import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { listKeywords, upsertKeyword, deleteKeyword, scrapePageForAccount, listScrapedPages } from "@/lib/admin.functions";
import { bulkEnrichApollo, countUnenrichedPhysicians } from "@/lib/apollo.functions";


const KINDS = ["vendor", "product_model", "focus_concept", "role_title", "complaint_signal"] as const;
type Kind = typeof KINDS[number];

export const Route = createFileRoute("/settings/keywords")({
  head: () => ({ meta: [{ title: "Keywords & Scraping — Yield Architect" }] }),
  component: KeywordsPage,
});

function KeywordsPage() {
  const qc = useQueryClient();
  const list = useServerFn(listKeywords);
  const upsert = useServerFn(upsertKeyword);
  const del = useServerFn(deleteKeyword);
  const scrape = useServerFn(scrapePageForAccount);
  const pages = useServerFn(listScrapedPages);
  const bulkEnrich = useServerFn(bulkEnrichApollo);
  const countUnenriched = useServerFn(countUnenrichedPhysicians);

  const kw = useQuery({ queryKey: ["keywords"], queryFn: () => list() });
  const sp = useQuery({ queryKey: ["scraped_pages"], queryFn: () => pages() });
  const unenrichedQ = useQuery({ queryKey: ["physician_contacts_unenriched_count"], queryFn: () => countUnenriched() });

  const [kind, setKind] = useState<Kind>("vendor");
  const [value, setValue] = useState("");
  const [url, setUrl] = useState("");
  const [enrichLimit, setEnrichLimit] = useState(25);


  const add = useMutation({
    mutationFn: () => upsert({ data: { kind, value: value.trim(), active: true } }),
    onSuccess: () => { setValue(""); qc.invalidateQueries({ queryKey: ["keywords"] }); toast.success("Added"); },
    onError: (e: Error) => toast.error(e.message),
  });
  const remove = useMutation({
    mutationFn: (id: string) => del({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["keywords"] }),
  });
  const doScrape = useMutation({
    mutationFn: () => scrape({ data: { url: url.trim() } }),
    onSuccess: () => { setUrl(""); qc.invalidateQueries({ queryKey: ["scraped_pages"] }); toast.success("Scraped"); },
    onError: (e: Error) => toast.error(e.message),
  });
  const doBulkEnrich = useMutation({
    mutationFn: () => bulkEnrich({ data: { limit: enrichLimit } }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["physician_contacts_unenriched_count"] });
      qc.invalidateQueries({ queryKey: ["lead_physicians"] });
      qc.invalidateQueries({ queryKey: ["account_physicians"] });
      toast.success(`Attempted ${r.attempted} · Matched ${r.matched} · ${r.errors} errors`);
    },
    onError: (e: Error) => toast.error(e.message),
  });


  const grouped = (kw.data ?? []).reduce<Record<string, typeof kw.data>>((acc, k) => {
    (acc[k.kind] ||= [] as never).push(k);
    return acc;
  }, {});

  return (
    <div className="mx-auto max-w-4xl space-y-8 p-6">
      <header>
        <h1 className="font-display text-2xl font-semibold">Keywords & Scraping</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Edit the taxonomy that drives Reddit / Bluesky / GDELT / RSS matching and AI lead extraction. Paste any
          fellowship or leadership page URL to extract people and vendor mentions.
        </p>
      </header>

      <section className="rounded-md border border-border bg-surface-2 p-4">
        <h2 className="mb-3 font-medium">Add term</h2>
        <div className="flex flex-wrap gap-2">
          <select value={kind} onChange={(e) => setKind(e.target.value as Kind)}
            className="h-9 rounded-md border border-border bg-surface-3 px-2 text-sm">
            {KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
          </select>
          <input value={value} onChange={(e) => setValue(e.target.value)}
            placeholder='e.g. "TE7 Max" or "POCUS director"'
            className="h-9 flex-1 rounded-md border border-border bg-surface-3 px-3 text-sm" />
          <button onClick={() => value.trim() && add.mutate()}
            disabled={add.isPending || !value.trim()}
            className="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50">
            Add
          </button>
        </div>
      </section>

      <section className="space-y-4">
        {KINDS.map((k) => (
          <div key={k} className="rounded-md border border-border bg-surface-2 p-4">
            <h3 className="mb-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">{k}</h3>
            <div className="flex flex-wrap gap-2">
              {(grouped[k] ?? []).map((row) => (
                <span key={row.id} className="inline-flex items-center gap-1 rounded-full border border-border bg-surface-3 px-3 py-1 text-xs">
                  {row.value}
                  <button onClick={() => remove.mutate(row.id)} className="ml-1 text-muted-foreground hover:text-destructive">×</button>
                </span>
              ))}
              {(grouped[k] ?? []).length === 0 && <span className="text-xs text-muted-foreground">No terms.</span>}
            </div>
          </div>
        ))}
      </section>

      <section className="rounded-md border border-border bg-surface-2 p-4">
        <h2 className="mb-3 font-medium">Scrape a hospital / fellowship page</h2>
        <div className="flex flex-wrap gap-2">
          <input value={url} onChange={(e) => setUrl(e.target.value)}
            placeholder="https://hospital.org/emergency-medicine/fellowship"
            className="h-9 flex-1 rounded-md border border-border bg-surface-3 px-3 text-sm" />
          <button onClick={() => url.trim() && doScrape.mutate()}
            disabled={doScrape.isPending || !url.trim()}
            className="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50">
            {doScrape.isPending ? "Scraping…" : "Scrape"}
          </button>
        </div>
        <div className="mt-4 space-y-2">
          {(sp.data ?? []).map((p) => {
            const ex = (p.extracted as { summary?: string; people?: { name: string; role_hint: string | null }[]; vendor_mentions?: string[] }) ?? {};
            return (
              <div key={p.id} className="rounded border border-border bg-surface-3 p-3 text-sm">
                <a href={p.url} target="_blank" rel="noreferrer" className="font-medium text-primary hover:underline">{p.title ?? p.url}</a>
                {ex.summary && <p className="mt-1 text-muted-foreground">{ex.summary}</p>}
                {ex.people && ex.people.length > 0 && (
                  <p className="mt-1 text-xs"><span className="text-muted-foreground">People: </span>
                    {ex.people.map((p) => `${p.name}${p.role_hint ? ` (${p.role_hint})` : ""}`).join(", ")}</p>
                )}
                {ex.vendor_mentions && ex.vendor_mentions.length > 0 && (
                  <p className="mt-1 text-xs"><span className="text-muted-foreground">Vendors: </span>{ex.vendor_mentions.join(", ")}</p>
                )}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
