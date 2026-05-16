export type LeadSource = "reddit" | "government" | "news" | "recalls" | "linkedin";

export interface Lead {
  id: string;
  title: string;
  summary: string;
  source: LeadSource;
  sourceUrl: string;
  confidence: number;
  dateDiscovered: string; // ISO
  hospital: string;
  specialty: string;
  territory: string;
  entities: {
    hospitals: string[];
    physicians: string[];
    equipment: string[];
    keywords: string[];
  };
  priority: "high" | "medium" | "low";
}

export const leads: Lead[] = [
  {
    id: "lead_001",
    title: "New Ultrasound RFQ at UC San Diego — $500K–$1M Budget",
    summary:
      "Cardiac Imaging Department issued formal request for quotation on premium ultrasound systems. Deadline May 30. Dr. Chen leading evaluation committee.",
    source: "government",
    sourceUrl: "https://sam.gov/opp/ucsd-ultrasound",
    confidence: 96,
    dateDiscovered: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(),
    hospital: "UC San Diego Health",
    specialty: "Cardiology",
    territory: "california",
    priority: "high",
    entities: {
      hospitals: ["UC San Diego Health", "Jacobs Medical Center"],
      physicians: ["Dr. Michael Chen", "Dr. Sarah Park"],
      equipment: ["Ultrasound Systems", "Cardiac Imaging"],
      keywords: ["RFQ", "$500K–$1M", "May 30 deadline"],
    },
  },
  {
    id: "lead_002",
    title: "Stanford Launches New Cardiac Surgery Fellowship Program",
    summary:
      "Stanford Health announces 2026 cardiac surgery fellowship expansion. Equipment procurement underway for new OR suite. Procurement contact identified.",
    source: "news",
    sourceUrl: "https://stanfordhealth.org/news/cardiac-fellowship",
    confidence: 91,
    dateDiscovered: new Date(Date.now() - 1000 * 60 * 60 * 4).toISOString(),
    hospital: "Stanford Health Care",
    specialty: "Cardiology",
    territory: "california",
    priority: "high",
    entities: {
      hospitals: ["Stanford Health Care"],
      physicians: ["Dr. Anna Whitfield"],
      equipment: ["Cardiac OR Suite", "Heart-Lung Bypass"],
      keywords: ["Fellowship", "OR expansion", "Q3 2026"],
    },
  },
  {
    id: "lead_003",
    title: "FDA Class II Recall — Competitor Infusion Pump (Cedars-Sinai impacted)",
    summary:
      "Competitor recall affecting 4,200 units across Western US hospitals. Cedars-Sinai and 6 other regional accounts seeking replacement vendor.",
    source: "recalls",
    sourceUrl: "https://accessdata.fda.gov/recall/pump-2026",
    confidence: 94,
    dateDiscovered: new Date(Date.now() - 1000 * 60 * 60 * 6).toISOString(),
    hospital: "Cedars-Sinai",
    specialty: "Critical Care",
    territory: "california",
    priority: "high",
    entities: {
      hospitals: ["Cedars-Sinai", "UCLA Health", "Hoag Memorial"],
      physicians: [],
      equipment: ["Infusion Pumps"],
      keywords: ["FDA Recall", "Class II", "Replacement opportunity"],
    },
  },
  {
    id: "lead_004",
    title: "Reddit r/medicine — UCLA Pulmonology venting on ventilator support contracts",
    summary:
      "Verified pulmonologist post details frustration with current ventilator vendor service response times. Multiple peer responses from same hospital system.",
    source: "reddit",
    sourceUrl: "https://reddit.com/r/medicine/comments/abc",
    confidence: 78,
    dateDiscovered: new Date(Date.now() - 1000 * 60 * 60 * 8).toISOString(),
    hospital: "UCLA Health",
    specialty: "Pulmonology",
    territory: "california",
    priority: "medium",
    entities: {
      hospitals: ["UCLA Health", "Ronald Reagan Medical"],
      physicians: [],
      equipment: ["Ventilators", "Service Contracts"],
      keywords: ["Service issues", "Vendor switch", "Contract renewal"],
    },
  },
  {
    id: "lead_005",
    title: "Hoag Memorial expands Cath Lab — RFI posted on procurement portal",
    summary:
      "Two new catheterization labs planned for Newport Beach campus. Vendor information requested by June 15.",
    source: "government",
    sourceUrl: "https://hoag.org/procurement/cath-lab",
    confidence: 88,
    dateDiscovered: new Date(Date.now() - 1000 * 60 * 60 * 10).toISOString(),
    hospital: "Hoag Memorial",
    specialty: "Cardiology",
    territory: "california",
    priority: "medium",
    entities: {
      hospitals: ["Hoag Memorial"],
      physicians: ["Dr. Lindsay Tanaka"],
      equipment: ["Cath Lab", "Hemodynamic Monitoring"],
      keywords: ["RFI", "Expansion", "June 15"],
    },
  },
  {
    id: "lead_006",
    title: "LinkedIn — VP Procurement at Scripps Health hiring imaging specialists",
    summary:
      "Three new req postings for imaging equipment specialists suggest fleet refresh in Q3.",
    source: "linkedin",
    sourceUrl: "https://linkedin.com/in/scripps-vp",
    confidence: 72,
    dateDiscovered: new Date(Date.now() - 1000 * 60 * 60 * 14).toISOString(),
    hospital: "Scripps Health",
    specialty: "Radiology",
    territory: "california",
    priority: "medium",
    entities: {
      hospitals: ["Scripps Health"],
      physicians: [],
      equipment: ["MRI", "CT"],
      keywords: ["Hiring signal", "Fleet refresh"],
    },
  },
  {
    id: "lead_007",
    title: "Sharp HealthCare publishes 2026 capital equipment budget — $42M imaging",
    summary:
      "Board-approved capital plan now public. Imaging allocation up 18% YoY.",
    source: "news",
    sourceUrl: "https://sharp.com/about/financials",
    confidence: 89,
    dateDiscovered: new Date(Date.now() - 1000 * 60 * 60 * 18).toISOString(),
    hospital: "Sharp HealthCare",
    specialty: "Radiology",
    territory: "california",
    priority: "high",
    entities: {
      hospitals: ["Sharp HealthCare"],
      physicians: [],
      equipment: ["Imaging Suite", "MRI", "PET-CT"],
      keywords: ["Capital budget", "$42M", "FY26"],
    },
  },
  {
    id: "lead_008",
    title: "Kaiser Permanente NorCal — Recall response committee posts vendor brief",
    summary:
      "Formal vendor information request following Q1 device recall. Submission window open through May 28.",
    source: "government",
    sourceUrl: "https://kp.org/vendors/brief-2026",
    confidence: 84,
    dateDiscovered: new Date(Date.now() - 1000 * 60 * 60 * 22).toISOString(),
    hospital: "Kaiser Permanente",
    specialty: "Critical Care",
    territory: "california",
    priority: "medium",
    entities: {
      hospitals: ["Kaiser Permanente NorCal"],
      physicians: [],
      equipment: ["Patient Monitors"],
      keywords: ["RFI", "May 28"],
    },
  },
  {
    id: "lead_009",
    title: "Sutter Health Sacramento — Pulmonary lab modernization grant awarded",
    summary:
      "$3.2M state grant funds equipment modernization. Procurement timeline: 90 days.",
    source: "news",
    sourceUrl: "https://sutterhealth.org/news",
    confidence: 82,
    dateDiscovered: new Date(Date.now() - 1000 * 60 * 60 * 26).toISOString(),
    hospital: "Sutter Health",
    specialty: "Pulmonology",
    territory: "california",
    priority: "medium",
    entities: {
      hospitals: ["Sutter Health Sacramento"],
      physicians: ["Dr. Rina Patel"],
      equipment: ["Spirometers", "Bronchoscopy Suite"],
      keywords: ["Grant", "$3.2M", "90 days"],
    },
  },
  {
    id: "lead_010",
    title: "Reddit r/nursing — Stanford ICU staff discuss new monitor rollout delays",
    summary:
      "Discussion thread suggests competitor implementation slipping. Window for alternative pitch.",
    source: "reddit",
    sourceUrl: "https://reddit.com/r/nursing/xyz",
    confidence: 68,
    dateDiscovered: new Date(Date.now() - 1000 * 60 * 60 * 30).toISOString(),
    hospital: "Stanford Health Care",
    specialty: "Critical Care",
    territory: "california",
    priority: "low",
    entities: {
      hospitals: ["Stanford Health Care"],
      physicians: [],
      equipment: ["Patient Monitors"],
      keywords: ["Implementation delay", "Competitor"],
    },
  },
  {
    id: "lead_011",
    title: "UCSF posts RFQ for advanced ECMO systems",
    summary:
      "Adult ECMO program expansion. Budget bracket $1.2M–$1.8M. Pre-bid conference May 22.",
    source: "government",
    sourceUrl: "https://ucsf.edu/procurement/ecmo",
    confidence: 93,
    dateDiscovered: new Date(Date.now() - 1000 * 60 * 60 * 34).toISOString(),
    hospital: "UCSF Medical Center",
    specialty: "Critical Care",
    territory: "california",
    priority: "high",
    entities: {
      hospitals: ["UCSF Medical Center"],
      physicians: ["Dr. Jose Alvarez"],
      equipment: ["ECMO Systems"],
      keywords: ["RFQ", "$1.2M–$1.8M", "Pre-bid May 22"],
    },
  },
  {
    id: "lead_012",
    title: "LinkedIn — Loma Linda announces new heart transplant program lead",
    summary:
      "High-profile hire signals near-term capital investment in cardiac surgery infrastructure.",
    source: "linkedin",
    sourceUrl: "https://linkedin.com/posts/lomalinda",
    confidence: 75,
    dateDiscovered: new Date(Date.now() - 1000 * 60 * 60 * 40).toISOString(),
    hospital: "Loma Linda University Health",
    specialty: "Cardiology",
    territory: "california",
    priority: "medium",
    entities: {
      hospitals: ["Loma Linda University Health"],
      physicians: ["Dr. Marcus Webb"],
      equipment: ["Cardiac Surgery Suite"],
      keywords: ["Leadership hire", "Transplant program"],
    },
  },
];

export const hospitals = Array.from(new Set(leads.map((l) => l.hospital)));
export const specialties = Array.from(new Set(leads.map((l) => l.specialty)));
export const sources: LeadSource[] = ["reddit", "government", "news", "recalls", "linkedin"];

export function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
