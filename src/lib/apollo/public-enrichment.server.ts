import { z } from "zod";
import type { LeadContact } from "@/data/leads";
import { logWarn } from "../logger.server";
import { territoryToCode } from "../territory";

const PUBLIC_TIMEOUT_MS = 8_000;
const USER_AGENT = "YieldArchitect-SalesIntelligence/1.0 (Philips Medical Territory)";

export interface ResolvedDecisionMaker {
  name: string;
  title: string | null;
  organization: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  linkedin_url: string | null;
  npi?: string | null;
  origin: string;
}

const HOSPITAL_ALIASES: Array<{ tokens: string[]; canonical: string }> = [
  {
    tokens: ["ut southwestern", "university of texas southwestern"],
    canonical: "UT Southwestern Medical Center",
  },
  {
    tokens: [
      "uthealth",
      "university of texas health science center at houston",
      "mcgovern medical",
    ],
    canonical: "UTHealth Houston McGovern Medical School",
  },
  {
    tokens: ["ut health san antonio", "university hospital san antonio", "uthscsa"],
    canonical: "University Hospital (UT Health San Antonio)",
  },
  {
    tokens: ["debakey", "houston va", "michael e debakey"],
    canonical: "Michael E. DeBakey VA Medical Center",
  },
  {
    tokens: ["ochsner"],
    canonical: "Ochsner Health System",
  },
  {
    tokens: ["uams", "university of arkansas for medical sciences"],
    canonical: "University of Arkansas for Medical Sciences (UAMS)",
  },
  {
    tokens: ["washington regional"],
    canonical: "Washington Regional Medical Center",
  },
  {
    tokens: ["ben taub"],
    canonical: "Ben Taub Hospital",
  },
  {
    tokens: ["our lady of the lake"],
    canonical: "Our Lady of the Lake Regional Medical Center",
  },
  {
    tokens: ["ou health tulsa", "ou tulsa"],
    canonical: "OU Health - Tulsa",
  },
  {
    tokens: ["university of oklahoma", "ou health", "ou medical"],
    canonical: "University of Oklahoma (OU) Health",
  },
  {
    tokens: ["houston methodist", "methodist hospital research", "methodist sugar land"],
    canonical: "Houston Methodist Sugar Land Hospital",
  },
  {
    tokens: ["methodist dallas", "methodist health system"],
    canonical: "Methodist Dallas Medical Center",
  },
  {
    tokens: ["medical city heart", "medical city dallas", "medical city"],
    canonical: "Medical City Heart Hospital",
  },
  {
    tokens: ["texas health presbyterian", "texas health"],
    canonical: "Texas Health Presbyterian Hospital Plano",
  },
  {
    tokens: ["lyndon b johnson", "lbj hospital", "harris health"],
    canonical: "Lyndon B. Johnson Hospital",
  },
  {
    tokens: ["brooke army", "saushec", "bamc"],
    canonical: "SAUSHEC / Brooke Army Medical Center",
  },
  {
    tokens: ["fort bliss", "william beaumont army"],
    canonical: "Fort Bliss Army Garrison",
  },
  {
    tokens: ["texas a m", "tamu"],
    canonical: "Texas A&M Rural Health Program",
  },
];

export function normalizeOrgKey(raw: string | null | undefined): string {
  if (!raw) return "";
  return raw
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function hospitalsMatch(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  const normA = normalizeOrgKey(a);
  const normB = normalizeOrgKey(b);
  if (!normA || !normB || normA.length < 4 || normB.length < 4) return false;
  if (normA === normB || normA.includes(normB) || normB.includes(normA)) {
    return true;
  }
  for (const group of HOSPITAL_ALIASES) {
    const aInGroup =
      normA === normalizeOrgKey(group.canonical) || group.tokens.some((tok) => normA.includes(tok));
    const bInGroup =
      normB === normalizeOrgKey(group.canonical) || group.tokens.some((tok) => normB.includes(tok));
    if (aInGroup && bInGroup) return true;
  }
  return false;
}

const ctContactEntrySchema = z.object({
  name: z.string().optional(),
  role: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().optional(),
});

const ctLocationEntrySchema = z.object({
  facility: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  zip: z.string().optional(),
  contacts: z.array(ctContactEntrySchema).optional(),
});

const ctOfficialEntrySchema = z.object({
  name: z.string().optional(),
  role: z.string().optional(),
  affiliation: z.string().optional(),
});

const ctStudyContactSchema = z.object({
  protocolSection: z
    .object({
      sponsorCollaboratorsModule: z
        .object({
          leadSponsor: z.object({ name: z.string().optional() }).optional(),
          responsibleParty: z
            .object({
              investigatorFullName: z.string().optional(),
              investigatorTitle: z.string().optional(),
              investigatorAffiliation: z.string().optional(),
            })
            .optional(),
        })
        .optional(),
      contactsLocationsModule: z
        .object({
          centralContacts: z.array(ctContactEntrySchema).optional(),
          overallOfficials: z.array(ctOfficialEntrySchema).optional(),
          locations: z.array(ctLocationEntrySchema).optional(),
        })
        .optional(),
    })
    .optional(),
});

const TERRITORY_STATES = new Set([
  "TX",
  "OK",
  "AR",
  "LA",
  "TEXAS",
  "OKLAHOMA",
  "ARKANSAS",
  "LOUISIANA",
]);

function formatRoleTitle(rawRole: string | undefined): string {
  if (!rawRole) return "Clinical Study Contact";
  const upper = rawRole.toUpperCase();
  if (upper.includes("PRINCIPAL_INVESTIGATOR")) return "Principal Investigator";
  if (upper.includes("STUDY_DIRECTOR")) return "Study Director";
  if (upper.includes("STUDY_CHAIR")) return "Study Chair";
  if (upper === "CONTACT") return "Clinical Research Coordinator";
  return rawRole;
}

export async function fetchClinicalTrialContacts(
  nctId: string,
  preferredHospital?: string | null,
): Promise<ResolvedDecisionMaker[]> {
  const cleanId = nctId.trim();
  if (!/^NCT\d+$/i.test(cleanId)) return [];

  try {
    const response = await fetch(`https://clinicaltrials.gov/api/v2/studies/${cleanId}`, {
      headers: { Accept: "application/json", "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(PUBLIC_TIMEOUT_MS),
    });
    if (!response.ok) return [];
    const parsed = ctStudyContactSchema.parse(await response.json());
    const clm = parsed.protocolSection?.contactsLocationsModule;
    const respParty = parsed.protocolSection?.sponsorCollaboratorsModule?.responsibleParty;
    const sponsorName = parsed.protocolSection?.sponsorCollaboratorsModule?.leadSponsor?.name;

    const results: ResolvedDecisionMaker[] = [];
    const seen = new Set<string>();

    const pushUnique = (item: ResolvedDecisionMaker) => {
      const cleanName = item.name.trim();
      if (!cleanName) return;
      const dedupeKey = `${cleanName.toLowerCase()}|${(item.email ?? "").toLowerCase()}`;
      if (seen.has(dedupeKey)) return;
      seen.add(dedupeKey);
      results.push({ ...item, name: cleanName });
    };

    const locations = clm?.locations ?? [];
    const territoryLocations = locations.filter((loc) =>
      TERRITORY_STATES.has((loc.state ?? "").trim().toUpperCase()),
    );
    const orderedLocations =
      preferredHospital && territoryLocations.length > 1
        ? [...territoryLocations].sort(
            (a, b) =>
              Number(hospitalsMatch(b.facility, preferredHospital)) -
              Number(hospitalsMatch(a.facility, preferredHospital)),
          )
        : territoryLocations;

    for (const loc of orderedLocations) {
      const address =
        [loc.facility, loc.city, loc.state, loc.zip].filter(Boolean).join(", ") || null;
      for (const c of loc.contacts ?? []) {
        if (!c.name) continue;
        pushUnique({
          name: c.name,
          title: formatRoleTitle(c.role),
          organization: loc.facility ?? preferredHospital ?? sponsorName ?? null,
          phone: c.phone ?? null,
          email: c.email ?? null,
          address,
          linkedin_url: null,
          origin: "ClinicalTrials.gov",
        });
      }
    }

    for (const official of clm?.overallOfficials ?? []) {
      if (!official.name) continue;
      pushUnique({
        name: official.name,
        title: formatRoleTitle(official.role),
        organization: official.affiliation ?? preferredHospital ?? sponsorName ?? null,
        phone: null,
        email: null,
        address: null,
        linkedin_url: null,
        origin: "ClinicalTrials.gov",
      });
    }

    if (respParty?.investigatorFullName) {
      pushUnique({
        name: respParty.investigatorFullName,
        title: respParty.investigatorTitle ?? "Principal Investigator",
        organization: respParty.investigatorAffiliation ?? preferredHospital ?? sponsorName ?? null,
        phone: null,
        email: null,
        address: null,
        linkedin_url: null,
        origin: "ClinicalTrials.gov",
      });
    }

    for (const central of clm?.centralContacts ?? []) {
      if (!central.name) continue;
      pushUnique({
        name: central.name,
        title: formatRoleTitle(central.role),
        organization: preferredHospital ?? sponsorName ?? null,
        phone: central.phone ?? null,
        email: central.email ?? null,
        address: null,
        linkedin_url: null,
        origin: "ClinicalTrials.gov",
      });
    }

    // Backfill phone/address from NPPES for any named investigator missing a phone number
    for (const contact of results.slice(0, 3)) {
      if (!contact.phone && /,?\s*(MD|M\.D\.|DO|D\.O\.|PhD|Ph\.D\.)/i.test(contact.name)) {
        const nppesMatch = await fetchNppesClinicianByName(contact.name, "TX");
        if (nppesMatch) {
          contact.phone = nppesMatch.phone;
          contact.address = contact.address ?? nppesMatch.address;
          contact.npi = nppesMatch.npi;
          if (!contact.title || contact.title === "Principal Investigator") {
            contact.title = nppesMatch.title ?? contact.title;
          }
        }
      }
    }

    // Sort contacts that have a phone or email ahead of name-only contacts
    return results.sort(
      (a, b) => Number(Boolean(b.email || b.phone)) - Number(Boolean(a.email || a.phone)),
    );
  } catch (err) {
    logWarn("contacts.ct", "ClinicalTrials.gov contact lookup failed", {
      nctId: cleanId,
      error: err instanceof Error ? err.message : String(err),
    });
    return [];
  }
}

const nppesResponseSchema = z.object({
  results: z
    .array(
      z.object({
        number: z.string().optional(),
        basic: z
          .object({
            first_name: z.string().optional(),
            last_name: z.string().optional(),
            credential: z.string().optional(),
            name_prefix: z.string().optional(),
            organization_name: z.string().optional(),
            authorized_official_first_name: z.string().optional(),
            authorized_official_last_name: z.string().optional(),
            authorized_official_middle_name: z.string().optional(),
            authorized_official_title_or_position: z.string().optional(),
            authorized_official_telephone_number: z.string().optional(),
            authorized_official_credential: z.string().optional(),
          })
          .optional(),
        addresses: z
          .array(
            z.object({
              address_purpose: z.string().optional(),
              address_1: z.string().optional(),
              city: z.string().optional(),
              state: z.string().optional(),
              postal_code: z.string().optional(),
              telephone_number: z.string().optional(),
            }),
          )
          .optional(),
        taxonomies: z
          .array(
            z.object({
              desc: z.string().optional(),
              primary: z.boolean().optional(),
            }),
          )
          .optional(),
      }),
    )
    .optional(),
});

function formatPhone(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return raw.trim() || null;
}

function toProperCase(raw: string): string {
  return raw.toLowerCase().replace(/\b[a-z]/g, (ch) => ch.toUpperCase());
}

export async function fetchNppesClinicianByName(
  rawName: string,
  stateCode?: string | null,
): Promise<ResolvedDecisionMaker | null> {
  const cleaned = rawName
    .replace(/^(dr\.?|prof\.?|mr\.?|ms\.?|mrs\.?)\s+/i, "")
    .replace(/,?\s*(MD|M\.D\.|DO|D\.O\.|PhD|Ph\.D\.|FACEP|MPH|MS|M\.Sc\.).*$/i, "")
    .replace(/\s*\(.*?\)\s*/g, " ")
    .trim();
  const parts = cleaned.split(/\s+/).filter(Boolean);
  if (parts.length < 2) return null;
  const firstName = parts[0];
  const lastName = parts[parts.length - 1];

  const params = new URLSearchParams({
    version: "2.1",
    enumeration_type: "NPI-1",
    first_name: firstName,
    last_name: lastName,
    limit: "5",
  });
  if (stateCode && stateCode.length === 2) {
    params.set("state", stateCode.toUpperCase());
  }

  try {
    const response = await fetch(`https://npiregistry.cms.hhs.gov/api/?${params.toString()}`, {
      headers: { Accept: "application/json", "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(PUBLIC_TIMEOUT_MS),
    });
    if (!response.ok) return null;
    const parsed = nppesResponseSchema.parse(await response.json());
    const top = parsed.results?.[0];
    if (!top?.basic) return null;

    const fullName = [
      toProperCase(top.basic.first_name ?? firstName),
      toProperCase(top.basic.last_name ?? lastName),
    ]
      .filter(Boolean)
      .join(" ");
    const cred = top.basic.credential?.trim();
    const display = cred ? `${fullName}, ${cred}` : fullName;
    const locAddr =
      top.addresses?.find((a) => a.address_purpose === "LOCATION") ?? top.addresses?.[0];
    const taxonomy =
      top.taxonomies?.find((t) => t.primary)?.desc ?? top.taxonomies?.[0]?.desc ?? null;
    const address = locAddr
      ? [locAddr.address_1, locAddr.city, locAddr.state, locAddr.postal_code?.slice(0, 5)]
          .filter(Boolean)
          .join(", ")
      : null;

    return {
      name: display,
      title: taxonomy,
      organization: locAddr ? [locAddr.city, locAddr.state].filter(Boolean).join(", ") : null,
      phone: formatPhone(locAddr?.telephone_number),
      email: null,
      address,
      linkedin_url: null,
      npi: top.number ?? null,
      origin: "NPPES Registry",
    };
  } catch (err) {
    logWarn("contacts.nppes", "NPPES clinician name lookup failed", {
      name: rawName,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

export async function fetchNppesOrganizationOfficial(
  organizationName: string,
  stateCode?: string | null,
): Promise<ResolvedDecisionMaker | null> {
  const cleanOrg = organizationName
    .replace(/\([^)]*\)/g, " ")
    .replace(/^The\s+/i, "")
    .split(/[/—–-]/)[0]
    .trim();
  if (cleanOrg.length < 3) return null;

  const searchVariants = [cleanOrg];
  const words = cleanOrg.split(/\s+/).filter(Boolean);
  if (words.length > 3) {
    searchVariants.push(words.slice(0, 3).join(" "));
  }

  for (const variant of searchVariants) {
    const params = new URLSearchParams({
      version: "2.1",
      enumeration_type: "NPI-2",
      organization_name: variant,
      limit: "5",
    });
    if (stateCode && stateCode.length === 2) {
      params.set("state", stateCode.toUpperCase());
    }

    try {
      const response = await fetch(`https://npiregistry.cms.hhs.gov/api/?${params.toString()}`, {
        headers: { Accept: "application/json", "User-Agent": USER_AGENT },
        signal: AbortSignal.timeout(PUBLIC_TIMEOUT_MS),
      });
      if (!response.ok) continue;
      const parsed = nppesResponseSchema.parse(await response.json());
      const results = parsed.results ?? [];
      const withOfficial = results.find(
        (r) => r.basic?.authorized_official_first_name && r.basic?.authorized_official_last_name,
      );
      const chosen = withOfficial ?? results[0];
      if (!chosen?.basic) continue;

      const locAddr =
        chosen.addresses?.find((a) => a.address_purpose === "LOCATION") ?? chosen.addresses?.[0];
      const phone =
        formatPhone(chosen.basic.authorized_official_telephone_number) ??
        formatPhone(locAddr?.telephone_number);
      const address = locAddr
        ? [locAddr.address_1, locAddr.city, locAddr.state, locAddr.postal_code?.slice(0, 5)]
            .filter(Boolean)
            .join(", ")
        : null;
      const orgTitle = chosen.basic.organization_name
        ? toProperCase(chosen.basic.organization_name)
        : organizationName;

      if (
        chosen.basic.authorized_official_first_name &&
        chosen.basic.authorized_official_last_name
      ) {
        const first = toProperCase(chosen.basic.authorized_official_first_name);
        const last = toProperCase(chosen.basic.authorized_official_last_name);
        const cred = chosen.basic.authorized_official_credential?.trim();
        const fullName = cred && cred !== "--" ? `${first} ${last}, ${cred}` : `${first} ${last}`;
        return {
          name: fullName,
          title:
            chosen.basic.authorized_official_title_or_position ?? "Authorized Executive Official",
          organization: orgTitle,
          phone,
          email: null,
          address,
          linkedin_url: null,
          npi: chosen.number ?? null,
          origin: "NPPES Registry",
        };
      }

      if (phone) {
        return {
          name: `${orgTitle} Clinical Engineering & Imaging`,
          title: chosen.taxonomies?.[0]?.desc ?? "Hospital Department Line",
          organization: orgTitle,
          phone,
          email: null,
          address,
          linkedin_url: null,
          npi: chosen.number ?? null,
          origin: "NPPES Registry",
        };
      }
    } catch (err) {
      logWarn("contacts.nppes_org", "NPPES organization lookup failed", {
        organizationName: variant,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return null;
}

export async function prospectNppesSpecialists(opts: {
  stateCode?: string | null;
  city?: string | null;
  taxonomyDescription?: string;
  limit?: number;
}): Promise<ResolvedDecisionMaker[]> {
  const state = (opts.stateCode ?? "TX").toUpperCase();
  const taxonomies = opts.taxonomyDescription
    ? [opts.taxonomyDescription]
    : ["Diagnostic Radiology", "Cardiovascular Disease", "Emergency Medicine"];
  const collected: ResolvedDecisionMaker[] = [];
  const seenNpi = new Set<string>();
  const targetLimit = opts.limit ?? 10;

  for (const taxonomy of taxonomies) {
    if (collected.length >= targetLimit) break;
    const params = new URLSearchParams({
      version: "2.1",
      enumeration_type: "NPI-1",
      state,
      taxonomy_description: taxonomy,
      limit: String(Math.min(targetLimit, 15)),
    });
    if (opts.city) {
      params.set("city", opts.city);
    }

    try {
      const response = await fetch(`https://npiregistry.cms.hhs.gov/api/?${params.toString()}`, {
        headers: { Accept: "application/json", "User-Agent": USER_AGENT },
        signal: AbortSignal.timeout(PUBLIC_TIMEOUT_MS),
      });
      if (!response.ok) continue;
      const parsed = nppesResponseSchema.parse(await response.json());
      for (const r of parsed.results ?? []) {
        if (!r.number || !r.basic || seenNpi.has(r.number)) continue;
        seenNpi.add(r.number);
        const first = toProperCase(r.basic.first_name ?? "");
        const last = toProperCase(r.basic.last_name ?? "");
        const fullName = [first, last].filter(Boolean).join(" ").trim();
        if (!fullName) continue;
        const cred = r.basic.credential?.trim();
        const locAddr =
          r.addresses?.find((a) => a.address_purpose === "LOCATION") ?? r.addresses?.[0];
        const primaryTax =
          r.taxonomies?.find((t) => t.primary)?.desc ?? r.taxonomies?.[0]?.desc ?? taxonomy;
        collected.push({
          name: cred ? `${fullName}, ${cred}` : fullName,
          title: primaryTax,
          organization: locAddr ? [locAddr.city, locAddr.state].filter(Boolean).join(", ") : state,
          phone: formatPhone(locAddr?.telephone_number),
          email: null,
          address: locAddr
            ? [locAddr.address_1, locAddr.city, locAddr.state, locAddr.postal_code?.slice(0, 5)]
                .filter(Boolean)
                .join(", ")
            : null,
          linkedin_url: null,
          npi: r.number,
          origin: "NPPES Registry",
        });
        if (collected.length >= targetLimit) break;
      }
    } catch (err) {
      logWarn("contacts.nppes_prospect", "NPPES specialist prospecting failed", {
        state,
        taxonomy,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return collected;
}

const nihSearchSchema = z.object({
  results: z
    .array(
      z.object({
        project_title: z.string().nullable().optional(),
        organization: z
          .object({
            org_name: z.string().nullable().optional(),
            org_city: z.string().nullable().optional(),
            org_state: z.string().nullable().optional(),
          })
          .nullable()
          .optional(),
        principal_investigators: z
          .array(
            z.object({
              full_name: z.string().nullable().optional(),
              first_name: z.string().nullable().optional(),
              last_name: z.string().nullable().optional(),
              title: z.string().nullable().optional(),
              is_contact_pi: z.boolean().nullable().optional(),
            }),
          )
          .nullable()
          .optional(),
      }),
    )
    .default([]),
});

export async function fetchNihReporterContacts(opts: {
  organizationName?: string | null;
  stateCode?: string | null;
  limit?: number;
}): Promise<ResolvedDecisionMaker[]> {
  const states = opts.stateCode ? [opts.stateCode.toUpperCase()] : ["TX", "OK", "AR", "LA"];
  const currentYear = new Date().getFullYear();

  try {
    const criteria: Record<string, unknown> = {
      org_states: states,
      fiscal_years: [currentYear, currentYear - 1, currentYear - 2],
      advanced_text_search: {
        operator: "or",
        search_field: "projecttitle,terms",
        search_text:
          '"ultrasound" OR "echocardiography" OR "patient monitoring" OR "cardiac imaging" OR "radiology"',
      },
    };
    if (opts.organizationName && opts.organizationName.trim().length >= 4) {
      criteria.org_names = [opts.organizationName.trim()];
    }

    const response = await fetch("https://api.reporter.nih.gov/v2/projects/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "User-Agent": USER_AGENT,
      },
      body: JSON.stringify({
        criteria,
        offset: 0,
        limit: Math.min(opts.limit ?? 10, 25),
        sort_field: "award_notice_date",
        sort_order: "desc",
      }),
      signal: AbortSignal.timeout(PUBLIC_TIMEOUT_MS),
    });
    if (!response.ok) return [];
    const parsed = nihSearchSchema.parse(await response.json());
    const contacts: ResolvedDecisionMaker[] = [];
    const seen = new Set<string>();

    for (const proj of parsed.results) {
      const orgName = proj.organization?.org_name?.trim() ?? opts.organizationName ?? null;
      const city = proj.organization?.org_city?.trim();
      const state = proj.organization?.org_state?.trim();
      for (const pi of proj.principal_investigators ?? []) {
        const rawName =
          pi.full_name?.trim() || [pi.first_name, pi.last_name].filter(Boolean).join(" ").trim();
        if (!rawName) continue;
        const cleanName = toProperCase(rawName);
        if (seen.has(cleanName.toLowerCase())) continue;
        seen.add(cleanName.toLowerCase());
        contacts.push({
          name: cleanName,
          title: pi.title?.trim() || "Principal Investigator (NIH Award)",
          organization: orgName ? toProperCase(orgName) : null,
          phone: null,
          email: null,
          address: [city, state].filter(Boolean).join(", ") || null,
          linkedin_url: null,
          origin: "NIH RePORTER",
        });
      }
    }
    return contacts;
  } catch (err) {
    logWarn("contacts.nih", "NIH RePORTER contact lookup failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return [];
  }
}

export function resolveTerritoryStateCode(territory: string | null | undefined): string {
  return territoryToCode(territory) ?? "TX";
}

export function toLeadContact(dm: ResolvedDecisionMaker): LeadContact {
  return {
    name: dm.name,
    title: dm.title,
    organization: dm.organization,
    phone: dm.phone,
    email: dm.email,
    address: dm.address,
    type: "primary",
    source_origin: dm.origin,
  };
}
