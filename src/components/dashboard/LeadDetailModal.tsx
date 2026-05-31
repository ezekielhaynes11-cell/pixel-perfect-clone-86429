import { useEffect } from "react";
import { X, ExternalLink, Building2, User2, Wrench, Tag, RefreshCw } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { type Lead, timeAgo } from "@/data/leads";
import type { LeadPhysician } from "@/lib/leads.functions";
import { ContactSection } from "./ContactSection";

export function LeadDetailModal({
  lead,
  physicians = [],
  onClose,
}: {
  lead: Lead | null;
  physicians?: LeadPhysician[];
  onClose: () => void;
}) {
  const qc = useQueryClient();

  useEffect(() => {
    const fn = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", fn);
    return () => document.removeEventListener("keydown", fn);
  }, [onClose]);

  if (!lead) return null;

  const handleRefreshContact = () =>
    qc.invalidateQueries({ queryKey: ["contact_enrichment", lead.id] });

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-4 backdrop-blur-sm md:p-8">
      <div className="fade-up w-full max-w-3xl rounded-lg border border-border bg-surface shadow-2xl">
        <div className="flex items-start justify-between border-b border-border p-5">
          <div>
            <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
              <span className="uppercase tracking-wider">{lead.source}</span>
              <span>·</span>
              <span>{timeAgo(lead.dateDiscovered)}</span>
              <span>·</span>
              <span className="font-semibold text-foreground">
                {lead.confidence}% Confidence
              </span>
            </div>
            <h2 className="font-display text-xl font-semibold leading-tight">
              {lead.title}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-5 p-5">
          <p className="text-sm leading-relaxed text-foreground/90">{lead.summary}</p>

          <div className="relative">
            <button
              type="button"
              onClick={handleRefreshContact}
              title="Re-run contact enrichment"
              className="absolute right-2 top-2 z-10 rounded p-1 text-muted-foreground opacity-60 transition-opacity hover:opacity-100 hover:text-foreground"
            >
              <RefreshCw className="h-3 w-3" />
            </button>
            <ContactSection sourceContacts={lead.sourceContacts ?? []} physicians={physicians} leadId={lead.id} />
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <EntityBlock icon={<Building2 />} title="Hospitals" items={lead.entities.hospitals} />
            <EntityBlock icon={<User2 />} title="Physicians / Teams" items={lead.entities.physicians} />
            <EntityBlock icon={<Wrench />} title="Equipment / Programs" items={lead.entities.equipment} />
            <EntityBlock icon={<Tag />} title="Keywords" items={lead.entities.keywords} />
          </div>

          <div className="rounded-md bg-surface-2 p-4">
            <div className="mb-2 text-xs uppercase tracking-wider text-muted-foreground">Notes</div>
            <textarea
              placeholder="Add internal notes about this opportunity..."
              className="h-20 w-full resize-none rounded border border-border bg-surface p-2 text-sm outline-none focus:border-primary"
            />
          </div>

          <a
            href={lead.sourceUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline"
          >
            View original source
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>

        <div className="flex flex-wrap gap-2 border-t border-border p-5">
          <button className="h-10 flex-1 rounded-md bg-primary text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90">
            Add to Salesforce
          </button>
          <button className="h-10 rounded-md border border-border px-4 text-sm text-foreground/80 transition-colors hover:bg-surface-2">
            Save
          </button>
          <button className="h-10 rounded-md border border-border px-4 text-sm text-foreground/80 transition-colors hover:bg-surface-2">
            Mark Contacted
          </button>
          <button className="h-10 rounded-md border border-border px-4 text-sm text-foreground/80 transition-colors hover:bg-surface-2">
            Share
          </button>
        </div>
      </div>
    </div>
  );
}

function EntityBlock({
  icon,
  title,
  items,
}: {
  icon: React.ReactNode;
  title: string;
  items: string[];
}) {
  return (
    <div className="rounded-md bg-surface-2 p-3">
      <div className="mb-2 flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
        <span className="[&_svg]:h-3.5 [&_svg]:w-3.5">{icon}</span>
        {title}
      </div>
      {items.length === 0 ? (
        <div className="text-xs text-muted-foreground/60">—</div>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {items.map((it) => (
            <span key={it} className="rounded-full bg-surface px-2 py-0.5 text-[11px] text-foreground/90">
              {it}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
