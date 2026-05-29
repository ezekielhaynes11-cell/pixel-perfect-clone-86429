import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { OWNER_ID } from "./owner.server";
import { draftOutreachEmail } from "./outreach.server";
import {
  apolloEnrichPhysician,
  apolloEnrichAccount,
  apolloProspectContacts,
} from "./apollo/service.server";

export const COPILOT_TOOLS = [
  {
    type: "function" as const,
    function: {
      name: "query_leads",
      description:
        "Search leads (enriched and raw). All filters optional. Returns up to 100 rows sorted by confidence desc. Use text_search to fuzzy-match across title/summary/hospital.",
      parameters: {
        type: "object",
        properties: {
          state: { type: "string", description: "Two-letter US state code, e.g. TX. Matches territory case-insensitively, including multi-state rows." },
          signal_type: { type: "string", enum: ["recall", "rfp", "funding", "expansion", "sentiment", "m_and_a", "incumbency", "other"] },
          source: { type: "string" },
          account_type: { type: "string", enum: ["va", "non_va", "unknown"] },
          vendor: { type: "string", description: "Substring of a vendor / model mention" },
          text_search: { type: "string", description: "Free-text substring matched across title, summary, and hospital." },
          min_confidence: { type: "number", minimum: 0, maximum: 100 },
          days_back: { type: "number", description: "Limit to leads discovered within this many days" },
          enriched_only: { type: "boolean", description: "If true, only return AI-enriched leads. Defaults to false." },
          limit: { type: "number", minimum: 1, maximum: 100 },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "query_accounts",
      description: "Search accounts by name/state/VA status. Returns up to 25 rows.",
      parameters: {
        type: "object",
        properties: {
          name_contains: { type: "string" },
          state: { type: "string" },
          is_va: { type: "boolean" },
          limit: { type: "number", minimum: 1, maximum: 25 },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "query_physicians",
      description: "Search physician contacts. Returns up to 25 rows.",
      parameters: {
        type: "object",
        properties: {
          specialty_contains: { type: "string" },
          state: { type: "string" },
          role_hint_contains: { type: "string" },
          limit: { type: "number", minimum: 1, maximum: 25 },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_account_brief",
      description: "Fetch the latest AI research brief for an account, if one exists.",
      parameters: {
        type: "object",
        properties: { account_id: { type: "string" } },
        required: ["account_id"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "draft_outreach",
      description: "Generate an outreach email for a specific lead. Persists the draft.",
      parameters: {
        type: "object",
        properties: {
          lead_id: { type: "string" },
          tone: { type: "string", enum: ["discovery", "follow_up", "executive_intro", "switch_pitch"] },
        },
        required: ["lead_id"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "apollo_enrich_physician",
      description: "Use Apollo.io to enrich an existing physician contact (email, title, LinkedIn, phone) by NPI.",
      parameters: {
        type: "object",
        properties: { npi: { type: "string" } },
        required: ["npi"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "apollo_enrich_account",
      description: "Use Apollo.io to enrich an account with domain, employee count, and industry.",
      parameters: {
        type: "object",
        properties: { account_id: { type: "string" } },
        required: ["account_id"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "apollo_prospect",
      description:
        "Find NEW contacts in Apollo.io and add them to the physician_contacts table. Use for net-new prospecting. Confirm with the user before requesting more than 25 contacts.",
      parameters: {
        type: "object",
        properties: {
          account_id: { type: "string", description: "Optional. If set, restricts search to this account's organisation." },
          state: { type: "string", description: "Two-letter US state code. Inherited from account if omitted." },
          titles: { type: "array", items: { type: "string" }, description: "Job titles to target, e.g. ['POCUS Director','Chief of Radiology']" },
          keywords: { type: "string", description: "Free-text keywords (e.g. 'ultrasound POCUS')" },
          limit: { type: "number", minimum: 1, maximum: 50 },
        },
        additionalProperties: false,
      },
    },
  },
];

interface ToolArgs {
  query_leads: {
    state?: string;
    signal_type?: string;
    source?: string;
    account_type?: string;
    vendor?: string;
    text_search?: string;
    min_confidence?: number;
    days_back?: number;
    enriched_only?: boolean;
    limit?: number;
  };
  query_accounts: { name_contains?: string; state?: string; is_va?: boolean; limit?: number };
  query_physicians: { specialty_contains?: string; state?: string; role_hint_contains?: string; limit?: number };
  get_account_brief: { account_id: string };
  draft_outreach: { lead_id: string; tone?: "discovery" | "follow_up" | "executive_intro" | "switch_pitch" };
  apollo_enrich_physician: { npi: string };
  apollo_enrich_account: { account_id: string };
  apollo_prospect: { account_id?: string; state?: string; titles?: string[]; keywords?: string; limit?: number };
}

export async function runCopilotTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  switch (name) {
    case "query_leads": {
      const a = args as ToolArgs["query_leads"];
      let q = supabaseAdmin
        .from("leads")
        .select("id, title, summary, hospital, specialty, territory, source, signal_type, account_type, vendor_mentions, confidence, estimated_value_usd, win_probability, date_discovered, source_url, account_id")
        .eq("enriched", true)
        .order("confidence", { ascending: false })
        .limit(Math.min(a.limit ?? 25, 50));
      if (a.signal_type) q = q.eq("signal_type", a.signal_type);
      if (a.source) q = q.eq("source", a.source);
      if (a.account_type) q = q.eq("account_type", a.account_type);
      if (a.min_confidence != null) q = q.gte("confidence", a.min_confidence);
      if (a.days_back != null) {
        const since = new Date(Date.now() - a.days_back * 86400000).toISOString();
        q = q.gte("date_discovered", since);
      }
      if (a.state) {
        const code = a.state.toUpperCase();
        const stateMap: Record<string, string> = { TX: "texas", OK: "oklahoma", AR: "arkansas", LA: "louisiana" };
        q = q.eq("territory", stateMap[code] ?? a.state.toLowerCase());
      }
      const { data, error } = await q;
      if (error) return { error: error.message };
      let rows = data ?? [];
      if (a.vendor) {
        const needle = a.vendor.toLowerCase();
        rows = rows.filter((r) => {
          const hay = ((r.vendor_mentions ?? []) as string[]).join(" ").toLowerCase();
          return hay.includes(needle);
        });
      }
      return { count: rows.length, leads: rows };
    }
    case "query_accounts": {
      const a = args as ToolArgs["query_accounts"];
      let q = supabaseAdmin
        .from("accounts")
        .select("id, name, state, system, account_type, is_va")
        .limit(Math.min(a.limit ?? 15, 25));
      if (a.state) q = q.eq("state", a.state.toUpperCase());
      if (a.is_va != null) q = q.eq("is_va", a.is_va);
      if (a.name_contains) q = q.ilike("name", `%${a.name_contains}%`);
      const { data, error } = await q;
      if (error) return { error: error.message };
      return { count: data?.length ?? 0, accounts: data ?? [] };
    }
    case "query_physicians": {
      const a = args as ToolArgs["query_physicians"];
      let q = supabaseAdmin
        .from("physician_contacts")
        .select("npi, full_name, credentials, primary_specialty, practice_city, practice_state, practice_phone")
        .limit(Math.min(a.limit ?? 15, 25));
      if (a.state) q = q.eq("practice_state", a.state.toUpperCase());
      if (a.specialty_contains) q = q.ilike("primary_specialty", `%${a.specialty_contains}%`);
      const { data, error } = await q;
      if (error) return { error: error.message };
      let rows = data ?? [];
      if (a.role_hint_contains) {
        const { data: lp } = await supabaseAdmin
          .from("lead_physicians")
          .select("npi, role_hint")
          .ilike("role_hint", `%${a.role_hint_contains}%`)
          .limit(100);
        const allowed = new Set((lp ?? []).map((r) => r.npi));
        rows = rows.filter((r) => allowed.has(r.npi));
      }
      return { count: rows.length, physicians: rows };
    }
    case "get_account_brief": {
      const a = args as ToolArgs["get_account_brief"];
      const { data, error } = await supabaseAdmin
        .from("account_briefs")
        .select("markdown, structured, sources, created_at")
        .eq("account_id", a.account_id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) return { error: error.message };
      if (!data) return { exists: false };
      return { exists: true, brief: data };
    }
    case "draft_outreach": {
      const a = args as ToolArgs["draft_outreach"];
      const { data: lead, error } = await supabaseAdmin.from("leads").select("*").eq("id", a.lead_id).single();
      if (error || !lead) return { error: "Lead not found" };
      const { data: profile } = await supabaseAdmin
        .from("profiles")
        .select("display_name")
        .eq("user_id", OWNER_ID)
        .maybeSingle();
      const draft = await draftOutreachEmail({
        lead: {
          title: lead.title,
          summary: lead.summary ?? "",
          hospital: lead.hospital,
          specialty: lead.specialty,
          source: lead.source,
          signal_type: (lead as { signal_type?: string | null }).signal_type ?? null,
          competitor_incumbent: lead.competitor_incumbent,
          vendor_mentions: ((lead as { vendor_mentions?: string[] | null }).vendor_mentions) ?? [],
          entities: (lead.entities as { physicians?: string[]; equipment?: string[]; keywords?: string[] }) ?? {},
        },
        repName: profile?.display_name ?? "Your Philips rep",
        tone: a.tone,
      });
      const { data: saved } = await supabaseAdmin
        .from("outreach_drafts")
        .insert({ lead_id: a.lead_id, user_id: OWNER_ID, subject: draft.subject, body: draft.body })
        .select()
        .single();
      return { draft_id: saved?.id, subject: draft.subject, body: draft.body };
    }
    default:
      return { error: `Unknown tool: ${name}` };
  }
}
