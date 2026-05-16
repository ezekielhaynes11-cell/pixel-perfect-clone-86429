import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, TrendingUp, Target, Gauge } from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import { useAuth } from "@/hooks/use-auth";
import { getPipelineForecast } from "@/lib/leads.functions";
import { formatUsd } from "@/data/leads";

export const Route = createFileRoute("/pipeline")({
  head: () => ({ meta: [{ title: "Pipeline forecast — Yield Architect" }] }),
  component: PipelinePage,
});

function PipelinePage() {
  const { user, loading } = useAuth();
  const fetchForecast = useServerFn(getPipelineForecast);
  const q = useQuery({
    queryKey: ["pipeline_forecast"],
    queryFn: () => fetchForecast(),
    enabled: !!user,
  });

  const navigate = useNavigate();
  useEffect(() => {
    if (!loading && !user) navigate({ to: "/login" });
  }, [loading, user, navigate]);

  if (loading || !user) return <div className="grid min-h-screen place-items-center text-muted-foreground">Loading…</div>;

  const d = q.data;
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-30 h-16 border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-full max-w-[1400px] items-center gap-4 px-6">
          <Link to="/" className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> Back
          </Link>
          <div className="font-display text-base font-bold">Pipeline forecast</div>
        </div>
      </header>

      <main className="mx-auto max-w-[1400px] space-y-6 px-6 py-6">
        {q.isLoading || !d ? (
          <div className="rounded-md border border-dashed border-border p-12 text-center text-sm text-muted-foreground">
            Calculating forecast…
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <Stat icon={<TrendingUp />} label="Weighted pipeline" value={formatUsd(d.totalWeighted)} accent />
              <Stat icon={<Target />} label="Open qualified leads" value={String(d.openCount)} />
              <Stat icon={<Gauge />} label="Avg confidence" value={`${d.avgConfidence}%`} />
            </div>

            <Panel title="Weighted pipeline by specialty">
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={d.bySpecialty.slice(0, 8)}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                    <XAxis dataKey="name" stroke="var(--color-muted-foreground)" fontSize={11} />
                    <YAxis stroke="var(--color-muted-foreground)" fontSize={11} tickFormatter={(v) => formatUsd(v)} />
                    <Tooltip
                      contentStyle={{
                        background: "var(--color-surface-2)",
                        border: "1px solid var(--color-border)",
                        borderRadius: 8,
                        fontSize: 12,
                      }}
                      formatter={(v: number) => formatUsd(v)}
                    />
                    <Bar dataKey="value" fill="var(--color-primary)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Panel>

            <Panel title="Top weighted opportunities">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                    <tr className="border-b border-border">
                      <th className="py-2 pr-3">Lead</th>
                      <th className="py-2 pr-3">Hospital</th>
                      <th className="py-2 pr-3">Specialty</th>
                      <th className="py-2 pr-3 text-right">Est. value</th>
                      <th className="py-2 pr-3 text-right">Win %</th>
                      <th className="py-2 pr-3 text-right">Weighted</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.topLeads.map((l) => (
                      <tr key={l.id} className="border-b border-border/50 hover:bg-surface-2">
                        <td className="py-2 pr-3 font-medium">{l.title}</td>
                        <td className="py-2 pr-3 text-foreground/80">{l.hospital ?? "—"}</td>
                        <td className="py-2 pr-3 text-foreground/80">{l.specialty ?? "—"}</td>
                        <td className="py-2 pr-3 text-right tabular-nums">{formatUsd(l.estimated_value_usd)}</td>
                        <td className="py-2 pr-3 text-right tabular-nums">
                          {Math.round((Number(l.win_probability) || 0) * 100)}%
                        </td>
                        <td className="py-2 pr-3 text-right font-semibold tabular-nums text-primary">
                          {formatUsd(l.weighted)}
                        </td>
                      </tr>
                    ))}
                    {d.topLeads.length === 0 && (
                      <tr>
                        <td colSpan={6} className="py-8 text-center text-muted-foreground">
                          No qualified leads yet. Refresh the feed on the dashboard.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </Panel>
          </>
        )}
      </main>
    </div>
  );
}

function Stat({
  icon,
  label,
  value,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div
      className={`rounded-md border p-5 ${
        accent ? "border-primary/40 bg-primary/5" : "border-border bg-surface-2"
      }`}
    >
      <div className="mb-2 flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-muted-foreground">
        <span className="[&_svg]:h-3.5 [&_svg]:w-3.5">{icon}</span>
        {label}
      </div>
      <div className={`font-display text-3xl font-bold ${accent ? "text-primary" : ""}`}>{value}</div>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-md border border-border bg-surface-2 p-5">
      <h2 className="mb-4 font-display text-sm font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </h2>
      {children}
    </section>
  );
}
