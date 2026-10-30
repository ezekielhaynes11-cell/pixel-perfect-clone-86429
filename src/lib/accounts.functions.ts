import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { OWNER_ID } from "./owner.server";
import { runAccountResearch } from "./research-agent.server";

export interface AccountBriefStructured {
  exec_summary: string;
  vendor_footprint: string[];
  capital_plans: string[];
  key_people: Array<{ name: string; role: string }>;
  recent_signals: string[];
  recommended_next_steps: string[];
  sources: Array<{ url: string; note: string }>;
}

export interface AccountBriefRow {
  id: string;
  account_id: string;
  markdown: string;
  structured: AccountBriefStructured;
  sources: Array<{ url: string; note: string }>;
  model: string;
  created_at: string;
}

export const listAccountBriefs = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({ account_id: z.string().uuid() }).parse(input))
  .handler(async ({ data }): Promise<AccountBriefRow[]> => {
    const { data: rows, error } = await supabaseAdmin
      .from("account_briefs")
      .select("id, account_id, markdown, structured, sources, model, created_at")
      .eq("account_id", data.account_id)
      .order("created_at", { ascending: false })
      .limit(5);
    if (error) throw new Error(error.message);
    return (rows ?? []) as unknown as AccountBriefRow[];
  });

export const researchAccount = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({ account_id: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    const result = await runAccountResearch(data.account_id);
    const { data: saved, error } = await supabaseAdmin
      .from("account_briefs")
      .insert({
        account_id: data.account_id,
        markdown: result.markdown,
        structured: result.brief as never,
        sources: result.sources as never,
        model: "google/gemini-2.5-flash",
        created_by: OWNER_ID,
      })
      .select("id, account_id, markdown, structured, sources, model, created_at")
      .single();
    if (error) throw new Error(error.message);
    return { brief: saved as unknown as AccountBriefRow, steps: result.steps };
  });

export interface AccountDetail {
  account: {
    id: string;
    name: string;
    state: string | null;
    system: string | null;
    account_type: string | null;
    is_va: boolean;
    notes: string | null;
  };
  leads: Array<{
    id: string;
    title: string;
    summary: string | null;
    source: string;
    source_url: string | null;
    confidence: number;
    date_discovered: string;
    signal_type: string | null;
    vendor_mentions: string[];
    estimated_value_usd: number | null;
  }>;
  physicians: Array<{
    npi: string;
    full_name: string;
    credentials: string | null;
    primary_specialty: string | null;
    role_hint: string | null;
    role: string;
    practice_city: string | null;
    practice_state: string | null;
    practice_phone: string | null;
    email: string | null;
    title: string | null;
    linkedin_url: string | null;
    apollo_enriched_at: string | null;
  }>;

  scrapedPages: Array<{
    id: string;
    url: string;
    title: string | null;
    fetched_at: string;
  }>;
  vendorFootprint: Array<{ vendor: string; mentions: number }>;
}

export const getAccountDetail = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data }): Promise<AccountDetail> => {
    const { data: account, error: accErr } = await supabaseAdmin
      .from("accounts")
      .select("id, name, state, system, account_type, is_va, notes")
      .eq("id", data.id)
      .single();
    if (accErr || !account) throw new Error(accErr?.message ?? "Account not found");

    const { data: leads } = await supabaseAdmin
      .from("leads")
      .select(
        "id, title, summary, source, source_url, confidence, date_discovered, signal_type, vendor_mentions, estimated_value_usd",
      )
      .eq("account_id", data.id)
      .order("date_discovered", { ascending: false })
      .limit(200);

    const leadIds = (leads ?? []).map((l) => l.id);

    type PhysJoin = {
      role: string;
      role_hint: string | null;
      physician_contacts: {
        npi: string;
        full_name: string;
        credentials: string | null;
        primary_specialty: string | null;
        practice_city: string | null;
        practice_state: string | null;
        practice_phone: string | null;
        email: string | null;
        title: string | null;
        linkedin_url: string | null;
        apollo_enriched_at: string | null;
      };
    };
    let physicians: AccountDetail["physicians"] = [];
    if (leadIds.length) {
      const { data: physRows } = await supabaseAdmin
        .from("lead_physicians")
        .select(
          "role, role_hint, physician_contacts!inner(npi, full_name, credentials, primary_specialty, practice_city, practice_state, practice_phone, email, title, linkedin_url, apollo_enriched_at)",
        )
        .in("lead_id", leadIds)
        .limit(200);
      const seen = new Set<string>();
      physicians = ((physRows ?? []) as unknown as PhysJoin[])
        .filter((r) => {
          if (seen.has(r.physician_contacts.npi)) return false;
          seen.add(r.physician_contacts.npi);
          return true;
        })
        .map((r) => ({
          npi: r.physician_contacts.npi,
          full_name: r.physician_contacts.full_name,
          credentials: r.physician_contacts.credentials,
          primary_specialty: r.physician_contacts.primary_specialty,
          role_hint: r.role_hint,
          role: r.role,
          practice_city: r.physician_contacts.practice_city,
          practice_state: r.physician_contacts.practice_state,
          practice_phone: r.physician_contacts.practice_phone,
          email: r.physician_contacts.email,
          title: r.physician_contacts.title,
          linkedin_url: r.physician_contacts.linkedin_url,
          apollo_enriched_at: r.physician_contacts.apollo_enriched_at,
        }));
    }

    const { data: scrapedPages } = await supabaseAdmin
      .from("scraped_pages")
      .select("id, url, title, fetched_at")
      .eq("account_id", data.id)
      .order("fetched_at", { ascending: false })
      .limit(50);

    const counts = new Map<string, number>();
    for (const l of leads ?? []) {
      for (const v of (l.vendor_mentions ?? []) as string[]) {
        counts.set(v, (counts.get(v) ?? 0) + 1);
      }
    }
    const vendorFootprint = Array.from(counts.entries())
      .map(([vendor, mentions]) => ({ vendor, mentions }))
      .sort((a, b) => b.mentions - a.mentions);

    return {
      account: {
        ...account,
        is_va: !!account.is_va,
      },
      leads: (leads ?? []).map((l) => ({
        ...l,
        vendor_mentions: (l.vendor_mentions ?? []) as string[],
      })),
      physicians,
      scrapedPages: scrapedPages ?? [],
      vendorFootprint,
    };
  });
