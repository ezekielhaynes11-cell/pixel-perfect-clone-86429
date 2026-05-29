import { useState } from "react";
import ReactMarkdown from "react-markdown";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Sparkles, ChevronDown, ChevronUp, ExternalLink, Loader2, Building2 } from "lucide-react";
import { toast } from "sonner";
import { listAccountBriefs, researchAccount } from "@/lib/accounts.functions";
import { enrichAccountApollo } from "@/lib/apollo.functions";

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.round(ms / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

export function AccountBrief({ accountId }: { accountId: string }) {
  const qc = useQueryClient();
  const list = useServerFn(listAccountBriefs);
  const research = useServerFn(researchAccount);
  const [open, setOpen] = useState(true);
  const [steps, setSteps] = useState<Array<{ tool: string; note: string }>>([]);

  const briefsQ = useQuery({
    queryKey: ["account-briefs", accountId],
    queryFn: () => list({ data: { account_id: accountId } }),
  });
  const latest = briefsQ.data?.[0];
  const isFresh = latest && Date.now() - new Date(latest.created_at).getTime() < 7 * 86400000;

  const run = useMutation({
    mutationFn: () => research({ data: { account_id: accountId } }),
    onMutate: () => {
      setSteps([]);
      toast.loading("Researching account…", { id: "research" });
    },
    onSuccess: (res) => {
      setSteps(res.steps);
      toast.success("Brief ready", { id: "research" });
      qc.invalidateQueries({ queryKey: ["account-briefs", accountId] });
    },
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : "Research failed", { id: "research" }),
  });

  return (
    <section className="mb-6 rounded-md border border-primary/30 bg-gradient-to-br from-primary/5 to-surface-2 p-5">
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <Sparkles className="h-4 w-4 text-primary" />
        <h2 className="font-display text-sm font-semibold uppercase tracking-wider">
          AI Account Brief
        </h2>
        {latest && (
          <span className="text-xs text-muted-foreground">
            Last updated {timeAgo(latest.created_at)}
          </span>
        )}
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => run.mutate()}
            disabled={run.isPending}
            className="flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
            title={isFresh ? "A recent brief exists — re-running will create a new one" : "Run deep-dive research"}
          >
            {run.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Sparkles className="h-3.5 w-3.5" />
            )}
            {latest ? (isFresh ? "Re-research" : "Refresh brief") : "Research account"}
          </button>
          {latest && (
            <button
              onClick={() => setOpen((v) => !v)}
              className="rounded-md border border-border bg-surface-2 p-1.5 text-foreground/70 hover:text-foreground"
            >
              {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </button>
          )}
        </div>
      </div>

      {run.isPending && (
        <div className="mb-3 space-y-1 rounded-md border border-border bg-surface p-3 text-xs text-muted-foreground">
          <div className="font-semibold text-foreground">Agent steps</div>
          {steps.length === 0 && <div>Planning…</div>}
          {steps.map((s, i) => (
            <div key={i}>
              <span className="text-primary">{s.tool}</span> · {s.note}
            </div>
          ))}
        </div>
      )}

      {!latest && !run.isPending && (
        <p className="text-sm text-muted-foreground">
          No brief yet. Click <span className="font-semibold text-foreground">Research account</span>{" "}
          to have the agent pull existing signals, scrape a hospital page if useful, and synthesize a
          strategic brief.
        </p>
      )}

      {latest && open && (
        <>
          <div className="prose prose-invert prose-sm max-w-none prose-headings:font-display prose-headings:uppercase prose-headings:tracking-wider prose-headings:text-muted-foreground prose-h2:mb-2 prose-h2:mt-4 prose-h2:text-xs prose-p:my-2 prose-li:my-0.5 prose-strong:text-foreground">
            <ReactMarkdown>{latest.markdown}</ReactMarkdown>
          </div>
          {latest.sources?.length > 0 && (
            <div className="mt-4 border-t border-border pt-3">
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Sources
              </div>
              <ul className="space-y-1">
                {latest.sources.map((s, i) => (
                  <li key={i} className="text-xs">
                    <a
                      href={s.url}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-1 text-primary hover:underline"
                    >
                      {s.note || s.url} <ExternalLink className="h-3 w-3" />
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </section>
  );
}
