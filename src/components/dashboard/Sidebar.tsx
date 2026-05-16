import { TrendingUp, Building2, PieChart } from "lucide-react";
import type { Lead } from "@/data/leads";

export function Sidebar({ leads }: { leads: Lead[] }) {
  // Top opportunity type
  const typeCounts = leads.reduce<Record<string, number>>((acc, l) => {
    acc[l.specialty] = (acc[l.specialty] || 0) + 1;
    return acc;
  }, {});
  const topType = Object.entries(typeCounts).sort((a, b) => b[1] - a[1])[0];

  // Most mentioned hospital
  const hospitalCounts = leads.reduce<Record<string, number>>((acc, l) => {
    acc[l.hospital] = (acc[l.hospital] || 0) + 1;
    return acc;
  }, {});
  const topHospital = Object.entries(hospitalCounts).sort((a, b) => b[1] - a[1])[0];

  // Source breakdown
  const sourceCounts = leads.reduce<Record<string, number>>((acc, l) => {
    acc[l.source] = (acc[l.source] || 0) + 1;
    return acc;
  }, {});
  const total = leads.length || 1;
  const sourceColors: Record<string, string> = {
    reddit: "bg-orange-500",
    government: "bg-blue-500",
    news: "bg-violet-500",
    recalls: "bg-red-500",
    linkedin: "bg-sky-500",
  };

  return (
    <aside className="space-y-4">
      <Panel icon={<TrendingUp />} title="Top Opportunity Type">
        <div className="font-display text-lg font-semibold">{topType?.[0] ?? "—"}</div>
        <div className="text-xs text-muted-foreground">
          {topType?.[1] ?? 0} leads today
        </div>
      </Panel>

      <Panel icon={<Building2 />} title="Most Active Hospital">
        <div className="font-display text-lg font-semibold">{topHospital?.[0] ?? "—"}</div>
        <div className="text-xs text-muted-foreground">
          Mentioned in {topHospital?.[1] ?? 0} leads
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
                <span className="capitalize text-foreground/90">{s}</span>
                <span className="ml-auto text-muted-foreground">
                  {Math.round((c / total) * 100)}%
                </span>
              </li>
            ))}
        </ul>
      </Panel>

      <Panel title="7-Day Trend">
        <div className="flex h-16 items-end gap-1">
          {[8, 10, 12, 14, 11, 9, 12].map((v, i) => (
            <div
              key={i}
              className="flex-1 rounded-sm bg-primary/60 transition-all hover:bg-primary"
              style={{ height: `${(v / 14) * 100}%` }}
              title={`${v} leads`}
            />
          ))}
        </div>
        <div className="mt-2 flex justify-between text-[10px] text-muted-foreground">
          <span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span>
          <span>Fri</span><span>Sat</span><span>Sun</span>
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
