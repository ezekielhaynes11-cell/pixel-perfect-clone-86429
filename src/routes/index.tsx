import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { RefreshCw, Bookmark, BarChart3, AlertCircle, EyeOff, Eye, XCircle, RotateCcw, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { listLeads, triggerIngestionForSource, setLeadAction, listLeadActions, getRecentIngestionRuns, listLeadPhysicians, bulkSetLeadAction, getEnrichedContactCount, INGESTION_SOURCES, type LeadPhysician } from "@/lib/leads.functions";
import { rowToLead, leadStateCode, leadIsHighPriority, type Lead, type LeadRow } from "@/data/leads";
import { SummaryCard } from "@/components/dashboard/SummaryCard";
import { FilterBar, emptyFilters, type Filters } from "@/components/dashboard/FilterBar";
import { LeadCard } from "@/components/dashboard/LeadCard";
import { LeadDetailModal } from "@/components/dashboard/LeadDetailModal";
import { Sidebar } from "@/components/dashboard/Sidebar";
import { OutreachDraftDialog } from "@/components/dashboard/OutreachDraftDialog";
import { SavedSearchesDrawer } from "@/components/dashboard/SavedSearchesDrawer";
import { AlertsBell } from "@/components/dashboard/AlertsBell";
import { CopilotPanel } from "@/components/dashboard/CopilotPanel";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Yield Architect — Philips Sales Intelligence" },
      { name: "description", content: "Live AI-powered medical device sales intelligence." },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [active, setActive] = useState<Lead | null>(null);
  const [draftFor, setDraftFor] = useState<Lead | null>(null);
  const [searchesOpen, setSearchesOpen] = useState(false);
  const [copilotOpen, setCopilotOpen] = useState(false);
  const [showDismissed, setShowDismissed] = useState(false);
  const [showOld, setShowOld] = useState(false);
  const [showAllTerritories, setShowAllTerritories] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const qc = useQueryClient();
  const fetchLeads = useServerFn(listLeads);
  const fetchActions = useServerFn(listLeadActions);
  const fetchRuns = useServerFn(getRecentIngestionRuns);
  const fetchPhysicians = useServerFn(listLeadPhysicians);
  const runIngestForSource = useServerFn(triggerIngestionForSource);
  const actionFn = useServerFn(setLeadAction);
  const bulkActionFn = useServerFn(bulkSetLeadAction);

  const leadsQ = useQuery({
    queryKey: ["leads"],
    queryFn: () => fetchLeads(),
  });
  const actionsQ = useQuery({
    queryKey: ["lead_actions"],
    queryFn: () => fetchActions(),
  });
  const runsQ = useQuery({
    queryKey: ["ingestion_runs"],
    queryFn: () => fetchRuns(),
    refetchInterval: 30_000,
  });
  const physiciansQ = useQuery({
    queryKey: ["lead_physicians"],
    queryFn: () => fetchPhysicians(),
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
      // Fan out per-source so each call stays well under the Worker 60s timeout.
      const results = await Promise.allSettled(
        INGESTION_SOURCES.map((source) => runIngestForSource({ data: { source } })),
      );
      let inserted = 0;
      let failed = 0;
      for (const r of results) {
        if (r.status === "fulfilled") inserted += r.value.inserted;
        else failed += 1;
      }
      return { inserted, failed };
    },
    onMutate: () => toast.loading("Scanning live sources…", { id: "ingest" }),
    onSuccess: ({ inserted, failed }) => {
      const msg = failed > 0
        ? `Found ${inserted} new leads · ${failed} source${failed === 1 ? "" : "s"} failed`
        : `Found ${inserted} new leads`;
      toast.success(msg, { id: "ingest" });
      qc.invalidateQueries({ queryKey: ["leads"] });
      qc.invalidateQueries({ queryKey: ["ingestion_runs"] });
      qc.invalidateQueries({ queryKey: ["lead_physicians"] });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Ingestion failed", { id: "ingest" }),
  });

  // Auto-trigger first ingestion if the database is empty and nothing has ever run.
  const autoRanRef = useRef(false);
  useEffect(() => {
    if (autoRanRef.current) return;
    if (leadsQ.isLoading || runsQ.isLoading) return;
    const noLeads = (leadsQ.data ?? []).length === 0;
    const noRuns = (runsQ.data ?? []).length === 0;
    if (noLeads && noRuns && !ingest.isPending) {
      autoRanRef.current = true;
      ingest.mutate();
    }
  }, [leadsQ.isLoading, leadsQ.data, runsQ.isLoading, runsQ.data, ingest]);

  const act = useMutation({
    mutationFn: (input: { lead_id: string; action: "saved" | "dismissed" | "pushed_sfdc"; remove?: boolean }) =>
      actionFn({ data: input }),
    onSuccess: (_res, vars) => {
      if (vars.action === "saved") {
        toast.success(vars.remove ? "Unsaved" : "Saved");
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

  const leads: Lead[] = useMemo(
    () => {
      const mapped = (leadsQ.data ?? []).map((r) => rowToLead(r as LeadRow));
      // Dedupe by normalized headline AND by source_url, keep highest confidence (tiebreak newest).
      const better = (a: Lead, b: Lead) =>
        a.confidence !== b.confidence
          ? a.confidence > b.confidence
          : new Date(a.dateDiscovered).getTime() > new Date(b.dateDiscovered).getTime();
      const byKey = new Map<string, Lead>();
      const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
      for (const l of mapped) {
        const keys = [`t:${norm(l.title)}`];
        if (l.sourceUrl) keys.push(`u:${l.sourceUrl}`);
        const existing = keys.map((k) => byKey.get(k)).find(Boolean);
        if (!existing || better(l, existing)) {
          for (const k of keys) byKey.set(k, l);
        }
      }
      return Array.from(new Set(byKey.values()));
    },
    [leadsQ.data],
  );
  const dismissedIds = useMemo(
    () => new Set((actionsQ.data ?? []).filter((a) => a.action === "dismissed").map((a) => a.lead_id)),
    [actionsQ.data],
  );
  const savedIds = useMemo(
    () => new Set((actionsQ.data ?? []).filter((a) => a.action === "saved").map((a) => a.lead_id)),
    [actionsQ.data],
  );
  const activeLeads = useMemo(() => leads.filter((l) => !dismissedIds.has(l.id)), [leads, dismissedIds]);
  const dismissedLeads = useMemo(() => leads.filter((l) => dismissedIds.has(l.id)), [leads, dismissedIds]);
  const visibleLeads = showDismissed ? dismissedLeads : activeLeads;

  const hospitals = useMemo(
    () => Array.from(new Set(visibleLeads.map((l) => l.hospital).filter((x): x is string => !!x))).sort(),
    [visibleLeads],
  );
  const specialties = useMemo(
    () => Array.from(new Set(visibleLeads.map((l) => l.specialty).filter((x): x is string => !!x))).sort(),
    [visibleLeads],
  );

  const AGE_FILTER_MS = 365 * 24 * 60 * 60 * 1000;
  const TERRITORY_STATES = new Set(["TX", "OK", "AR", "LA"]);

  const filtered = useMemo(
    () =>
      visibleLeads.filter((l) => {
        if (!showOld && Date.now() - new Date(l.dateDiscovered).getTime() > AGE_FILTER_MS) return false;
        if (!showAllTerritories && filters.states.length === 0) {
          const code = leadStateCode(l);
          if (!code || !TERRITORY_STATES.has(code)) return false;
        }
        if (filters.hospitals.length && (!l.hospital || !filters.hospitals.includes(l.hospital))) return false;
        if (filters.specialties.length && (!l.specialty || !filters.specialties.includes(l.specialty))) return false;
        if (filters.sources.length && !filters.sources.includes(l.source)) return false;
        if (l.confidence < filters.minConfidence) return false;
        if (filters.signalTypes.length && (!l.signalType || !filters.signalTypes.includes(l.signalType as never))) return false;
        if (filters.accountTypes.length && (!l.accountType || !filters.accountTypes.includes(l.accountType as never))) return false;
        if (filters.vendors.length) {
          const hay = [...l.vendorMentions, l.competitorIncumbent ?? ""].join(" ").toLowerCase();
          if (!filters.vendors.some((v) => hay.includes(v.toLowerCase()))) return false;
        }
        if (filters.states.length) {
          const code = leadStateCode(l);
          if (!code || !filters.states.includes(code)) return false;
        }
        return true;
      }),
    [visibleLeads, filters, showOld, showAllTerritories, AGE_FILTER_MS],
  );

  const highPriority = activeLeads.filter(leadIsHighPriority).length;
  const pipelineUsd = activeLeads.reduce(
    (s, l) => s + (l.estimatedValueUsd ?? 0) * (l.winProbability ?? 0),
    0,
  );

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-40 h-16 border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-full max-w-[1600px] items-center gap-4 px-6">
          <div className="font-display text-base font-bold tracking-tight">
            ⚡ Yield Architect
            <span className="ml-2 hidden rounded-sm bg-surface-2 px-1.5 py-0.5 font-sans text-[10px] uppercase tracking-wider text-muted-foreground sm:inline">
              Philips Medical
            </span>
          </div>
          <div className="flex-1" />
          {(() => {
            const last = (runsQ.data ?? [])[0];
            if (!last) {
              return (
                <div className="hidden items-center gap-1.5 text-xs text-muted-foreground md:flex">
                  <RefreshCw className="h-3.5 w-3.5 text-success" />
                  Awaiting first sync…
                </div>
              );
            }
            const when = new Date(last.started_at);
            const mins = Math.max(0, Math.round((Date.now() - when.getTime()) / 60000));
            const ago = mins < 1 ? "just now" : mins < 60 ? `${mins}m ago` : `${Math.round(mins / 60)}h ago`;
            return (
              <div className="hidden items-center gap-1.5 text-xs text-muted-foreground md:flex">
                <RefreshCw className={`h-3.5 w-3.5 ${last.status === "running" ? "animate-spin text-primary" : "text-success"}`} />
                Daily sync · {ago}
                {last.status === "error" ? " · failed" : ""}
              </div>
            );
          })()}
          <Link
            to="/pipeline"
            className="hidden items-center gap-1.5 rounded-md border border-border bg-surface-2 px-3 py-1.5 text-xs font-medium text-foreground/80 transition-colors hover:bg-surface-3 hover:text-foreground md:flex"
          >
            <BarChart3 className="h-3.5 w-3.5" /> Pipeline
          </Link>
          <button
            onClick={() => setSearchesOpen(true)}
            className="hidden items-center gap-1.5 rounded-md border border-border bg-surface-2 px-3 py-1.5 text-xs font-medium text-foreground/80 transition-colors hover:bg-surface-3 hover:text-foreground md:flex"
          >
            <Bookmark className="h-3.5 w-3.5" /> Saved
          </button>
          <button
            onClick={() => setCopilotOpen(true)}
            className="flex items-center gap-1.5 rounded-md border border-primary/30 bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-primary/20"
            title="Open Copilot"
          >
            <Sparkles className="h-3.5 w-3.5" /> Copilot
          </button>
          <AlertsBell leads={activeLeads} onOpenLead={setActive} />
          <button
            onClick={() => ingest.mutate()}
            disabled={ingest.isPending}
            className="flex items-center gap-2 rounded-md bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${ingest.isPending ? "animate-spin" : ""}`} />
            {ingest.isPending ? "Scanning…" : "Refresh feed"}
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-[1600px] px-6 py-6">
        <SummaryCard total={activeLeads.length} highPriority={highPriority} />

        {(() => {
          const last = (runsQ.data ?? [])[0];
          if (!last) return null;
          const when = new Date(last.started_at);
          const mins = Math.max(0, Math.round((Date.now() - when.getTime()) / 60000));
          const ago = mins < 1 ? "just now" : mins < 60 ? `${mins}m ago` : `${Math.round(mins / 60)}h ago`;
          const color =
            last.status === "error"
              ? "text-destructive"
              : last.status === "running"
              ? "text-muted-foreground"
              : "text-success";
          return (
            <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
              <span className={`inline-block h-1.5 w-1.5 rounded-full bg-current ${color}`} />
              Last scan: {ago} · {last.source} · {last.new_count ?? 0} new · {enrichedCountQ.data?.count ?? 0} enriched
              {last.status === "error" ? " · failed" : ""}
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
            <FilterBar filters={filters} onChange={setFilters} hospitals={hospitals} specialties={specialties} />


            <div className="mb-1 text-[10px] text-yellow-500 font-mono">
              DEBUG: server={leadsQ.data?.length ?? (leadsQ.isLoading ? "loading" : "err")} | dedup={leads.length} | filtered={filtered.length} | state={leadsQ.status}
            </div>
            <div className="mb-3 flex flex-wrap items-center gap-3">
              <h2 className="font-display text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                {showDismissed ? "Dismissed" : "Lead Feed"}
                <span className="ml-2 rounded-full bg-surface-2 px-2 py-0.5 text-xs text-foreground">
                  {filtered.length}
                </span>
              </h2>
              <button
                onClick={() => { setShowDismissed((v) => !v); setSelected(new Set()); }}
                className="flex h-7 items-center gap-1.5 rounded-sm border border-border bg-surface-2 px-2.5 text-[11px] font-medium text-foreground/80 transition-colors hover:bg-surface-3 hover:text-foreground"
                title={showDismissed ? "Back to active feed" : "View dismissed leads"}
              >
                {showDismissed ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                {showDismissed ? "Show active" : `Show dismissed (${dismissedLeads.length})`}
              </button>
              <button
                onClick={() => setShowOld((v) => !v)}
                className={`flex h-7 items-center gap-1.5 rounded-sm border px-2.5 text-[11px] font-medium transition-colors ${showOld ? "border-primary/50 bg-primary/10 text-primary" : "border-border bg-surface-2 text-foreground/80 hover:bg-surface-3"}`}
                title="Include leads older than 365 days"
              >
                {showOld ? "Hide older leads" : "Show older leads"}
              </button>
              <button
                onClick={() => setShowAllTerritories((v) => !v)}
                className={`flex h-7 items-center gap-1.5 rounded-sm border px-2.5 text-[11px] font-medium transition-colors ${showAllTerritories ? "border-primary/50 bg-primary/10 text-primary" : "border-border bg-surface-2 text-foreground/80 hover:bg-surface-3"}`}
                title="Include leads outside OK · AR · LA · TX"
              >
                {showAllTerritories ? "Territory: TX/OK/AR/LA" : "Show all territories"}
              </button>
              {filtered.length > 0 && (
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
              {selected.size > 0 && (
                <div className="ml-auto flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">{selected.size} selected</span>
                  {showDismissed ? (
                    <button
                      onClick={() =>
                        bulkAct.mutate({ lead_ids: Array.from(selected), action: "dismissed", remove: true })
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
              {selected.size === 0 && (
                <div className="ml-auto text-xs text-muted-foreground">Sorted by confidence</div>
              )}
            </div>

            {leadsQ.isError ? (
              <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <div>
                  <div className="font-semibold">Failed to load leads</div>
                  <div className="text-destructive/80">
                    {leadsQ.error instanceof Error ? leadsQ.error.message : "Unknown error"}
                  </div>
                </div>
              </div>
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
                {filtered
                  .slice()
                  .sort((a, b) => b.confidence - a.confidence)
                  .map((lead, i) => (
                    <LeadCard
                      key={lead.id}
                      lead={lead}
                      index={i}
                      physicians={physiciansByLead.get(lead.id) ?? []}
                      onView={setActive}
                      saved={savedIds.has(lead.id)}
                      onSave={() => act.mutate({ lead_id: lead.id, action: "saved", remove: savedIds.has(lead.id) })}
                      onDismiss={() => act.mutate({ lead_id: lead.id, action: "dismissed" })}
                      onDraft={() => setDraftFor(lead)}
                      selectable
                      selected={selected.has(lead.id)}
                      onToggleSelect={() =>
                        setSelected((prev) => {
                          const next = new Set(prev);
                          if (next.has(lead.id)) next.delete(lead.id);
                          else next.add(lead.id);
                          return next;
                        })
                      }
                      dismissed={showDismissed}
                      onRestore={() =>
                        act.mutate({ lead_id: lead.id, action: "dismissed", remove: true })
                      }
                    />
                  ))}
              </div>
            )}
          </div>

          <Sidebar leads={filtered.length ? filtered : visibleLeads} />
        </div>

        <footer className="mt-12 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-4 text-xs text-muted-foreground">
          {(() => {
            const labels: Record<string, string> = {
              sam_gov: "SAM.gov", openfda: "openFDA", gdelt: "GDELT",
              gdelt_m_and_a: "GDELT", gdelt_va_funding: "GDELT",
              reddit: "Reddit", bluesky: "Bluesky", news: "News",
              clinicaltrials: "ClinicalTrials", cms_open_payments: "CMS Payments",
              funding_rss: "Gov Funding RSS",
            };
            const active = Array.from(
              new Set(activeLeads.map((l) => labels[l.source] ?? l.source))
            ).sort();
            const list = active.length ? active.join(" · ") : "active sources";
            return <span>Live data from {list} · Enriched by Yield AI</span>;
          })()}
          <span>Single-user mode</span>
        </footer>
      </main>

      <LeadDetailModal lead={active} physicians={active ? physiciansByLead.get(active.id) ?? [] : []} onClose={() => setActive(null)} />
      <OutreachDraftDialog lead={draftFor} open={!!draftFor} onClose={() => setDraftFor(null)} />
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
