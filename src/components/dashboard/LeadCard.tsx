import { useState } from "react";
import {
  ExternalLink,
  Bookmark,
  Sparkles,
  XCircle,
  Building2,
  Stethoscope,
  RotateCcw,
  UserRound,
  MoreHorizontal,
  Cpu,
} from "lucide-react";

import { Link } from "@tanstack/react-router";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { classifyLeadType, LEAD_TYPE_LABELS, type Lead, timeAgo } from "@/data/leads";
import type { LeadPhysician } from "@/lib/leads.functions";
import { ContactSection } from "./ContactSection";

const sourceMeta: Record<string, { label: string; cls: string }> = {
  rural_rht: {
    label: "CMS Rural RHT",
    cls: "bg-lime-500/15 text-lime-300 border-lime-500/30",
  },
  sam_gov: { label: "SAM.gov", cls: "bg-blue-500/15 text-blue-300 border-blue-500/30" },
  openfda: { label: "FDA Recall", cls: "bg-red-500/15 text-red-300 border-red-500/30" },
  gdelt: { label: "News", cls: "bg-violet-500/15 text-violet-300 border-violet-500/30" },
  gdelt_m_and_a: { label: "Vendor M&A", cls: "bg-pink-500/15 text-pink-300 border-pink-500/30" },
  gdelt_va_funding: { label: "VA Funding", cls: "bg-cyan-500/15 text-cyan-300 border-cyan-500/30" },
  reddit: { label: "Reddit", cls: "bg-orange-500/15 text-orange-300 border-orange-500/30" },
  bluesky: { label: "Bluesky", cls: "bg-sky-500/15 text-sky-300 border-sky-500/30" },
  news: { label: "News", cls: "bg-violet-500/15 text-violet-300 border-violet-500/30" },
  clinicaltrials: {
    label: "ClinicalTrials",
    cls: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  },
  cms_open_payments: {
    label: "CMS Payments",
    cls: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  },
  funding_rss: { label: "Gov Funding RSS", cls: "bg-teal-500/15 text-teal-300 border-teal-500/30" },
};

function confidenceColor(c: number) {
  if (c >= 90) return "text-success bg-success";
  if (c >= 70) return "text-warning bg-warning";
  return "text-danger bg-danger";
}

export function LeadCard({
  lead,
  onView,
  index,
  physicians = [],
  onSave,
  saved = false,
  onDismiss,
  onDraft,
  selectMode = false,
  selected = false,
  onToggleSelect,
  dismissed = false,
  onRestore,
}: {
  lead: Lead;
  onView: (lead: Lead) => void;
  index: number;
  physicians?: LeadPhysician[];
  onSave?: () => void;
  saved?: boolean;
  onDismiss?: () => void;
  onDraft?: () => void;
  selectMode?: boolean;
  selected?: boolean;
  onToggleSelect?: () => void;
  dismissed?: boolean;
  onRestore?: () => void;
}) {
  const meta = sourceMeta[lead.source] ?? {
    label: lead.source,
    cls: "bg-surface-3 text-foreground border-border",
  };
  const conf = confidenceColor(lead.confidence);
  const hasContacts = (lead.sourceContacts?.length ?? 0) > 0 || physicians.length > 0;
  const [contactOpen, setContactOpen] = useState(hasContacts);
  const [isOpeningContact, setIsOpeningContact] = useState(false);

  const handleOpenContact = () => {
    setIsOpeningContact(true);
    setContactOpen(true);
  };

  const formattedValue =
    lead.estimatedValueUsd != null && lead.estimatedValueUsd > 0
      ? lead.estimatedValueUsd >= 1e6
        ? `Est. $${(lead.estimatedValueUsd / 1e6).toFixed(1)}M`
        : `Est. $${Math.round(lead.estimatedValueUsd / 1000)}k`
      : null;

  return (
    <article
      className={`fade-up group rounded-xl border bg-card/50 p-4 sm:p-5 backdrop-blur-sm transition-all duration-200 hover:scale-[1.01] hover:border-primary/40 hover:bg-card/80 hover:shadow-lg ${
        selected ? "border-primary/60 ring-1 ring-primary/40" : "border-border/40"
      } ${dismissed ? "opacity-60" : ""}`}
      style={{ animationDelay: `${Math.min(index * 30, 300)}ms` }}
    >
      {/* Top row: Badges + Tabular metrics + Timestamp */}
      <div className="mb-2.5 flex flex-wrap items-center gap-2">
        {selectMode && (
          <div className="flex min-h-[32px] items-center">
            <input
              type="checkbox"
              checked={selected}
              onChange={onToggleSelect}
              onClick={(e) => e.stopPropagation()}
              aria-label="Select lead"
              className="h-4 w-4 cursor-pointer accent-primary"
            />
          </div>
        )}
        <span
          className={`rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${meta.cls}`}
        >
          {meta.label}
        </span>
        <span className="hidden rounded-md border border-border/70 bg-surface/70 px-2 py-0.5 text-[10px] font-medium text-muted-foreground sm:inline-block">
          {LEAD_TYPE_LABELS[classifyLeadType(lead)]}
        </span>

        {/* Tabular figures: Confidence & Deal Value grouped together */}
        <div className="flex items-center gap-2 rounded-md border border-border/40 bg-surface/40 px-2 py-0.5">
          <span className={`inline-block h-2 w-2 rounded-full ${conf.split(" ")[1]}`} />
          <span className="text-xs font-semibold tabular-nums text-foreground">
            {lead.confidence}%
          </span>
          <span className="text-[10px] text-muted-foreground">conf.</span>
        </div>

        {formattedValue ? (
          <span className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-xs font-semibold tabular-nums text-emerald-400">
            {formattedValue}
          </span>
        ) : (
          <span className="rounded-md border border-border/30 bg-surface/30 px-2 py-0.5 text-xs tabular-nums text-muted-foreground/80">
            Est. value TBD
          </span>
        )}

        <span className="ml-auto text-xs tabular-nums text-muted-foreground">
          {timeAgo(lead.dateDiscovered)}
        </span>
      </div>

      {/* Clickable body — opens the detail modal */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => onView(lead)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onView(lead);
          }
        }}
        aria-label={`View details for ${lead.title}`}
        className="-mx-1 cursor-pointer rounded-lg px-1 py-0.5 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary"
      >
        {/* Title */}
        <h3 className="mb-1.5 font-display text-base font-semibold leading-snug text-foreground transition-colors group-hover:text-primary">
          {lead.title}
        </h3>

        {/* Summary */}
        <p className="line-clamp-2 text-sm leading-relaxed text-muted-foreground">{lead.summary}</p>
      </div>

      {/* Entity chips */}
      <div className="mb-3.5 mt-3 flex flex-wrap items-center gap-1.5">
        {lead.hospital && (
          <span className="inline-flex items-center gap-1 rounded-full border border-border/40 bg-surface/60 px-2.5 py-0.5 text-xs text-foreground/85">
            <Building2 className="h-3 w-3 text-muted-foreground" />
            {lead.hospital}
          </span>
        )}
        {lead.specialty && (
          <span className="inline-flex items-center gap-1 rounded-full border border-border/40 bg-surface/60 px-2.5 py-0.5 text-xs text-foreground/85">
            <Stethoscope className="h-3 w-3 text-muted-foreground" />
            {lead.specialty}
          </span>
        )}
        {lead.entities.equipment.slice(0, 2).map((equip) => (
          <span
            key={`eq:${equip}`}
            className="inline-flex items-center gap-1 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2.5 py-0.5 text-xs text-emerald-300"
          >
            <Cpu className="h-3 w-3" />
            {equip}
          </span>
        ))}
        {lead.entities.equipment.length === 0 &&
          lead.entities.keywords.slice(0, 2).map((keyword) => (
            <span
              key={keyword}
              className="rounded-full border border-primary/20 bg-primary/5 px-2.5 py-0.5 text-xs text-primary"
            >
              {keyword}
            </span>
          ))}
      </div>

      {/* Contact Section — min-height preserved to prevent jarring layout shifts */}
      <div className="min-h-[44px]">
        {contactOpen || hasContacts ? (
          <ContactSection
            sourceContacts={lead.sourceContacts ?? []}
            physicians={physicians}
            leadId={lead.id}
            autoEnrichOnOpen={!hasContacts}
          />
        ) : (
          <button
            type="button"
            onClick={handleOpenContact}
            className="mb-3 flex min-h-[44px] w-full items-center justify-center gap-2 rounded-lg border border-dashed border-border/70 bg-surface/30 px-3.5 py-2.5 text-xs font-medium text-muted-foreground transition-all duration-150 hover:border-primary/40 hover:bg-surface/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
          >
            {isOpeningContact ? (
              <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            ) : (
              <UserRound className="h-3.5 w-3.5 text-muted-foreground" />
            )}
            <span>Show contact &amp; enrich decision-maker</span>
          </button>
        )}
      </div>

      {/* Actions: Standardized design tokens & minimum 44px touch targets */}
      <div
        className="flex flex-wrap items-center gap-2 pt-1"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <button
          onClick={onDraft}
          className="flex min-h-[44px] items-center gap-2 rounded-lg bg-primary px-4 text-xs font-semibold text-primary-foreground shadow-sm transition-all duration-150 hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
        >
          <Sparkles className="h-4 w-4" />
          <span>Draft outreach</span>
        </button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label="More actions"
              title="More actions"
              className="ml-auto flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg border border-border/50 bg-card/60 text-muted-foreground transition-all duration-150 hover:bg-card hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
            >
              <MoreHorizontal className="h-4 w-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48 border-border bg-surface">
            <DropdownMenuItem onSelect={() => onSave?.()}>
              <Bookmark className="h-4 w-4" fill={saved ? "currentColor" : "none"} />
              {saved ? "Unsave" : "Save"}
            </DropdownMenuItem>
            {dismissed ? (
              <DropdownMenuItem onSelect={() => onRestore?.()}>
                <RotateCcw className="h-4 w-4" />
                Restore
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem
                onSelect={() => onDismiss?.()}
                className="text-destructive focus:text-destructive"
              >
                <XCircle className="h-4 w-4" />
                Dismiss
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            {lead.accountId ? (
              <DropdownMenuItem asChild>
                <Link to="/accounts/$id" params={{ id: lead.accountId }}>
                  <Building2 className="h-4 w-4" />
                  View account
                </Link>
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem disabled title="No linked account for this lead">
                <Building2 className="h-4 w-4" />
                View account
              </DropdownMenuItem>
            )}
            <DropdownMenuItem asChild>
              <a href={lead.sourceUrl} target="_blank" rel="noreferrer">
                <ExternalLink className="h-4 w-4" />
                Source
              </a>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </article>
  );
}
