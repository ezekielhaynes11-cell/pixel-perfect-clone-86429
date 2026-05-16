import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { DashboardHeader } from "@/components/dashboard/Header";
import { SummaryCard } from "@/components/dashboard/SummaryCard";
import { FilterBar, emptyFilters, type Filters } from "@/components/dashboard/FilterBar";
import { LeadCard } from "@/components/dashboard/LeadCard";
import { LeadDetailModal } from "@/components/dashboard/LeadDetailModal";
import { Sidebar } from "@/components/dashboard/Sidebar";
import { leads as allLeads, type Lead } from "@/data/leads";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Yield Architect — Phillips Sales Intelligence" },
      {
        name: "description",
        content:
          "AI-powered medical device sales intelligence dashboard for Phillips field reps.",
      },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [active, setActive] = useState<Lead | null>(null);

  const filtered = useMemo(() => {
    return allLeads.filter((l) => {
      if (filters.hospitals.length && !filters.hospitals.includes(l.hospital)) return false;
      if (filters.specialties.length && !filters.specialties.includes(l.specialty)) return false;
      if (filters.sources.length && !filters.sources.includes(l.source)) return false;
      if (l.confidence < filters.minConfidence) return false;
      return true;
    });
  }, [filters]);

  const highPriority = allLeads.filter((l) => l.priority === "high").length;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <DashboardHeader />

      <main className="mx-auto max-w-[1600px] px-6 py-6">
        <SummaryCard total={allLeads.length} highPriority={highPriority} />

        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
          <div>
            <FilterBar filters={filters} onChange={setFilters} />

            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-display text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                Lead Feed
                <span className="ml-2 rounded-full bg-surface-2 px-2 py-0.5 text-xs text-foreground">
                  {filtered.length}
                </span>
              </h2>
              <div className="text-xs text-muted-foreground">
                Sorted by confidence · newest first
              </div>
            </div>

            <div className="space-y-3">
              {filtered.length === 0 ? (
                <div className="rounded-md border border-dashed border-border p-12 text-center text-sm text-muted-foreground">
                  No leads match your filters.
                </div>
              ) : (
                filtered
                  .slice()
                  .sort((a, b) => b.confidence - a.confidence)
                  .map((lead, i) => (
                    <LeadCard key={lead.id} lead={lead} index={i} onView={setActive} />
                  ))
              )}
            </div>
          </div>

          <Sidebar leads={filtered.length ? filtered : allLeads} />
        </div>

        <footer className="mt-12 flex flex-wrap items-center justify-between border-t border-border pt-4 text-xs text-muted-foreground">
          <span>Last sync: 6:00 AM PST · Next refresh in 23:42</span>
          <span>
            Yield Architect v1.0 · <a href="#" className="hover:text-primary">Support</a>
          </span>
        </footer>
      </main>

      <LeadDetailModal lead={active} onClose={() => setActive(null)} />
    </div>
  );
}
