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
} from "lucide-react";
import type { LeadContact } from "@/data/leads";
import type { LeadPhysician, ContactEnrichmentRow } from "@/lib/leads.functions";
import { supabase } from "@/integrations/supabase/client";

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

function NotAvailable() {
  return (
    <span className="italic text-muted-foreground/70">Not available</span>
  );
}

function Row({
  icon,
  label,
  value,
  href,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | null | undefined;
  href?: string;
}) {
  return (
    <div className="flex items-start gap-2 text-xs">
      <span className="mt-0.5 text-muted-foreground [&_svg]:h-3.5 [&_svg]:w-3.5">{icon}</span>
      <span className="w-20 shrink-0 text-muted-foreground">{label}</span>
      <span className="min-w-0 flex-1 break-words text-foreground/90">
        {value ? (
          href ? (
            <a href={href} className="text-primary hover:underline" target={href.startsWith("http") ? "_blank" : undefined} rel="noreferrer">
              {value}
            </a>
          ) : (
            value
          )
        ) : (
          <NotAvailable />
        )}
      </span>
    </div>
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
  const unified: UnifiedContact[] = [
    ...sourceContacts.map(sourceToContact),
    ...physicians.map(physicianToContact),
  ];
  const empty = unified.length === 0;
  const [expanded, setExpanded] = useState(0);

  const qc = useQueryClient();
  const enrichQ = useQuery({
    queryKey: ["contact_enrichment", leadId],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke<ContactEnrichmentRow>(
        "enrich-contact",
        { body: { lead_id: leadId! } },
      );
      if (error) throw error;
      return data!;
    },
    enabled: !!leadId,
    staleTime: 1000 * 60 * 60,
    retry: false,
  });

  const enrich = enrichQ.data;
  const enrichLoading = leadId && enrichQ.isLoading;
  // Badge is green if Apollo found a decision-maker OR we already have
  // NPPES/source contacts in the unified list.
  const enrichFound = enrich?.status === "found" || unified.length > 0;

  useEffect(() => {
    if (enrichFound) {
      qc.invalidateQueries({ queryKey: ["contact_enrichment_count"] });
    }
  }, [enrichFound, qc]);

  return (
    <section className="mb-3 rounded-md border border-border/60 bg-surface/60 p-3">
      <header className="mb-2 flex flex-wrap items-center gap-2">
        <UserRound className="h-3.5 w-3.5 text-muted-foreground" />
        <h4 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Contact
        </h4>
        {leadId && (
          enrichLoading ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-warning/40 bg-warning/10 px-2 py-0.5 text-[10px] font-medium text-warning">
              <Loader2 className="h-3 w-3 animate-spin" />
              Enriching…
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
          )
        )}
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

      {enrichFound && enrich && (
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
        <ContactCard contact={null} />
      ) : !empty ? (
        <ul className="space-y-2">
          {unified.map((c, i) => {
            const isOpen = i === expanded;
            return (
              <li key={c.key} className="rounded border border-border/40 bg-surface/40">
                <button
                  type="button"
                  onClick={() => setExpanded(isOpen ? -1 : i)}
                  className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-xs hover:bg-surface-3/40"
                >
                  <span className="font-medium text-foreground">
                    {c.name ?? <NotAvailable />}
                  </span>
                  {c.title && (
                    <span className="text-muted-foreground">· {c.title}</span>
                  )}
                  <span className="ml-auto flex items-center gap-2">
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
                    <ContactCard contact={c} />
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

function ContactCard({ contact }: { contact: UnifiedContact | null }) {
  return (
    <div className="space-y-1.5">
      <Row icon={<UserRound />} label="Name" value={contact?.name ?? null} />
      <Row icon={<Briefcase />} label="Title" value={contact?.title ?? null} />
      <Row icon={<Building2 />} label="Organization" value={contact?.organization ?? null} />
      <Row
        icon={<Phone />}
        label="Phone"
        value={contact?.phone ?? null}
        href={contact?.phone ? `tel:${contact.phone}` : undefined}
      />
      <Row
        icon={<Mail />}
        label="Email"
        value={contact?.email ?? null}
        href={contact?.email ? `mailto:${contact.email}` : undefined}
      />
      <Row icon={<MapPin />} label="Address" value={contact?.address ?? null} />
      {contact?.linkedin_url && (
        <Row
          icon={<Linkedin />}
          label="LinkedIn"
          value={contact.linkedin_url}
          href={contact.linkedin_url}
        />
      )}
    </div>
  );
}
