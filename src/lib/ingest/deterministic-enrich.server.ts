import { passesMedicalGate } from "./medical-gate";
import type { AccountType, EnrichmentResult, LeadContact, RawLead, SignalType } from "./types";

const TERRITORY_SLUGS = new Set(["texas", "oklahoma", "arkansas", "louisiana"]);

const STATE_LOOKUP: ReadonlyArray<[RegExp, string]> = [
  [/\btexas\b|\(\s*tx\s*\)|,\s*tx\b|\bstate:\s*tx\b/i, "texas"],
  [/\boklahoma\b|\(\s*ok\s*\)|,\s*ok\b|\bstate:\s*ok\b/i, "oklahoma"],
  [/\barkansas\b|\(\s*ar\s*\)|,\s*ar\b|\bstate:\s*ar\b/i, "arkansas"],
  [/\blouisiana\b|\(\s*la\s*\)|,\s*la\b|\bstate:\s*la\b/i, "louisiana"],
];

const HOSPITAL_CANONICAL_OVERRIDES: ReadonlyArray<[RegExp, string]> = [
  [/\but\s+southwestern|university\s+of\s+texas\s+southwestern/i, "UT Southwestern Medical Center"],
  [/\bmd\s+anderson/i, "UT MD Anderson Cancer Center"],
  [/\bmichael\s+e\.?\s+debakey\s+va/i, "Michael E. DeBakey VA Medical Center"],
  [/\bbaylor\s+college\s+of\s+medicine/i, "Baylor College of Medicine"],
  [/\bmethodist\s+hospital\s+research\s+institute/i, "Houston Methodist Research Institute"],
  [/\btexas\s+a&m\s+university\s+health\s+science/i, "Texas A&M Health Science Center"],
  [/\buniversity\s+of\s+texas\s+hlth\s+science\s+center/i, "UT Health Science Center"],
  [/\buniversity\s+of\s+north\s+texas\s+hlth\s+sci/i, "UNT Health Science Center"],
  [/\buniversity\s+of\s+texas\s+dallas/i, "University of Texas at Dallas"],
  [/\buniversity\s+of\s+oklahoma\s+hlth\s+sciences/i, "OU Health Sciences Center"],
  [/\btulane\s+university/i, "Tulane University School of Medicine"],
  [/\blouisiana\s+state\s+univ\s+hsc\s+shreveport/i, "LSU Health Shreveport"],
  [/\blouisiana\s+state\s+univ\s+hsc/i, "LSU Health Sciences Center"],
  [/\buniversity\s+of\s+arkansas\s+for\s+medical\s+sciences|\buams\b/i, "UAMS Medical Center"],
  [/\buniversity\s+of\s+arkansas\b/i, "University of Arkansas Health"],
  [/\bochsner/i, "Ochsner Health System"],
];

const UPPERCASE_ACRONYMS = new Set([
  "VA",
  "UT",
  "MD",
  "LSU",
  "OU",
  "UNT",
  "UAMS",
  "HSC",
  "TX",
  "OK",
  "AR",
  "LA",
  "ICU",
  "MRI",
  "CT",
  "II",
  "III",
  "INC",
  "LLC",
]);

const SPECIALTY_RULES: ReadonlyArray<[RegExp, string]> = [
  [
    /\b(cardiac|cardiolog|echocard|atrial|ventricular|aortic|coronary|cath\s+lab|catheterization|arrhythmia|heart|amyloidosis|ablation|defibrillator|vascular)\b/i,
    "Cardiology",
  ],
  [
    /\b(radiolog|radiograph|mri|pet\/ct|ct\s+scan|computed\s+tomography|fluoroscop|mammograph|x-ray|imaging|glymphatic|ultrasound|sonograph)\b/i,
    "Radiology",
  ],
  [/\b(oncolog|cancer|tumor|carcinoma|thyroid\s+cancer|myeloma|leukemia|radiation)\b/i, "Oncology"],
  [/\b(critical\s+care|icu|ecmo|sepsis|hemodynamic|telemetry)\b/i, "Critical Care"],
  [/\b(pulmon|respirat|ventilat|airway|cpap|bipap|sleep\s+apnea)\b/i, "Pulmonology"],
  [/\b(emergency\s+medicine|emergency\s+department|\bpocus\b|trauma)\b/i, "Emergency"],
  [/\b(anesthes|perioperative)\b/i, "Anesthesia"],
  [/\b(surgic|surgery|neurosurg|deep\s+brain\s+stimulation|interventional)\b/i, "Surgery"],
  [/\b(obstet|gynecol|maternal|fetal|reproductive|ob\/gyn)\b/i, "OB/GYN"],
];

const EQUIPMENT_CATALOG: ReadonlyArray<[RegExp, string]> = [
  [/\b(blueseal|helium[- ]free\s+mri|mobile\s+1\.5t|mobile\s+mri)\b/i, "BlueSeal Mobile 1.5T MRI"],
  [/\b(ct\s*5300|ai\s+smart\s+workflow)\b/i, "CT 5300 Smart Workflow"],
  [/\b(\brocc\b|radiology\s+operations\s+command|remote\s+scanning)\b/i, "ROCC Remote Scanning"],
  [
    /\b(ecaremanager|\beicu\b|tele[- ]critical|tele[- ]icu|virtual\s+icu)\b/i,
    "eICU / eCareManager",
  ],
  [
    /\b(avalon|intellispace\s+perinatal|lumify\s+with\s+reacts|fetal\s+monitoring)\b/i,
    "Avalon & Lumify Perinatal",
  ],
  [/\b(earlyvue|vs30|early\s+warning\s+scoring)\b/i, "EarlyVue VS30"],
  [/\b(telemetry\s+monitor\s+5500|intellivue\s+mx40|\bmx40\b)\b/i, "Telemetry 5500 / MX40"],
  [
    /\b(echocardiograph\w*|cardiac\s+ultrasound|transthoracic|transesophageal)\b/i,
    "Echocardiography",
  ],
  [/\b(\bpocus\b|point[- ]of[- ]care\s+ultrasound)\b/i, "Point-of-Care Ultrasound"],
  [/\b(ultrasound\w*|sonograph\w*|transducer\w*|neuromodulation)\b/i, "Diagnostic Ultrasound"],
  [/\b(mri|magnetic\s+resonance)\b/i, "MRI"],
  [
    /\b(ct\s+scan\w*|computed\s+tomography|pet\/ct|metabolic\s+imaging)\b/i,
    "CT / Molecular Imaging",
  ],
  [
    /\b(cath\s+lab|catheterization|image[- ]guided|interventional|ablation|ivus|vascular|aortic|ventricular|atrial)\b/i,
    "Image-Guided Therapy / Cath Lab",
  ],
  [/\b(fluoroscop\w*|radiograph\w*|x-ray|imaging)\b/i, "Diagnostic X-Ray / Fluoroscopy"],
  [
    /\b(patient\s+monitor\w*|telemetry|hemodynamic|physiological\s+monitor\w*|cardiovascular)\b/i,
    "Patient Monitoring",
  ],
  [/\b(ventilator\w*|respirat\w*|cpap|bipap)\b/i, "Respiratory / Ventilation"],
  [/\b(defibrillator\w*|aed|ecg|ekg)\b/i, "Cardiac Resuscitation & ECG"],
  [/\b(infusion\s+pump\w*)\b/i, "Infusion Systems"],
];

const KNOWN_COMPETITORS = [
  "GE HealthCare",
  "Siemens Healthineers",
  "Canon Medical",
  "Mindray",
  "Fujifilm",
  "SonoSite",
  "Samsung Medison",
  "Nihon Kohden",
  "Baxter",
  "Medtronic",
  "Boston Scientific",
  "Abbott",
  "Stryker",
  "Masimo",
  "Draeger",
  "ZOLL",
  "Hologic",
];

const SOCIAL_SPAM_OR_OFFTOPIC_RX =
  /\b(hocus[\s-]*pocus|witch\s+film|halloween|prog\s+rock|fresher\s+alert|careerowl|job\s+alert|amazon\.com\/d\/|patreon\.com|music\.youtube\.com|hibernate\s+until\s+next\s+year|conferences?\s+for\s+#\w+\s+and\s+#pocus\s+in\s+europe)\b/i;

const COMMERCIAL_NON_HOSPITAL_RX = /\b(inc\.?|llc|corp\.?|ltd\.?|biosciences|therapeutics)\b/i;

function formatHospitalDisplay(rawName: string): string {
  const cleaned = rawName.replace(/\s+/g, " ").trim();
  for (const [pattern, canonical] of HOSPITAL_CANONICAL_OVERRIDES) {
    if (pattern.test(cleaned)) return canonical;
  }
  if (cleaned !== cleaned.toUpperCase()) return cleaned;

  return cleaned
    .split(" ")
    .map((word) => {
      const bare = word.replace(/[^A-Za-z]/g, "");
      if (UPPERCASE_ACRONYMS.has(bare)) return word;
      if (
        word.toLowerCase() === "of" ||
        word.toLowerCase() === "at" ||
        word.toLowerCase() === "and"
      ) {
        return word.toLowerCase();
      }
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(" ");
}

function extractHospital(raw: RawLead): string | null {
  if (raw.source === "openfda") return null;

  const lineMatch = raw.raw_text.match(/^(?:Hospital|Hospital\/Agency):\s*(.+)$/im);
  if (lineMatch?.[1]) {
    const candidate = lineMatch[1].split(" — ")[0]?.trim() ?? "";
    if (candidate && candidate.toLowerCase() !== "n/a" && candidate.toLowerCase() !== "unknown") {
      return formatHospitalDisplay(candidate);
    }
  }

  const titlePrefix = raw.title.match(/^([A-Z0-9 .,&'-]{4,80})\s+\((?:TX|OK|AR|LA)\)\s+—/);
  if (titlePrefix?.[1]) {
    return formatHospitalDisplay(titlePrefix[1]);
  }
  return null;
}

function extractTerritory(raw: RawLead, hospital: string | null): string | null {
  const explicitStateLine = raw.raw_text.match(/^State:\s*(Texas|Oklahoma|Arkansas|Louisiana)\b/im);
  if (explicitStateLine?.[1]) {
    return explicitStateLine[1].toLowerCase();
  }

  const headerAndHospital = `${raw.title}\n${hospital ?? ""}`;
  for (const [pattern, slug] of STATE_LOOKUP) {
    if (pattern.test(headerAndHospital)) return slug;
  }

  for (const [pattern, slug] of STATE_LOOKUP) {
    if (pattern.test(raw.raw_text)) return slug;
  }
  return null;
}

function inferSignalType(raw: RawLead): SignalType {
  if (raw.source === "openfda") return "recall";
  if (raw.source === "rural_rht") {
    if (raw.source_external_id.startsWith("grants-gov:")) return "rfp";
    if (raw.source_external_id.startsWith("cms-cah:")) return "expansion";
    return "funding";
  }
  if (raw.source === "sam_gov") {
    return raw.source_external_id.startsWith("nih:") ? "funding" : "rfp";
  }
  if (raw.source === "funding_rss" || raw.source === "gdelt_va_funding") return "funding";
  if (raw.source === "clinicaltrials") return "expansion";
  if (raw.source === "gdelt_m_and_a") return "m_and_a";
  if (raw.source === "cms_open_payments") return "incumbency";
  if (raw.source === "gdelt") {
    return /\b(grant|budget|bond|capital|funding)\b/i.test(raw.raw_text) ? "funding" : "expansion";
  }
  if (raw.source === "reddit" || raw.source === "bluesky") return "sentiment";
  return "other";
}

function inferAccountType(raw: RawLead, hospital: string | null): AccountType {
  const combined = `${hospital ?? ""} ${raw.title} ${raw.raw_text}`;
  if (
    /\b(va\s+medical|va\s+health|veterans\s+affairs|veterans\s+health|debakey\s+va)\b/i.test(
      combined,
    )
  ) {
    return "va";
  }
  if (hospital) return "non_va";
  return "unknown";
}

function inferSpecialty(haystack: string): string {
  for (const [pattern, label] of SPECIALTY_RULES) {
    if (pattern.test(haystack)) return label;
  }
  return "Other";
}

function extractEquipment(haystack: string): string[] {
  const matched: string[] = [];
  for (const [pattern, label] of EQUIPMENT_CATALOG) {
    if (pattern.test(haystack)) matched.push(label);
  }
  return matched;
}

function extractVendors(
  raw: RawLead,
  knownVendors: string[],
  knownProducts: string[],
): { mentions: string[]; incumbent: string | null } {
  const haystack = `${raw.title}\n${raw.raw_text}`;
  const lower = haystack.toLowerCase();
  const candidates = Array.from(new Set([...KNOWN_COMPETITORS, ...knownVendors, ...knownProducts]));
  const mentions = candidates.filter((term) => {
    const clean = term.trim();
    if (clean.length < 4) return false;
    if (/^philips$/i.test(clean) || /^phillips$/i.test(clean)) return false;
    return lower.includes(clean.toLowerCase());
  });

  const recallingFirm = raw.raw_text
    .match(/^(?:Recalling firm|Competitor):\s*(.+)$/im)?.[1]
    ?.trim();
  if (recallingFirm && !/philips/i.test(recallingFirm)) {
    if (!mentions.includes(recallingFirm)) mentions.unshift(recallingFirm);
    return { mentions: mentions.slice(0, 6), incumbent: recallingFirm };
  }
  return { mentions: mentions.slice(0, 6), incumbent: mentions[0] ?? null };
}

function extractDollarValue(
  raw: RawLead,
  signalType: SignalType,
  equipment: string[],
): number | null {
  const explicitAwardLine = raw.raw_text.match(/^Award \$:\s*\$([0-9]{1,3}(?:,[0-9]{3})+)/im);
  const awardMatch =
    explicitAwardLine ?? `${raw.title}\n${raw.raw_text}`.match(/\$([0-9]{1,3}(?:,[0-9]{3})+)/);
  if (awardMatch?.[1]) {
    const numeric = Number(awardMatch[1].replace(/,/g, ""));
    if (Number.isFinite(numeric) && numeric >= 50_000) {
      return Math.min(numeric, 4_000_000);
    }
  }
  if (raw.source === "rural_rht") {
    if (raw.source_external_id.startsWith("grants-gov:")) return 650_000;
    if (raw.source_external_id.startsWith("cms-cah:")) {
      const hasImagingHub = equipment.some(
        (item) => item.includes("MRI") || item.includes("CT") || item.includes("ROCC"),
      );
      return hasImagingHub ? 750_000 : 450_000;
    }
    return 500_000;
  }
  if (equipment.some((item) => item.includes("MRI") || item.includes("Cath Lab"))) return 1_200_000;
  if (equipment.some((item) => item.includes("CT"))) return 850_000;
  if (signalType === "recall") return equipment.length > 0 ? 450_000 : 250_000;
  if (signalType === "rfp") return 550_000;
  if (signalType === "funding" || signalType === "expansion") {
    return equipment.length > 0 ? 400_000 : 280_000;
  }
  if (signalType === "incumbency" || signalType === "m_and_a") return 300_000;
  return null;
}

function extractPhysiciansFromContacts(
  contacts: LeadContact[] | undefined,
): Array<{ name: string; role_hint: string | null }> {
  if (!contacts || contacts.length === 0) return [];
  const seen = new Set<string>();
  const list: Array<{ name: string; role_hint: string | null }> = [];
  for (const contact of contacts) {
    const name = contact.name?.trim();
    if (!name || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    list.push({ name, role_hint: contact.title ?? null });
  }
  return list.slice(0, 5);
}

function scoreRuralRhtLead(
  raw: RawLead,
  inCoreTerritory: boolean,
): { confidence: number; priority: "high" | "medium"; winProbability: number } {
  if (raw.source_external_id.startsWith("rht-grant:")) {
    const confidence = inCoreTerritory ? 88 : 78;
    return { confidence, priority: "high", winProbability: 0.32 };
  }
  if (raw.source_external_id.startsWith("grants-gov:")) {
    return { confidence: 86, priority: "high", winProbability: 0.28 };
  }
  const hasEmergencyServices = /24\/7 Emergency Services/i.test(raw.raw_text);
  const confidence = hasEmergencyServices ? 85 : 80;
  return {
    confidence,
    priority: confidence >= 80 && inCoreTerritory ? "high" : "medium",
    winProbability: hasEmergencyServices ? 0.28 : 0.22,
  };
}

function scoreLead(opts: {
  raw: RawLead;
  hospital: string | null;
  territory: string | null;
  signalType: SignalType;
  equipment: string[];
  estimatedValueUsd: number | null;
}): { confidence: number; priority: "high" | "medium" | "low"; winProbability: number } {
  const { raw, hospital, territory, signalType, equipment, estimatedValueUsd } = opts;
  const haystack = `${raw.title}\n${raw.raw_text}`;

  if (SOCIAL_SPAM_OR_OFFTOPIC_RX.test(haystack) || !passesMedicalGate(raw)) {
    return { confidence: 12, priority: "low", winProbability: 0.01 };
  }

  const inCoreTerritory = territory !== null && TERRITORY_SLUGS.has(territory);
  if (raw.source === "rural_rht") {
    return scoreRuralRhtLead(raw, inCoreTerritory);
  }

  const hasEquipmentSignal = equipment.length > 0;
  const isCommercialEntity = hospital !== null && COMMERCIAL_NON_HOSPITAL_RX.test(hospital);

  let confidence = 55;
  let winProbability = 0.15;

  if (signalType === "rfp") {
    confidence = inCoreTerritory ? 90 : 76;
    winProbability = 0.35;
  } else if (signalType === "recall") {
    const isClassOne = /\bclass\s+i\b/i.test(haystack);
    confidence = hasEquipmentSignal ? (isClassOne ? 88 : 82) : 48;
    winProbability = hasEquipmentSignal ? 0.45 : 0.12;
  } else if (signalType === "funding") {
    if (isCommercialEntity) {
      confidence = 66;
      winProbability = 0.12;
    } else if (inCoreTerritory && hasEquipmentSignal) {
      confidence = (estimatedValueUsd ?? 0) >= 350_000 ? 86 : 80;
      winProbability = 0.25;
    } else if (inCoreTerritory && hospital) {
      confidence = (estimatedValueUsd ?? 0) >= 350_000 ? 76 : 70;
      winProbability = 0.18;
    } else {
      confidence = 62;
    }
  } else if (signalType === "expansion") {
    confidence = inCoreTerritory && hasEquipmentSignal ? 82 : inCoreTerritory ? 75 : 64;
    winProbability = 0.2;
  } else if (signalType === "m_and_a" || signalType === "incumbency") {
    confidence = inCoreTerritory ? 78 : 68;
    winProbability = 0.25;
  } else if (signalType === "sentiment") {
    confidence = inCoreTerritory && hasEquipmentSignal ? 68 : hasEquipmentSignal ? 58 : 30;
    winProbability = 0.08;
  }

  const isHighPriority =
    !isCommercialEntity &&
    (confidence >= 85 ||
      (confidence >= 70 &&
        (signalType === "recall" || signalType === "rfp" || signalType === "funding") &&
        (estimatedValueUsd ?? 0) >= 250_000));

  const priority = isHighPriority ? "high" : confidence >= 65 ? "medium" : "low";
  return { confidence, priority, winProbability };
}

function buildRuralRhtSummary(
  raw: RawLead,
  hospital: string | null,
  stateUpper: string | null,
  equipment: string[],
  valueText: string,
): string {
  const bundleLabel = equipment.slice(0, 2).join(" + ") || "BlueSeal Mobile 1.5T MRI + ROCC / eICU";
  const loc = stateUpper ? ` (${stateUpper})` : "";

  if (raw.source_external_id.startsWith("rht-grant:") && hospital) {
    return `${hospital}${loc} secured ${valueText}HHS/CMS rural health grant. Position Philips ${bundleLabel} under ${stateUpper ?? "state"} $50B CMS RHT funding.`.slice(
      0,
      275,
    );
  }
  if (raw.source_external_id.startsWith("cms-cah:") && hospital) {
    return `${hospital}${loc} is a verified CMS Critical Access Hospital eligible for ${stateUpper ?? "state"} $50B RHT modernization. Pitch Philips ${bundleLabel}.`.slice(
      0,
      275,
    );
  }
  return `Active HHS/CMS rural hospital grant window for TX/OK/AR/LA accounts. Spec Philips ${bundleLabel} into facility capital budgets before close.`.slice(
    0,
    275,
  );
}

function buildSalesSummary(opts: {
  raw: RawLead;
  hospital: string | null;
  territory: string | null;
  signalType: SignalType;
  specialty: string;
  equipment: string[];
  incumbent: string | null;
  estimatedValueUsd: number | null;
  physicians: Array<{ name: string; role_hint: string | null }>;
}): string {
  const {
    raw,
    hospital,
    territory,
    signalType,
    specialty,
    equipment,
    incumbent,
    estimatedValueUsd,
    physicians,
  } = opts;
  const stateUpper =
    territory === "texas"
      ? "TX"
      : territory === "oklahoma"
        ? "OK"
        : territory === "arkansas"
          ? "AR"
          : territory === "louisiana"
            ? "LA"
            : null;
  const modalityLabel =
    equipment[0] ?? (specialty !== "Other" ? `${specialty} systems` : "clinical equipment");
  const leadContact = physicians[0]?.name ? ` (Lead PI: ${physicians[0].name})` : "";
  const valueText =
    estimatedValueUsd && estimatedValueUsd >= 50_000
      ? `$${Math.round(estimatedValueUsd).toLocaleString("en-US")} `
      : "";

  if (raw.source === "rural_rht") {
    return buildRuralRhtSummary(raw, hospital, stateUpper, equipment, valueText);
  }
  if (signalType === "recall") {
    return `${incumbent ?? "Competitor"} FDA recall impacting ${modalityLabel}. Position Philips replacement fleet across TX/OK/AR/LA accounts.`.slice(
      0,
      275,
    );
  }
  if (signalType === "funding" && hospital) {
    const loc = stateUpper ? ` (${stateUpper})` : "";
    return `${hospital}${loc} received ${valueText}federal ${specialty.toLowerCase()} funding${leadContact}. Engage clinical leadership on Philips ${modalityLabel}.`.slice(
      0,
      275,
    );
  }
  if (signalType === "rfp" && hospital) {
    return `${hospital} active federal procurement signal (${valueText || "open solicitation"}). Position Philips ${modalityLabel} response.`.slice(
      0,
      275,
    );
  }
  if (signalType === "expansion" && hospital) {
    return `${hospital} expanding ${specialty.toLowerCase()} clinical program${leadContact}. Opportunity for Philips ${modalityLabel}.`.slice(
      0,
      275,
    );
  }
  return raw.title.replace(/\s+/g, " ").trim().slice(0, 275);
}

export function deterministicEnrichRawLead(
  raw: RawLead,
  knownVendors: string[] = [],
  knownProducts: string[] = [],
): EnrichmentResult {
  const haystack = `${raw.title}\n${raw.raw_text}`;
  const hospital = extractHospital(raw);
  const territory = extractTerritory(raw, hospital);
  const signalType = inferSignalType(raw);
  const accountType = inferAccountType(raw, hospital);
  const specialty = inferSpecialty(haystack);
  const equipment = extractEquipment(haystack);
  const { mentions, incumbent } = extractVendors(raw, knownVendors, knownProducts);
  const estimatedValueUsd = extractDollarValue(raw, signalType, equipment);
  const physicians = extractPhysiciansFromContacts(raw.source_contacts);
  const { confidence, priority, winProbability } = scoreLead({
    raw,
    hospital,
    territory,
    signalType,
    equipment,
    estimatedValueUsd,
  });

  const summary = buildSalesSummary({
    raw,
    hospital,
    territory,
    signalType,
    specialty,
    equipment,
    incumbent,
    estimatedValueUsd,
    physicians,
  });

  return {
    summary,
    confidence,
    priority,
    hospital,
    specialty: specialty === "Other" && confidence < 35 ? null : specialty,
    territory,
    estimated_value_usd: confidence < 35 ? null : estimatedValueUsd,
    win_probability: confidence < 35 ? 0.01 : winProbability,
    competitor_incumbent: incumbent,
    account_type: accountType,
    signal_type: signalType,
    vendor_mentions: mentions,
    entities: {
      hospitals: hospital ? [hospital] : [],
      physicians,
      equipment,
      keywords: equipment.map((item) => item.toLowerCase()),
    },
  };
}
