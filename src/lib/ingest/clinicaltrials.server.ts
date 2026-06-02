import type { RawLead } from "./types";
import { PHILLIPS_KEYWORDS } from "./types";

// ClinicalTrials.gov v2 API — public, no key required
// Docs: https://clinicaltrials.gov/data-api/api
const BASE = "https://clinicaltrials.gov/api/v2/studies";

const TERRITORY_STATES: Record<string, string> = {
  texas: "TX",
  oklahoma: "OK",
  arkansas: "AR",
  louisiana: "LA",
};
const TERRITORY_ABBREVS = new Set(Object.values(TERRITORY_STATES));

export async function fetchClinicalTrials(opts: { daysBack?: number; limit?: number } = {}): Promise<RawLead[]> {
  const { daysBack = 30, limit = 100 } = opts;
  const since = new Date(Date.now() - daysBack * 86400_000).toISOString().slice(0, 10);

  // Restrict to territory states and imaging/cardiac/critical-care equipment keywords.
  const stateFilter = "(AREA[LocationState]Texas OR AREA[LocationState]Oklahoma OR AREA[LocationState]Arkansas OR AREA[LocationState]Louisiana)";
  const term = `AREA[StudyFirstPostDate]RANGE[${since},MAX] AND AREA[LocationCountry]United States AND ${stateFilter} AND (imaging OR MRI OR ultrasound OR "cath lab" OR cardiac OR ventilator OR "patient monitor")`;

  const params = new URLSearchParams({
    "query.term": term,
    "filter.overallStatus": "RECRUITING|NOT_YET_RECRUITING|ENROLLING_BY_INVITATION",
    pageSize: String(limit),
    format: "json",
    fields:
      "NCTId,BriefTitle,OfficialTitle,StudyFirstPostDate,OverallStatus,LeadSponsorName,LocationFacility,LocationCity,LocationState,Condition,InterventionName,BriefSummary",
  });

  const res = await fetch(`${BASE}?${params}`);
  if (!res.ok) {
    if (res.status === 404) return [];
    throw new Error(`ClinicalTrials.gov ${res.status}: ${await res.text()}`);
  }
  const json = (await res.json()) as { studies?: CtStudy[] };
  const rows = json.studies ?? [];
  const kwLower = PHILLIPS_KEYWORDS.map((k) => k.toLowerCase());

  return rows
    .map((s) => flatten(s))
    // Keep only trials that have at least one site in a territory state
    .filter((f) => f.territorySites.length > 0)
    .filter((f) => kwLower.some((k) => f.blob.toLowerCase().includes(k)))
    .map((f): RawLead => {
      const primarySite = f.territorySites[0];
      return {
        source: "clinicaltrials",
        source_external_id: f.id,
        source_url: `https://clinicaltrials.gov/study/${f.id}`,
        title: f.title,
        raw_text: [
          `Hospital: ${primarySite.facility}`,
          `Location: ${primarySite.city}, ${primarySite.state}`,
          `Trial: ${f.title}`,
          `Status: ${f.status}`,
          `Sponsor: ${f.sponsor}`,
          `All Territory Sites: ${f.territorySites.map((s) => [s.facility, s.city, s.state].filter(Boolean).join(", ")).slice(0, 5).join("; ")}`,
          `Conditions: ${f.conditions.join(", ")}`,
          `Interventions: ${f.interventions.join(", ")}`,
          `First posted: ${f.posted}`,
          `Summary: ${f.summary}`,
        ].join("\n"),
        date_discovered: f.posted ?? new Date().toISOString(),
        raw_payload: f.raw as unknown as Record<string, unknown>,
      };
    });
}

interface CtStudy {
  protocolSection?: {
    identificationModule?: { nctId?: string; briefTitle?: string; officialTitle?: string };
    statusModule?: { overallStatus?: string; studyFirstPostDateStruct?: { date?: string } };
    sponsorCollaboratorsModule?: { leadSponsor?: { name?: string } };
    contactsLocationsModule?: {
      locations?: { facility?: string; city?: string; state?: string }[];
    };
    conditionsModule?: { conditions?: string[] };
    armsInterventionsModule?: { interventions?: { name?: string }[] };
    descriptionModule?: { briefSummary?: string };
  };
}

function flatten(s: CtStudy) {
  const p = s.protocolSection ?? {};
  const id = p.identificationModule?.nctId ?? "";
  const title = p.identificationModule?.briefTitle ?? p.identificationModule?.officialTitle ?? "Untitled trial";
  const status = p.statusModule?.overallStatus ?? "";
  const posted = p.statusModule?.studyFirstPostDateStruct?.date
    ? new Date(p.statusModule.studyFirstPostDateStruct.date).toISOString()
    : "";
  const sponsor = p.sponsorCollaboratorsModule?.leadSponsor?.name ?? "";
  const locations = p.contactsLocationsModule?.locations ?? [];

  // Separate territory sites from all sites
  const territorySites = locations.filter((l) => {
    const stateRaw = (l.state ?? "").trim();
    return (
      TERRITORY_ABBREVS.has(stateRaw.toUpperCase()) ||
      TERRITORY_ABBREVS.has(TERRITORY_STATES[stateRaw.toLowerCase()] ?? "__")
    );
  });

  const sites = locations.map((l) => [l.facility, l.city, l.state].filter(Boolean).join(", "));
  const conditions = p.conditionsModule?.conditions ?? [];
  const interventions = p.armsInterventionsModule?.interventions?.map((i) => i.name ?? "") ?? [];
  const summary = p.descriptionModule?.briefSummary ?? "";
  const blob = [title, status, sponsor, sites.join(" "), conditions.join(" "), interventions.join(" "), summary].join(" ");
  return { id, title, status, posted, sponsor, sites, territorySites, conditions, interventions, summary, blob, raw: s };
}
