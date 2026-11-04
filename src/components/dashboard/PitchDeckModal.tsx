import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Presentation,
  Copy,
  Check,
  Sparkles,
  Download,
  Building2,
  DollarSign,
  Cpu,
  Layers,
} from "lucide-react";
import { toast } from "sonner";
import type { Lead } from "@/data/leads";

function formatCurrency(val: number | null | undefined): string {
  if (val == null || val <= 0) return "Capital allocation pending";
  if (val >= 1e6) {
    return `$${(val / 1e6).toFixed(1)}M USD`;
  }
  return `$${Math.round(val / 1000)}k USD`;
}

export function PitchDeckModal({
  lead,
  open,
  onOpenChange,
  onDraftOutreach,
}: {
  lead: Lead | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDraftOutreach?: (lead: Lead) => void;
}) {
  const [copied, setCopied] = useState(false);

  if (!lead) return null;

  const hospitalName = lead.hospital || "Regional Healthcare Facility";
  const equipmentFocus =
    lead.entities.equipment.length > 0
      ? lead.entities.equipment.join(", ")
      : "Interventional Imaging & Diagnostic Solutions";
  const formattedValue = formatCurrency(lead.estimatedValueUsd);

  const deckOutline = `# Executive Briefing & Sales Pitch Deck
## Target Facility: ${hospitalName} (${lead.territory || "TX/OK/AR/LA"})
## Initiative: ${lead.title}
## Estimated Contract Value: ${formattedValue} | Confidence: ${lead.confidence}%

---
### Slide 1: Clinical Challenge & Strategic Opportunity
- **Facility**: ${hospitalName}
- **Initiative Focus**: ${lead.title}
- **Clinical Need**: Address patient transfer bottlenecks and modernize aging diagnostic imaging infrastructure to retain high-acuity surgical and interventional procedures locally.
- **Trigger Signal**: Discovered via ${lead.source} (${lead.signalType || "Capital Procurement"}).

---
### Slide 2: Financial & Procurement Justification
- **Estimated Capital Value**: ${formattedValue}
- **Funding & Grant Alignment**: Leveraging regional healthcare transformation funds, federal appropriations, and hospital capital reserves.
- **Budget Window**: Current performance horizon with procurement milestones targeted for Q4 2026 / FY2027.
- **ROI Drivers**: Increased room throughput, lower radiation exposure per procedure, and operational warranty uptime.

---
### Slide 3: The Philips Clinical Solution (Azurion & Advanced Imaging)
- **Proposed Technology**: ${equipmentFocus} (Philips Azurion 7 / CT 5300 / Affiniti Ultrasound Suites).
- **Competitive Advantage**: Seamless tableside workflow integration, DoseWise radiation optimization, and modular upgradability over legacy systems (${lead.competitorIncumbent ? `Displacing incumbent ${lead.competitorIncumbent}` : "Replacing aging multi-vendor footprint"}).
- **Staff Retention & Onboarding**: Simplified UI designed for cross-trained clinical staff and traveling technicians.

---
### Slide 4: Strategic Roadmap & Decision-Maker Engagement
- **Next Milestone**: On-site clinical workflow assessment and preliminary architectural room planning.
- **Decision-Makers**: Radiology administration, Cath Lab Medical Director, and Chief Financial Officer.
- **Call-to-Action**: Schedule a 20-minute executive presentation with the Philips regional solutions architecture team.
`;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(deckOutline);
      setCopied(true);
      toast.success("Executive pitch deck outline copied to clipboard");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Failed to copy outline to clipboard");
    }
  };

  const handleDownload = () => {
    const blob = new Blob([deckOutline], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `pitch-deck-${lead.id.slice(0, 8)}.md`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Downloaded presentation brief");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto border-border/60 bg-card p-6 shadow-2xl">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-400">
              <Presentation className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle className="font-display text-lg font-semibold text-foreground">
                Executive Pitch Deck &amp; Opportunity Brief
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                Tailored 4-slide executive presentation outline for {hospitalName}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* Presentation Slide Carousel / Grid */}
        <div className="mt-4 space-y-4">
          {/* Slide 1 */}
          <div className="rounded-xl border border-border/50 bg-surface/50 p-4 transition-colors hover:border-primary/30">
            <div className="mb-2 flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-primary">
                <Layers className="h-3.5 w-3.5" />
                Slide 1 · Clinical Challenge &amp; Strategic Opportunity
              </span>
              <span className="rounded bg-surface-2 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                Executive Context
              </span>
            </div>
            <h4 className="font-display text-sm font-semibold text-foreground">{lead.title}</h4>
            <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
              <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
              <span>{hospitalName}</span>
              {lead.territory && <span className="rounded bg-surface-2 px-1.5 py-0.2">{lead.territory}</span>}
            </div>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{lead.summary}</p>
          </div>

          {/* Slide 2 */}
          <div className="rounded-xl border border-border/50 bg-surface/50 p-4 transition-colors hover:border-primary/30">
            <div className="mb-2 flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-emerald-400">
                <DollarSign className="h-3.5 w-3.5" />
                Slide 2 · Financial &amp; Procurement Framework
              </span>
              <span className="rounded bg-surface-2 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                Capital Justification
              </span>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="rounded-lg border border-border/40 bg-surface-2/40 p-2.5">
                <div className="text-[11px] text-muted-foreground">Estimated Contract Value</div>
                <div className="font-display text-base font-bold tabular-nums text-foreground">{formattedValue}</div>
              </div>
              <div className="rounded-lg border border-border/40 bg-surface-2/40 p-2.5">
                <div className="text-[11px] text-muted-foreground">Procurement Confidence</div>
                <div className="font-display text-base font-bold tabular-nums text-primary">{lead.confidence}% Verified</div>
              </div>
            </div>
            <p className="mt-2.5 text-xs text-muted-foreground">
              Strategic procurement window aligned with regional healthcare budget approvals and capital renewal cycles.
            </p>
          </div>

          {/* Slide 3 */}
          <div className="rounded-xl border border-border/50 bg-surface/50 p-4 transition-colors hover:border-primary/30">
            <div className="mb-2 flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-primary">
                <Cpu className="h-3.5 w-3.5" />
                Slide 3 · The Philips Clinical Advantage
              </span>
              <span className="rounded bg-surface-2 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                Clinical Workflow
              </span>
            </div>
            <div className="space-y-1.5 text-xs text-foreground/90">
              <div className="flex items-start gap-2">
                <span className="mt-1 h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
                <span>
                  <strong>Technology Focus:</strong> {equipmentFocus}
                </span>
              </div>
              {lead.competitorIncumbent && (
                <div className="flex items-start gap-2">
                  <span className="mt-1 h-1.5 w-1.5 rounded-full bg-amber-400 shrink-0" />
                  <span>
                    <strong>Incumbent Displacement:</strong> Targeting replacement of {lead.competitorIncumbent} equipment.
                  </span>
                </div>
              )}
              <div className="flex items-start gap-2">
                <span className="mt-1 h-1.5 w-1.5 rounded-full bg-emerald-400 shrink-0" />
                <span>
                  <strong>Throughput &amp; Safety:</strong> Industry-leading tableside controls and DoseWise radiation reduction.
                </span>
              </div>
            </div>
          </div>

          {/* Slide 4 */}
          <div className="rounded-xl border border-border/50 bg-surface/50 p-4 transition-colors hover:border-primary/30">
            <div className="mb-2 flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-purple-400">
                <Presentation className="h-3.5 w-3.5" />
                Slide 4 · Engagement Roadmap &amp; Next Steps
              </span>
              <span className="rounded bg-surface-2 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                Call to Action
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              Propose an on-site clinical workflow assessment and virtual architectural demonstration for the hospital purchasing committee.
            </p>
          </div>
        </div>

        {/* Modal Action Footer: High-contrast, minimum 44px touch targets */}
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-border/40 pt-4">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleCopy}
              className="flex min-h-[44px] items-center gap-2 rounded-lg border border-border/60 bg-surface px-4 text-xs font-medium text-foreground transition-all hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              {copied ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
              <span>{copied ? "Copied!" : "Copy Outline"}</span>
            </button>

            <button
              type="button"
              onClick={handleDownload}
              className="flex min-h-[44px] items-center gap-2 rounded-lg border border-border/60 bg-surface px-4 text-xs font-medium text-foreground transition-all hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <Download className="h-4 w-4" />
              <span>Download (.md)</span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            {onDraftOutreach && (
              <button
                type="button"
                onClick={() => {
                  onOpenChange(false);
                  onDraftOutreach(lead);
                }}
                className="flex min-h-[44px] items-center gap-2 rounded-lg bg-primary px-4 text-xs font-semibold text-primary-foreground shadow-sm transition-all hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <Sparkles className="h-4 w-4" />
                <span>Draft Outreach for Deck</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="flex min-h-[44px] items-center rounded-lg border border-border/60 bg-surface px-4 text-xs font-medium text-muted-foreground transition-all hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              Close
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
