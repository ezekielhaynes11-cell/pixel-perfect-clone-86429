import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { loadKeywords, matchesAnyKeyword } from "./keywords.server";

/** Lightweight HTML → text + AI structured extraction for any URL Mike pastes. */

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

interface ExtractedPeople {
  people: Array<{ name: string; role_hint: string | null }>;
  programs: string[];
  vendor_mentions: string[];
  summary: string;
}

function stripHtml(html: string): { text: string; title: string } {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = (titleMatch?.[1] ?? "").trim();
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
  return { text: text.slice(0, 12000), title };
}

const TOOL = {
  type: "function" as const,
  function: {
    name: "extract_page",
    description: "Extract people, fellowship programs, and vendor mentions from a hospital page.",
    parameters: {
      type: "object",
      properties: {
        summary: { type: "string", description: "<=240 chars summary of what this page is about." },
        people: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              role_hint: { type: ["string", "null"] },
            },
            required: ["name", "role_hint"],
            additionalProperties: false,
          },
        },
        programs: { type: "array", items: { type: "string" } },
        vendor_mentions: { type: "array", items: { type: "string" } },
      },
      required: ["summary", "people", "programs", "vendor_mentions"],
      additionalProperties: false,
    },
  },
};

export interface ScrapeResult {
  id: string;
  url: string;
  title: string;
  extracted: ExtractedPeople;
}

export async function scrapeUrlForAccount(args: {
  url: string;
  accountId?: string | null;
}): Promise<ScrapeResult> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) throw new Error("LOVABLE_API_KEY not configured");

  const res = await fetch(args.url, {
    headers: {
      "User-Agent": "PhillipsLeadRadar/1.0 (+contact: sales-intel)",
      Accept: "text/html,application/xhtml+xml",
    },
  });
  if (!res.ok) throw new Error(`fetch ${args.url}: ${res.status}`);
  const html = await res.text();
  const { text, title } = stripHtml(html);

  const kw = await loadKeywords();
  const vendorHits = matchesAnyKeyword(text, [...kw.vendors, ...kw.products]);

  const aiRes = await fetch(GATEWAY_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        {
          role: "system",
          content:
            "Extract physicians/leadership, fellowship/training programs, and any medical-device vendor mentions from a hospital web page. Be conservative — if a name lacks a clear medical role on the page, omit it. role_hint examples: POCUS director, fellowship director, chief of emergency medicine, biomed director, attending.",
        },
        {
          role: "user",
          content: `URL: ${args.url}\nTitle: ${title}\n\nPage text:\n${text}`,
        },
      ],
      tools: [TOOL],
      tool_choice: { type: "function", function: { name: "extract_page" } },
    }),
  });
  if (!aiRes.ok) throw new Error(`AI gateway ${aiRes.status}: ${await aiRes.text()}`);
  const aiJson = (await aiRes.json()) as {
    choices?: { message?: { tool_calls?: { function?: { arguments?: string } }[] } }[];
  };
  const argsStr = aiJson.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
  if (!argsStr) throw new Error("AI returned no extraction");
  const extracted = JSON.parse(argsStr) as ExtractedPeople;

  // Merge keyword-matched vendors with AI-extracted ones.
  extracted.vendor_mentions = Array.from(new Set([...(extracted.vendor_mentions ?? []), ...vendorHits]));

  const { data, error } = await supabaseAdmin
    .from("scraped_pages")
    .insert({
      account_id: args.accountId ?? null,
      url: args.url,
      title: title || args.url,
      extracted,
      raw_text: text,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return { id: data.id, url: args.url, title, extracted };
}
