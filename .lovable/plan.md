# Yield Architect → Top-1% Roadmap

You already have the rare core (live SAM.gov + FDA + news + AI enrichment + pipeline forecast + auto-drafted outreach). To dominate, you need three things competitors don't combine: **deeper buying-intent signals**, **a closed loop into your daily workflow (CRM, email, calendar)**, and **a commission-aware decision layer** so the system tells you exactly where to spend the next hour.

Below is everything I'd add, grouped by impact. Pick a tier and I'll build it.

---

## TIER 1 — Ship before publishing (highest $/effort)

These five turn the app from "cool dashboard" into a tool you'd refuse to give back.

1. **Scheduled ingestion (pg_cron → `/api/public/ingest`)**
   Runs every 30 min so leads accumulate while you sleep. Without this you only see signals when you open the tab.

2. **CMS Open Payments + NPPES (free, federal)**
   Maps every physician at every hospital, their specialty, and which device companies are already paying them. Instantly tells you *who the Philips champion is*, *who the GE/Siemens loyalist is*, and *who just switched*. This is the single biggest commission lever — it makes every outreach surgical.

3. **ClinicalTrials.gov + 510(k) cross-reference**
   When a hospital starts a cardiac MRI trial or a competitor gets a new clearance at that site, you know a 6–18 month buying window just opened. We tag leads with "active trial" / "competitor clearance" → priority bump.

4. **HubSpot push (connector already supported)**
   One-click "Push to SFDC" really pushes to HubSpot/Salesforce as a deal with contact, summary, AI brief, and source links. No more re-typing. Pipeline forecast pulls *back* the won/lost outcomes to train confidence scoring.

5. **Email send via Gmail + auto follow-up sequence**
   The drafted email actually sends from your Gmail (connector), logs to the lead, and auto-schedules a 3-day / 7-day follow-up if no reply. Turns the AI draft from "nice" into revenue.

---

## TIER 2 — Compounding intelligence (data moats)

6. **Hospital financials & capex signals**
   - **CMS Hospital Cost Reports** (free) — operating margin, capital budget headroom, age of equipment. A hospital with $200M cash and 12-year-old MRIs is your dream lead.
   - **IRS Form 990** (free, ProPublica) for non-profit systems — exec comp, capital commitments.
   - **USASpending.gov** — every dollar the VA, DoD, and federal hospitals have actually awarded to Philips and competitors. Filter for renewals coming due.

7. **Healthcare job postings (Greenhouse / Indeed / hospital career sites)**
   Hospitals hiring 3 interventional radiologists = imaging expansion. Hiring a "Director of Cardiovascular Service Line" = department reorg + buying committee forming. We scrape + tag → priority bump.

8. **State + local procurement portals**
   CalProcure, BidNet, HigherGov for California-specific RFPs and pre-solicitations (warmer than SAM.gov national feed). Catches deals 30–90 days before they hit SAM.

9. **Conference & event intelligence (RSNA, HIMSS, ACC)**
   Pull attendee/exhibitor lists and recent talks. "Dr. Chen at Cedars-Sinai just presented on photon-counting CT" = call her Monday.

10. **Competitor incumbent enrichment**
    For every lead, AI cross-references CMS data + news + LinkedIn to identify the *current* vendor at that account, the contract expiry estimate, and the switching-cost story. Outreach drafts use this automatically.

11. **News sentiment + executive-change watch**
    GDELT is broad; add **NewsAPI** + **LinkedIn news mentions** filtered for "CFO/CTO/VP Radiology hired" — new exec = 90-day window to influence vendor selection.

---

## TIER 3 — The commission-aware decision layer

12. **Commission calculator + "What should I do next?" agent**
    You enter your comp plan (% of margin, accelerators, quota). The dashboard ranks every action by *expected dollars in your pocket this quarter*, not just deal size. The morning briefing becomes: "Call Dr. Patel first — 73% close × $480k × 8% accel = $34k in your pocket."

13. **Multi-signal intent score (replaces single confidence number)**
    Compounding score: SAM RFP + CMS payment shift + new hire + trial registered + news mention = 95. One signal alone = 40. This is what tools like ZoomInfo/6sense charge $60k/yr for.

14. **Win/loss feedback loop**
    Every deal you close or lose feeds back. Lovable AI re-weights which signal types actually predicted *your* wins. After 30 deals your scoring beats any generic tool.

15. **Territory map view**
    Mapbox/Leaflet visualization of leads by hospital with heat overlay (weighted pipeline by county). Plan your driving day.

---

## TIER 4 — Workflow & moat polish

16. **Voice briefing (ElevenLabs)** — 90-second audio brief delivered to your phone at 7am.
17. **Slack/SMS alerts (Twilio)** — high-priority leads ping you instantly.
18. **Mobile PWA** — install on iPhone, works offline at the hospital.
19. **Calendar integration (Google Calendar)** — book the discovery call from inside the lead modal.
20. **DocuSign / quote generator** — pre-fill quote PDFs from lead context.
21. **Single-shared-password protection** — before publishing, gate the open URL so competitors can't browse it.

---

## Cost / setup reality

- **Free, no key**: CMS Open Payments, NPPES, ClinicalTrials.gov, USASpending, Hospital Cost Reports, 990, state portals.
- **Free, key required**: NewsAPI (already), Greenhouse job board.
- **Lovable connectors (one-click)**: HubSpot, Gmail, Slack, Twilio, Google Calendar, ElevenLabs, Notion.
- **Paid (skip unless you confirm budget)**: Definitive Healthcare, Apollo, Clearbit, ZoomInfo. Your free stack already replaces ~70% of what these sell.

---

## My recommendation

Before publishing, build **Tier 1 (items 1–5)** plus **#21 password gate**. That's ~one focused build session and converts the app from demo to daily-driver. Then publish, use it for a week, and pick Tier 2 items based on which deals you actually chase.

**Which do you want me to start with?** Reply with the numbers (e.g. "1, 2, 4, 5, 21") and I'll implement.
