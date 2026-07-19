import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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
import type { LeadPhysician, ManualContact } from "@/lib/leads.functions";
import { fetchContactEnrichment, listLeadContacts } from "@/lib/leads.functions";

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
  // True when this record should surface an "Enrich with Apollo" CTA:
  // it was flagged for manual sourcing, or it has no institutional email yet.
  needsApollo?: boolean;
  // True when `email` actually holds a standardized domain (e.g. "@ochsner.org")
  // used as a fallback because no concrete email is on file. Rendered as plain
  // text rather than a mailto: link.
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
  const hasEmail = !!(c.email && c.email.trim().length > 0);
  // Guardrail: institutional emails are preferred; the personal/alt email is
  // intentionally NOT surfaced for outreach here — it is backup-only.
  const emailValue = hasEmail ? c.email : (c.email_domain_standard ?? null);
  return {
    key: `manual:${c.id}`,
    name: c.contact_name,
    title: c.title,
    organization: c.account_name,
    phone: c.direct_phone ?? c.department_phone,
    email: emailValue,
    address: c.facility_address,
    origin: "Manual seed",
    needsApollo: c.needs_manual_sourcing || !hasEmail,
    emailIsFallback: !hasEmail && !!c.email_domain_standard,
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

export function ContactSection({
  sourceContacts,
  physicians,
  leadId,
}: {
  sourceContacts: LeadContact[];
  physicians: LeadPhysician[];
  leadId?: string;
}) {
  const qc = useQueryClient();

  const manualQ = useQuery({
    queryKey: ["lead_contacts", leadId],
    queryFn: () => listLeadContacts({ data: { lead_id: leadId! } }),
    enabled: !!leadId,
    staleTime: 60_000,
  });

  const unified: UnifiedContact[] = [
    ...(manualQ.data ?? []).map(manualToContact),
    ...sourceContacts.map(sourceToContact),
    ...physicians.map(physicianToContact),
  ];
  const empty = unified.length === 0;
  const [expanded, setExpanded] = useState(0);

  // Contact enrichment runs the paid Apollo waterfall, so it is NEVER fired
  // automatically on mount — it only runs when the rep clicks "Enrich with
  // Apollo" (runApollo -> refetch). enabled:false keeps the query idle until then.
  const enrichQ = useQuery({
    queryKey: ["contact_enrichment", leadId],
    queryFn: () => fetchContactEnrichment({ data: { lead_id: leadId! } }),
    enabled: false,
    staleTime: Infinity,
    retry: false,
  });

  const enrich = enrichQ.data;
  const enrichLoading = !!(leadId && (enrichQ.isLoading || enrichQ.isFetching));
  const enrichError = !!(leadId && enrichQ.isError);
  const enrichFound = enrich?.status === "found" || unified.length > 0;

  // Trigger the Apollo decision-maker waterfall on demand (user-initiated only).
  const runApollo = () => {
    if (!leadId) return;
    enrichQ.refetch();
  };

  useEffect(() => {
    if (enrichFound) {
      qc.invalidateQueries({ queryKey: ["contact_enrichment_count"] });
    }
  }, [enrichFound, qc]);

  const errorMessage = enrichQ.error
    ? ((enrichQ.error as { message?: string }).message ?? "Unknown error")
    : "";

  return (
    <section className="mb-3 rounded-md border border-border/60 bg-surface/60 p-3">
      <header className="mb-2 flex flex-wrap items-center gap-2">
        <UserRound className="h-3.5 w-3.5 text-muted-foreground" />
        <h4 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Contact
        </h4>

        {leadId &&
          (enrichLoading ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-warning/40 bg-warning/10 px-2 py-0.5 text-[10px] font-medium text-warning">
              <Loader2 className="h-3 w-3 animate-spin" />
              Enriching…
            </span>
          ) : enrichError ? (
            <span
              title={errorMessage}
              className="inline-flex items-center gap-1 rounded-full border border-destructive/40 bg-destructive/10 px-2 py-0.5 text-[10px] font-medium text-destructive"
            >
              <XCircle className="h-3 w-3" />
              Enrichment failed
            </span>
          ) : enrichFound ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-success/40 bg-success/10 px-2 py-0.5 text-[10px] font-medium text-success">
              <CheckCircle2 className="h-3 w-3" />
              Contact found
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full border border-warning/40 bg-warning/10 px-2 py-0.5 text-[10px] font-medium text-warning">
              <AlertCircle className="h-3 w-3" />
              No contact on file
            </span>
          ))}

        {empty ? (
          !leadId && (
            <span className="ml-auto inline-flex items-center gap-1 rounded-full border border-warning/40 bg-warning/10 px-2 py-0.5 text-[10px] font-medium text-warning">
              <AlertCircle className="h-3 w-3" />
              No contact on file
            </span>
          )
        ) : (
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

      {enrichFound && enrich && enrich.status === "found" && (
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
              origin: "Apollo",
            }}
          />
        </div>
      )}

      {empty && !enrichFound ? (
        <div className="space-y-2 px-1 py-1">
          <p className="text-xs text-muted-foreground">
            No decision-maker on file yet for this account.
          </p>
          {leadId && <ApolloCTA onClick={runApollo} loading={enrichLoading} />}
        </div>
      ) : !empty ? (
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
      ) : null}
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
  // Only render rows that actually have a value — never a stack of
  // "Not available" placeholders. Missing details are surfaced via the
  // "Enrich with Apollo" CTA instead.
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
