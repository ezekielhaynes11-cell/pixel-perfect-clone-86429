import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { runIngestion } from "./ingest/run.server";
import { draftOutreachEmail } from "./outreach.server";

export const listLeads = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data, error } = await supabase
      .from("leads")
      .select("*")
      .eq("enriched", true)
      .order("confidence", { ascending: false })
      .order("date_discovered", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const triggerIngestion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    return await runIngestion();
  });

export const listLeadActions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data, error } = await supabase
      .from("lead_actions")
      .select("lead_id, action, note, created_at");
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const setLeadAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        lead_id: z.string().uuid(),
        action: z.enum(["saved", "dismissed", "pushed_sfdc"]),
        note: z.string().max(2000).optional(),
        remove: z.boolean().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (data.remove) {
      await supabase
        .from("lead_actions")
        .delete()
        .eq("lead_id", data.lead_id)
        .eq("user_id", userId)
        .eq("action", data.action);
      return { ok: true };
    }
    const { error } = await supabase.from("lead_actions").upsert(
      {
        lead_id: data.lead_id,
        user_id: userId,
        action: data.action,
        note: data.note ?? null,
      },
      { onConflict: "lead_id,user_id,action" },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getOutreachDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ lead_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Reuse latest draft if <24h old
    const { data: existing } = await supabase
      .from("outreach_drafts")
      .select("*")
      .eq("lead_id", data.lead_id)
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (existing && Date.now() - new Date(existing.created_at).getTime() < 86400_000) {
      return existing;
    }

    const { data: lead, error } = await supabase
      .from("leads")
      .select("*")
      .eq("id", data.lead_id)
      .single();
    if (error || !lead) throw new Error("Lead not found");

    const { data: profile } = await supabase
      .from("profiles")
      .select("display_name")
      .eq("user_id", userId)
      .single();

    const draft = await draftOutreachEmail({
      lead: {
        title: lead.title,
        summary: lead.summary ?? "",
        hospital: lead.hospital,
        specialty: lead.specialty,
        entities: lead.entities as {
          physicians?: string[];
          equipment?: string[];
          keywords?: string[];
        },
      },
      repName: profile?.display_name ?? "your Phillips rep",
    });

    const { data: saved } = await supabase
      .from("outreach_drafts")
      .insert({
        lead_id: data.lead_id,
        user_id: userId,
        subject: draft.subject,
        body: draft.body,
      })
      .select()
      .single();
    return saved;
  });
