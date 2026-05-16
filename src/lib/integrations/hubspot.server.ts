// HubSpot CRM push via the Lovable connector gateway.
// Connector must be linked: standard_connectors--connect with connector_id "hubspot"

const GATEWAY_URL = "https://connector-gateway.lovable.dev/hubspot";

export interface HubSpotPushInput {
  title: string;
  summary: string;
  hospital: string | null;
  estimated_value_usd: number | null;
  win_probability: number | null;
  confidence: number;
  source: string;
  source_url: string | null;
  outreach_subject?: string;
  outreach_body?: string;
}

export interface HubSpotPushResult {
  ok: boolean;
  dealId?: string;
  noteId?: string;
  hubspotUrl?: string;
  error?: string;
}

export async function pushLeadToHubspot(input: HubSpotPushInput): Promise<HubSpotPushResult> {
  const LOVABLE_API_KEY = process.env.LOVABLE_API_KEY;
  const HUBSPOT_API_KEY = process.env.HUBSPOT_API_KEY;
  if (!LOVABLE_API_KEY) return { ok: false, error: "LOVABLE_API_KEY not set" };
  if (!HUBSPOT_API_KEY) {
    return {
      ok: false,
      error:
        "HubSpot is not connected yet. Open the chat and ask Lovable to connect the HubSpot connector, then retry.",
    };
  }

  const amount = (input.estimated_value_usd ?? 0) * (input.win_probability ?? 0);

  // Create a deal
  const dealRes = await fetch(`${GATEWAY_URL}/crm/v3/objects/deals`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "X-Connection-Api-Key": HUBSPOT_API_KEY,
    },
    body: JSON.stringify({
      properties: {
        dealname: input.title.slice(0, 250),
        amount: amount > 0 ? Math.round(amount).toString() : undefined,
        dealstage: "appointmentscheduled",
        pipeline: "default",
        description: [
          input.summary,
          "",
          `Source: ${input.source}${input.source_url ? ` (${input.source_url})` : ""}`,
          `Hospital: ${input.hospital ?? "n/a"}`,
          `Confidence: ${input.confidence}%`,
          input.estimated_value_usd
            ? `Est. value: $${input.estimated_value_usd.toLocaleString()} · Win prob: ${Math.round((input.win_probability ?? 0) * 100)}%`
            : "",
        ]
          .filter(Boolean)
          .join("\n"),
      },
    }),
  });

  if (!dealRes.ok) {
    const text = await dealRes.text().catch(() => "");
    return { ok: false, error: `HubSpot deal create failed [${dealRes.status}]: ${text.slice(0, 300)}` };
  }
  const deal = (await dealRes.json()) as { id?: string };
  const dealId = deal.id;

  // Optionally attach the AI-drafted outreach as a note
  let noteId: string | undefined;
  if (input.outreach_subject && input.outreach_body && dealId) {
    const noteRes = await fetch(`${GATEWAY_URL}/crm/v3/objects/notes`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "X-Connection-Api-Key": HUBSPOT_API_KEY,
      },
      body: JSON.stringify({
        properties: {
          hs_note_body: `<p><strong>${input.outreach_subject}</strong></p><pre style="white-space:pre-wrap">${input.outreach_body}</pre>`,
          hs_timestamp: Date.now().toString(),
        },
        associations: [
          {
            to: { id: dealId },
            types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: 214 }],
          },
        ],
      }),
    });
    if (noteRes.ok) {
      const n = (await noteRes.json()) as { id?: string };
      noteId = n.id;
    }
  }

  return {
    ok: true,
    dealId,
    noteId,
    hubspotUrl: dealId ? `https://app.hubspot.com/contacts/_/deal/${dealId}` : undefined,
  };
}
