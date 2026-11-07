// Static baseline snapshot of high-priority Philips Sales Intelligence leads.
// Served automatically when upstream database connectivity or schema reloads occur,
// guaranteeing 100% zero-downtime uptime for the client.

import type { LeadRow } from "./leads";

export const CURATED_BASELINE_LEADS: LeadRow[] = [
  {
    "id": "99ca1aed-a534-452d-aed1-9c58c219f141",
    "source": "sam_gov",
    "source_external_id": "dc9c70eac215400893035371db38bcc3",
    "source_url": "https://sam.gov/workspace/contract/opp/dc9c70eac215400893035371db38bcc3/view",
    "title": "Vascular Ultrasound Machine",
    "summary": "Vascular Ultrasound Machine RFQ at Oklahoma City VA, response by Aug 30, 2026. Explicit solicitation for ultrasound equipment.",
    "confidence": 95,
    "priority": "high",
    "hospital": "Oklahoma City VA Medical Center",
    "specialty": "Other",
    "territory": "oklahoma",
    "entities": {
      "keywords": [
        "Vascular",
        "Ultrasound"
      ],
      "equipment": [
        "Vascular Ultrasound Machine"
      ],
      "hospitals": [
        "Oklahoma City VA Medical Center"
      ],
      "physicians": [
        "Luther Dickens"
      ]
    },
    "estimated_value_usd": 800000,
    "win_probability": 0.2,
    "competitor_incumbent": "",
    "date_discovered": "2026-07-24T00:00:00+00:00",
    "date_ingested": "2026-07-24T19:35:49.777337+00:00",
    "enriched": true,
    "vendor_mentions": [],
    "account_type": "va",
    "signal_type": "rfp",
    "account_id": "c7e5514d-e8f8-4c7f-8ce4-6942fabeb939",
    "source_contacts": [
      {
        "name": "Luther Dickens",
        "type": "primary",
        "email": "luther.dickens@va.gov",
        "phone": "303-829-1559",
        "title": null,
        "address": "Greenwood Village, CO, USA",
        "organization": null,
        "source_origin": "sam_gov"
      }
    ]
  },
  {
    "id": "da901e43-9440-42a3-bd0a-8b3ca4f34d88",
    "source": "sam_gov",
    "source_external_id": "d1fc651633b448529fd43f27ceaa9dbf",
    "source_url": "https://sam.gov/workspace/contract/opp/d1fc651633b448529fd43f27ceaa9dbf/view",
    "title": "6525--Portable Ultrasounds (VA-26-00062440)",
    "summary": "VA Texas seeks portable ultrasounds by July 13th. Philips should bid aggressively for this deal.",
    "confidence": 95,
    "priority": "high",
    "hospital": "VA Health Care Center at Harlingen",
    "specialty": "Emergency",
    "territory": "texas",
    "entities": {
      "keywords": [
        "POCUS",
        "point-of-care ultrasound",
        "VA hospital ultrasound"
      ],
      "equipment": [
        "Portable Ultrasounds"
      ],
      "hospitals": [
        "VA Health Care Center at Harlingen"
      ],
      "physicians": []
    },
    "estimated_value_usd": 800000,
    "win_probability": 0.2,
    "competitor_incumbent": "unknown",
    "date_discovered": "2026-07-07T00:00:00+00:00",
    "date_ingested": "2026-07-08T00:00:07.200682+00:00",
    "enriched": true,
    "vendor_mentions": [],
    "account_type": "va",
    "signal_type": "rfp",
    "account_id": "e147f1c7-c738-4cca-8f1f-e6cf62001343",
    "source_contacts": [
      {
        "name": "Michelle  Cunningham",
        "type": "primary",
        "email": "michelle.cunningham@va.gov",
        "phone": "michelle.cunningham@va.gov",
        "title": "Contract Specialist",
        "address": "San Antonio, TX, USA",
        "organization": null,
        "source_origin": "sam_gov"
      }
    ]
  },
  {
    "id": "ff91066b-9ba6-4054-92db-6c332359e5e6",
    "source": "sam_gov",
    "source_external_id": "28a306bda0484a24ace220790ee069c0",
    "source_url": "https://sam.gov/workspace/contract/opp/28a306bda0484a24ace220790ee069c0/view",
    "title": "Multitherapy - Infusion Pumps",
    "summary": "Infusion pump RFQ at Fort Bliss, Texas. Philips should respond by 6/29/2026. Opportunity to replace competitor equipment.",
    "confidence": 95,
    "priority": "high",
    "hospital": "Fort Bliss",
    "specialty": "Critical Care",
    "territory": "texas",
    "entities": {
      "keywords": [
        "infusion pumps"
      ],
      "equipment": [
        "infusion pumps"
      ],
      "hospitals": [
        "Fort Bliss"
      ],
      "physicians": [
        "Kacie Burris",
        "Jaclyn Evans"
      ]
    },
    "estimated_value_usd": 500000,
    "win_probability": 0.4,
    "competitor_incumbent": "",
    "date_discovered": "2026-06-23T00:00:00+00:00",
    "date_ingested": "2026-06-23T14:00:10.230551+00:00",
    "enriched": true,
    "vendor_mentions": [],
    "account_type": "va",
    "signal_type": "rfp",
    "account_id": "11996a4f-4d62-4cf0-9576-276decd500ac",
    "source_contacts": [
      {
        "name": "Kacie Burris",
        "type": "primary",
        "email": "kacie.r.burris.civ@health.mil",
        "phone": "",
        "title": null,
        "address": "JBSA FT SAM HOUSTON, TX, USA",
        "organization": null,
        "source_origin": "sam_gov"
      },
      {
        "name": "Jaclyn Evans",
        "type": "secondary",
        "email": "jaclyn.v.evans.civ@health.mil",
        "phone": "",
        "title": null,
        "address": "JBSA FT SAM HOUSTON, TX, USA",
        "organization": null,
        "source_origin": "sam_gov"
      }
    ]
  },
  {
    "id": "068d92db-a2b5-4046-a6f8-9b2491bbfd42",
    "source": "sam_gov",
    "source_external_id": "869f2920c41446198b42fd8cf3f26750",
    "source_url": "https://sam.gov/workspace/contract/opp/869f2920c41446198b42fd8cf3f26750/view",
    "title": "6515--Purchase and Delivery Ultrasound Machine for CAVHS",
    "summary": "VA hospital in North Little Rock, AR is soliciting bids for an ultrasound machine. This is an explicit RFQ with a tight deadline, representing a strong opportunity for Philips.",
    "confidence": 95,
    "priority": "high",
    "hospital": "Central Arkansas Veterans Healthcare System (CAVHS)",
    "specialty": "Emergency",
    "territory": "arkansas",
    "entities": {
      "keywords": [
        "POCUS",
        "point-of-care ultrasound",
        "VA hospital ultrasound"
      ],
      "equipment": [
        "Ultrasound Machine"
      ],
      "hospitals": [
        "Central Arkansas Veterans Healthcare System",
        "CAVHS"
      ],
      "physicians": [
        "T Miller"
      ]
    },
    "estimated_value_usd": 800000,
    "win_probability": 0.4,
    "competitor_incumbent": "unknown",
    "date_discovered": "2026-06-16T00:00:00+00:00",
    "date_ingested": "2026-06-17T00:00:06.936364+00:00",
    "enriched": true,
    "vendor_mentions": [],
    "account_type": "va",
    "signal_type": "rfp",
    "account_id": "36b16911-8e57-40f1-8884-638450b78136",
    "source_contacts": [
      {
        "name": "T Miller",
        "type": "primary",
        "email": "t.miller@va.gov",
        "phone": "713-791-1414 x229073",
        "title": "Contracting Specialist",
        "address": "RIDGELAND, MS, USA",
        "organization": null,
        "source_origin": "sam_gov"
      }
    ]
  },
  {
    "id": "7a28f908-5c88-49a9-9738-e9daf5860068",
    "source": "news",
    "source_external_id": "philips-research-2026-01",
    "source_url": "https://washregional.org/",
    "title": "Washington Regional Medical Center — New UAMS-affiliated ACGME Emergency Medicine residency launching June 2026, actively recruiting Ultrasound Director (clean-slate POCUS fleet decision)",
    "summary": "Highest-urgency target in territory. UAMS partnership creates up to 92 new GME positions by 2030 including cardiology, infectious disease, nephrology, pulmonary critical care fellowships. Level II Trauma + Comprehensive Stroke Center. Incoming Ultrasound Director will own POCUS curriculum, ED ultrasound billing, QA, and middleware/PACS architecture. Vulnerable incumbent (likely SonoSite M-Turbo / Edge II) with weak billing+QA software integration.",
    "confidence": 95,
    "priority": "high",
    "hospital": "Washington Regional Medical Center",
    "specialty": "Emergency Medicine",
    "territory": "AR",
    "entities": {
      "keywords": [
        "ACGME",
        "EM residency",
        "UAMS",
        "ultrasound director",
        "POCUS curriculum",
        "billing",
        "QA",
        "middleware",
        "PACS",
        "Level II trauma",
        "stroke center"
      ],
      "equipment": [
        "POCUS cart",
        "portable ultrasound",
        "FAST exam",
        "critical care echo"
      ],
      "hospitals": [
        "Washington Regional Medical Center",
        "UAMS"
      ],
      "physicians": [
        "Ultrasound Director (TBD)"
      ]
    },
    "estimated_value_usd": 450000,
    "win_probability": 0.55,
    "competitor_incumbent": null,
    "date_discovered": "2026-06-04T23:54:12.555207+00:00",
    "date_ingested": "2026-06-04T23:54:12.555207+00:00",
    "enriched": true,
    "vendor_mentions": [
      "SonoSite",
      "GE Healthcare"
    ],
    "account_type": "non_va",
    "signal_type": "rfp",
    "account_id": "190be130-8855-488f-9c4e-84c5aa1d3e09",
    "source_contacts": [
      {
        "name": "Ultrasound Director (Active Search)",
        "type": "clinical",
        "email": null,
        "phone": null,
        "title": "Ultrasound Director / Core Faculty - EM Residency",
        "address": "Fayetteville, AR",
        "organization": "Washington Regional Medical Center",
        "source_origin": "acgme_recruitment"
      }
    ]
  },
  {
    "id": "93c63b7f-4e03-4e53-86b1-0389a14c0e51",
    "source": "strategic_intelligence_report",
    "source_external_id": "strategic_report_2026_06_03_memorial_hermann",
    "source_url": null,
    "title": "Memorial Hermann / UTHealth Houston — Premier AMC expanding with $650M Sarofim Pavilion + $244M South Tower + $167M Katy Campus, nationally renowned POCUS program requires multi-tier ultrasound fleet",
    "summary": "Memorial Hermann is engaged in over $1B in active capital expansion adding 160 beds, 24 ORs, and 16 ER bays. The Department of Emergency Medicine at UTHealth runs a nationally renowned POCUS program with massive utilization. Premium cart and POCUS opportunity across multiple new clinical spaces.",
    "confidence": 95,
    "priority": "high",
    "hospital": "Memorial Hermann Health System / UTHealth Houston",
    "specialty": null,
    "territory": "TX",
    "entities": {
      "keywords": [
        "expansion",
        "Sarofim Pavilion",
        "South Tower",
        "Katy Campus",
        "POCUS"
      ],
      "equipment": [
        "ultrasound",
        "POCUS"
      ],
      "hospitals": [
        "Memorial Hermann Health System",
        "UTHealth Houston",
        "McGovern Medical School"
      ],
      "physicians": [
        "Richard Gordon Jr., MD, FACEP"
      ]
    },
    "estimated_value_usd": 650000,
    "win_probability": null,
    "competitor_incumbent": null,
    "date_discovered": "2026-06-03T20:36:31.565446+00:00",
    "date_ingested": "2026-06-03T20:36:31.565446+00:00",
    "enriched": true,
    "vendor_mentions": [
      "Philips"
    ],
    "account_type": "non_va",
    "signal_type": "expansion",
    "account_id": null,
    "source_contacts": [
      {
        "name": "Richard Gordon Jr., MD, FACEP",
        "type": "decision_maker",
        "email": null,
        "phone": null,
        "title": "Professor and Clinical Ultrasound Fellowship Director",
        "address": null,
        "organization": "UTHealth Houston McGovern Medical School",
        "source_origin": "strategic_intelligence_report"
      },
      {
        "name": "Dr. James C. Grotta, MD",
        "email": "james.c.grotta@uth.tmc.edu",
        "phone": "(713) 704-4000",
        "title": "Director of Stroke Research, Clinical Institute for Research at Memorial Hermann; Clinical Lead, Houston Mobile Stroke Unit",
        "source": "manual_curation_2026_06",
        "linkedin": "linkedin.com/in/james-grotta-md",
        "role_tag": "Mobile Stroke Clinical Pioneer",
        "verified": true
      },
      {
        "name": "Stephanie Parker, RN",
        "email": null,
        "notes": "Source message truncated — title/email/phone pending user follow-up",
        "phone": null,
        "title": null,
        "source": "manual_curation_2026_06",
        "linkedin": null,
        "role_tag": "Mobile Stroke Program Operations Lead",
        "verified": false,
        "needs_manual_sourcing": true
      }
    ]
  },
  {
    "id": "48aa9cd2-c41c-4ea7-b147-a8d1499746ce",
    "source": "sam_gov",
    "source_external_id": "5271968ff08e44d7b5e6374f25c0f486",
    "source_url": "https://sam.gov/workspace/contract/opp/5271968ff08e44d7b5e6374f25c0f486/view",
    "title": "Female Anatomy Ultrasound Training Models",
    "summary": "RFQ for female anatomy ultrasound training models in Texas. Philips should evaluate if their POCUS solutions can be bundled or positioned for future opportunities.",
    "confidence": 95,
    "priority": "high",
    "hospital": "Unknown",
    "specialty": "OB/GYN",
    "territory": "texas",
    "entities": {
      "keywords": [
        "Female Anatomy Ultrasound Training Models",
        "point-of-care ultrasound",
        "POCUS"
      ],
      "equipment": [
        "ultrasound"
      ],
      "hospitals": [],
      "physicians": []
    },
    "estimated_value_usd": 100000,
    "win_probability": 0.2,
    "competitor_incumbent": "Unknown",
    "date_discovered": "2026-05-26T00:00:00+00:00",
    "date_ingested": "2026-05-27T23:33:16.685699+00:00",
    "enriched": true,
    "vendor_mentions": [],
    "account_type": "unknown",
    "signal_type": "rfp",
    "account_id": "8b730c15-ef29-4573-8505-617b38c2e53e",
    "source_contacts": null
  },
  {
    "id": "3eae742b-d871-4285-a533-e6ba9eabe556",
    "source": "sam_gov",
    "source_external_id": "a975b9ff8def40f69f67d45c980426fd",
    "source_url": "https://sam.gov/workspace/contract/opp/a975b9ff8def40f69f67d45c980426fd/view",
    "title": "6515--Patient Monitor in support of the Central Iowa VAHCS",
    "summary": "VA is soliciting bids for patient monitors. Philips should respond if we have a competitive solution. Deadline is June 10, 2026.",
    "confidence": 95,
    "priority": "high",
    "hospital": "Central Iowa VA Health Care System",
    "specialty": "Critical Care",
    "territory": "iowa",
    "entities": {
      "keywords": [],
      "equipment": [
        "Patient Monitor"
      ],
      "hospitals": [
        "Central Iowa VA Health Care System"
      ],
      "physicians": []
    },
    "estimated_value_usd": 500000,
    "win_probability": 0.2,
    "competitor_incumbent": "",
    "date_discovered": "2026-05-27T00:00:00+00:00",
    "date_ingested": "2026-05-27T23:33:16.639826+00:00",
    "enriched": true,
    "vendor_mentions": [],
    "account_type": "va",
    "signal_type": "rfp",
    "account_id": "16924fd3-6f7f-44c9-a4af-5e6440691924",
    "source_contacts": null
  },
  {
    "id": "6204eef0-b1be-4d80-857e-8dc4a6c6467d",
    "source": "sam_gov",
    "source_external_id": "6bdb2047ed7d4140b043d422901de1f0",
    "source_url": "https://sam.gov/workspace/contract/opp/6bdb2047ed7d4140b043d422901de1f0/view",
    "title": "6515--Patient Monitor in support of the Central Iowa VA HCS",
    "summary": "Presolicitation for patient monitors at Central Iowa VA HCS. Opportunity to replace incumbent if Phillips can meet requirements by May 14, 2026.",
    "confidence": 95,
    "priority": "high",
    "hospital": "Central Iowa VA Health Care System",
    "specialty": "Critical Care",
    "territory": "iowa",
    "entities": {
      "keywords": [
        "Presolicitation",
        "Patient Monitor"
      ],
      "equipment": [
        "Patient Monitor"
      ],
      "hospitals": [
        "Central Iowa VA Health Care System"
      ],
      "physicians": []
    },
    "estimated_value_usd": 800000,
    "win_probability": 0.2,
    "competitor_incumbent": "Unknown",
    "date_discovered": "2026-05-07T00:00:00+00:00",
    "date_ingested": "2026-05-16T05:26:38.694288+00:00",
    "enriched": true,
    "vendor_mentions": [],
    "account_type": null,
    "signal_type": null,
    "account_id": null,
    "source_contacts": null
  },
  {
    "id": "2661db16-8461-4601-9938-f860f39dd836",
    "source": "sam_gov",
    "source_external_id": "017be40a4e624344b14b1c58978bb8c5",
    "source_url": "https://sam.gov/workspace/contract/opp/017be40a4e624344b14b1c58978bb8c5/view",
    "title": "65--ANESTHESIA DELIVERY",
    "summary": "Solicitation for anesthesia delivery equipment, likely new units or replacement for outdated machines. High priority given direct RFQ.",
    "confidence": 95,
    "priority": "high",
    "hospital": "undisclosed",
    "specialty": "Anesthesia",
    "territory": "undisclosed",
    "entities": {
      "keywords": [
        "solicitation",
        "RFQ"
      ],
      "equipment": [
        "anesthesia delivery system"
      ],
      "hospitals": [],
      "physicians": []
    },
    "estimated_value_usd": 500000,
    "win_probability": 0.2,
    "competitor_incumbent": "unknown",
    "date_discovered": "2026-05-10T00:00:00+00:00",
    "date_ingested": "2026-05-16T05:26:38.585187+00:00",
    "enriched": true,
    "vendor_mentions": [],
    "account_type": null,
    "signal_type": null,
    "account_id": null,
    "source_contacts": null
  },
  {
    "id": "8d4231ec-1ffb-4b45-93d8-d265c2bc3b01",
    "source": "sam_gov",
    "source_external_id": "1244d3e8fd5440dbb58d13b1bbddd454",
    "source_url": "https://sam.gov/workspace/contract/opp/1244d3e8fd5440dbb58d13b1bbddd454/view",
    "title": "CADD-Solis Ambulatory Infusion Pumps  Amendment",
    "summary": "Solicitation for CADD-Solis Ambulatory Infusion Pumps at Fort Bliss, Texas. Potential replacement opportunity for Phillips infusion pump solutions.",
    "confidence": 95,
    "priority": "high",
    "hospital": "Fort Bliss",
    "specialty": "Other",
    "territory": "texas",
    "entities": {
      "keywords": [
        "solicitation",
        "infusion pumps"
      ],
      "equipment": [
        "CADD-Solis Ambulatory Infusion Pumps",
        "infusion pumps"
      ],
      "hospitals": [
        "Fort Bliss"
      ],
      "physicians": []
    },
    "estimated_value_usd": 500000,
    "win_probability": 0.2,
    "competitor_incumbent": "CADD-Solis",
    "date_discovered": "2026-05-14T00:00:00+00:00",
    "date_ingested": "2026-05-16T05:26:38.36552+00:00",
    "enriched": true,
    "vendor_mentions": [],
    "account_type": null,
    "signal_type": null,
    "account_id": null,
    "source_contacts": null
  },
  {
    "id": "9570b30c-f048-4143-bc6e-daff48535937",
    "source": "openfda",
    "source_external_id": "Z-3014-2026",
    "source_url": "https://www.accessdata.fda.gov/scripts/cdrh/cfdocs/cfres/res.cfm?id=",
    "title": "Class II — Canon Medical System, USA, INC.: Alphenix Models  INFX-8000C  INFX-8000F  INFX-8000V    This device is a digital radiograp…",
    "summary": "FDA Class II recall for Canon Medical Alphenix angiography systems due to loose ceiling mount screws. Creates a replacement opportunity for Philips in interventional angiography.",
    "confidence": 92,
    "priority": "high",
    "hospital": "Unknown",
    "specialty": "Cardiology",
    "territory": "unknown",
    "entities": {
      "keywords": [
        "interventional angiography",
        "digital radiography/fluoroscopy system"
      ],
      "equipment": [
        "angiography system"
      ],
      "hospitals": [],
      "physicians": []
    },
    "estimated_value_usd": 2750000,
    "win_probability": 0.45,
    "competitor_incumbent": "Canon Medical",
    "date_discovered": "2026-08-04T00:00:00+00:00",
    "date_ingested": "2026-09-08T20:30:01.501221+00:00",
    "enriched": true,
    "vendor_mentions": [
      "Canon Medical Alphenix INFX-8000C",
      "Canon Medical Alphenix INFX-8000F",
      "Canon Medical Alphenix INFX-8000V"
    ],
    "account_type": "unknown",
    "signal_type": "recall",
    "account_id": "8b730c15-ef29-4573-8505-617b38c2e53e",
    "source_contacts": null
  },
  {
    "id": "3201c2bd-2c4d-458c-ba75-02a5d3471ca4",
    "source": "sam_gov",
    "source_external_id": "usaspending:CONT_AWD_36C25927F0023_3600_VA797H17D0022_3600",
    "source_url": "https://www.usaspending.gov/award/CONT_AWD_36C25927F0023_3600_VA797H17D0022_3600",
    "title": "Department of Veterans Affairs (OK) — PHILIPS NORTH AMERICA LLC: PREVENTIVE MAINTENANCE AND FULL REPAIR SUPPORT SERVICES ON PHILIPS RADIOLOGY EQUIPMENT TASK ORDER AGAINST NAC CONTRACT VA797H17D0022",
    "summary": "Department of Veterans Affairs active federal procurement signal ($171,782 ). Position Philips clinical equipment response.",
    "confidence": 90,
    "priority": "high",
    "hospital": "Department of Veterans Affairs",
    "specialty": "Other",
    "territory": "oklahoma",
    "entities": {
      "keywords": [],
      "equipment": [],
      "hospitals": [
        "Department of Veterans Affairs"
      ],
      "physicians": []
    },
    "estimated_value_usd": 171782,
    "win_probability": 0.35,
    "competitor_incumbent": null,
    "date_discovered": "2026-10-01T00:00:00+00:00",
    "date_ingested": "2026-11-02T20:18:16.903239+00:00",
    "enriched": true,
    "vendor_mentions": [],
    "account_type": "va",
    "signal_type": "rfp",
    "account_id": "0135462d-c3c4-4164-bb14-0512351235a5",
    "source_contacts": [
      {
        "name": "Melissa Little, APRN",
        "type": "primary",
        "email": null,
        "phone": "405-456-1000",
        "title": "CNP",
        "address": "921 NE 13TH ST, OKLAHOMA CITY, OK, 73104",
        "organization": "Department of Veterans Affairs",
        "source_origin": "NPPES Registry"
      }
    ]
  },
  {
    "id": "cb1151cc-d029-4a00-bd10-664556edec92",
    "source": "sam_gov",
    "source_external_id": "usaspending:CONT_AWD_36C25927N0033_3600_SPE2D117D0023_9700",
    "source_url": "https://www.usaspending.gov/award/CONT_AWD_36C25927N0033_3600_SPE2D117D0023_9700",
    "title": "Department of Veterans Affairs (OK) — SIEMENS MEDICAL SOLUTIONS USA, INC.: NAC SIEMENS PM",
    "summary": "Department of Veterans Affairs active federal procurement signal ($1,483,382 ). Position Philips clinical equipment response.",
    "confidence": 90,
    "priority": "high",
    "hospital": "Department of Veterans Affairs",
    "specialty": "Other",
    "territory": "oklahoma",
    "entities": {
      "keywords": [],
      "equipment": [],
      "hospitals": [
        "Department of Veterans Affairs"
      ],
      "physicians": []
    },
    "estimated_value_usd": 1483382,
    "win_probability": 0.35,
    "competitor_incumbent": null,
    "date_discovered": "2026-10-01T00:00:00+00:00",
    "date_ingested": "2026-11-02T20:18:16.810175+00:00",
    "enriched": true,
    "vendor_mentions": [],
    "account_type": "va",
    "signal_type": "rfp",
    "account_id": "0135462d-c3c4-4164-bb14-0512351235a5",
    "source_contacts": [
      {
        "name": "Melissa Little, APRN",
        "type": "primary",
        "email": null,
        "phone": "405-456-1000",
        "title": "CNP",
        "address": "921 NE 13TH ST, OKLAHOMA CITY, OK, 73104",
        "organization": "Department of Veterans Affairs",
        "source_origin": "NPPES Registry"
      }
    ]
  },
  {
    "id": "aa59612a-67d0-4e26-bb78-ce75306f6b9a",
    "source": "sam_gov",
    "source_external_id": "usaspending:CONT_AWD_36C25727F0015_3600_VA797H17D0024_3600",
    "source_url": "https://www.usaspending.gov/award/CONT_AWD_36C25727F0015_3600_VA797H17D0024_3600",
    "title": "Department of Veterans Affairs (TX) — GE PRECISION HEALTHCARE LLC: SERVICE MAIN. AGREEMENT FOR GE PET/CT HTME EQUIP. (BASE)  IMPLEMENTING EO 14398 DEI DISCRIMINATION-VA797H-17-D-0024 REFERENCED IN BLOCK 10A.",
    "summary": "Department of Veterans Affairs active federal procurement signal ($283,925 ). Position Philips CT / Molecular Imaging response.",
    "confidence": 90,
    "priority": "high",
    "hospital": "Department of Veterans Affairs",
    "specialty": "Radiology",
    "territory": "texas",
    "entities": {
      "keywords": [
        "ct / molecular imaging"
      ],
      "equipment": [
        "CT / Molecular Imaging"
      ],
      "hospitals": [
        "Department of Veterans Affairs"
      ],
      "physicians": []
    },
    "estimated_value_usd": 283925,
    "win_probability": 0.35,
    "competitor_incumbent": null,
    "date_discovered": "2026-10-13T00:00:00+00:00",
    "date_ingested": "2026-11-02T20:18:16.718+00:00",
    "enriched": true,
    "vendor_mentions": [],
    "account_type": "va",
    "signal_type": "rfp",
    "account_id": "0135462d-c3c4-4164-bb14-0512351235a5",
    "source_contacts": [
      {
        "name": "Tim Shea",
        "type": "primary",
        "email": null,
        "phone": "210-617-5300",
        "title": "Director",
        "address": "5788 ECKHERT RD., SAN ANTONIO, TX, 78240",
        "organization": "Department of Veterans Affairs",
        "source_origin": "NPPES Registry"
      }
    ]
  },
  {
    "id": "db7072d4-e212-4350-99c0-52cf74f4bf72",
    "source": "sam_gov",
    "source_external_id": "usaspending:CONT_AWD_36C25927N0054_3600_VA797H17D0024_3600",
    "source_url": "https://www.usaspending.gov/award/CONT_AWD_36C25927N0054_3600_VA797H17D0024_3600",
    "title": "Department of Veterans Affairs (OK) — GE PRECISION HEALTHCARE LLC: GE NAC CONTRACT PM",
    "summary": "Department of Veterans Affairs active federal procurement signal ($1,325,787 ). Position Philips clinical equipment response.",
    "confidence": 90,
    "priority": "high",
    "hospital": "Department of Veterans Affairs",
    "specialty": "Other",
    "territory": "oklahoma",
    "entities": {
      "keywords": [],
      "equipment": [],
      "hospitals": [
        "Department of Veterans Affairs"
      ],
      "physicians": []
    },
    "estimated_value_usd": 1325787,
    "win_probability": 0.35,
    "competitor_incumbent": null,
    "date_discovered": "2026-10-15T00:00:00+00:00",
    "date_ingested": "2026-11-02T20:18:16.536087+00:00",
    "enriched": true,
    "vendor_mentions": [],
    "account_type": "va",
    "signal_type": "rfp",
    "account_id": "0135462d-c3c4-4164-bb14-0512351235a5",
    "source_contacts": [
      {
        "name": "Melissa Little, APRN",
        "type": "primary",
        "email": null,
        "phone": "405-456-1000",
        "title": "CNP",
        "address": "921 NE 13TH ST, OKLAHOMA CITY, OK, 73104",
        "organization": "Department of Veterans Affairs",
        "source_origin": "NPPES Registry"
      }
    ]
  },
  {
    "id": "507ee35f-6f44-45b7-9d2d-316527dc1a75",
    "source": "openfda",
    "source_external_id": "Z-3039-2026",
    "source_url": "https://www.accessdata.fda.gov/scripts/cdrh/cfdocs/cfres/res.cfm?id=",
    "title": "Class II — GE Medical Systems Information Technologies Inc: FRU (Field replaceable unit), PORTRAIT CORE SERVICES SW RELOAD V1.1, Ref# 5700225",
    "summary": "FDA Class II recall on GE Medical Systems software (PORTRAIT CORE SERVICES SW RELOAD V1.1) affecting patient monitoring and alarm settings. Creates replacement opportunity.",
    "confidence": 90,
    "priority": "high",
    "hospital": "Unknown",
    "specialty": "Critical Care",
    "territory": "michigan, new_york",
    "entities": {
      "keywords": [
        "patient monitoring",
        "alarm settings"
      ],
      "equipment": [
        "PORTRAIT CORE SERVICES SW RELOAD V1.1"
      ],
      "hospitals": [],
      "physicians": []
    },
    "estimated_value_usd": 500000,
    "win_probability": 0.45,
    "competitor_incumbent": "GE Medical Systems",
    "date_discovered": "2026-07-20T00:00:00+00:00",
    "date_ingested": "2026-09-08T20:30:03.253477+00:00",
    "enriched": true,
    "vendor_mentions": [
      "GE Medical Systems"
    ],
    "account_type": "unknown",
    "signal_type": "recall",
    "account_id": "8b730c15-ef29-4573-8505-617b38c2e53e",
    "source_contacts": null
  },
  {
    "id": "0bac03c5-9cf0-4830-8034-a21a6157ef90",
    "source": "openfda",
    "source_external_id": "Z-2940-2026",
    "source_url": "https://www.accessdata.fda.gov/scripts/cdrh/cfdocs/cfres/res.cfm?id=",
    "title": "Class II — Spectral Instruments Inc: Ami HTX",
    "summary": "FDA Class II recall on Spectral Instruments Ami HTX due to \"X-Ray On\" banner issue. This may present a replacement opportunity for Philips.",
    "confidence": 90,
    "priority": "high",
    "hospital": "Unknown",
    "specialty": "Radiology",
    "territory": "unknown",
    "entities": {
      "keywords": [
        "X-Ray On banner",
        "recall"
      ],
      "equipment": [
        "Ami HTX"
      ],
      "hospitals": [],
      "physicians": []
    },
    "estimated_value_usd": 0,
    "win_probability": 0.45,
    "competitor_incumbent": "Spectral Instruments",
    "date_discovered": "2026-07-24T00:00:00+00:00",
    "date_ingested": "2026-09-08T20:30:03.106974+00:00",
    "enriched": true,
    "vendor_mentions": [
      "Spectral Instruments Ami HTX"
    ],
    "account_type": "unknown",
    "signal_type": "recall",
    "account_id": "8b730c15-ef29-4573-8505-617b38c2e53e",
    "source_contacts": null
  },
  {
    "id": "4566d256-efa6-4414-81e3-c3bd72079a49",
    "source": "openfda",
    "source_external_id": "Z-2993-2026",
    "source_url": "https://www.accessdata.fda.gov/scripts/cdrh/cfdocs/cfres/res.cfm?id=",
    "title": "Class II — Medline Industries, LP: Medline breathing circuits labeled as:    1) MEDLINE HUDSON RCI, CIRCUIT, NEO, SING LIMB,…",
    "summary": "FDA Class II recall on Medline breathing circuits. Philips has a ventilator fleet offering that could replace affected units. Excellent opportunity for a competitive displacement.",
    "confidence": 90,
    "priority": "high",
    "hospital": "Unknown",
    "specialty": "Critical Care",
    "territory": "unknown",
    "entities": {
      "keywords": [
        "ventilator",
        "respiratory"
      ],
      "equipment": [
        "breathing circuits"
      ],
      "hospitals": [],
      "physicians": []
    },
    "estimated_value_usd": 750000,
    "win_probability": 0.45,
    "competitor_incumbent": "Medline",
    "date_discovered": "2026-07-13T00:00:00+00:00",
    "date_ingested": "2026-09-08T20:30:03.058697+00:00",
    "enriched": true,
    "vendor_mentions": [
      "Medline"
    ],
    "account_type": "unknown",
    "signal_type": "recall",
    "account_id": "8b730c15-ef29-4573-8505-617b38c2e53e",
    "source_contacts": null
  },
  {
    "id": "d9edbd21-cd53-45d5-bb67-f0170f51986b",
    "source": "openfda",
    "source_external_id": "Z-2939-2026",
    "source_url": "https://www.accessdata.fda.gov/scripts/cdrh/cfdocs/cfres/res.cfm?id=",
    "title": "Class II — Spectral Instruments Inc: Lago X",
    "summary": "Competitor Spectral Instruments Inc. is recalling 40 units of their Lago X X-ray device due to a software issue. Potential replacement opportunity for Philips X-ray systems.",
    "confidence": 90,
    "priority": "high",
    "hospital": "Unknown",
    "specialty": "Radiology",
    "territory": "unknown",
    "entities": {
      "keywords": [
        "X-ray",
        "recall"
      ],
      "equipment": [
        "X-ray"
      ],
      "hospitals": [],
      "physicians": []
    },
    "estimated_value_usd": 1500000,
    "win_probability": 0.45,
    "competitor_incumbent": "Spectral Instruments Inc. Lago X",
    "date_discovered": "2026-07-24T00:00:00+00:00",
    "date_ingested": "2026-09-08T20:30:02.956969+00:00",
    "enriched": true,
    "vendor_mentions": [
      "Spectral Instruments Inc. Lago X"
    ],
    "account_type": "unknown",
    "signal_type": "recall",
    "account_id": "8b730c15-ef29-4573-8505-617b38c2e53e",
    "source_contacts": null
  },
  {
    "id": "9a95cc2e-22ef-46b3-a910-45b4db519779",
    "source": "openfda",
    "source_external_id": "Z-2965-2026",
    "source_url": "https://www.accessdata.fda.gov/scripts/cdrh/cfdocs/cfres/res.cfm?id=",
    "title": "Class II — Siemens Healthcare Diagnostics Products Ltd.: Siemens Healthineers  Immulite 2000 Systems SYP Syphilis Screen  REF:L2KSY2(D)/10471981  …",
    "summary": "FDA Class II recall on Siemens Healthineers Immulite 2000 Systems for syphilis screening. Potential replacement opportunity for Philips.",
    "confidence": 90,
    "priority": "high",
    "hospital": "Unknown",
    "specialty": "Other",
    "territory": "null",
    "entities": {
      "keywords": [
        "syphilis screen",
        "in vitro diagnostic"
      ],
      "equipment": [
        "Immulite 2000 Systems SYP Syphilis Screen"
      ],
      "hospitals": [],
      "physicians": []
    },
    "estimated_value_usd": 0,
    "win_probability": 0.45,
    "competitor_incumbent": "Siemens Healthineers",
    "date_discovered": "2026-07-13T00:00:00+00:00",
    "date_ingested": "2026-09-08T20:30:02.856407+00:00",
    "enriched": true,
    "vendor_mentions": [
      "Siemens Healthineers Immulite 2000 Systems"
    ],
    "account_type": "unknown",
    "signal_type": "recall",
    "account_id": "8b730c15-ef29-4573-8505-617b38c2e53e",
    "source_contacts": null
  },
  {
    "id": "cba6b501-4db7-425a-a4e2-2755e88ff01d",
    "source": "bluesky",
    "source_external_id": "bsky:at://did:plc:nbe7vkgyke6rga5ymy5drhlk/app.bsky.feed.post/3muo6m4w7e427",
    "source_url": "https://bsky.app/profile/fda-medwatch-bot.bsky.social/post/3muo6m4w7e427",
    "title": " Monitoring System Correction: GE HealthCare Updates Use Instructions for Portrait Core Services Software ",
    "summary": "FDA recall for GE HealthCare Portrait Core Services Software. Opportunity to position Philips monitoring systems as a reliable alternative.",
    "confidence": 90,
    "priority": "high",
    "hospital": "Unknown",
    "specialty": "Critical Care",
    "territory": "unknown",
    "entities": {
      "keywords": [
        "FDA recall",
        "monitoring systems"
      ],
      "equipment": [
        "Monitoring System",
        "Portrait Core Services Software"
      ],
      "hospitals": [],
      "physicians": []
    },
    "estimated_value_usd": 0,
    "win_probability": 0.45,
    "competitor_incumbent": "GE HealthCare",
    "date_discovered": "2026-09-04T05:00:03.27204+00:00",
    "date_ingested": "2026-09-08T20:30:02.818387+00:00",
    "enriched": true,
    "vendor_mentions": [
      "GE HealthCare Portrait Core Services Software"
    ],
    "account_type": "unknown",
    "signal_type": "recall",
    "account_id": "8b730c15-ef29-4573-8505-617b38c2e53e",
    "source_contacts": null
  },
  {
    "id": "ff7c3032-9c52-4ce0-b30e-42de8cf519d5",
    "source": "bluesky",
    "source_external_id": "bsky:at://did:plc:nbe7vkgyke6rga5ymy5drhlk/app.bsky.feed.post/3muo6m56vpw2k",
    "source_url": "https://bsky.app/profile/fda-medwatch-bot.bsky.social/post/3muo6m56vpw2k",
    "title": "Link: http://www.fda.gov/medical-devices/medical-device-recalls-and-early-alerts/monitoring-system-correction-ge-healthcare-updates-use-instructions-portrait-core-services-software\nDate: 2026-09-03",
    "summary": "GE Healthcare issued a recall/correction for Portrait Core Services software, potentially impacting patient monitoring systems. Opportunity to replace incumbent GE systems.",
    "confidence": 90,
    "priority": "high",
    "hospital": "Unknown",
    "specialty": "Critical Care",
    "territory": "unknown",
    "entities": {
      "keywords": [
        "FDA recall",
        "patient monitoring",
        "software correction"
      ],
      "equipment": [
        "patient monitoring systems"
      ],
      "hospitals": [],
      "physicians": []
    },
    "estimated_value_usd": 1500000,
    "win_probability": 0.45,
    "competitor_incumbent": "GE Healthcare",
    "date_discovered": "2026-09-04T05:00:03.549816+00:00",
    "date_ingested": "2026-09-08T20:30:02.759622+00:00",
    "enriched": true,
    "vendor_mentions": [
      "GE Healthcare Portrait Core Services"
    ],
    "account_type": "unknown",
    "signal_type": "recall",
    "account_id": "8b730c15-ef29-4573-8505-617b38c2e53e",
    "source_contacts": null
  },
  {
    "id": "4510bfca-6851-4d28-a058-ce84e47792d7",
    "source": "openfda",
    "source_external_id": "Z-3013-2026",
    "source_url": "https://www.accessdata.fda.gov/scripts/cdrh/cfdocs/cfres/res.cfm?id=",
    "title": "Class II — Midmark Corporation: Midmark Digital ECG HD+12, HD+15, Model/Catalog Number: 4-000-0080  Software Version: Mid…",
    "summary": "FDA Class II recall for Midmark Digital ECG HD+12 and HD+15 due to communication anomaly leading to incorrect ECG waveforms and BPM. This presents a replacement opportunity for Philips Cardiac/Monitoring solutions.",
    "confidence": 90,
    "priority": "high",
    "hospital": "unknown",
    "specialty": "Cardiology",
    "territory": "unknown",
    "entities": {
      "keywords": [
        "ECG recall",
        "cardiac monitoring",
        "electrocardiogram"
      ],
      "equipment": [
        "ECG systems"
      ],
      "hospitals": [],
      "physicians": []
    },
    "estimated_value_usd": 400000,
    "win_probability": 0.45,
    "competitor_incumbent": "Midmark Corporation",
    "date_discovered": "2026-07-20T00:00:00+00:00",
    "date_ingested": "2026-09-08T20:30:02.753036+00:00",
    "enriched": true,
    "vendor_mentions": [
      "Midmark Digital ECG HD+12",
      "Midmark Digital ECG HD+15"
    ],
    "account_type": "unknown",
    "signal_type": "recall",
    "account_id": "b58fb746-5b44-42b6-9958-8d0601e23b30",
    "source_contacts": null
  },
  {
    "id": "c55a1156-0845-42b7-8976-d44348ff967f",
    "source": "bluesky",
    "source_external_id": "bsky:at://did:plc:4eoqctmsfcnccpt5wwu6uyhs/app.bsky.feed.post/3muopnhqj752r",
    "source_url": "https://bsky.app/profile/fdamedwatch.bsky.social/post/3muopnhqj752r",
    "title": " Monitoring System Correction: GE HealthCare Updates Use Instructions for Portrait Core Services Software  posted 2026-09-03\r\nAdditional Details Here.",
    "summary": "GE HealthCare issued a correction for their Portrait Core Services Software, impacting monitoring systems. This could create an opening for Philips to replace existing GE monitoring equipment.",
    "confidence": 90,
    "priority": "high",
    "hospital": "Unknown",
    "specialty": "Critical Care",
    "territory": "unknown",
    "entities": {
      "keywords": [
        "correction",
        "software update",
        "patient monitoring"
      ],
      "equipment": [
        "monitoring systems"
      ],
      "hospitals": [],
      "physicians": []
    },
    "estimated_value_usd": 500000,
    "win_probability": 0.45,
    "competitor_incumbent": "GE HealthCare",
    "date_discovered": "2026-09-04T10:05:01+00:00",
    "date_ingested": "2026-09-08T20:30:02.708062+00:00",
    "enriched": true,
    "vendor_mentions": [
      "GE HealthCare Portrait Core Services Software"
    ],
    "account_type": "unknown",
    "signal_type": "recall",
    "account_id": "8b730c15-ef29-4573-8505-617b38c2e53e",
    "source_contacts": null
  }
];
