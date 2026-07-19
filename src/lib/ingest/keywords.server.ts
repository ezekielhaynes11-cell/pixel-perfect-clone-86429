import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { PHILLIPS_KEYWORDS } from "./types";

export interface Keywords {
  vendors: string[];
  products: string[];
  focusConcepts: string[];
  roleTitles: string[];
  complaintSignals: string[];
  /** Combined vendor + product + focus list for keyword matching. */
  all: string[];
}

let cache: { at: number; data: Keywords } | null = null;
const TTL_MS = 5 * 60 * 1000;

const FALLBACK: Keywords = {
  vendors: [
    "GE Healthcare",
    "Mindray",
    "SonoSite",
    "Samsung Medison",
    "Canon Medical",
    "Siemens Healthineers",
    "Fujifilm Sonosite",
  ],
  products: [
    "Venue",
    "Venue Fit",
    "Venue Go",
    "TE7",
    "TE7 Max",
    "TE8",
    "M9",
    "LX",
    "PX",
    "S2",
    "Lumify",
  ],
  focusConcepts: [
    "POCUS",
    "point-of-care ultrasound",
    "MSK ultrasound",
    "echocardiography",
    "cath lab",
    "VA hospital ultrasound",
  ],
  roleTitles: [
    "POCUS director",
    "fellowship director",
    "chief of emergency medicine",
    "biomed director",
  ],
  complaintSignals: [
    "what should we replace",
    "frustrated with",
    "looking to buy",
    "end of life",
    "any recommendations",
  ],
  all: [...PHILLIPS_KEYWORDS],
};

export async function loadKeywords(): Promise<Keywords> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.data;
  try {
    const { data, error } = await supabaseAdmin
      .from("keyword_lists")
      .select("kind, value")
      .eq("active", true);
    if (error || !data || data.length === 0) {
      cache = { at: Date.now(), data: FALLBACK };
      return FALLBACK;
    }
    const bucket = (k: string) => data.filter((r) => r.kind === k).map((r) => r.value);
    const vendors = bucket("vendor");
    const products = bucket("product_model");
    const focusConcepts = bucket("focus_concept");
    const roleTitles = bucket("role_title");
    const complaintSignals = bucket("complaint_signal");
    const out: Keywords = {
      vendors,
      products,
      focusConcepts,
      roleTitles,
      complaintSignals,
      all: Array.from(new Set([...vendors, ...products, ...focusConcepts, ...PHILLIPS_KEYWORDS])),
    };
    cache = { at: Date.now(), data: out };
    return out;
  } catch {
    return FALLBACK;
  }
}

export function matchesAnyKeyword(text: string, terms: string[]): string[] {
  const t = text.toLowerCase();
  return terms.filter((k) => t.includes(k.toLowerCase()));
}
