import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  UserRound,
  Mail,
  Phone,
  Linkedin,
  Building2,
  MapPin,
  Briefcase,
  AlertCircle,
  ChevronDown,
  CheckCircle2,
  Loader2,
  XCircle,
  Sparkles,
} from "lucide-react";
import type { LeadContact } from "@/data/leads";
import {
  fetchContactEnrichment,
  getCachedContactEnrichment,
  listLeadContacts,
  type ContactEnrichmentRow,
  type LeadPhysician,
  type ManualContact,
} from "@/lib/leads.functions";

interface UnifiedContact {
  key: string;
  name: string | null;
  title: string | null;
  organization: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  linkedin_url?: string | null;
  origin: string;
  needsApollo?: boolean;
  emailIsFallback?: boolean;
}

function physicianToContact(p: LeadPhysician): UnifiedContact {
  const cityState = [p.practice_city, p.practice_state].filter(Boolean).join(", ");
  const addr = [p.practice_address, cityState, p.practice_zip]
    .filter((v) => v && String(v).trim().length > 0)
    .join(", ");
  return {
    key: `phys:${p.npi}`,
    name: [p.full_name, p.credentials].filter(Boolean).join(", ") || p.full_name,
    title: p.title ?? p.primary_specialty,
    organization: cityState || null,
    phone: p.practice_phone,
    email: p.email,
    address: addr || null,
    linkedin_url: p.linkedin_url,
    origin: p.apollo_enriched_at ? "NPPES + Apollo" : "NPPES",
  };
}

function sourceToContact(c: LeadContact, idx: number): UnifiedContact {
  return {
    key: `src:${idx}:${c.email ?? c.name ?? ""}`,
    name: c.name,
    title: c.title,
    organization: c.organization,
    phone: c.phone,
    email: c.email,
    address: c.address,
    origin: c.source_origin ?? "source",
  };
}

function manualToContact(c: ManualContact): UnifiedContact {
  const hasEmail = Boolean(c.email && c.email.trim().length > 0);
  const emailValue = hasEmail ? c.email : (c.email_domain_standard ?? null);
  return {
    key: `manual:${c.id}`,
    name: c.contact_name,
    title: c.title,
    organization: c.account_name,
    phone: c.direct_phone ?? c.department_phone,
    email: emailValue,
    address: c.facility_address,
    origin: "Verified seed",
    needsApollo: c.needs_manual_sourcing || !hasEmail || !c.contact_name,
    emailIsFallback: !hasEmail && Boolean(c.email_domain_standard),
  };
}

function Row({
  icon,
  label,
  value,
  href,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  href?: string;
}) {
  return (
    <div className="flex items-start gap-2 text-xs">
      <span className="mt-0.5 text-muted-foreground [&_svg]:h-3.5 [&_svg]:w-3.5">{icon}</span>
      <span className="w-20 shrink-0 text-muted-foreground">{label}</span>
      <span className="min-w-0 flex-1 break-words text-foreground/90">
        {href ? (
          <a
            href={href}
            className="text-primary hover:underline"
            target={href.startsWith("http") ? "_blank" : undefined}
            rel="noreferrer"
          >
            {value}
          </a>
        ) : (
          value
        )}
      </span>
    </div>
  );
}

function ApolloCTA({ onClick, loading }: { onClick: () => void; loading?: boolean }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      disabled={loading}
      className="mt-1 inline-flex items-center gap-1.5 rounded-md border border-primary/40 bg-primary/10 px-2.5 py-1 text-[11px] font-medium text-primary transition-colors hover:bg-primary/20 disabled:opacity-60"
    >
      {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
      Enrich with Apollo
    </button>
  );
}

function renderStatusBadge(
  enrichLoading: boolean,
  enrichError: boolean,
  enrichFound: boolean,
  errorMessage: string,
) {
  if (enrichLoading) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-warning/40 bg-warning/10 px-2 py-0.5 text-[10px] font-medium text-warning">
        <Loader2 className="h-3 w-3 animate-spin" />
        Enriching…
      </span>
    );
  }
  if (enrichError) {
    return (
      <span
        title={errorMessage}
        className="inline-flex items-center gap-1 rounded-full border border-destructive/40 bg-destructive/10 px-2 py-0.5 text-[10px] font-medium text-destructive"
      >
        <XCircle className="h-3 w-3" />
        Enrichment failed
      </span>
    );
  }
  if (enrichFound) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-success/40 bg-success/10 px-2 py-0.5 text-[10px] font-medium text-success">
        <CheckCircle2 className="h-3 w-3" />
        Contact found
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-warning/40 bg-warning/10 px-2 py-0.5 text-[10px] font-medium text-warning">
      <AlertCircle className="h-3 w-3" />
      No contact on file
    </span>
  );
}

function mergeContacts(
  manualContacts: ManualContact[],
  sourceContacts: LeadContact[],
  physicians: LeadPhysician[],
  enrich: ContactEnrichmentRow | null | undefined,
): UnifiedContact[] {
  const rawList: UnifiedContact[] = [
    ...manualContacts.map(manualToContact),
    ...sourceContacts.map(sourceToContact),
    ...physicians.map(physicianToContact),
  ];

  // If we have an enriched decision-maker, fill in any unnamed manual seed row
  // and deduplicate by name so the user never sees duplicate cards.
  if (enrich && enrich.status === "found" && enrich.name) {
    for (const item of rawList) {
      if (!item.name) {
        item.name = enrich.name;
        item.title = enrich.title ?? item.title;
        item.phone = enrich.phone ?? item.phone;
        if (enrich.email) {
          item.email = enrich.email;
          item.emailIsFallback = false;
        }
        item.linkedin_url = enrich.linkedin_url ?? item.linkedin_url;
        item.needsApollo = false;
        item.origin = "Enriched";
      }
    }
  }

  const seenNames = new Set<string>();
  const deduped: UnifiedContact[] = [];
  for (const c of rawList) {
    const normKey = c.name
      ? c.name.toLowerCase().trim()
      : `${c.organization ?? ""}:${c.title ?? ""}`.toLowerCase();
    if (normKey && seenNames.has(normKey)) continue;
    if (normKey) seenNames.add(normKey);
    deduped.push(c);
  }
  return deduped;
}

export function ContactSection({
  sourceContacts,
  physicians,
  leadId,
  autoEnrichOnOpen = false,
}: {
  sourceContacts: LeadContact[];
  physicians: LeadPhysician[];
  leadId?: string;
  autoEnrichOnOpen?: boolean;
}) {
  const qc = useQueryClient();
  const fetchManualContacts = useServerFn(listLeadContacts);
  const fetchCachedEnrichment = useServerFn(getCachedContactEnrichment);
  const triggerEnrichment = useServerFn(fetchContactEnrichment);

  const manualQ = useQuery({
    queryKey: ["lead_contacts", leadId],
    queryFn: () => fetchManualContacts({ data: { lead_id: leadId! } }),
    enabled: Boolean(leadId),
    staleTime: 60_000,
  });

  const cachedEnrichQ = useQuery({
    queryKey: ["cached_contact_enrichment", leadId],
    queryFn: () => fetchCachedEnrichment({ data: { lead_id: leadId! } }),
    enabled: Boolean(leadId),
    staleTime: 60_000,
  });

  const enrichQ = useQuery({
    queryKey: ["contact_enrichment", leadId],
    queryFn: () => triggerEnrichment({ data: { lead_id: leadId! } }),
    enabled: false,
    staleTime: Infinity,
    retry: false,
  });

  const enrich = enrichQ.data ?? cachedEnrichQ.data ?? null;
  const unified = mergeContacts(manualQ.data ?? [], sourceContacts, physicians, enrich);
  const empty = unified.length === 0;
  const [expanded, setExpanded] = useState(0);

  const enrichLoading = Boolean(
    leadId && (enrichQ.isLoading || enrichQ.isFetching || manualQ.isLoading),
  );
  const enrichError = Boolean(leadId && enrichQ.isError);
  const enrichFound = enrich?.status === "found" || unified.length > 0;

  const runApollo = () => {
    if (!leadId) return;
    void enrichQ.refetch();
  };

  // When the user explicitly opens "Show contact & enrich decision-maker" and no
  // named contact is cached yet, automatically run the enrichment waterfall once.
  const autoTriggeredRef = useRef(false);
  useEffect(() => {
    if (!autoEnrichOnOpen || !leadId || autoTriggeredRef.current) return;
    if (manualQ.isLoading || cachedEnrichQ.isLoading) return;
    const hasNamedContact =
      (cachedEnrichQ.data?.status === "found" && Boolean(cachedEnrichQ.data.name)) ||
      unified.some((c) => Boolean(c.name && (c.phone || c.email)));
    if (!hasNamedContact) {
      autoTriggeredRef.current = true;
      void enrichQ.refetch();
    }
  }, [
    autoEnrichOnOpen,
    leadId,
    manualQ.isLoading,
    cachedEnrichQ.isLoading,
    cachedEnrichQ.data,
    unified,
    enrichQ,
  ]);

  useEffect(() => {
    if (enrichQ.data?.status === "found") {
      qc.invalidateQueries({ queryKey: ["contact_enrichment_count"] });
      qc.invalidateQueries({ queryKey: ["cached_contact_enrichment", leadId] });
      qc.invalidateQueries({ queryKey: ["leads"] });
    }
  }, [enrichQ.data, leadId, qc]);

  const errorMessage = enrichQ.error
    ? ((enrichQ.error as { message?: string }).message ?? "Unknown error")
    : "";

  const enrichAlreadyInUnified =
    Boolean(enrich?.name) &&
    unified.some((c) => c.name?.toLowerCase().trim() === enrich?.name?.toLowerCase().trim());

  return (
    <section className="mb-3 rounded-md border border-border/60 bg-surface/60 p-3">
      <header className="mb-2 flex flex-wrap items-center gap-2">
        <UserRound className="h-3.5 w-3.5 text-muted-foreground" />
        <h4 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Contact
        </h4>

        {leadId && renderStatusBadge(enrichLoading, enrichError, enrichFound, errorMessage)}

        {empty && !leadId && (
          <span className="ml-auto inline-flex items-center gap-1 rounded-full border border-warning/40 bg-warning/10 px-2 py-0.5 text-[10px] font-medium text-warning">
            <AlertCircle className="h-3 w-3" />
            No contact on file
          </span>
        )}
        {!empty && (
          <span className="ml-auto text-[10px] text-muted-foreground">
            {unified.length} contact{unified.length > 1 ? "s" : ""}
          </span>
        )}
      </header>

      {enrichError && errorMessage && (
        <div className="mb-2 rounded border border-destructive/30 bg-destructive/5 px-2 py-2 text-[11px] text-destructive">
          <span className="font-semibold">Enrichment error: </span>
          {errorMessage}
        </div>
      )}

      {enrichFound && enrich && enrich.status === "found" && !enrichAlreadyInUnified && (
        <div className="mb-2 rounded border border-success/30 bg-success/5 px-2 py-2">
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-success">
            Decision-maker
          </div>
          <ContactCard
            contact={{
              key: `apollo:${enrich.lead_id}`,
              name: enrich.name,
              title: enrich.title,
              organization: enrich.organization,
              phone: enrich.phone,
              email: enrich.email,
              address: null,
              linkedin_url: enrich.linkedin_url,
              origin: "Enriched",
            }}
          />
        </div>
      )}

      {empty && !enrichFound && (
        <div className="space-y-2 px-1 py-1">
          <p className="text-xs text-muted-foreground">
            No decision-maker on file yet for this account.
          </p>
          {leadId && <ApolloCTA onClick={runApollo} loading={enrichLoading} />}
        </div>
      )}

      {!empty && (
        <ul className="space-y-2">
          {unified.map((c, i) => {
            const isOpen = i === expanded;
            const label = c.name ?? c.title ?? "Decision-maker";
            return (
              <li key={c.key} className="rounded border border-border/40 bg-surface/40">
                <button
                  type="button"
                  onClick={() => setExpanded(isOpen ? -1 : i)}
                  className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-xs hover:bg-surface-3/40"
                >
                  <span className="font-medium text-foreground">{label}</span>
                  {c.name && c.title && <span className="text-muted-foreground">· {c.title}</span>}
                  <span className="ml-auto flex items-center gap-2">
                    {c.needsApollo && (
                      <span className="rounded-full border border-warning/40 bg-warning/10 px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-warning">
                        {c.name ? "Enrich" : "Needs sourcing"}
                      </span>
                    )}
                    <span className="rounded-full border border-border/50 bg-surface px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-muted-foreground">
                      {c.origin}
                    </span>
                    <ChevronDown
                      className={`h-3 w-3 transition-transform ${isOpen ? "rotate-180" : ""}`}
                    />
                  </span>
                </button>
                {isOpen && (
                  <div className="border-t border-border/40 px-2 py-2">
                    <ContactCard
                      contact={c}
                      onEnrich={c.needsApollo && leadId ? runApollo : undefined}
                      enriching={enrichLoading}
                    />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function ContactCard({
  contact,
  onEnrich,
  enriching,
}: {
  contact: UnifiedContact | null;
  onEnrich?: () => void;
  enriching?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      {contact?.name && <Row icon={<UserRound />} label="Name" value={contact.name} />}
      {contact?.title && <Row icon={<Briefcase />} label="Title" value={contact.title} />}
      {contact?.organization && (
        <Row icon={<Building2 />} label="Organization" value={contact.organization} />
      )}
      {contact?.phone && (
        <Row icon={<Phone />} label="Phone" value={contact.phone} href={`tel:${contact.phone}`} />
      )}
      {contact?.email && (
        <Row
          icon={<Mail />}
          label={contact.emailIsFallback ? "Email domain" : "Email"}
          value={contact.email}
          href={contact.emailIsFallback ? undefined : `mailto:${contact.email}`}
        />
      )}
      {contact?.address && <Row icon={<MapPin />} label="Address" value={contact.address} />}
      {contact?.linkedin_url && (
        <Row
          icon={<Linkedin />}
          label="LinkedIn"
          value={contact.linkedin_url}
          href={contact.linkedin_url}
        />
      )}
      {onEnrich && (contact?.needsApollo || !contact) && (
        <ApolloCTA onClick={onEnrich} loading={enriching} />
      )}
    </div>
  );
}
