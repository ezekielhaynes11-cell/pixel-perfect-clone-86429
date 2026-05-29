import {
  ExternalLink,
  Eye,
  Bookmark,
  Sparkles,
  XCircle,
  Building2,
  Stethoscope,
  UserRound,
  Phone,
  Mail,
  Linkedin,
  ChevronDown,
  RotateCcw,
} from "lucide-react";

import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { type Lead, timeAgo } from "@/data/leads";
import type { LeadPhysician } from "@/lib/leads.functions";

const sourceMeta: Record<string, { label: string; cls: string }> = {
  sam_gov: { label: "SAM.gov", cls: "bg-blue-500/15 text-blue-300 border-blue-500/30" },
  openfda: { label: "FDA Recall", cls: "bg-red-500/15 text-red-300 border-red-500/30" },
  gdelt: { label: "News", cls: "bg-violet-500/15 text-violet-300 border-violet-500/30" },
  gdelt_m_and_a: { label: "Vendor M&A", cls: "bg-pink-500/15 text-pink-300 border-pink-500/30" },
  gdelt_va_funding: { label: "VA Funding", cls: "bg-cyan-500/15 text-cyan-300 border-cyan-500/30" },
  reddit: { label: "Reddit", cls: "bg-orange-500/15 text-orange-300 border-orange-500/30" },
  bluesky: { label: "Bluesky", cls: "bg-sky-500/15 text-sky-300 border-sky-500/30" },
  news: { label: "News", cls: "bg-violet-500/15 text-violet-300 border-violet-500/30" },
  clinicaltrials: { label: "ClinicalTrials", cls: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30" },
  cms_open_payments: { label: "CMS Payments", cls: "bg-amber-500/15 text-amber-300 border-amber-500/30" },
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
  selectable = false,
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
  selectable?: boolean;
  selected?: boolean;
  onToggleSelect?: () => void;
  dismissed?: boolean;
  onRestore?: () => void;
}) {
  const [showDocs, setShowDocs] = useState(false);
  const meta = sourceMeta[lead.source] ?? { label: lead.source, cls: "bg-surface-3 text-foreground border-border" };
  const conf = confidenceColor(lead.confidence);
  return (
    <article
      className={`fade-up group rounded-md border bg-surface-2 p-4 transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:bg-surface-3 hover:shadow-card-hover ${
        selected ? "border-primary/60 ring-1 ring-primary/40" : "border-border"
      } ${dismissed ? "opacity-60" : ""}`}
      style={{ animationDelay: `${Math.min(index * 40, 400)}ms` }}
    >
      {/* Top row: Source + Confidence + Date */}
      <div className="mb-2 flex items-center gap-3">
        {selectable && (
          <input
            type="checkbox"
            checked={selected}
            onChange={onToggleSelect}
            onClick={(e) => e.stopPropagation()}
            aria-label="Select lead"
            className="h-4 w-4 cursor-pointer accent-primary"
          />
        )}
        <span
          className={`rounded-sm border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider ${meta.cls}`}
        >
          {meta.label}
        </span>
        <div className="flex items-center gap-1.5">
          <span className={`inline-block h-3 w-3 rounded-full ${conf.split(" ")[1]}`} />
          <span className="text-xs font-semibold">{lead.confidence}% Confidence</span>
        </div>
        <span className="ml-auto text-[11px] text-muted-foreground">
          {timeAgo(lead.dateDiscovered)}
        </span>
      </div>

      {/* Title */}
      <h3 className="mb-1.5 font-display text-base font-semibold leading-snug text-foreground transition-colors group-hover:text-primary">
        {lead.title}
      </h3>

      {/* Summary */}
      <p className="mb-3 line-clamp-2 text-sm text-muted-foreground">{lead.summary}</p>

      {/* Entity chips */}
      <div className="mb-3 flex flex-wrap gap-1.5">
        {lead.hospital && (
          <span className="inline-flex items-center gap-1 rounded-full bg-surface px-2 py-0.5 text-[11px] text-foreground/80">
            <Building2 className="h-3 w-3 text-muted-foreground" />
            {lead.hospital}
          </span>
        )}
        {lead.specialty && (
          <span className="inline-flex items-center gap-1 rounded-full bg-surface px-2 py-0.5 text-[11px] text-foreground/80">
            <Stethoscope className="h-3 w-3 text-muted-foreground" />
            {lead.specialty}
          </span>
        )}
        {lead.estimatedValueUsd != null && (
          <span className="rounded-full border border-success/30 bg-success/10 px-2 py-0.5 text-[11px] text-success">
            Est. {lead.estimatedValueUsd >= 1e6 ? `$${(lead.estimatedValueUsd / 1e6).toFixed(1)}M` : `$${Math.round(lead.estimatedValueUsd / 1000)}k`}
          </span>
        )}
        {lead.entities.keywords.slice(0, 2).map((k) => (
          <span
            key={k}
            className="rounded-full border border-primary/20 bg-primary/5 px-2 py-0.5 text-[11px] text-primary"
          >
            {k}
          </span>
        ))}
      </div>

      {/* Physicians */}
      {physicians.length > 0 && (
        <div className="mb-3 rounded-md border border-border/60 bg-surface/60 p-2">
          <button
            type="button"
            onClick={() => setShowDocs((v) => !v)}
            className="flex w-full items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground"
          >
            <UserRound className="h-3 w-3" />
            {physicians.length} Physician{physicians.length > 1 ? "s" : ""}
            <ChevronDown className={`ml-auto h-3 w-3 transition-transform ${showDocs ? "rotate-180" : ""}`} />
          </button>
          {showDocs && (
            <ul className="mt-2 space-y-1.5">
              {physicians.slice(0, 6).map((p) => (
                <li key={p.npi} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
                  <span className="font-medium text-foreground">
                    {p.full_name}
                    {p.credentials ? `, ${p.credentials}` : ""}
                  </span>
                  {p.title && (
                    <span className="text-muted-foreground">· {p.title}</span>
                  )}
                  {p.primary_specialty && (
                    <span className="text-muted-foreground">· {p.primary_specialty}</span>
                  )}
                  {(p.practice_city || p.practice_state) && (
                    <span className="text-muted-foreground">
                      · {[p.practice_city, p.practice_state].filter(Boolean).join(", ")}
                    </span>
                  )}
                  {p.apollo_enriched_at && (
                    <span className="rounded-full border border-primary/20 bg-primary/5 px-2 py-0.5 text-[10px] uppercase tracking-wide text-primary/80">
                      Apollo · {timeAgo(p.apollo_enriched_at)}
                    </span>
                  )}
                  <div className="ml-auto flex items-center gap-2">
                    {p.email && (
                      <a
                        href={`mailto:${p.email}`}
                        className="flex items-center gap-1 text-primary hover:underline"
                      >
                        <Mail className="h-3 w-3" />
                        {p.email}
                      </a>
                    )}
                    {p.linkedin_url && (
                      <a
                        href={p.linkedin_url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-primary hover:underline"
                        aria-label="LinkedIn"
                      >
                        <Linkedin className="h-3 w-3" />
                      </a>
                    )}
                    {p.practice_phone && (
                      <a
                        href={`tel:${p.practice_phone}`}
                        className="flex items-center gap-1 text-primary hover:underline"
                      >
                        <Phone className="h-3 w-3" />
                        {p.practice_phone}
                      </a>
                    )}
                  </div>
                </li>
              ))}
            </ul>

          )}
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => onView(lead)}
          className="flex h-8 items-center gap-1.5 rounded-sm border border-border px-3 text-xs text-foreground/80 transition-colors hover:bg-surface-3 hover:text-foreground"
        >
          <Eye className="h-3.5 w-3.5" />
          View Details
        </button>
        <button
          onClick={onDraft}
          className="flex h-8 items-center gap-1.5 rounded-sm border border-primary/40 bg-primary/10 px-3 text-xs text-primary transition-colors hover:bg-primary/20"
        >
          <Sparkles className="h-3.5 w-3.5" />
          Draft outreach
        </button>
        <button
          onClick={onSave}
          className={
            saved
              ? "flex h-8 items-center gap-1.5 rounded-sm border border-primary/40 bg-primary/10 px-3 text-xs text-primary transition-colors hover:bg-primary/20"
              : "flex h-8 items-center gap-1.5 rounded-sm border border-border px-3 text-xs text-foreground/80 transition-colors hover:bg-surface-3 hover:text-foreground"
          }
        >
          <Bookmark className="h-3.5 w-3.5" fill={saved ? "currentColor" : "none"} />
          {saved ? "Saved" : "Save"}
        </button>
        {dismissed ? (
          <button
            onClick={onRestore}
            className="flex h-8 items-center gap-1.5 rounded-sm border border-border px-3 text-xs text-foreground/80 transition-colors hover:bg-success/10 hover:text-success"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Restore
          </button>
        ) : (
          <button
            onClick={onDismiss}
            className="flex h-8 items-center gap-1.5 rounded-sm border border-border px-3 text-xs text-foreground/80 transition-colors hover:bg-destructive/10 hover:text-destructive"
          >
            <XCircle className="h-3.5 w-3.5" />
            Dismiss
          </button>
        )}
        {lead.accountId && (
          <Link
            to="/accounts/$id"
            params={{ id: lead.accountId }}
            className="flex h-8 items-center gap-1.5 rounded-sm border border-border px-3 text-xs text-foreground/80 transition-colors hover:bg-surface-3 hover:text-foreground"
          >
            <Building2 className="h-3.5 w-3.5" />
            View account
          </Link>
        )}
        <a
          href={lead.sourceUrl}
          target="_blank"
          rel="noreferrer"
          className="ml-auto flex h-8 items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-primary"
        >
          Source
          <ExternalLink className="h-3 w-3" />
        </a>
      </div>
    </article>
  );
}
