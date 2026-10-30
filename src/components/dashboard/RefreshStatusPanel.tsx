import { useState } from "react";
import { RefreshCw, AlertCircle, CheckCircle2, CircleDashed, Info } from "lucide-react";
import type { RefreshStatus } from "@/lib/refresh.functions";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export function formatWhen(iso: string | null | undefined): string {
  if (!iso) return "Never";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "Never";
  const mins = Math.max(0, Math.round((Date.now() - t) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 48) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

export interface RunRow {
  source: string;
  status: string;
  started_at: string;
  finished_at: string | null;
  fetched_count: number | null;
  new_count: number | null;
  enriched_count?: number | null;
}

export function RefreshStatusPanel({
  status,
  isLoading,
  isRunning,
  onRefresh,
  runs,
}: {
  status: RefreshStatus | undefined;
  isLoading: boolean;
  isRunning: boolean;
  onRefresh?: () => void;
  runs: RunRow[];
}) {
  const [open, setOpen] = useState(false);
  const state = isRunning ? "running" : (status?.status ?? "idle");
  const neverRefreshed = !status?.lastAttemptedAt;

  const tone =
    state === "running"
      ? { text: "text-primary", dot: "bg-primary", label: "Refreshing…" }
      : state === "failed"
        ? { text: "text-destructive", dot: "bg-destructive", label: "Last refresh failed" }
        : status?.isLive
          ? { text: "text-success", dot: "bg-success", label: "Live monitoring" }
          : neverRefreshed
            ? {
                text: "text-muted-foreground",
                dot: "bg-muted-foreground",
                label: "Never refreshed",
              }
            : {
                text: "text-warning",
                dot: "bg-warning",
                label: "Manual refresh required",
              };

  const Icon =
    state === "running"
      ? CircleDashed
      : state === "failed"
        ? AlertCircle
        : status?.isLive
          ? CheckCircle2
          : Info;

  return (
    <div className="rounded-md border border-border bg-surface-2 p-4">
      <div className="mb-2 flex items-center gap-2 text-[11px] uppercase tracking-wider text-muted-foreground">
        <RefreshCw className="h-3.5 w-3.5" />
        Refresh Status
      </div>

      <div className={`flex items-center gap-2 text-sm font-medium ${tone.text}`}>
        <span
          className={`inline-block h-2 w-2 rounded-full ${tone.dot} ${state === "running" ? "animate-pulse" : ""}`}
        />
        <Icon className="h-4 w-4" />
        {tone.label}
      </div>

      <dl className="mt-3 space-y-1 text-[11px] text-muted-foreground">
        <div className="flex justify-between gap-2">
          <dt>Last successful</dt>
          <dd className="text-foreground/90">{formatWhen(status?.lastSucceededAt)}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt>Last attempted</dt>
          <dd className="text-foreground/90">{formatWhen(status?.lastAttemptedAt)}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt>Records scanned / new</dt>
          <dd className="text-foreground/90">
            {status ? `${status.recordsScanned} / ${status.recordsUpdated}` : "—"}
          </dd>
        </div>
      </dl>

      {status?.status === "failed" && status.errorMessage ? (
        <div className="mt-3 rounded-sm border border-destructive/40 bg-destructive/10 p-2 text-[11px] text-destructive">
          {status.errorMessage}
        </div>
      ) : null}

      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          onClick={onRefresh}
          disabled={!onRefresh || isRunning || isLoading}
          className="flex h-8 flex-1 items-center justify-center gap-1.5 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isRunning ? "animate-spin" : ""}`} />
          {isRunning ? "Refreshing…" : "Refresh Intelligence"}
        </button>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <button
              type="button"
              className="h-8 rounded-md border border-border bg-surface px-2.5 text-xs text-foreground/80 hover:bg-surface-3 hover:text-foreground"
            >
              Details
            </button>
          </DialogTrigger>
          <DialogContent className="max-w-lg border-border bg-surface">
            <DialogHeader>
              <DialogTitle>Refresh diagnostics</DialogTitle>
              <DialogDescription>
                Ingestion state persisted server-side. Source rows come from the ingestion run log.
              </DialogDescription>
            </DialogHeader>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
              <dt className="text-muted-foreground">Current state</dt>
              <dd>{state}</dd>
              <dt className="text-muted-foreground">Trigger</dt>
              <dd>{status?.trigger ?? "—"}</dd>
              <dt className="text-muted-foreground">Last successful</dt>
              <dd>{status?.lastSucceededAt ?? "Never"}</dd>
              <dt className="text-muted-foreground">Last attempted</dt>
              <dd>{status?.lastAttemptedAt ?? "Never"}</dd>
              <dt className="text-muted-foreground">Records scanned</dt>
              <dd>{status?.recordsScanned ?? 0}</dd>
              <dt className="text-muted-foreground">New records stored</dt>
              <dd>{status?.recordsUpdated ?? 0}</dd>
              <dt className="text-muted-foreground">Sources ok / failed</dt>
              <dd>
                {status?.sourcesOk ?? 0} / {status?.sourcesFailed ?? 0}
              </dd>
            </dl>
            {status?.errorMessage ? (
              <div className="rounded-sm border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">
                <span className="font-semibold">Failure reason: </span>
                {status.errorMessage}
              </div>
            ) : null}
            <div>
              <div className="mb-1 text-[11px] uppercase tracking-wider text-muted-foreground">
                Recent source runs
              </div>
              {runs.length === 0 ? (
                <div className="text-xs text-muted-foreground">No ingestion runs recorded yet.</div>
              ) : (
                <ul className="max-h-56 space-y-1 overflow-y-auto text-xs">
                  {runs.map((r, i) => (
                    <li
                      key={`${r.source}-${r.started_at}-${i}`}
                      className="flex items-center gap-2 rounded-sm bg-surface-2 px-2 py-1"
                    >
                      <span
                        className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                          r.status === "error"
                            ? "bg-destructive"
                            : r.status === "running"
                              ? "bg-primary"
                              : "bg-success"
                        }`}
                      />
                      <span className="font-medium">{r.source}</span>
                      <span className="text-muted-foreground">
                        {r.fetched_count ?? 0} fetched · {r.new_count ?? 0} new
                      </span>
                      <span className="ml-auto text-muted-foreground">
                        {formatWhen(r.started_at)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
