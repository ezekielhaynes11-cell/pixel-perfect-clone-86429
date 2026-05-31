// Supabase Edge Function: enrich-contact
// Waterfall: NPPES (lead_physicians cache) → Apollo → none
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const APOLLO_BASE = "https://api.apollo.io/api/v1";

const DECISION_MAKER_TITLES = [
  "VP Supply Chain",
  "Director Procurement",
  "CMO",
  "VP Clinical Operations",
  "Materials Manager",
  "Director of Surgery",
  "CNO",
  "Chief Nursing Officer",
  "Director of Purchasing",
  "Supply Chain Manager",
];

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface ContactEnrichmentRow {
  lead_id: string;
  status: "found" | "none";
  name: string | null;
  title: string | null;
  organization: string | null;
  phone: string | null;
  email: string | null;
  linkedin_url: string | null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { lead_id } = await req.json() as { lead_id?: string };
    if (!lead_id) {
      return new Response(JSON.stringify({ error: "lead_id is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const respond = (data: unknown) =>
      new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });

    // Step 1: Cache hit
    const { data: cached } = await supabase
      .from("contact_enrichment")
      .select("*")
      .eq("lead_id", lead_id)
      .maybeSingle();
    if (cached?.status === "found") return respond(cached);

    // Step 2: Load lead
    const { data: lead, error: leadErr } = await supabase
      .from("leads")
      .select("hospital, entities")
      .eq("id", lead_id)
      .single();
    if (leadErr || !lead) {
      return new Response(JSON.stringify({ error: "Lead not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const upsert = async (row: ContactEnrichmentRow) => {
      const { data: saved, error: insErr } = await supabase
        .from("contact_enrichment")
        .upsert(row, { onConflict: "lead_id" })
        .select()
        .single();
      if (insErr) throw new Error(insErr.message);
      return saved;
    };

    // Step 3: NPPES — check lead_physicians table
    type PhysRow = {
      physician_contacts: {
        full_name: string;
        credentials: string | null;
        primary_specialty: string | null;
        practice_phone: string | null;
        practice_city: string | null;
        practice_state: string | null;
        email: string | null;
        title: string | null;
        linkedin_url: string | null;
      } | null;
    };

    const { data: physRows } = await supabase
      .from("lead_physicians")
      .select(
        "physician_contacts(full_name, credentials, primary_specialty, practice_phone, practice_city, practice_state, email, title, linkedin_url)",
      )
      .eq("lead_id", lead_id)
      .limit(1);

    const phys = (physRows as PhysRow[] | null)?.[0]?.physician_contacts;
    if (phys) {
      const name =
        [phys.full_name, phys.credentials].filter(Boolean).join(", ") ||
        phys.full_name;
      const org =
        [phys.practice_city, phys.practice_state].filter(Boolean).join(", ") ||
        null;
      const result = await upsert({
        lead_id,
        status: "found",
        name,
        title: phys.title ?? phys.primary_specialty,
        organization: org,
        phone: phys.practice_phone,
        email: phys.email,
        linkedin_url: phys.linkedin_url,
      });
      return respond(result);
    }

    // Step 4: Resolve org name from lead fields
    const ents = (lead.entities as {
      hospitals?: string[];
      physicians?: string[];
    }) ?? {};
    const org =
      ((lead.hospital as string | null)?.trim() || null) ??
      (ents.hospitals?.[0]?.trim() || null) ??
      (ents.physicians?.[0]?.trim() || null);

    if (!org) {
      const result = await upsert({
        lead_id, status: "none",
        name: null, title: null, organization: null,
        phone: null, email: null, linkedin_url: null,
      });
      return respond(result);
    }

    // Step 5: Apollo fallback
    const apolloKey = Deno.env.get("APOLLO_API_KEY");
    if (!apolloKey) throw new Error("APOLLO_API_KEY is not configured");

    const apolloRes = await fetch(`${APOLLO_BASE}/mixed_people/search`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        accept: "application/json",
        "x-api-key": apolloKey,
      },
      body: JSON.stringify({
        page: 1,
        per_page: 10,
        person_titles: DECISION_MAKER_TITLES,
        organization_name: org,
      }),
      signal: AbortSignal.timeout(30_000),
    });

    if (!apolloRes.ok) {
      const text = await apolloRes.text();
      throw new Error(`Apollo ${apolloRes.status}: ${text.slice(0, 300)}`);
    }

    type ApolloPerson = {
      name?: string | null;
      first_name?: string | null;
      last_name?: string | null;
      title?: string | null;
      linkedin_url?: string | null;
      email?: string | null;
      phone_numbers?: Array<{
        raw_number?: string | null;
        sanitized_number?: string | null;
      }> | null;
      organization?: { name?: string } | null;
    };

    const { people } = (await apolloRes.json()) as { people: ApolloPerson[] };
    const person = people?.[0];

    if (!person) {
      const result = await upsert({
        lead_id, status: "none",
        name: null, title: null, organization: org,
        phone: null, email: null, linkedin_url: null,
      });
      return respond(result);
    }

    const name =
      person.name ||
      [person.first_name, person.last_name].filter(Boolean).join(" ") ||
      null;
    const phone =
      person.phone_numbers?.[0]?.sanitized_number ??
      person.phone_numbers?.[0]?.raw_number ??
      null;

    const result = await upsert({
      lead_id,
      status: "found",
      name,
      title: person.title ?? null,
      organization: person.organization?.name ?? org,
      phone,
      email: person.email ?? null,
      linkedin_url: person.linkedin_url ?? null,
    });
    return respond(result);

  } catch (err) {
    console.error("[enrich-contact]", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
