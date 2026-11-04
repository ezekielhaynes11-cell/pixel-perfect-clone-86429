import { useEffect, useState } from "react";
import { AlertTriangle, MapPin, Sparkles } from "lucide-react";

function CountUp({ value, className }: { value: number; className?: string }) {
  const [currentValue, setCurrentValue] = useState(0);
  useEffect(() => {
    const start = performance.now();
    const duration = 700;
    let animationFrameId = 0;
    const tick = (currentTime: number) => {
      const progress = Math.min(1, (currentTime - start) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      setCurrentValue(Math.round(value * eased));
      if (progress < 1) animationFrameId = requestAnimationFrame(tick);
    };
    animationFrameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animationFrameId);
  }, [value]);
  return <span className={className}>{currentValue}</span>;
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
    return { color: "text-emerald-400", dot: "bg-emerald-400", label: "Live monitoring active" };
  }
  if (lastSucceededAt) {
    return { color: "text-amber-400", dot: "bg-amber-400", label: "Manual refresh required" };
  }
  return { color: "text-amber-400", dot: "bg-amber-400", label: "Never refreshed" };
}

function resolveSyncCaption(
  refreshFailed: boolean,
  isLive: boolean,
  lastSucceededAt: string | null,
): string {
  if (refreshFailed) {
    return lastSucceededAt
      ? `Last sync ${formatWhen(lastSucceededAt)} · check Refresh Status`
      : "No successful sync yet · check Refresh Status";
  }
  if (isLive) {
    return `Public sources synced ${formatWhen(lastSucceededAt)}`;
  }
  if (lastSucceededAt) {
    return `Cached data · last synced ${formatWhen(lastSucceededAt)}`;
  }
  return "Cached data · run Refresh Intelligence for live data";
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
    <div className="fade-up grid grid-cols-1 gap-3 rounded-2xl border border-border/40 bg-card/60 p-3 shadow-sm backdrop-blur-md md:grid-cols-3">
      {/* Bento Card 1: Leads Discovered Today */}
      <button
        type="button"
        aria-pressed={todayActive}
        onClick={onToggleToday}
        className={`group flex min-h-[110px] flex-col justify-between rounded-xl border p-4 text-left transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 ${
          todayActive
            ? "border-primary/60 bg-primary/10 shadow-sm ring-1 ring-primary/40"
            : "border-border/40 bg-surface/40 hover:border-primary/40 hover:bg-surface/70 hover:shadow-md"
        }`}
      >
        <div className="flex w-full items-center justify-between gap-2">
          <CountUp
            value={total}
            className="font-display text-4xl font-semibold leading-none tabular-nums text-primary sm:text-5xl"
          />
          <span
            className={`flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-all ${
              todayActive
                ? "bg-primary text-primary-foreground shadow-sm"
                : "bg-surface-2/80 text-muted-foreground group-hover:bg-surface-3 group-hover:text-foreground"
            }`}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                todayActive ? "bg-primary-foreground" : "bg-primary/70"
              }`}
            />
            {todayActive ? "Filtering · Clear" : "Filter today"}
          </span>
        </div>
        <div className="mt-3 flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors group-hover:text-foreground">
          <span>Leads discovered today</span>
        </div>
      </button>

      {/* Bento Card 2: High Priority Opportunities */}
      <button
        type="button"
        aria-pressed={highPriorityActive}
        onClick={onToggleHighPriority}
        className={`group flex min-h-[110px] flex-col justify-between rounded-xl border p-4 text-left transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger focus-visible:ring-offset-2 ${
          highPriorityActive
            ? "border-danger/60 bg-danger/10 shadow-sm ring-1 ring-danger/40"
            : "border-border/40 bg-surface/40 hover:border-danger/40 hover:bg-surface/70 hover:shadow-md"
        }`}
      >
        <div className="flex w-full items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <AlertTriangle className="h-6 w-6 shrink-0 text-danger" />
            <CountUp
              value={highPriority}
              className="font-display text-4xl font-semibold leading-none tabular-nums text-danger sm:text-5xl"
            />
          </div>
          <span
            className={`flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-all ${
              highPriorityActive
                ? "bg-danger text-white shadow-sm"
                : "bg-surface-2/80 text-muted-foreground group-hover:bg-surface-3 group-hover:text-foreground"
            }`}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                highPriorityActive ? "bg-white" : "bg-danger/70"
              }`}
            />
            {highPriorityActive ? "Filtering · Clear" : "Filter priority"}
          </span>
        </div>
        <div className="mt-3 flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors group-hover:text-foreground">
          <span>High-priority opportunities</span>
        </div>
      </button>

      {/* Bento Card 3: Territory & System Status */}
      <div className="flex min-h-[110px] flex-col justify-between rounded-xl border border-border/40 bg-surface/40 p-4">
        <div>
          <div className={`flex items-center gap-2 text-xs font-medium ${tone.color}`}>
            <span
              className={`inline-block h-2 w-2 rounded-full ${tone.dot} ${
                isLive && !isRefreshing && !refreshFailed ? "pulse-dot" : ""
              }`}
            />
            <span>{tone.label}</span>
          </div>
          <div className="mt-1.5 line-clamp-1 text-xs text-muted-foreground">{syncCaption}</div>
        </div>

        <div className="mt-3 flex items-center gap-1.5 border-t border-border/30 pt-2 text-xs text-muted-foreground">
          <MapPin className="h-3.5 w-3.5 shrink-0 text-primary/70" />
          <span>Territory coverage: OK, AR, LA, TX</span>
        </div>
      </div>
    </div>
  );
}
