import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Building2, MapPin, Shield, ExternalLink, Phone, FileText, Zap } from "lucide-react";
import { getAccountDetail } from "@/lib/accounts.functions";
import { timeAgo, formatUsd } from "@/data/leads";

export const Route = createFileRoute("/accounts/$id")({
  head: () => ({
    meta: [{ title: "Account — Yield Architect" }],
  }),
  component: AccountPage,
});

function AccountPage() {
  const { id } = Route.useParams();
  const fetchDetail = useServerFn(getAccountDetail);
  const q = useQuery({
    queryKey: ["account", id],
    queryFn: () => fetchDetail({ data: { id } }),
  });

  if (q.isLoading) {
    return <div className="p-10 text-sm text-muted-foreground">Loading account…</div>;
  }
  if (q.isError || !q.data) {
    return (
      <div className="p-10 text-sm text-destructive">
        Failed to load account. <Link to="/" className="underline">Back to feed</Link>
      </div>
    );
  }

  const { account, leads, physicians, scrapedPages, vendorFootprint } = q.data;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-40 h-16 border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-full max-w-[1400px] items-center gap-4 px-6">
          <Link
            to="/"
            className="flex items-center gap-1.5 rounded-md border border-border bg-surface-2 px-3 py-1.5 text-xs font-medium text-foreground/80 transition-colors hover:bg-surface-3"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to feed
          </Link>
          <div className="font-display text-base font-bold tracking-tight">⚡ Yield Architect</div>
        </div>
      </header>

      <main className="mx-auto max-w-[1400px] px-6 py-6">
        {/* Account header */}
        <div className="mb-6 rounded-md border border-border bg-surface-2 p-5">
          <div className="flex flex-wrap items-start gap-3">
            <Building2 className="mt-1 h-6 w-6 text-primary" />
            <div className="flex-1">
              <h1 className="font-display text-2xl font-bold">{account.name}</h1>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                {account.state && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-surface px-2 py-0.5 text-foreground/80">
                    <MapPin className="h-3 w-3" /> {account.state}
                  </span>
                )}
                {account.is_va && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-cyan-500/30 bg-cyan-500/15 px-2 py-0.5 text-cyan-300">
                    <Shield className="h-3 w-3" /> VA
                  </span>
                )}
                {account.system && (
                  <span className="rounded-full bg-surface px-2 py-0.5 text-foreground/80">
                    {account.system}
                  </span>
                )}
                {account.account_type && (
                  <span className="rounded-full bg-surface px-2 py-0.5 text-foreground/80">
                    {account.account_type}
                  </span>
                )}
              </div>
              {account.notes && (
                <p className="mt-3 text-sm text-muted-foreground">{account.notes}</p>
              )}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
          <div className="space-y-6">
            {/* Signal timeline */}
            <section>
              <h2 className="mb-3 font-display text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                Signal Timeline ({leads.length})
              </h2>
              {leads.length === 0 ? (
                <div className="rounded-md border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
                  No signals captured for this account yet.
                </div>
              ) : (
                <ul className="space-y-2">
                  {leads.map((l) => (
                    <li
                      key={l.id}
                      className="rounded-md border border-border bg-surface-2 p-3 transition-colors hover:border-primary/40"
                    >
                      <div className="mb-1 flex items-center gap-2 text-[11px] text-muted-foreground">
                        <Zap className="h-3 w-3 text-primary" />
                        <span className="uppercase tracking-wider">{l.signal_type ?? l.source}</span>
                        <span>· {timeAgo(l.date_discovered)}</span>
                        <span className="ml-auto font-semibold text-foreground">{l.confidence}%</span>
                      </div>
                      <div className="font-medium">{l.title}</div>
                      {l.summary && (
                        <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{l.summary}</p>
                      )}
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                        {l.vendor_mentions.map((v) => (
                          <span
                            key={v}
                            className="rounded-full border border-primary/20 bg-primary/5 px-2 py-0.5 text-primary"
                          >
                            {v}
                          </span>
                        ))}
                        {l.estimated_value_usd != null && (
                          <span className="rounded-full border border-success/30 bg-success/10 px-2 py-0.5 text-success">
                            {formatUsd(l.estimated_value_usd)}
                          </span>
                        )}
                        {l.source_url && (
                          <a
                            href={l.source_url}
                            target="_blank"
                            rel="noreferrer"
                            className="ml-auto flex items-center gap-1 text-muted-foreground hover:text-primary"
                          >
                            Source <ExternalLink className="h-3 w-3" />
                          </a>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* Physicians */}
            <section>
              <h2 className="mb-3 font-display text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                Physicians ({physicians.length})
              </h2>
              {physicians.length === 0 ? (
                <div className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                  No physicians linked yet.
                </div>
              ) : (
                <ul className="space-y-1.5">
                  {physicians.map((p) => (
                    <li
                      key={p.npi}
                      className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-border bg-surface-2 px-3 py-2 text-sm"
                    >
                      <span className="font-medium">
                        {p.full_name}
                        {p.credentials ? `, ${p.credentials}` : ""}
                      </span>
                      {p.role_hint && (
                        <span className="rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[11px] text-primary">
                          {p.role_hint}
                        </span>
                      )}
                      {p.primary_specialty && (
                        <span className="text-xs text-muted-foreground">{p.primary_specialty}</span>
                      )}
                      {(p.practice_city || p.practice_state) && (
                        <span className="text-xs text-muted-foreground">
                          {[p.practice_city, p.practice_state].filter(Boolean).join(", ")}
                        </span>
                      )}
                      {p.practice_phone && (
                        <a
                          href={`tel:${p.practice_phone}`}
                          className="ml-auto flex items-center gap-1 text-xs text-primary hover:underline"
                        >
                          <Phone className="h-3 w-3" /> {p.practice_phone}
                        </a>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          {/* Sidebar */}
          <aside className="space-y-4">
            <div className="rounded-md border border-border bg-surface-2 p-4">
              <h3 className="mb-2 font-display text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Vendor Footprint
              </h3>
              {vendorFootprint.length === 0 ? (
                <p className="text-xs text-muted-foreground">No vendor mentions detected.</p>
              ) : (
                <ul className="space-y-1.5">
                  {vendorFootprint.map((v) => (
                    <li key={v.vendor} className="flex items-center justify-between text-sm">
                      <span>{v.vendor}</span>
                      <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-semibold text-primary">
                        {v.mentions}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="rounded-md border border-border bg-surface-2 p-4">
              <h3 className="mb-2 flex items-center gap-1.5 font-display text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <FileText className="h-3.5 w-3.5" /> Scraped Pages ({scrapedPages.length})
              </h3>
              {scrapedPages.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  No pages scraped. Use Settings → Keywords to add hospital URLs.
                </p>
              ) : (
                <ul className="space-y-1.5">
                  {scrapedPages.map((p) => (
                    <li key={p.id} className="text-xs">
                      <a
                        href={p.url}
                        target="_blank"
                        rel="noreferrer"
                        className="block truncate text-primary hover:underline"
                      >
                        {p.title ?? p.url}
                      </a>
                      <span className="text-muted-foreground">{timeAgo(p.fetched_at)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}
