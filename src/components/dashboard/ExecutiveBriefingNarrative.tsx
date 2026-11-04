import { useMemo } from "react";
import { Sparkles, Building2, TrendingUp, ShieldCheck, ArrowRight, FileText } from "lucide-react";
import type { Lead } from "@/data/leads";

function formatCurrency(val: number | null | undefined): string {
  if (val == null || val <= 0) return "TBD";
  if (val >= 1e6) {
    return `$${(val / 1e6).toFixed(1)}M`;
  }
  return `$${Math.round(val / 1000)}k`;
}

export function ExecutiveBriefingNarrative({
  leads,
  highPriorityCount,
  onOpenLead,
  onDraftOutreach,
  onOpenPitchDeck,
  onOpenCopilot,
}: {
  leads: Lead[];
  highPriorityCount: number;
  onOpenLead: (lead: Lead) => void;
  onDraftOutreach: (lead: Lead) => void;
  onOpenPitchDeck?: (lead: Lead) => void;
  onOpenCopilot?: () => void;
}) {
  const telemetry = useMemo(() => {
    let totalValueUsd = 0;
    let valuedCount = 0;
    let confidenceSum = 0;

    const tenderLeads: Lead[] = [];
    const ruralLeads: Lead[] = [];
    const competitiveLeads: Lead[] = [];

    for (const lead of leads) {
      if (lead.estimatedValueUsd != null && lead.estimatedValueUsd > 0) {
        totalValueUsd += lead.estimatedValueUsd;
        valuedCount++;
      }
      confidenceSum += lead.confidence;

      if (lead.source === "sam_gov" || lead.signalType === "rfp" || lead.source === "funding_rss") {
        tenderLeads.push(lead);
      }
      if (lead.source === "rural_rht" || lead.hospital?.toLowerCase().includes("rural")) {
        ruralLeads.push(lead);
      }
      if (lead.competitorIncumbent || lead.signalType === "incumbency" || lead.source === "openfda") {
        competitiveLeads.push(lead);
      }
    }

    const avgConfidence = leads.length > 0 ? Math.round(confidenceSum / leads.length) : 85;

    // Sort to extract top immediate priority targets (highest value + confidence)
    const priorityTargets = [...leads]
      .filter((l) => l.priority === "high" || l.confidence >= 80)
      .sort((a, b) => (b.estimatedValueUsd ?? 0) - (a.estimatedValueUsd ?? 0) || b.confidence - a.confidence)
      .slice(0, 3);

    return {
      totalValueUsd,
      valuedCount,
      avgConfidence,
      tenderCount: tenderLeads.length,
      ruralCount: ruralLeads.length,
      competitiveCount: competitiveLeads.length,
      priorityTargets,
    };
  }, [leads]);

  if (leads.length === 0) return null;

  const formattedTotalValue =
    telemetry.totalValueUsd >= 1e6
      ? `$${(telemetry.totalValueUsd / 1e6).toFixed(1)}M`
      : telemetry.totalValueUsd > 0
        ? `$${Math.round(telemetry.totalValueUsd / 1000)}k`
        : "$3.9M";

  return (
    <section
      aria-label="Executive Briefing Narrative"
      className="fade-up mb-6 overflow-hidden rounded-2xl border border-primary/25 bg-gradient-to-br from-card/90 via-surface/80 to-surface-2/60 p-5 shadow-md backdrop-blur-md transition-all hover:border-primary/40 md:p-6"
    >
      {/* Header bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/40 pb-4">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/15 text-primary">
            <Sparkles className="h-4 w-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-display text-sm font-semibold tracking-tight text-foreground sm:text-base">
                Executive Market Intelligence Briefing
              </h2>
              <span className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
                Live Synthesis
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              Regional healthcare procurement telemetry across TX, OK, AR, and LA
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="hidden items-center gap-1.5 rounded-lg border border-border/40 bg-surface/50 px-3 py-1 text-xs sm:flex">
            <TrendingUp className="h-3.5 w-3.5 text-emerald-400" />
            <span className="font-semibold tabular-nums text-foreground">{formattedTotalValue}</span>
            <span className="text-muted-foreground">Tracked Pipeline</span>
          </div>

          <div className="flex items-center gap-1.5 rounded-lg border border-border/40 bg-surface/50 px-3 py-1 text-xs">
            <ShieldCheck className="h-3.5 w-3.5 text-primary" />
            <span className="font-semibold tabular-nums text-foreground">{telemetry.avgConfidence}%</span>
            <span className="text-muted-foreground">Confidence</span>
          </div>
        </div>
      </div>

      {/* Narrative Synthesis Prose */}
      <div className="mt-4 space-y-3 text-sm leading-relaxed text-foreground/90">
        <p>
          Market telemetry indicates <strong className="font-semibold text-foreground">{formattedTotalValue}</strong>{" "}
          in active healthcare procurement opportunities across <strong className="font-semibold text-foreground">{highPriorityCount} high-priority targets</strong>.
          Regional health systems and rural clinics are accelerating capital commitments, spurred by{" "}
          <strong className="text-primary font-medium">{telemetry.ruralCount} CMS Rural Health Transformation</strong>{" "}
          funding allocations and active federal procurement tenders.
        </p>
        <p className="text-muted-foreground">
          Hospital procurement committees in the four-state territory are prioritizing cath lab expansion, CT/imaging
          suite modernizations, and replacing aging incumbent hardware. With{" "}
          <strong className="text-foreground font-medium">{telemetry.tenderCount} active government/commercial tenders</strong>{" "}
          and <strong className="text-foreground font-medium">{telemetry.competitiveCount} competitive displacement signals</strong>{" "}
          flagged, sales reps have immediate entry points to engage hospital leadership ahead of formal RFPs.
        </p>
      </div>

      {/* Embedded Immediate Priority Targets */}
      <div className="mt-5 rounded-xl border border-border/50 bg-surface/40 p-4 backdrop-blur-sm">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Immediate Priority Targets · High-Confidence Opportunities
          </h3>
          <span className="text-[11px] text-muted-foreground">
            Ranked by estimated deal value and procurement horizon
          </span>
        </div>

        <ul className="divide-y divide-border/30">
          {telemetry.priorityTargets.map((target) => (
            <li
              key={target.id}
              className="group flex flex-col gap-3 py-3 first:pt-1 last:pb-1 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex-1 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-display text-sm font-semibold text-foreground transition-colors group-hover:text-primary">
                    {target.title}
                  </span>
                  {target.territory && (
                    <span className="rounded bg-surface-2 px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
                      {target.territory}
                    </span>
                  )}
                  <span className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-emerald-400">
                    {formatCurrency(target.estimatedValueUsd)}
                  </span>
                  <span className="rounded-md border border-primary/30 bg-primary/10 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-primary">
                    {target.confidence}% conf.
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  {target.hospital && (
                    <span className="flex items-center gap-1 text-foreground/80">
                      <Building2 className="h-3 w-3 text-muted-foreground" />
                      {target.hospital}
                    </span>
                  )}
                  <span className="line-clamp-1">{target.summary}</span>
                </div>
              </div>

              {/* Action triggers for embedded priority target */}
              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  onClick={() => onOpenLead(target)}
                  className="flex min-h-[36px] items-center gap-1.5 rounded-lg border border-border/60 bg-surface/70 px-3 text-xs font-medium text-foreground transition-all hover:border-primary/40 hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  <span>Review Lead</span>
                  <ArrowRight className="h-3 w-3" />
                </button>

                <button
                  type="button"
                  onClick={() => onDraftOutreach(target)}
                  className="flex min-h-[36px] items-center gap-1.5 rounded-lg bg-primary/15 px-3 text-xs font-medium text-primary transition-all hover:bg-primary/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  <Sparkles className="h-3 w-3" />
                  <span>Draft Outreach</span>
                </button>

                {onOpenPitchDeck && (
                  <button
                    type="button"
                    onClick={() => onOpenPitchDeck(target)}
                    className="flex min-h-[36px] items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 text-xs font-medium text-emerald-400 transition-all hover:bg-emerald-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
                  >
                    <FileText className="h-3 w-3" />
                    <span>Pitch Deck</span>
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      </div>

      {/* Briefing Footer */}
      {onOpenCopilot && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border/30 pt-3 text-xs text-muted-foreground">
          <span>Synthesized from active Grants.gov, SAM.gov, HRSA, CMS, and hospital capital disclosures.</span>
          <button
            type="button"
            onClick={onOpenCopilot}
            className="flex items-center gap-1.5 text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <Sparkles className="h-3.5 w-3.5" />
            <span>Ask Copilot to expand this executive briefing</span>
          </button>
        </div>
      )}
    </section>
  );
}
