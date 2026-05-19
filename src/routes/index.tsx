import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { RefreshCw, TrendingUp, Bookmark, BarChart3, AlertCircle, EyeOff, Eye, XCircle, RotateCcw, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { listLeads, triggerIngestion, setLeadAction, listLeadActions, getRecentIngestionRuns, listLeadPhysicians, bulkSetLeadAction, type LeadPhysician } from "@/lib/leads.functions";
import { rowToLead, leadStateCode, type Lead, type LeadRow } from "@/data/leads";
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
      { title: "Yield Architect — Phillips Sales Intelligence" },
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
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const qc = useQueryClient();
  const fetchLeads = useServerFn(listLeads);
  const fetchActions = useServerFn(listLeadActions);
  const fetchRuns = useServerFn(getRecentIngestionRuns);
  const fetchPhysicians = useServerFn(listLeadPhysicians);
  const runIngest = useServerFn(triggerIngestion);
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
    mutationFn: () => runIngest(),
    onMutate: () => toast.loading("Scanning live sources…", { id: "ingest" }),
    onSuccess: (summaries) => {
      const total = summaries.reduce((a, s) => a + s.inserted, 0);
      const enriched = summaries.reduce((a, s) => a + s.enriched, 0);
      toast.success(`Found ${total} new leads · enriched ${enriched}`, { id: "ingest" });
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
    onSuccess: () => qc.invalidateQueries({ queryKey: ["lead_actions"] }),
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
    () => (leadsQ.data ?? []).map((r) => rowToLead(r as LeadRow)),
    [leadsQ.data],
  );
  const dismissedIds = useMemo(
    () => new Set((actionsQ.data ?? []).filter((a) => a.action === "dismissed").map((a) => a.lead_id)),
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

  const filtered = useMemo(
    () =>
      visibleLeads.filter((l) => {
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
    [visibleLeads, filters],
  );

  const highPriority = activeLeads.filter((l) => l.priority === "high").length;
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
              Phillips Medical
            </span>
          </div>
          <div className="flex-1" />
          {(() => {
            const last = (runsQ.data ?? [])[0];
            if (!last) {
              return (
                <div className="hidden items-center gap-1.5 text-xs text-muted-foreground md:flex">
                  <RefreshCw className="h-3.5 w-3.5 text-success" />
                  Daily sync · 7am & 1pm PT
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
              Last scan: {ago} · {last.source} · {last.new_count ?? 0} new · {last.enriched_count ?? 0} enriched
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

            {leadsQ.isLoading ? (
              <div className="rounded-md border border-dashed border-border p-12 text-center text-sm text-muted-foreground">
                Loading leads…
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
                      onSave={() => act.mutate({ lead_id: lead.id, action: "saved" })}
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

        <footer className="mt-12 flex flex-wrap items-center justify-between border-t border-border pt-4 text-xs text-muted-foreground">
          <span>Live data from SAM.gov · openFDA · GDELT · Enriched by Lovable AI</span>
          <span>Single-user mode</span>
        </footer>
      </main>

      <LeadDetailModal lead={active} onClose={() => setActive(null)} />
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
