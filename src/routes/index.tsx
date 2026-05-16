import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { RefreshCw, LogOut, TrendingUp, Bookmark, BarChart3 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { listLeads, triggerIngestion, setLeadAction, listLeadActions } from "@/lib/leads.functions";
import { rowToLead, type Lead, type LeadRow } from "@/data/leads";
import { SummaryCard } from "@/components/dashboard/SummaryCard";
import { FilterBar, emptyFilters, type Filters } from "@/components/dashboard/FilterBar";
import { LeadCard } from "@/components/dashboard/LeadCard";
import { LeadDetailModal } from "@/components/dashboard/LeadDetailModal";
import { Sidebar } from "@/components/dashboard/Sidebar";
import { OutreachDraftDialog } from "@/components/dashboard/OutreachDraftDialog";
import { SavedSearchesDrawer } from "@/components/dashboard/SavedSearchesDrawer";
import { AlertsBell } from "@/components/dashboard/AlertsBell";

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
  const { user, loading } = useAuth();
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [active, setActive] = useState<Lead | null>(null);
  const [draftFor, setDraftFor] = useState<Lead | null>(null);
  const [searchesOpen, setSearchesOpen] = useState(false);
  const qc = useQueryClient();
  const fetchLeads = useServerFn(listLeads);
  const fetchActions = useServerFn(listLeadActions);
  const runIngest = useServerFn(triggerIngestion);
  const actionFn = useServerFn(setLeadAction);

  const leadsQ = useQuery({
    queryKey: ["leads"],
    queryFn: () => fetchLeads(),
    enabled: !!user,
  });
  const actionsQ = useQuery({
    queryKey: ["lead_actions"],
    queryFn: () => fetchActions(),
    enabled: !!user,
  });

  const ingest = useMutation({
    mutationFn: () => runIngest(),
    onMutate: () => toast.loading("Scanning live sources…", { id: "ingest" }),
    onSuccess: (summaries) => {
      const total = summaries.reduce((a, s) => a + s.inserted, 0);
      const enriched = summaries.reduce((a, s) => a + s.enriched, 0);
      toast.success(`Found ${total} new leads · enriched ${enriched}`, { id: "ingest" });
      qc.invalidateQueries({ queryKey: ["leads"] });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Ingestion failed", { id: "ingest" }),
  });

  const act = useMutation({
    mutationFn: (input: { lead_id: string; action: "saved" | "dismissed" | "pushed_sfdc"; remove?: boolean }) =>
      actionFn({ data: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["lead_actions"] }),
  });

  const leads: Lead[] = useMemo(
    () => (leadsQ.data ?? []).map((r) => rowToLead(r as LeadRow)),
    [leadsQ.data],
  );
  const dismissedIds = new Set(
    (actionsQ.data ?? []).filter((a) => a.action === "dismissed").map((a) => a.lead_id),
  );
  const visibleLeads = leads.filter((l) => !dismissedIds.has(l.id));

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
        return true;
      }),
    [visibleLeads, filters],
  );

  const highPriority = visibleLeads.filter((l) => l.priority === "high").length;
  const pipelineUsd = visibleLeads.reduce(
    (s, l) => s + (l.estimatedValueUsd ?? 0) * (l.winProbability ?? 0),
    0,
  );

  const navigate = useNavigate();
  useEffect(() => {
    if (!loading && !user) navigate({ to: "/login" });
  }, [loading, user, navigate]);

  if (loading || !user) {
    return <div className="grid min-h-screen place-items-center text-muted-foreground">Loading…</div>;
  }

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
          <div className="hidden items-center gap-1.5 text-xs text-muted-foreground md:flex">
            <TrendingUp className="h-3.5 w-3.5 text-success" />
            Weighted pipeline:{" "}
            <span className="font-semibold text-foreground">
              {pipelineUsd >= 1e6 ? `$${(pipelineUsd / 1e6).toFixed(1)}M` : `$${Math.round(pipelineUsd / 1000)}k`}
            </span>
          </div>
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
          <AlertsBell leads={visibleLeads} onOpenLead={setActive} />
          <button
            onClick={() => ingest.mutate()}
            disabled={ingest.isPending}
            className="flex items-center gap-2 rounded-md bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${ingest.isPending ? "animate-spin" : ""}`} />
            {ingest.isPending ? "Scanning…" : "Refresh feed"}
          </button>
          <button
            onClick={async () => {
              await supabase.auth.signOut();
              window.location.href = "/login";
            }}
            className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground"
            title="Sign out"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-[1600px] px-6 py-6">
        <SummaryCard total={visibleLeads.length} highPriority={highPriority} />

        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
          <div>
            <FilterBar filters={filters} onChange={setFilters} hospitals={hospitals} specialties={specialties} />

            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-display text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                Lead Feed
                <span className="ml-2 rounded-full bg-surface-2 px-2 py-0.5 text-xs text-foreground">
                  {filtered.length}
                </span>
              </h2>
              <div className="text-xs text-muted-foreground">Sorted by confidence</div>
            </div>

            {leadsQ.isLoading ? (
              <div className="rounded-md border border-dashed border-border p-12 text-center text-sm text-muted-foreground">
                Loading leads…
              </div>
            ) : filtered.length === 0 ? (
              <div className="rounded-md border border-dashed border-border p-12 text-center text-sm text-muted-foreground">
                {leads.length === 0
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
                      onView={setActive}
                      onSave={() => act.mutate({ lead_id: lead.id, action: "saved" })}
                      onDismiss={() => act.mutate({ lead_id: lead.id, action: "dismissed" })}
                      onDraft={() => setDraftFor(lead)}
                    />
                  ))}
              </div>
            )}
          </div>

          <Sidebar leads={filtered.length ? filtered : visibleLeads} />
        </div>

        <footer className="mt-12 flex flex-wrap items-center justify-between border-t border-border pt-4 text-xs text-muted-foreground">
          <span>Live data from SAM.gov · openFDA · GDELT · Enriched by Lovable AI</span>
          <Link to="/login" className="hover:text-primary">{user.email}</Link>
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
    </div>
  );
}
