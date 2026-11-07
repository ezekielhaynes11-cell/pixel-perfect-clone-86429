import { RefreshCw, Database, AlertCircle, WifiOff } from "lucide-react";
import { restructureCacheDataError } from "@/lib/supabase-errors";

interface CacheDataErrorCardProps {
  error: unknown;
  onRetry: () => void;
  isRetrying?: boolean;
}

export function CacheDataErrorCard({
  error,
  onRetry,
  isRetrying = false,
}: CacheDataErrorCardProps) {
  const structured = restructureCacheDataError(error, "Sales Intelligence Feed");

  const IconComponent =
    structured.category === "schema_cache"
      ? Database
      : structured.category === "network_sync"
        ? WifiOff
        : AlertCircle;

  return (
    <div
      role="alert"
      className="rounded-xl border border-warning/30 bg-card/70 backdrop-blur-md p-6 sm:p-7 shadow-sm transition-all duration-200"
    >
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-5">
        <div className="flex items-start gap-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-warning/35 bg-warning/10 text-warning">
            <IconComponent className={`h-5 w-5 ${isRetrying ? "animate-pulse" : ""}`} />
          </div>
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-semibold tracking-tight text-foreground">
                {structured.userFacingTitle}
              </h3>
              <span className="inline-flex items-center rounded-full border border-warning/30 bg-warning/10 px-2 py-0.5 text-[10px] font-medium text-warning">
                {structured.category === "schema_cache"
                  ? "Schema Cache Synchronizing"
                  : structured.category === "network_sync"
                    ? "Network Latency Guard"
                    : "Automatic Recovery"}
              </span>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed max-w-2xl">
              {structured.userFacingMessage}
            </p>
            {structured.technicalDetail && (
              <div className="pt-1">
                <span className="inline-flex items-center gap-1.5 rounded border border-border/40 bg-surface-2/60 px-2 py-0.5 text-[10px] font-mono text-muted-foreground/80">
                  <span className="h-1.5 w-1.5 rounded-full bg-warning" />
                  Telemetry: {structured.technicalDetail.slice(0, 120)}
                </span>
              </div>
            )}
          </div>
        </div>

        <div className="flex w-full sm:w-auto shrink-0 items-center gap-2 pt-2 sm:pt-0">
          <button
            type="button"
            onClick={onRetry}
            disabled={isRetrying}
            className="flex min-h-[44px] w-full sm:w-auto items-center justify-center gap-2 rounded-lg bg-primary px-4 text-xs font-semibold text-primary-foreground shadow-sm transition-all duration-150 hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${isRetrying ? "animate-spin" : ""}`} />
            <span>{isRetrying ? "Synchronizing…" : "Reconnect & Refresh"}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
