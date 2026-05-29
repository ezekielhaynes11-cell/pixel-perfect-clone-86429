import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  apolloEnrichAccount,
  apolloEnrichPhysician,
  apolloProspectContacts,
} from "./apollo/service.server";

export const countUnenrichedPhysicians = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { count, error } = await supabaseAdmin
      .from("physician_contacts")
      .select("npi", { count: "exact", head: true })
      .is("apollo_id", null)
      .is("apollo_enriched_at", null);
    if (error) throw new Error(error.message);
    return { count: count ?? 0 };
  });

export const bulkEnrichApollo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ limit: z.number().int().min(1).max(100).optional() }).parse(input),
  )
  .handler(async ({ data }) => {
    const limit = data.limit ?? 25;
    const { data: rows, error } = await supabaseAdmin
      .from("physician_contacts")
      .select("npi")
      .is("apollo_id", null)
      .is("apollo_enriched_at", null)
      .order("last_verified_at", { ascending: false })
      .limit(limit);
    if (error) throw new Error(error.message);
    const targets = rows ?? [];
    let matched = 0;
    let errors = 0;
    for (const row of targets) {
      try {
        const result = await apolloEnrichPhysician({ npi: row.npi });
        if (result && (result as { matched?: boolean }).matched) matched++;
      } catch (e) {
        console.error("bulkEnrichApollo failed for", row.npi, e instanceof Error ? e.message : e);
        errors++;
      }
      await new Promise((r) => setTimeout(r, 300));
    }
    return { attempted: targets.length, matched, errors };
  });


export const enrichAccountApollo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ account_id: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => apolloEnrichAccount({ account_id: data.account_id }));

export const enrichPhysicianApollo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ npi: z.string().min(1).max(64) }).parse(input))
  .handler(async ({ data }) => apolloEnrichPhysician({ npi: data.npi }));

export const prospectContactsApollo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        account_id: z.string().uuid().optional(),
        state: z.string().min(2).max(2).optional(),
        titles: z.array(z.string().min(1).max(120)).max(10).optional(),
        keywords: z.string().max(200).optional(),
        limit: z.number().int().min(1).max(50).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => apolloProspectContacts(data));
