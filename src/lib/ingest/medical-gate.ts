import type { RawLead } from "./types";

const GATE_BYPASS_SOURCES = new Set<string>([
  "rural_rht",
  "openfda",
  "clinicaltrials",
  "cms_open_payments",
]);

const CLINICAL_SUBSTRING_TERMS = [
  "critical access hospital",
  "rural emergency hospital",
  "rural health transformation",
  "tele-critical",
  "perinatal",
  "ultrasound",
  "echocard",
  "sonograph",
  "doppler",
  "cath lab",
  "catheterization",
  "radiolog",
  "cardiolog",
  "oncolog",
  "emergency medicine",
  "emergency department",
  "emergency room",
  "anesthesi",
  "surgical",
  "surgery",
  "hospital",
  "health system",
  "healthcare",
  "health care",
  "medical center",
  "physician",
  "nurse",
  "patient",
  "va medical",
  "va healthcare",
  "veterans health",
  "veterans affairs",
  "indian health service",
  "imaging",
  "ct scan",
  "pet/ct",
  "x-ray",
  "fluoroscop",
  "defibrillator",
  "ventilator",
  "transducer",
  "biomed",
  "medtech",
  "medical device",
  "clinical trial",
  "point-of-care",
  "point of care",
  "electrophysiolog",
  "intravascular",
];

const CLINICAL_WORD_BOUNDARY_RX = /\b(mri|icu|ehr|emr|fda|ecmo|pacs|ivus|ekg|ecg|clinic)\b/i;

const POCUS_RX = /\bpocus\b/i;
const HOCUS_POCUS_NOISE_RX = /\bhocus[\s-]*pocus\b/i;

// Consumer-overlapping brand names and 2-3 character model codes that match
// non-medical products (espresso machines, shavers, TVs, phones, SUVs, concert venues)
// unless an explicit clinical/healthcare term is also present.
const AMBIGUOUS_EXTRA_TERMS = new Set<string>([
  "philips",
  "phillips",
  "samsung",
  "fujifilm",
  "canon",
  "siemens",
  "venue",
  "venue fit",
  "venue go",
  "venue r3",
  "lx",
  "px",
  "s2",
  "m9",
  "te7",
  "te8",
  "logiq",
  "kosmos",
  "edge ii",
]);

const NON_MEDICAL_NOISE_RX =
  /\b(animal medical|veterinary|vet clinic|equine|canine|feline|hocus[\s-]*pocus|witch film|halloween shirts?|prog rock|careerowl\.in|fresher alert)\b/i;

const SYNTHETIC_METADATA_LINE_RX = /^(?:query|matched terms|query slice):.*$/gim;

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function isAmbiguousExtraTerm(term: string): boolean {
  const normalized = term.trim().toLowerCase();
  if (normalized.length < 4) return true;
  return AMBIGUOUS_EXTRA_TERMS.has(normalized);
}

export function passesMedicalGate(raw: RawLead, extraTerms: string[] = []): boolean {
  if (GATE_BYPASS_SOURCES.has(raw.source)) return true;

  const cleanedRawText = raw.raw_text.replace(SYNTHETIC_METADATA_LINE_RX, " ");
  const haystack = `${raw.title} ${cleanedRawText} ${raw.source_url ?? ""}`.toLowerCase();
  if (NON_MEDICAL_NOISE_RX.test(haystack)) return false;

  if (CLINICAL_SUBSTRING_TERMS.some((term) => haystack.includes(term))) {
    return true;
  }
  if (CLINICAL_WORD_BOUNDARY_RX.test(haystack)) {
    return true;
  }
  if (POCUS_RX.test(haystack) && !HOCUS_POCUS_NOISE_RX.test(haystack)) {
    return true;
  }

  for (const rawTerm of extraTerms) {
    const term = rawTerm.trim().toLowerCase();
    if (!term || isAmbiguousExtraTerm(term)) continue;
    const rx = new RegExp(`\\b${escapeRegex(term)}\\b`, "i");
    if (rx.test(haystack)) return true;
  }

  return false;
}

export function sanitizeErrorText(raw: string, maxLen = 300): string {
  return raw
    .replace(/<[^>]+>/g, " ")
    .replace(/(api[_-]?key|token|secret|password)\s*[=:]\s*\S+/gi, "$1=***")
    .replace(/https?:\/\/\S+/gi, "[url]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLen);
}
