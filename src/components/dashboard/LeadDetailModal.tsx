import { useEffect, useState } from "react";
import { X, ExternalLink, Building2, User2, Wrench, Tag, Loader2, Check } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { type Lead, timeAgo } from "@/data/leads";
import { type LeadPhysician, getLeadNote, saveLeadNote } from "@/lib/leads.functions";
import { pushLeadToCrm } from "@/lib/integrations.functions";
import { ContactSection } from "./ContactSection";

export function LeadDetailModal({
  lead,
  physicians = [],
  contacted = false,
  pushed = false,
  onMarkContacted,
  onClose,
}: {
  lead: Lead | null;
  physicians?: LeadPhysician[];
  contacted?: boolean;
  pushed?: boolean;
  onMarkContacted?: () => void;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const fetchNote = useServerFn(getLeadNote);
  const storeNote = useServerFn(saveLeadNote);
  const pushCrm = useServerFn(pushLeadToCrm);
  const leadId = lead?.id ?? null;

  const [note, setNote] = useState("");

  useEffect(() => {
    const fn = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", fn);
    return () => document.removeEventListener("keydown", fn);
  }, [onClose]);

  const noteQ = useQuery({
    queryKey: ["lead_note", leadId],
    queryFn: () => fetchNote({ data: { lead_id: leadId! } }),
    enabled: !!leadId,
    staleTime: 30_000,
  });

  // Seed the textarea when the note for the current lead loads.
  useEffect(() => {
    setNote(noteQ.data?.note ?? "");
  }, [noteQ.data, leadId]);

  const saveNote = useMutation({
    mutationFn: () => storeNote({ data: { lead_id: leadId!, note } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["lead_note", leadId] });
      toast.success("Note saved");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not save note"),
  });

  const crm = useMutation({
    mutationFn: () => pushCrm({ data: { lead_id: leadId! } }),
    onSuccess: (res) => {
      if (res && (res as { ok?: boolean }).ok === false) {
        toast.error((res as { error?: string }).error ?? "CRM push failed");
        return;
      }
      qc.invalidateQueries({ queryKey: ["lead_actions"] });
      toast.success("Pushed to CRM");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "CRM push failed"),
  });

  if (!lead) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-4 backdrop-blur-sm md:p-8">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={lead.title}
        className="fade-up w-full max-w-3xl rounded-lg border border-border bg-surface shadow-2xl"
      >
        <div className="flex items-start justify-between border-b border-border p-5">
          <div>
            <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
              <span className="uppercase tracking-wider">{lead.source}</span>
              <span>·</span>
              <span>{timeAgo(lead.dateDiscovered)}</span>
              <span>·</span>
              <span className="font-semibold text-foreground">{lead.confidence}% Confidence</span>
            </div>
            <h2 className="font-display text-xl font-semibold leading-tight">{lead.title}</h2>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-5 p-5">
          <p className="text-sm leading-relaxed text-foreground/90">{lead.summary}</p>

          <ContactSection
            sourceContacts={lead.sourceContacts ?? []}
            physicians={physicians}
            leadId={lead.id}
          />

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <EntityBlock icon={<Building2 />} title="Hospitals" items={lead.entities.hospitals} />
            <EntityBlock
              icon={<User2 />}
              title="Physicians / Teams"
              items={lead.entities.physicians}
            />
            <EntityBlock
              icon={<Wrench />}
              title="Equipment / Programs"
              items={lead.entities.equipment}
            />
            <EntityBlock icon={<Tag />} title="Keywords" items={lead.entities.keywords} />
          </div>

          <div className="rounded-md bg-surface-2 p-4">
            <div className="mb-2 flex items-center justify-between">
              <label
                htmlFor="lead-note"
                className="text-xs uppercase tracking-wider text-muted-foreground"
              >
                Notes
              </label>
              <button
                onClick={() => saveNote.mutate()}
                disabled={saveNote.isPending || note === (noteQ.data?.note ?? "")}
                className="rounded border border-border px-2 py-0.5 text-[11px] text-foreground/80 transition-colors hover:bg-surface-3 disabled:opacity-40"
              >
                {saveNote.isPending ? "Saving…" : "Save note"}
              </button>
            </div>
            <textarea
              id="lead-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Add internal notes about this opportunity..."
              className="h-20 w-full resize-none rounded border border-border bg-surface p-2 text-sm outline-none focus-visible:border-primary focus-visible:ring-1 focus-visible:ring-primary"
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

        <div className="flex flex-col gap-2 border-t border-border p-5 sm:flex-row">
          <button
            onClick={() => crm.mutate()}
            disabled={crm.isPending || pushed}
            className="flex h-10 w-full items-center justify-center gap-1.5 rounded-md bg-primary text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60 sm:flex-1"
          >
            {crm.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            {pushed ? "In CRM" : "Add to CRM"}
          </button>
          <button
            onClick={onMarkContacted}
            className={`flex h-10 w-full items-center justify-center gap-1.5 rounded-md border text-sm transition-colors sm:flex-1 sm:px-4 ${
              contacted
                ? "border-success/50 bg-success/10 text-success"
                : "border-border text-foreground/80 hover:bg-surface-2"
            }`}
          >
            {contacted ? <Check className="h-3.5 w-3.5" /> : null}
            {contacted ? "Contacted" : "Mark Contacted"}
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
          {items.map((it, idx) => (
            <span
              key={`${it}:${idx}`}
              className="rounded-full bg-surface px-2 py-0.5 text-[11px] text-foreground/90"
            >
              {it}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
