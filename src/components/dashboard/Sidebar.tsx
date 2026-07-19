import { TrendingUp, Building2, PieChart } from "lucide-react";
import { type Lead, leadHospital, opportunityType } from "@/data/leads";

export function Sidebar({ leads }: { leads: Lead[] }) {
  const typeCounts = leads.reduce<Record<string, number>>((acc, l) => {
    const k = opportunityType(l);
    acc[k] = (acc[k] || 0) + 1;
    return acc;
  }, {});
  const topType = Object.entries(typeCounts).sort((a, b) => b[1] - a[1])[0];

  const hospitalCounts = leads.reduce<Record<string, number>>((acc, l) => {
    const k = leadHospital(l);
    if (!k) return acc;
    acc[k] = (acc[k] || 0) + 1;
    return acc;
  }, {});
  const topHospital = Object.entries(hospitalCounts).sort((a, b) => b[1] - a[1])[0];

  // Source breakdown
  const sourceCounts = leads.reduce<Record<string, number>>((acc, l) => {
    acc[l.source] = (acc[l.source] || 0) + 1;
    return acc;
  }, {});
  const total = leads.length || 1;

  // Real 7-day trend: count leads by discovery day for the last 7 calendar days
  // (oldest → newest), replacing what used to be a hardcoded array.
  const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const todayStart = startOfDay(new Date());
  const trend = Array.from({ length: 7 }, (_, i) => {
    const dayStart = todayStart - (6 - i) * 86_400_000;
    const nextDayStart = dayStart + 86_400_000;
    const count = leads.reduce((n, l) => {
      const t = new Date(l.dateDiscovered).getTime();
      return t >= dayStart && t < nextDayStart ? n + 1 : n;
    }, 0);
    return { label: DAY_LABELS[new Date(dayStart).getDay()], count };
  });
  const trendMax = Math.max(1, ...trend.map((d) => d.count));
  const sourceColors: Record<string, string> = {
    sam_gov: "bg-blue-500",
    openfda: "bg-red-500",
    gdelt: "bg-violet-500",
    gdelt_m_and_a: "bg-pink-500",
    gdelt_va_funding: "bg-cyan-500",
    reddit: "bg-orange-500",
    bluesky: "bg-sky-500",
    news: "bg-violet-500",
    clinicaltrials: "bg-emerald-500",
    cms_open_payments: "bg-amber-500",
    funding_rss: "bg-teal-500",
  };
  const sourceLabels: Record<string, string> = {
    sam_gov: "SAM.gov",
    openfda: "openFDA",
    gdelt: "GDELT",
    gdelt_m_and_a: "GDELT M&A",
    gdelt_va_funding: "GDELT VA Funding",
    reddit: "Reddit",
    bluesky: "Bluesky",
    news: "News",
    clinicaltrials: "ClinicalTrials",
    cms_open_payments: "CMS Payments",
    funding_rss: "Gov Funding RSS",
  };

  return (
    <aside className="space-y-4">
      <Panel icon={<TrendingUp />} title="Top Opportunity Type">
        <div className="font-display text-lg font-semibold">{topType?.[0] ?? "—"}</div>
        <div className="text-xs text-muted-foreground">{topType?.[1] ?? 0} leads today</div>
      </Panel>

      <Panel icon={<Building2 />} title="Most Active Hospital">
        <div className="font-display text-lg font-semibold">{topHospital?.[0] ?? "—"}</div>
        <div className="text-xs text-muted-foreground">
          {topHospital
            ? `Mentioned in ${topHospital[1]} lead${topHospital[1] === 1 ? "" : "s"}`
            : "No hospital signals yet"}
        </div>
      </Panel>

      <Panel icon={<PieChart />} title="Data Sources (Today)">
        <div className="mb-3 flex h-2 overflow-hidden rounded-full bg-surface-2">
          {Object.entries(sourceCounts).map(([s, c]) => (
            <div
              key={s}
              className={sourceColors[s] ?? "bg-muted"}
              style={{ width: `${(c / total) * 100}%` }}
            />
          ))}
        </div>
        <ul className="space-y-1.5">
          {Object.entries(sourceCounts)
            .sort((a, b) => b[1] - a[1])
            .map(([s, c]) => (
              <li key={s} className="flex items-center gap-2 text-xs">
                <span className={`h-2 w-2 rounded-full ${sourceColors[s] ?? "bg-muted"}`} />
                <span className="text-foreground/90">{sourceLabels[s] ?? s}</span>
                <span className="ml-auto text-muted-foreground">
                  {Math.round((c / total) * 100)}%
                </span>
              </li>
            ))}
        </ul>
      </Panel>

      <Panel title="7-Day Trend">
        <div className="flex h-16 items-end gap-1">
          {trend.map((d, i) => (
            <div
              key={i}
              className="flex-1 rounded-sm bg-primary/60 transition-all hover:bg-primary"
              style={{ height: `${Math.max(4, (d.count / trendMax) * 100)}%` }}
              title={`${d.label}: ${d.count} lead${d.count === 1 ? "" : "s"} discovered`}
            />
          ))}
        </div>
        <div className="mt-2 flex justify-between text-[10px] text-muted-foreground">
          {trend.map((d, i) => (
            <span key={i}>{d.label}</span>
          ))}
        </div>
      </Panel>
    </aside>
  );
}

function Panel({
  icon,
  title,
  children,
}: {
  icon?: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-md border border-border bg-surface-2 p-4">
      <div className="mb-2 flex items-center gap-2 text-[11px] uppercase tracking-wider text-muted-foreground">
        {icon && <span className="[&_svg]:h-3.5 [&_svg]:w-3.5">{icon}</span>}
        {title}
      </div>
      {children}
    </div>
  );
}
