import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";

function CountUp({ value, className }: { value: number; className?: string }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    const start = performance.now();
    const dur = 700;
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      setN(Math.round(value * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <span className={className}>{n}</span>;
}

function formatWhen(iso: string | null): string {
  if (!iso) return "never";
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  return hrs < 48 ? `${hrs}h ago` : `${Math.round(hrs / 24)}d ago`;
}

export function SummaryCard({
  total,
  highPriority,
  isLive,
  lastSucceededAt,
  refreshFailed,
  isRefreshing,
}: {
  total: number;
  highPriority: number;
  isLive: boolean;
  lastSucceededAt: string | null;
  refreshFailed: boolean;
  isRefreshing: boolean;
}) {
  return (
    <div
      className="fade-up grid grid-cols-1 gap-6 rounded-md border-l-4 border-primary bg-gradient-to-r from-surface-2 to-surface px-6 py-6 md:grid-cols-3"
      style={{ minHeight: 120 }}
    >
      <div>
        <CountUp
          value={total}
          className="font-display text-5xl font-bold leading-none text-primary"
        />
        <div className="mt-2 text-xs uppercase tracking-wider text-muted-foreground">
          Leads Discovered Today
        </div>
      </div>

      <div className="md:border-l md:border-border md:pl-6">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-6 w-6 text-danger" />
          <CountUp
            value={highPriority}
            className="font-display text-4xl font-bold leading-none text-danger"
          />
        </div>
        <div className="mt-2 text-xs uppercase tracking-wider text-muted-foreground">
          High Priority Opportunities
        </div>
      </div>

      <div className="md:border-l md:border-border md:pl-6">
        {(() => {
          const tone = isRefreshing
            ? { color: "text-primary", dot: "bg-primary", label: "Refreshing sources…" }
            : refreshFailed
              ? { color: "text-destructive", dot: "bg-destructive", label: "Last refresh failed" }
              : isLive
                ? { color: "text-success", dot: "bg-success", label: "Live monitoring" }
                : lastSucceededAt
                  ? {
                      color: "text-warning",
                      dot: "bg-warning",
                      label: "Manual refresh required",
                    }
                  : { color: "text-warning", dot: "bg-warning", label: "Never refreshed" };
          return (
            <>
              <div className={`flex items-center gap-2 ${tone.color}`}>
                <span
                  className={`inline-block h-2 w-2 rounded-full ${tone.dot} ${isLive && !isRefreshing && !refreshFailed ? "pulse-dot" : ""}`}
                />
                <span className="text-sm font-medium">{tone.label}</span>
              </div>
              <div className="mt-2 text-[11px] text-muted-foreground">
                {refreshFailed
                  ? lastSucceededAt
                    ? `Last successful sync ${formatWhen(lastSucceededAt)} · see Refresh Status`
                    : "No successful sync yet · see Refresh Status"
                  : isLive
                    ? `Public sources synced ${formatWhen(lastSucceededAt)}`
                    : lastSucceededAt
                      ? `Showing stored data · last synced ${formatWhen(lastSucceededAt)}`
                      : "Showing stored data · run Refresh Intelligence to pull live sources"}
              </div>
            </>
          );
        })()}
        <div className="mt-1 text-[11px] uppercase tracking-wider text-muted-foreground">
          Territory: OK · AR · LA · TX
        </div>
      </div>

    </div>
  );
}
