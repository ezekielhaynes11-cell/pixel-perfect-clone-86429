import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  apolloEnrichAccount,
  apolloEnrichPhysician,
  apolloProspectContacts,
} from "./apollo/service.server";

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
