import { useState, useEffect, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { X, Sparkles, Copy, Mail, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  generateOutreachDraft,
  listDraftsForLead,
  updateOutreachDraft,
} from "@/lib/leads.functions";
import type { Lead } from "@/data/leads";

type Tone = "discovery" | "follow_up" | "executive_intro";

const TONE_LABEL: Record<Tone, string> = {
  discovery: "Discovery",
  follow_up: "Follow-up",
  executive_intro: "Exec intro",
};

export function OutreachDraftDialog({
  lead,
  open,
  onClose,
}: {
  lead: Lead | null;
  open: boolean;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const fetchDrafts = useServerFn(listDraftsForLead);
  const generate = useServerFn(generateOutreachDraft);
  const update = useServerFn(updateOutreachDraft);
  const [tone, setTone] = useState<Tone>("discovery");
  const [draftId, setDraftId] = useState<string | null>(null);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");

  const drafts = useQuery({
    queryKey: ["outreach_drafts", lead?.id],
    queryFn: () => fetchDrafts({ data: { lead_id: lead!.id } }),
    enabled: !!lead && open,
  });

  // Seed the editor from saved drafts ONCE per lead. A background refetch (e.g.
  // window focus, or the invalidation after "Save edits") must not overwrite
  // whatever the rep is currently typing.
  const seededLeadRef = useRef<string | null>(null);
  useEffect(() => {
    if (!lead || drafts.isLoading) return;
    if (seededLeadRef.current === lead.id) return;
    seededLeadRef.current = lead.id;
    const latest = drafts.data?.[0];
    if (latest) {
      setDraftId(latest.id);
      setSubject(latest.subject);
      setBody(latest.body);
    } else {
      setDraftId(null);
      setSubject("");
      setBody("");
    }
  }, [lead, drafts.data, drafts.isLoading]);

  const gen = useMutation({
    mutationFn: () => generate({ data: { lead_id: lead!.id, tone } }),
    onSuccess: (saved) => {
      if (!saved) return;
      setDraftId(saved.id);
      setSubject(saved.subject);
      setBody(saved.body);
      qc.invalidateQueries({ queryKey: ["outreach_drafts", lead?.id] });
      toast.success("Draft generated");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Generation failed"),
  });

  const save = useMutation({
    mutationFn: () => update({ data: { id: draftId!, subject, body } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["outreach_drafts", lead?.id] });
      toast.success("Saved");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Save failed"),
  });

  if (!open || !lead) return null;

  // Prefill the recipient from the best known email on the lead so "Open in mail"
  // doesn't drop the address the app already has.
  const recipient = lead.sourceContacts?.find((c) => c.email)?.email ?? "";

  const copyAll = async () => {
    await navigator.clipboard.writeText(`Subject: ${subject}\n\n${body}`);
    toast.success("Copied to clipboard");
  };

  const mailto = () => {
    const to = recipient ? encodeURIComponent(recipient) : "";
    const url = `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.location.href = url;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-4 backdrop-blur-sm md:p-8">
      <div className="fade-up w-full max-w-2xl rounded-lg border border-border bg-surface shadow-2xl">
        <div className="flex items-start justify-between border-b border-border p-5">
          <div>
            <div className="mb-1 flex items-center gap-1.5 text-xs uppercase tracking-wider text-muted-foreground">
              <Sparkles className="h-3.5 w-3.5 text-primary" />
              AI-drafted outreach
            </div>
            <h2 className="font-display text-lg font-semibold leading-tight">{lead.title}</h2>
            <div className="mt-1 text-xs text-muted-foreground">
              {lead.hospital ?? "—"} · {lead.specialty ?? "—"}
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 p-5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs uppercase tracking-wider text-muted-foreground">Tone</span>
            {(Object.keys(TONE_LABEL) as Tone[]).map((t) => (
              <button
                key={t}
                onClick={() => setTone(t)}
                className={`rounded-md border px-3 py-1 text-xs transition-colors ${
                  tone === t
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border bg-surface-2 text-foreground/80 hover:bg-surface-3"
                }`}
              >
                {TONE_LABEL[t]}
              </button>
            ))}
            <button
              onClick={() => gen.mutate()}
              disabled={gen.isPending}
              className="ml-auto flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {gen.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Sparkles className="h-3.5 w-3.5" />
              )}
              {gen.isPending
                ? "Drafting…"
                : drafts.data && drafts.data.length > 0
                  ? "Regenerate"
                  : "Generate with AI"}
            </button>
          </div>

          <div>
            <label className="mb-1 block text-[11px] uppercase tracking-wider text-muted-foreground">
              Subject
            </label>
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Subject line"
              className="w-full rounded-md border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-primary"
            />
          </div>

          <div>
            <label className="mb-1 block text-[11px] uppercase tracking-wider text-muted-foreground">
              Body
            </label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Click Generate to draft a tailored email with Gemini…"
              className="h-56 w-full resize-none rounded-md border border-border bg-surface-2 p-3 text-sm leading-relaxed outline-none focus:border-primary"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-border p-5">
          <button
            onClick={() => save.mutate()}
            disabled={!draftId || save.isPending || (!subject && !body)}
            className="h-10 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            {save.isPending ? "Saving…" : "Save edits"}
          </button>
          <button
            onClick={copyAll}
            disabled={!body}
            className="flex h-10 items-center gap-1.5 rounded-md border border-border px-3 text-sm text-foreground/80 transition-colors hover:bg-surface-2 disabled:opacity-40"
          >
            <Copy className="h-3.5 w-3.5" /> Copy
          </button>
          <button
            onClick={mailto}
            disabled={!body}
            title={
              recipient
                ? `To: ${recipient}`
                : "No recipient email on file — add it in your mail app"
            }
            className="flex h-10 items-center gap-1.5 rounded-md border border-border px-3 text-sm text-foreground/80 transition-colors hover:bg-surface-2 disabled:opacity-40"
          >
            <Mail className="h-3.5 w-3.5" /> {recipient ? "Email contact" : "Open in mail"}
          </button>
          <span className="ml-auto text-[11px] text-muted-foreground">
            {drafts.data
              ? `${drafts.data.length} draft${drafts.data.length === 1 ? "" : "s"} saved`
              : ""}
          </span>
        </div>
      </div>
    </div>
  );
}
