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

function resolveStatusTone(
  isRefreshing: boolean,
  refreshFailed: boolean,
  isLive: boolean,
  lastSucceededAt: string | null,
) {
  if (isRefreshing) {
    return { color: "text-primary", dot: "bg-primary", label: "Refreshing sources…" };
  }
  if (refreshFailed) {
    return { color: "text-destructive", dot: "bg-destructive", label: "Last refresh failed" };
  }
  if (isLive) {
    return { color: "text-success", dot: "bg-success", label: "Live monitoring" };
  }
  if (lastSucceededAt) {
    return { color: "text-warning", dot: "bg-warning", label: "Manual refresh required" };
  }
  return { color: "text-warning", dot: "bg-warning", label: "Never refreshed" };
}

function resolveSyncCaption(
  refreshFailed: boolean,
  isLive: boolean,
  lastSucceededAt: string | null,
): string {
  if (refreshFailed) {
    return lastSucceededAt
      ? `Last successful sync ${formatWhen(lastSucceededAt)} · see Refresh Status`
      : "No successful sync yet · see Refresh Status";
  }
  if (isLive) {
    return `Public sources synced ${formatWhen(lastSucceededAt)}`;
  }
  if (lastSucceededAt) {
    return `Showing stored data · last synced ${formatWhen(lastSucceededAt)}`;
  }
  return "Showing stored data · run Refresh Intelligence to pull live sources";
}

export function SummaryCard({
  total,
  highPriority,
  isLive,
  lastSucceededAt,
  refreshFailed,
  isRefreshing,
  todayActive = false,
  highPriorityActive = false,
  onToggleToday,
  onToggleHighPriority,
}: {
  total: number;
  highPriority: number;
  isLive: boolean;
  lastSucceededAt: string | null;
  refreshFailed: boolean;
  isRefreshing: boolean;
  todayActive?: boolean;
  highPriorityActive?: boolean;
  onToggleToday?: () => void;
  onToggleHighPriority?: () => void;
}) {
  const tone = resolveStatusTone(isRefreshing, refreshFailed, isLive, lastSucceededAt);
  const syncCaption = resolveSyncCaption(refreshFailed, isLive, lastSucceededAt);

  return (
    <div
      className="fade-up grid grid-cols-1 gap-4 rounded-md border-l-4 border-primary bg-gradient-to-r from-surface-2 to-surface px-6 py-5 md:grid-cols-3"
      style={{ minHeight: 120 }}
    >
      <button
        type="button"
        aria-pressed={todayActive}
        onClick={onToggleToday}
        className={`group flex flex-col items-start rounded-md border px-3.5 py-2.5 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
          todayActive
            ? "border-primary bg-primary/10 ring-1 ring-primary/40"
            : "border-transparent hover:border-primary/40 hover:bg-surface-3/60"
        }`}
      >
        <div className="flex w-full items-center justify-between gap-2">
          <CountUp
            value={total}
            className="font-display text-5xl font-bold leading-none text-primary"
          />
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider transition-opacity ${
              todayActive
                ? "bg-primary text-primary-foreground opacity-100"
                : "bg-surface text-muted-foreground opacity-70 group-hover:opacity-100"
            }`}
          >
            {todayActive ? "Filtering · Clear" : "Filter today"}
          </span>
        </div>
        <div className="mt-2 text-xs uppercase tracking-wider text-muted-foreground group-hover:text-foreground">
          Leads Discovered Today
        </div>
      </button>

      <div className="md:border-l md:border-border md:pl-4">
        <button
          type="button"
          aria-pressed={highPriorityActive}
          onClick={onToggleHighPriority}
          className={`group flex w-full flex-col items-start rounded-md border px-3.5 py-2.5 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger ${
            highPriorityActive
              ? "border-danger/70 bg-danger/10 ring-1 ring-danger/40"
              : "border-transparent hover:border-danger/40 hover:bg-surface-3/60"
          }`}
        >
          <div className="flex w-full items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-6 w-6 text-danger" />
              <CountUp
                value={highPriority}
                className="font-display text-4xl font-bold leading-none text-danger"
              />
            </div>
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider transition-opacity ${
                highPriorityActive
                  ? "bg-danger text-white opacity-100"
                  : "bg-surface text-muted-foreground opacity-70 group-hover:opacity-100"
              }`}
            >
              {highPriorityActive ? "Filtering · Clear" : "Filter priority"}
            </span>
          </div>
          <div className="mt-2 text-xs uppercase tracking-wider text-muted-foreground group-hover:text-foreground">
            High Priority Opportunities
          </div>
        </button>
      </div>

      <div className="flex flex-col justify-center md:border-l md:border-border md:pl-6">
        <div className={`flex items-center gap-2 ${tone.color}`}>
          <span
            className={`inline-block h-2 w-2 rounded-full ${tone.dot} ${isLive && !isRefreshing && !refreshFailed ? "pulse-dot" : ""}`}
          />
          <span className="text-sm font-medium">{tone.label}</span>
        </div>
        <div className="mt-2 text-[11px] text-muted-foreground">{syncCaption}</div>
        <div className="mt-1 text-[11px] uppercase tracking-wider text-muted-foreground">
          Territory: OK · AR · LA · TX
        </div>
      </div>
    </div>
  );
}
