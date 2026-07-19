// CRM + email server functions for one-click "Push to HubSpot" and "Send via Gmail".

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { OWNER_ID } from "./owner.server";
import { pushLeadToHubspot } from "./integrations/hubspot.server";
import { sendGmail } from "./integrations/gmail.server";

/* -------------------- HubSpot -------------------- */

export const pushLeadToCrm = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z.object({ lead_id: z.string().uuid(), draft_id: z.string().uuid().optional() }).parse(input),
  )
  .handler(async ({ data }) => {
    const { data: lead, error } = await supabaseAdmin
      .from("leads")
      .select(
        "id, title, summary, hospital, estimated_value_usd, win_probability, confidence, source, source_url",
      )
      .eq("id", data.lead_id)
      .single();
    if (error || !lead) throw new Error("Lead not found");

    let draft: { subject: string; body: string } | null = null;
    if (data.draft_id) {
      const { data: d } = await supabaseAdmin
        .from("outreach_drafts")
        .select("subject, body")
        .eq("id", data.draft_id)
        .maybeSingle();
      if (d) draft = d;
    }

    const result = await pushLeadToHubspot({
      title: lead.title,
      summary: lead.summary ?? "",
      hospital: lead.hospital,
      estimated_value_usd: lead.estimated_value_usd ? Number(lead.estimated_value_usd) : null,
      win_probability: lead.win_probability ? Number(lead.win_probability) : null,
      confidence: lead.confidence,
      source: lead.source,
      source_url: lead.source_url,
      outreach_subject: draft?.subject,
      outreach_body: draft?.body,
    });

    if (result.ok) {
      await supabaseAdmin.from("lead_actions").insert({
        lead_id: data.lead_id,
        user_id: OWNER_ID,
        action: "pushed_sfdc",
        note: result.hubspotUrl ?? null,
      });
    }
    return result;
  });

/* -------------------- Gmail send + follow-up scheduling -------------------- */

export const sendOutreachEmail = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z
      .object({
        draft_id: z.string().uuid(),
        to: z.string().email().max(200),
        cc: z.string().email().max(200).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { data: draft, error } = await supabaseAdmin
      .from("outreach_drafts")
      .select("id, lead_id, subject, body")
      .eq("id", data.draft_id)
      .single();
    if (error || !draft) throw new Error("Draft not found");

    const res = await sendGmail({
      to: data.to,
      cc: data.cc,
      subject: draft.subject,
      body: draft.body,
    });
    if (!res.ok) return res;

    // Record the send as a real 'contacted' action so the lead shows as contacted.
    // (Previously mislabelled 'saved', which polluted the saved/bookmark list.)
    await supabaseAdmin.from("lead_actions").upsert(
      {
        lead_id: draft.lead_id,
        user_id: OWNER_ID,
        action: "contacted",
        note: `Sent via Gmail to ${data.to}${res.messageId ? ` · message ${res.messageId}` : ""}`,
      },
      { onConflict: "lead_id,user_id,action" },
    );

    return { ok: true, messageId: res.messageId, threadId: res.threadId };
  });
