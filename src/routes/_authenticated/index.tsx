import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  RefreshCw,
  Bookmark,
  BarChart3,
  AlertCircle,
  XCircle,
  RotateCcw,
  Sparkles,
  SlidersHorizontal,
  MoreHorizontal,
  Settings,
} from "lucide-react";
import { toast } from "sonner";
import {
  listLeads,
  getArchivedLeadCount,
  triggerIngestionForSource,
  setLeadAction,
  listLeadActions,
  getRecentIngestionRuns,
  listLeadPhysicians,
  bulkSetLeadAction,
  getEnrichedContactCount,
  INGESTION_SOURCES,
  type LeadPhysician,
} from "@/lib/leads.functions";
import {
  rowToLead,
  leadStateCode,
  leadInTerritoryScope,
  leadIsHighPriority,
  isArchivedLead,
  isDiscoveredToday,
  isRuralCampaignLead,
  classifyLeadType,
  leadMatchesDateFilter,
  sortLeads,
  ACTIVE_LEAD_WINDOW_MS,
  SOURCE_LABELS,
  type Lead,
  type LeadRow,
} from "@/data/leads";
import { isLikelyNonEnglish, leadDedupeKey } from "@/lib/lead-clean";
import { SummaryCard } from "@/components/dashboard/SummaryCard";
import { FilterBar } from "@/components/dashboard/FilterBar";
import { emptyFilters, type Filters } from "@/components/dashboard/filters";
import { LeadCard } from "@/components/dashboard/LeadCard";
import { LeadDetailModal } from "@/components/dashboard/LeadDetailModal";
import { Sidebar } from "@/components/dashboard/Sidebar";
import { OutreachDraftDialog } from "@/components/dashboard/OutreachDraftDialog";
import { PitchDeckModal } from "@/components/dashboard/PitchDeckModal";
import { ExecutiveBriefingNarrative } from "@/components/dashboard/ExecutiveBriefingNarrative";
import { CacheDataErrorCard } from "@/components/dashboard/CacheDataErrorCard";
import { SavedSearchesDrawer } from "@/components/dashboard/SavedSearchesDrawer";
import { AlertsBell } from "@/components/dashboard/AlertsBell";
import { CopilotPanel } from "@/components/dashboard/CopilotPanel";
import { RefreshStatusPanel, formatWhen } from "@/components/dashboard/RefreshStatusPanel";
import { getRefreshStatus, beginRefresh, completeRefresh } from "@/lib/refresh.functions";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export const Route = createFileRoute("/_authenticated/")({
  head: () => ({
    meta: [
      { title: "Yield Architect — Philips Sales Intelligence" },
      { name: "description", content: "Live AI-powered medical device sales intelligence." },
    ],
  }),
  component: Dashboard,
});

// Module-scope constants (stable identities) so the feed useMemo doesn't need
// them in its dependency array and doesn't reallocate them every render.
const TERRITORY_STATES = new Set(["TX", "OK", "AR", "LA"]);
const MIN_HEADLINE_CONFIDENCE = 35;

function extractFailedSourceNames(errorMessage: string | null | undefined): string[] {
  if (!errorMessage) return [];
  const names: string[] = [];
  for (const segment of errorMessage.split("|")) {
    const match = segment.trim().match(/^([a-z0-9_]+):/i);
    if (match?.[1] && !names.includes(match[1])) {
      names.push(match[1]);
    }
  }
  return names;
}

function resolveFeedLabel(filters: Filters, filtered: Lead[], showArchived: boolean): string {
  if (filters.onlyRural && filters.onlyHighPriority) {
    return "High priority Rural RHT leads";
  }
  if (filters.onlyRural) {
    return "CMS $50B Rural RHT campaign";
  }
  if (filters.onlyHighPriority && (filters.onlyToday || filters.datePreset === "today")) {
    return "High priority leads today";
  }
  if (filters.onlyHighPriority) {
    return "High priority leads";
  }
  const allFilteredToday =
    filtered.length > 0 &&
    filtered.every((l) => isDiscoveredToday(l.dateDiscovered, l.dateIngested));
  if (filters.onlyToday || filters.datePreset === "today" || allFilteredToday) {
    return "Discovered today";
  }
  if (showArchived) {
    return "Active + archived leads";
  }
  return "Active leads";
}

function Dashboard() {
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [active, setActive] = useState<Lead | null>(null);
  const [draftFor, setDraftFor] = useState<Lead | null>(null);
  const [pitchDeckFor, setPitchDeckFor] = useState<Lead | null>(null);
  const [searchesOpen, setSearchesOpen] = useState(false);
  const [copilotOpen, setCopilotOpen] = useState(false);
  const [showDismissed, setShowDismissed] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [showAllTerritories, setShowAllTerritories] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [showInsights, setShowInsights] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const qc = useQueryClient();
  const fetchLeads = useServerFn(listLeads);
  const fetchArchivedCount = useServerFn(getArchivedLeadCount);
  const fetchActions = useServerFn(listLeadActions);
  const fetchRuns = useServerFn(getRecentIngestionRuns);
  const fetchPhysicians = useServerFn(listLeadPhysicians);
  const runIngestForSource = useServerFn(triggerIngestionForSource);
  const actionFn = useServerFn(setLeadAction);
  const bulkActionFn = useServerFn(bulkSetLeadAction);

  const customFromRequiresArchive = useMemo(() => {
    if (!filters.dateFrom) return false;
    const fromTs = new Date(`${filters.dateFrom}T00:00:00`).getTime();
    return Number.isFinite(fromTs) && Date.now() - fromTs > ACTIVE_LEAD_WINDOW_MS;
  }, [filters.dateFrom]);

  const effectiveIncludeArchived = showArchived || customFromRequiresArchive;

  const leadsQ = useQuery({
    queryKey: ["leads", effectiveIncludeArchived],
    queryFn: () => fetchLeads({ data: { includeArchived: effectiveIncludeArchived } }),
    retry: 2,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 3000),
  });
  const archivedCountQ = useQuery({
    queryKey: ["archived_lead_count"],
    queryFn: () => fetchArchivedCount(),
    retry: 2,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 3000),
  });
  const actionsQ = useQuery({
    queryKey: ["lead_actions"],
    queryFn: () => fetchActions(),
    retry: 2,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 3000),
  });
  const runsQ = useQuery({
    queryKey: ["ingestion_runs"],
    queryFn: () => fetchRuns(),
    refetchInterval: 30_000,
    retry: 2,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 3000),
  });
  const physiciansQ = useQuery({
    queryKey: ["lead_physicians"],
    queryFn: () => fetchPhysicians(),
    retry: 2,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 3000),
  });
  const fetchRefreshStatus = useServerFn(getRefreshStatus);
  const startRefresh = useServerFn(beginRefresh);
  const finishRefresh = useServerFn(completeRefresh);
  const refreshQ = useQuery({
    queryKey: ["refresh_status"],
    queryFn: () => fetchRefreshStatus(),
    refetchInterval: 30_000,
  });
  const fetchEnrichedCount = useServerFn(getEnrichedContactCount);
  const enrichedCountQ = useQuery({
    queryKey: ["contact_enrichment_count"],
    queryFn: () => fetchEnrichedCount(),
    refetchInterval: 30_000,
  });
  const physiciansByLead = useMemo(() => {
    const map = new Map<string, LeadPhysician[]>();
    for (const p of physiciansQ.data ?? []) {
      const arr = map.get(p.lead_id) ?? [];
      arr.push(p);
      map.set(p.lead_id, arr);
    }
    return map;
  }, [physiciansQ.data]);

  const ingest = useMutation({
    mutationFn: async () => {
      // Claim the server-side lock first: prevents concurrent runs across tabs
      // and records the attempt even if the run later fails.
      await startRefresh({ data: { trigger: "manual" as const } });
      try {
        // Fan out per-source so each call stays well under the Worker 60s timeout.
        const results = await Promise.allSettled(
          INGESTION_SOURCES.map((source) => runIngestForSource({ data: { source } })),
        );
        let inserted = 0;
        let enriched = 0;
        let fetched = 0;
        let failed = 0;
        const failedSources: string[] = [];
        const errors: string[] = [];
        for (let i = 0; i < results.length; i++) {
          const r = results[i];
          if (r.status === "fulfilled" && !r.value.error) {
            inserted += r.value.inserted;
            enriched += r.value.enriched;
            fetched += r.value.fetched;
          } else {
            failed += 1;
            failedSources.push(INGESTION_SOURCES[i]);
            const msg =
              r.status === "rejected"
                ? r.reason instanceof Error
                  ? r.reason.message
                  : String(r.reason)
                : (r.value.error ?? "unknown error");
            errors.push(`${INGESTION_SOURCES[i]}: ${msg}`);
          }
        }
        const surfaced = Math.max(inserted, enriched);
        const allFailed = failed === results.length;
        await finishRefresh({
          data: {
            ok: !allFailed,
            recordsScanned: fetched,
            recordsUpdated: surfaced,
            sourcesOk: results.length - failed,
            sourcesFailed: failed,
            errorMessage: errors.length ? errors.slice(0, 3).join(" | ") : undefined,
          },
        });
        if (allFailed) throw new Error(errors[0] ?? "All sources failed");
        return { surfaced, failed, failedSources };
      } catch (e) {
        await finishRefresh({
          data: {
            ok: false,
            errorMessage: e instanceof Error ? e.message : String(e),
          },
        }).catch(() => undefined);
        throw e;
      }
    },
    onMutate: () => toast.loading("Scanning live sources…", { id: "ingest" }),
    onSuccess: ({ surfaced, failed, failedSources }) => {
      const sourceDetail = failedSources.length > 0 ? ` (${failedSources.join(", ")})` : "";
      const leadLabel =
        surfaced > 0 ? `Found ${surfaced} new leads` : "Sources synced · active leads up to date";
      const msg =
        failed > 0
          ? `${leadLabel} · ${failed} source${failed === 1 ? "" : "s"} failed${sourceDetail}`
          : leadLabel;
      toast.success(msg, { id: "ingest" });
      qc.invalidateQueries({ queryKey: ["leads"] });
      qc.invalidateQueries({ queryKey: ["archived_lead_count"] });
      qc.invalidateQueries({ queryKey: ["ingestion_runs"] });
      qc.invalidateQueries({ queryKey: ["lead_physicians"] });
      qc.invalidateQueries({ queryKey: ["contact_enrichment_count"] });
    },
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : "Refresh failed", { id: "ingest" }),
    onSettled: () => qc.invalidateQueries({ queryKey: ["refresh_status"] }),
  });

  // Auto-trigger background ingestion if active pipeline is completely dry or un-synced.
  const autoRanRef = useRef(false);
  useEffect(() => {
    if (autoRanRef.current) return;
    if (leadsQ.isLoading || runsQ.isLoading || leadsQ.isError) return;
    const noLeads = (leadsQ.data ?? []).length === 0;
    if (noLeads && !ingest.isPending) {
      autoRanRef.current = true;
      ingest.mutate();
    }
  }, [leadsQ.isLoading, leadsQ.isError, leadsQ.data, runsQ.isLoading, ingest]);

  const act = useMutation({
    mutationFn: (input: {
      lead_id: string;
      action: "saved" | "dismissed" | "pushed_sfdc" | "contacted";
      remove?: boolean;
    }) => actionFn({ data: input }),
    onSuccess: (_res, vars) => {
      if (vars.action === "saved") {
        toast.success(vars.remove ? "Unsaved" : "Saved");
      } else if (vars.action === "contacted") {
        toast.success(vars.remove ? "Marked not contacted" : "Marked contacted");
      }
      qc.invalidateQueries({ queryKey: ["lead_actions"] });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Action failed"),
  });

  const bulkAct = useMutation({
    mutationFn: (input: { lead_ids: string[]; action: "dismissed"; remove?: boolean }) =>
      bulkActionFn({ data: input }),
    onSuccess: (res, vars) => {
      toast.success(vars.remove ? `Restored ${res.count} leads` : `Dismissed ${res.count} leads`);
      setSelected(new Set());
      qc.invalidateQueries({ queryKey: ["lead_actions"] });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Bulk action failed"),
  });

  const leads: Lead[] = useMemo(() => {
    const mapped = (leadsQ.data ?? [])
      .map((r) => rowToLead(r as LeadRow))
      // Hide non-English items (e.g. the German Siemens Healthineers listing).
      .filter((l) => !isLikelyNonEnglish(`${l.title} ${l.summary}`));
    // Dedupe by normalized headline AND by source_url, keep highest confidence (tiebreak newest).
    const better = (a: Lead, b: Lead) =>
      a.confidence !== b.confidence
        ? a.confidence > b.confidence
        : new Date(a.dateDiscovered).getTime() > new Date(b.dateDiscovered).getTime();
    // Winners keyed by lead id; keyToId maps each dedupe key to its current
    // winner. Tracking winners by id (rather than storing leads under each key)
    // means displacing a lead removes it entirely — it can't survive under a
    // non-shared key the way it did before.
    const winners = new Map<string, Lead>();
    const keyToId = new Map<string, string>();
    for (const l of mapped) {
      // Signature key collapses near-duplicate recall listings that differ
      // only by recall number/class; URL key collapses exact re-ingests.
      const keys = [`t:${leadDedupeKey(l.title)}`];
      if (l.sourceUrl && l.sourceUrl !== "#") keys.push(`u:${l.sourceUrl}`);
      const rivals = Array.from(
        new Set(keys.map((k) => keyToId.get(k)).filter((id): id is string => !!id)),
      )
        .map((id) => winners.get(id))
        .filter((r): r is Lead => !!r);
      if (rivals.length > 0 && !rivals.every((r) => better(l, r))) continue; // l is the dup, drop it
      for (const r of rivals) winners.delete(r.id);
      winners.set(l.id, l);
      for (const k of keys) keyToId.set(k, l.id);
    }
    return Array.from(winners.values());
  }, [leadsQ.data]);
  const dismissedIds = useMemo(
    () =>
      new Set((actionsQ.data ?? []).filter((a) => a.action === "dismissed").map((a) => a.lead_id)),
    [actionsQ.data],
  );
  const savedIds = useMemo(
    () => new Set((actionsQ.data ?? []).filter((a) => a.action === "saved").map((a) => a.lead_id)),
    [actionsQ.data],
  );
  const contactedIds = useMemo(
    () =>
      new Set((actionsQ.data ?? []).filter((a) => a.action === "contacted").map((a) => a.lead_id)),
    [actionsQ.data],
  );
  const pushedIds = useMemo(
    () =>
      new Set(
        (actionsQ.data ?? []).filter((a) => a.action === "pushed_sfdc").map((a) => a.lead_id),
      ),
    [actionsQ.data],
  );
  const activeLeads = useMemo(
    () => leads.filter((l) => !dismissedIds.has(l.id)),
    [leads, dismissedIds],
  );
  const dismissedLeads = useMemo(
    () => leads.filter((l) => dismissedIds.has(l.id)),
    [leads, dismissedIds],
  );
  const visibleLeads = showDismissed ? dismissedLeads : activeLeads;

  // Anti-pipeline-starvation guard: if leads exist but all happen to be older than
  // ACTIVE_LEAD_WINDOW_MS (e.g. over calendar turns or slow quarters), never wipe the screen blank.
  const hasFreshLeads = useMemo(
    () => activeLeads.some((l) => !isArchivedLead(l)),
    [activeLeads],
  );

  const scopedActiveLeads = useMemo(
    () =>
      activeLeads.filter((l) => {
        if (!effectiveIncludeArchived && hasFreshLeads && isArchivedLead(l)) return false;
        if (!showAllTerritories && !leadInTerritoryScope(l, TERRITORY_STATES)) return false;
        return true;
      }),
    [activeLeads, effectiveIncludeArchived, hasFreshLeads, showAllTerritories],
  );

  const facetSourceLeads = showDismissed ? dismissedLeads : scopedActiveLeads;
  const hospitals = useMemo(
    () =>
      Array.from(
        new Set(facetSourceLeads.map((l) => l.hospital).filter((x): x is string => !!x)),
      ).sort(),
    [facetSourceLeads],
  );
  const specialties = useMemo(
    () =>
      Array.from(
        new Set(facetSourceLeads.map((l) => l.specialty).filter((x): x is string => !!x)),
      ).sort(),
    [facetSourceLeads],
  );

  const filtered = useMemo(() => {
    const matched = visibleLeads.filter((l) => {
      if (!effectiveIncludeArchived && hasFreshLeads && isArchivedLead(l)) return false;
      if (!showAllTerritories && filters.states.length === 0) {
        if (!leadInTerritoryScope(l, TERRITORY_STATES)) return false;
      }
      if (
        (filters.onlyToday || filters.datePreset === "today") &&
        l.confidence < MIN_HEADLINE_CONFIDENCE
      ) {
        return false;
      }
      if (
        !leadMatchesDateFilter(l, {
          onlyToday: filters.onlyToday,
          datePreset: filters.datePreset,
          dateFrom: filters.dateFrom,
          dateTo: filters.dateTo,
        })
      ) {
        return false;
      }
      if (filters.onlyRural && !isRuralCampaignLead(l)) return false;
      if (filters.onlyHighPriority && !leadIsHighPriority(l)) return false;
      if (filters.leadTypes.length > 0 && !filters.leadTypes.includes(classifyLeadType(l))) {
        return false;
      }
      if (filters.hospitals.length && (!l.hospital || !filters.hospitals.includes(l.hospital)))
        return false;
      if (
        filters.specialties.length &&
        (!l.specialty || !filters.specialties.includes(l.specialty))
      )
        return false;
      if (filters.sources.length && !filters.sources.includes(l.source)) return false;
      if (l.confidence < filters.minConfidence) return false;
      if (
        filters.signalTypes.length &&
        (!l.signalType || !filters.signalTypes.includes(l.signalType as never))
      )
        return false;
      if (
        filters.accountTypes.length &&
        (!l.accountType || !filters.accountTypes.includes(l.accountType as never))
      )
        return false;
      if (filters.vendors.length) {
        const hay = [...l.vendorMentions, l.competitorIncumbent ?? ""].join(" ").toLowerCase();
        if (!filters.vendors.some((v) => hay.includes(v.toLowerCase()))) return false;
      }
      if (filters.states.length) {
        const code = leadStateCode(l);
        if (!code || !filters.states.includes(code)) return false;
      }
      return true;
    });

    return sortLeads(matched, filters.sortBy);
  }, [visibleLeads, filters, effectiveIncludeArchived, showAllTerritories]);

  const discoveredToday = scopedActiveLeads.filter(
    (l) =>
      l.confidence >= MIN_HEADLINE_CONFIDENCE &&
      isDiscoveredToday(l.dateDiscovered, l.dateIngested),
  ).length;
  const highPriority = scopedActiveLeads.filter(leadIsHighPriority).length;
  const ruralCampaignCount = scopedActiveLeads.filter(isRuralCampaignLead).length;

  const feedLabel = resolveFeedLabel(filters, filtered, effectiveIncludeArchived);

  const toggleTodayFilter = () => {
    setShowDismissed(false);
    setFilters((prev) => {
      const nextToday = !prev.onlyToday;
      return {
        ...prev,
        onlyToday: nextToday,
        datePreset: nextToday ? "today" : prev.datePreset === "today" ? "all" : prev.datePreset,
      };
    });
  };

  const toggleHighPriorityFilter = () => {
    setShowDismissed(false);
    setFilters((prev) => ({ ...prev, onlyHighPriority: !prev.onlyHighPriority }));
  };

  const toggleSelectMode = () => {
    setSelectMode((currentMode) => {
      const nextMode = !currentMode;
      if (!nextMode) {
        setSelected(new Set());
      }
      return nextMode;
    });
  };

  const toggleLeadSelection = (leadId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(leadId)) {
        next.delete(leadId);
      } else {
        next.add(leadId);
      }
      return next;
    });
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b border-border/50 bg-background/90 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-[1600px] items-center gap-3 px-6">
          <div className="flex items-center gap-2.5 font-display text-base font-semibold tracking-tight">
            <span>⚡ Yield Architect</span>
            <span className="hidden rounded-full border border-primary/25 bg-primary/10 px-2.5 py-0.5 font-sans text-[11px] font-medium text-primary sm:inline-flex">
              Philips Medical
            </span>
          </div>
          <div className="flex-1" />
          {(() => {
            const rs = refreshQ.data;
            const running = ingest.isPending || rs?.status === "running";
            const failed = !running && rs?.status === "failed";
            const label = running
              ? "Refreshing sources…"
              : failed
                ? "Last refresh failed"
                : rs?.isLive
                  ? `Live monitoring · synced ${formatWhen(rs.lastSucceededAt)}`
                  : rs?.lastSucceededAt
                    ? `Cached data · synced ${formatWhen(rs.lastSucceededAt)}`
                    : "Manual refresh required";
            const color = running
              ? "text-primary"
              : failed
                ? "text-destructive"
                : rs?.isLive
                  ? "text-emerald-400"
                  : "text-amber-400";
            return (
              <div
                className="hidden items-center gap-2 text-xs text-muted-foreground sm:flex"
                title={label}
              >
                <RefreshCw className={`h-3.5 w-3.5 ${color} ${running ? "animate-spin" : ""}`} />
                <span className="truncate max-w-[220px]">{label}</span>
              </div>
            );
          })()}

          <button
            onClick={() => setCopilotOpen(true)}
            className="flex min-h-[44px] items-center gap-2 rounded-lg border border-primary/30 bg-primary/10 px-3.5 text-xs font-medium text-primary transition-all duration-150 hover:bg-primary/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
            title="Open Copilot"
          >
            <Sparkles className="h-4 w-4" />
            <span>Copilot</span>
          </button>

          <AlertsBell leads={activeLeads} onOpenLead={setActive} />

          <button
            onClick={() => ingest.mutate()}
            disabled={ingest.isPending || refreshQ.data?.status === "running"}
            aria-label="Refresh Intelligence"
            title={ingest.isPending ? "Refreshing…" : "Refresh Intelligence"}
            className="flex min-h-[44px] items-center justify-center gap-2 rounded-lg bg-primary px-4 text-xs font-semibold text-primary-foreground shadow-sm transition-all duration-150 hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${ingest.isPending ? "animate-spin" : ""}`} />
            <span className="hidden sm:inline">
              {ingest.isPending ? "Refreshing…" : "Refresh Intelligence"}
            </span>
          </button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label="More"
                title="More"
                className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg border border-border/50 bg-card/60 text-muted-foreground transition-all duration-150 hover:bg-card hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
              >
                <MoreHorizontal className="h-4 w-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48 border-border bg-surface">
              <DropdownMenuItem asChild>
                <Link to="/pipeline">
                  <BarChart3 className="h-4 w-4" />
                  Pipeline
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setSearchesOpen(true)}>
                <Bookmark className="h-4 w-4" />
                Saved
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link to="/settings/keywords">
                  <Settings className="h-4 w-4" />
                  Settings
                </Link>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <main className="mx-auto max-w-[1600px] px-6 py-6">
        <SummaryCard
          total={discoveredToday}
          highPriority={highPriority}
          leads={filtered.length ? filtered : scopedActiveLeads}
          isLive={refreshQ.data?.isLive ?? false}
          lastSucceededAt={refreshQ.data?.lastSucceededAt ?? null}
          refreshFailed={refreshQ.data?.status === "failed"}
          isRefreshing={ingest.isPending || refreshQ.data?.status === "running"}
          todayActive={filters.onlyToday}
          highPriorityActive={filters.onlyHighPriority}
          onToggleToday={toggleTodayFilter}
          onToggleHighPriority={toggleHighPriorityFilter}
        />

        {(() => {
          const rs = refreshQ.data;
          if (!rs) return null;
          const isFailed = rs.status === "failed";
          const isRunning = rs.status === "running" || ingest.isPending;
          const statusDot = isFailed
            ? "bg-destructive"
            : isRunning
              ? "bg-primary"
              : rs.isLive
                ? "bg-emerald-400"
                : "bg-amber-400";
          return (
            <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl border border-border/30 bg-card/40 px-4 py-2.5 text-xs text-muted-foreground backdrop-blur-sm">
              <span className="inline-flex items-center gap-1.5">
                <span className={`h-2 w-2 rounded-full ${statusDot}`} />
                <span>Last successful refresh: {formatWhen(rs.lastSucceededAt)}</span>
              </span>
              <span className="text-border/60">·</span>
              <span>Last attempt: {formatWhen(rs.lastAttemptedAt)}</span>
              <span className="text-border/60">·</span>
              <span>
                <strong className="font-semibold tabular-nums text-foreground">
                  {rs.recordsScanned}
                </strong>{" "}
                scanned
              </span>
              <span className="text-border/60">·</span>
              <span>
                <strong className="font-semibold tabular-nums text-foreground">
                  {rs.recordsUpdated}
                </strong>{" "}
                new
              </span>
              <span className="text-border/60">·</span>
              <span>
                <strong className="font-semibold tabular-nums text-foreground">
                  {enrichedCountQ.data?.count ?? 0}
                </strong>{" "}
                enriched
              </span>
              {rs.sourcesFailed > 0 &&
                (() => {
                  const names = extractFailedSourceNames(rs.errorMessage);
                  const suffix = names.length > 0 ? ` (${names.join(", ")})` : "";
                  return (
                    <span className="ml-auto inline-flex items-center gap-1 rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-300">
                      <AlertCircle className="h-3 w-3" />
                      <span>
                        {rs.sourcesFailed} source{rs.sourcesFailed === 1 ? "" : "s"} failed
                        {suffix}
                      </span>
                    </span>
                  );
                })()}
            </div>
          );
        })()}

        {ingest.isError ? (
          <div className="mt-3 flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <div className="font-semibold">Ingestion failed</div>
              <div className="text-destructive/80">
                {ingest.error instanceof Error ? ingest.error.message : String(ingest.error)}
              </div>
            </div>
          </div>
        ) : null}

        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
          <div>
            <ExecutiveBriefingNarrative
              leads={filtered.length ? filtered : scopedActiveLeads}
              highPriorityCount={highPriority}
              onOpenLead={setActive}
              onDraftOutreach={setDraftFor}
              onOpenPitchDeck={(lead) => setPitchDeckFor(lead)}
              onOpenCopilot={() => setCopilotOpen(true)}
            />

            <FilterBar
              filters={filters}
              onChange={setFilters}
              hospitals={hospitals}
              specialties={specialties}
              facetLeads={facetSourceLeads}
              todayCount={discoveredToday}
              highPriorityCount={highPriority}
              ruralCount={ruralCampaignCount}
            />

            <div className="mb-3 flex flex-wrap items-center gap-3">
              <h2 className="flex shrink-0 items-center font-display text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                {showDismissed ? "Dismissed" : feedLabel}
                <span className="ml-2 rounded-full bg-surface-2 px-2 py-0.5 text-xs text-foreground">
                  {filtered.length}
                </span>
              </h2>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    aria-label="View options"
                    title="View options"
                    className="flex h-7 shrink-0 items-center gap-1.5 rounded-sm border border-border bg-surface-2 px-2.5 text-[11px] font-medium text-foreground/80 transition-colors hover:bg-surface-3 hover:text-foreground"
                  >
                    <SlidersHorizontal className="h-3.5 w-3.5" />
                    View options
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-60 border-border bg-surface">
                  <DropdownMenuLabel className="text-muted-foreground">
                    View options
                  </DropdownMenuLabel>
                  <DropdownMenuCheckboxItem
                    checked={showDismissed}
                    onCheckedChange={() => {
                      setShowDismissed((v) => !v);
                      setSelected(new Set());
                    }}
                    onSelect={(e) => e.preventDefault()}
                  >
                    Show dismissed ({dismissedLeads.length})
                  </DropdownMenuCheckboxItem>
                  <DropdownMenuCheckboxItem
                    checked={showArchived}
                    onCheckedChange={() => setShowArchived((v) => !v)}
                    onSelect={(e) => e.preventDefault()}
                  >
                    Show archived leads ({archivedCountQ.data?.count ?? 0})
                  </DropdownMenuCheckboxItem>
                  <DropdownMenuCheckboxItem
                    checked={showAllTerritories}
                    onCheckedChange={() => setShowAllTerritories((v) => !v)}
                    onSelect={(e) => e.preventDefault()}
                  >
                    Show all territories
                  </DropdownMenuCheckboxItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuCheckboxItem
                    checked={selectMode}
                    onCheckedChange={toggleSelectMode}
                    onSelect={(e) => e.preventDefault()}
                  >
                    Select leads
                  </DropdownMenuCheckboxItem>
                </DropdownMenuContent>
              </DropdownMenu>

              {selectMode && filtered.length > 0 && (
                <button
                  onClick={() => {
                    const all = filtered.map((l) => l.id);
                    setSelected((prev) => (prev.size === all.length ? new Set() : new Set(all)));
                  }}
                  className="text-[11px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                >
                  {selected.size === filtered.length ? "Clear selection" : "Select all"}
                </button>
              )}
              {selectMode && selected.size > 0 && (
                <div className="ml-auto flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">{selected.size} selected</span>
                  {showDismissed ? (
                    <button
                      onClick={() =>
                        bulkAct.mutate({
                          lead_ids: Array.from(selected),
                          action: "dismissed",
                          remove: true,
                        })
                      }
                      disabled={bulkAct.isPending}
                      className="flex h-7 items-center gap-1.5 rounded-sm border border-success/40 bg-success/10 px-2.5 text-[11px] font-medium text-success hover:bg-success/20 disabled:opacity-50"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                      Restore selected
                    </button>
                  ) : (
                    <button
                      onClick={() =>
                        bulkAct.mutate({ lead_ids: Array.from(selected), action: "dismissed" })
                      }
                      disabled={bulkAct.isPending}
                      className="flex h-7 items-center gap-1.5 rounded-sm border border-destructive/40 bg-destructive/10 px-2.5 text-[11px] font-medium text-destructive hover:bg-destructive/20 disabled:opacity-50"
                    >
                      <XCircle className="h-3.5 w-3.5" />
                      Dismiss selected
                    </button>
                  )}
                </div>
              )}
            </div>

            {leadsQ.isError ? (
              <CacheDataErrorCard
                error={leadsQ.error}
                onRetry={() => leadsQ.refetch()}
                isRetrying={leadsQ.isFetching}
              />
            ) : leadsQ.isLoading ? (
              <div className="space-y-3" aria-busy="true" aria-label="Loading leads">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div
                    key={i}
                    className="animate-pulse rounded-md border border-border bg-surface-2/40 p-4"
                  >
                    <div className="flex items-center gap-2">
                      <div className="h-4 w-16 rounded bg-surface-3" />
                      <div className="h-4 w-24 rounded bg-surface-3" />
                    </div>
                    <div className="mt-3 h-5 w-3/4 rounded bg-surface-3" />
                    <div className="mt-2 h-4 w-full rounded bg-surface-3/70" />
                    <div className="mt-1 h-4 w-5/6 rounded bg-surface-3/70" />
                    <div className="mt-4 flex gap-2">
                      <div className="h-6 w-28 rounded bg-surface-3" />
                      <div className="h-6 w-20 rounded bg-surface-3" />
                    </div>
                  </div>
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <div className="rounded-md border border-dashed border-border p-12 text-center text-sm text-muted-foreground">
                {showDismissed
                  ? "No dismissed leads."
                  : leads.length === 0
                    ? 'No leads yet. Click "Refresh feed" to pull live signals from SAM.gov, FDA, and news.'
                    : "No leads match your filters."}
              </div>
            ) : (
              <div className="space-y-3">
                {filtered.map((lead, i) => (
                  <LeadCard
                    key={lead.id}
                    lead={lead}
                    index={i}
                    physicians={physiciansByLead.get(lead.id) ?? []}
                    onView={setActive}
                    saved={savedIds.has(lead.id)}
                    contacted={contactedIds.has(lead.id)}
                    onSave={() =>
                      act.mutate({
                        lead_id: lead.id,
                        action: "saved",
                        remove: savedIds.has(lead.id),
                      })
                    }
                    onDismiss={() => act.mutate({ lead_id: lead.id, action: "dismissed" })}
                    onDraft={() => setDraftFor(lead)}
                    onPitchDeck={(targetLead) => setPitchDeckFor(targetLead)}
                    onToggleContacted={(targetLead) => {
                      const isContacted = contactedIds.has(targetLead.id);
                      act.mutate(
                        { lead_id: targetLead.id, action: "contacted", remove: isContacted },
                        {
                          onSuccess: () => {
                            toast.success(
                              isContacted
                                ? `Marked "${targetLead.hospital || targetLead.title}" as uncontacted`
                                : `Marked "${targetLead.hospital || targetLead.title}" as contacted`,
                            );
                          },
                        },
                      );
                    }}
                    selectMode={selectMode}
                    selected={selected.has(lead.id)}
                    onToggleSelect={() => toggleLeadSelection(lead.id)}
                    dismissed={showDismissed}
                    onRestore={() =>
                      act.mutate({ lead_id: lead.id, action: "dismissed", remove: true })
                    }
                  />
                ))}
              </div>
            )}
          </div>

          {/* Insights: always visible on desktop; collapsed behind a toggle on
              phones so the rep sees leads first, not four analytics panels. */}
          <div>
            <button
              onClick={() => setShowInsights((v) => !v)}
              className="mb-3 flex w-full items-center justify-between rounded-md border border-border bg-surface-2 px-4 py-2 text-xs font-medium text-foreground/80 transition-colors hover:bg-surface-3 lg:hidden"
              aria-expanded={showInsights}
            >
              {showInsights ? "Hide insights" : "Show insights"}
              <BarChart3 className="h-3.5 w-3.5" />
            </button>
            <div className={showInsights ? "block space-y-4" : "hidden space-y-4 lg:block"}>
              <RefreshStatusPanel
                status={refreshQ.data ?? undefined}
                isLoading={refreshQ.isLoading}
                isRunning={ingest.isPending || refreshQ.data?.status === "running"}
                onRefresh={() => ingest.mutate()}
                runs={runsQ.data ?? []}
              />
              <Sidebar leads={filtered.length ? filtered : scopedActiveLeads} />
            </div>
          </div>
        </div>

        <footer className="mt-12 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-4 text-xs text-muted-foreground">
          {(() => {
            const active = Array.from(
              new Set(activeLeads.map((l) => SOURCE_LABELS[l.source] ?? l.source)),
            ).sort();
            const list = active.length ? active.join(" · ") : "active sources";
            return <span>Live data from {list} · Enriched by Yield AI</span>;
          })()}
          <span>Single-user mode</span>
        </footer>
      </main>

      <LeadDetailModal
        lead={active}
        physicians={active ? (physiciansByLead.get(active.id) ?? []) : []}
        contacted={active ? contactedIds.has(active.id) : false}
        pushed={active ? pushedIds.has(active.id) : false}
        onMarkContacted={() =>
          active &&
          act.mutate({
            lead_id: active.id,
            action: "contacted",
            remove: contactedIds.has(active.id),
          })
        }
        onClose={() => setActive(null)}
      />
      <OutreachDraftDialog lead={draftFor} open={!!draftFor} onClose={() => setDraftFor(null)} />
      <PitchDeckModal
        lead={pitchDeckFor}
        open={Boolean(pitchDeckFor)}
        onOpenChange={(open) => !open && setPitchDeckFor(null)}
        onDraftOutreach={(lead) => {
          setPitchDeckFor(null);
          setDraftFor(lead);
        }}
      />
      <SavedSearchesDrawer
        open={searchesOpen}
        onClose={() => setSearchesOpen(false)}
        currentFilters={filters}
        onApply={setFilters}
      />
      <CopilotPanel open={copilotOpen} onClose={() => setCopilotOpen(false)} />
    </div>
  );
}
