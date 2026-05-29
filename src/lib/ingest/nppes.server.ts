// NPPES NPI Registry enrichment.
// Free public API — no key required. Resolves physician names to NPI + practice contact.
// Docs: https://npiregistry.cms.hhs.gov/api-page

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { apolloEnrichPhysician } from "@/lib/apollo/service.server";
import { tryConsumeApolloCall } from "@/lib/apollo/quota.server";


const NPPES_URL = "https://npiregistry.cms.hhs.gov/api/?version=2.1";

interface NppesAddress {
  address_purpose?: string;
  address_1?: string;
  address_2?: string;
  city?: string;
  state?: string;
  postal_code?: string;
  telephone_number?: string;
}

interface NppesTaxonomy {
  desc?: string;
  primary?: boolean;
}

interface NppesBasic {
  first_name?: string;
  last_name?: string;
  middle_name?: string;
  credential?: string;
  name_prefix?: string;
}

interface NppesResult {
  number?: string;
  basic?: NppesBasic;
  addresses?: NppesAddress[];
  taxonomies?: NppesTaxonomy[];
}

export interface PhysicianContact {
  npi: string;
  full_name: string;
  credentials: string | null;
  primary_specialty: string | null;
  practice_address: string | null;
  practice_city: string | null;
  practice_state: string | null;
  practice_zip: string | null;
  practice_phone: string | null;
}

export interface PhysicianLookupInput {
  rawName: string; // "Dr. Jane Smith MD" or "Jane Smith"
  state?: string | null; // 2-letter US state to narrow match
  knownNpi?: string | null; // skip NPPES lookup if we already have the NPI (CMS Open Payments)
  role?: "named_in_source" | "cms_payment_recipient";
  roleHint?: string | null; // POCUS director, fellowship director, biomed, chief, etc.
}

const NAME_PREFIX_RE = /^(dr\.?|prof\.?|mr\.?|ms\.?|mrs\.?)\s+/i;
const CREDENTIAL_RE = /,?\s+(MD|DO|RN|NP|PA|DDS|DPM|DC|PhD)\.?$/i;

function parseName(raw: string): { first: string | null; last: string | null } {
  let s = raw.trim().replace(NAME_PREFIX_RE, "").replace(CREDENTIAL_RE, "").trim();
  // Drop trailing parenthesized notes
  s = s.replace(/\s*\(.*?\)\s*$/, "");
  const parts = s.split(/\s+/).filter(Boolean);
  if (parts.length < 2) return { first: null, last: null };
  return { first: parts[0], last: parts[parts.length - 1] };
}

function pickPrimaryTaxonomy(t?: NppesTaxonomy[]): string | null {
  if (!t || t.length === 0) return null;
  return t.find((x) => x.primary)?.desc ?? t[0]?.desc ?? null;
}

function pickPracticeAddress(addrs?: NppesAddress[]): NppesAddress | null {
  if (!addrs || addrs.length === 0) return null;
  return addrs.find((a) => a.address_purpose === "LOCATION") ?? addrs[0];
}

function mapNppesToContact(r: NppesResult): PhysicianContact | null {
  if (!r.number || !r.basic) return null;
  const b = r.basic;
  const first = b.first_name ?? "";
  const last = b.last_name ?? "";
  const fullName = [b.name_prefix, first, last].filter(Boolean).join(" ").trim();
  if (!fullName) return null;
  const addr = pickPracticeAddress(r.addresses);
  return {
    npi: r.number,
    full_name: fullName,
    credentials: b.credential ?? null,
    primary_specialty: pickPrimaryTaxonomy(r.taxonomies),
    practice_address: addr?.address_1 ?? null,
    practice_city: addr?.city ?? null,
    practice_state: addr?.state ?? null,
    practice_zip: addr?.postal_code?.slice(0, 5) ?? null,
    practice_phone: addr?.telephone_number ?? null,
  };
}

async function fetchByNpi(npi: string): Promise<PhysicianContact | null> {
  const url = `${NPPES_URL}&number=${encodeURIComponent(npi)}`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const json = (await res.json().catch(() => ({}))) as { results?: NppesResult[] };
  const r = json.results?.[0];
  return r ? mapNppesToContact(r) : null;
}

async function fetchByName(
  first: string,
  last: string,
  state?: string | null,
): Promise<PhysicianContact | null> {
  const params = new URLSearchParams({
    version: "2.1",
    first_name: first,
    last_name: last,
    limit: "5",
  });
  if (state) params.set("state", state.toUpperCase());
  const url = `https://npiregistry.cms.hhs.gov/api/?${params.toString()}`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const json = (await res.json().catch(() => ({}))) as { results?: NppesResult[] };
  // If multiple matches and no state filter, take the top result but mark low confidence upstream.
  const results = json.results ?? [];
  if (results.length === 0) return null;
  return mapNppesToContact(results[0]);
}


/**
 * Resolve a list of physician references for a single lead, upsert the contacts,
 * and create lead_physicians rows. Safe to call repeatedly — uses ON CONFLICT.
 */
export async function attachPhysiciansToLead(
  leadId: string,
  refs: PhysicianLookupInput[],
): Promise<number> {
  if (refs.length === 0) return 0;
  let linked = 0;

  // Dedup by best key
  const seen = new Set<string>();
  const queue: PhysicianLookupInput[] = [];
  for (const r of refs) {
    const key = (r.knownNpi ?? r.rawName).toLowerCase().trim();
    if (seen.has(key)) continue;
    seen.add(key);
    queue.push(r);
  }

  for (const ref of queue) {
    try {
      let contact: PhysicianContact | null = null;
      let confidence = 1.0;

      if (ref.knownNpi) {
        // Try cache first
        const { data: cached } = await supabaseAdmin
          .from("physician_contacts")
          .select("*")
          .eq("npi", ref.knownNpi)
          .maybeSingle();
        contact = (cached as PhysicianContact | null) ?? (await fetchByNpi(ref.knownNpi));
      } else {
        const { first, last } = parseName(ref.rawName);
        if (!first || !last) continue;
        confidence = ref.state ? 0.85 : 0.6;
        contact = await fetchByName(first, last, ref.state ?? undefined);
        // Gentle rate-limit pacing
        await new Promise((r) => setTimeout(r, 250));
      }

      if (!contact) continue;

      await supabaseAdmin
        .from("physician_contacts")
        .upsert(
          {
            npi: contact.npi,
            full_name: contact.full_name,
            credentials: contact.credentials,
            primary_specialty: contact.primary_specialty,
            practice_address: contact.practice_address,
            practice_city: contact.practice_city,
            practice_state: contact.practice_state,
            practice_zip: contact.practice_zip,
            practice_phone: contact.practice_phone,
            last_verified_at: new Date().toISOString(),
          },
          { onConflict: "npi" },
        );

      const { error: linkErr } = await supabaseAdmin
        .from("lead_physicians")
        .insert({
          lead_id: leadId,
          npi: contact.npi,
          role: ref.role ?? "named_in_source",
          role_hint: ref.roleHint ?? null,
          match_confidence: confidence,
        });
      if (!linkErr) linked++;
      else if (!linkErr.message?.includes("duplicate")) {
        console.error("lead_physicians insert:", linkErr.message);
      }
    } catch (e) {
      console.error("NPPES lookup failed:", e instanceof Error ? e.message : e);
    }
  }
  return linked;
}
