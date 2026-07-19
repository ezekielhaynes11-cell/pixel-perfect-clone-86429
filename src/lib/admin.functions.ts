import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { scrapeUrlForAccount } from "./ingest/scrape-url.server";

export const listKeywords = createServerFn({ method: "GET" }).handler(async () => {
  const { data, error } = await supabaseAdmin
    .from("keyword_lists")
    .select("id, kind, value, active, notes, created_at")
    .order("kind", { ascending: true })
    .order("value", { ascending: true });
  if (error) throw new Error(error.message);
  return data ?? [];
});

export const upsertKeyword = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z
      .object({
        id: z.string().uuid().optional(),
        kind: z.enum([
          "vendor",
          "product_model",
          "focus_concept",
          "role_title",
          "complaint_signal",
        ]),
        value: z.string().min(1).max(200),
        active: z.boolean().default(true),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    if (data.id) {
      const { error } = await supabaseAdmin
        .from("keyword_lists")
        .update({ kind: data.kind, value: data.value, active: data.active })
        .eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: row, error } = await supabaseAdmin
      .from("keyword_lists")
      .insert({ kind: data.kind, value: data.value, active: data.active })
      .select("id")
      .single();
    if (error && !error.message.includes("duplicate")) throw new Error(error.message);
    return { id: row?.id ?? null };
  });

export const deleteKeyword = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    const { error } = await supabaseAdmin.from("keyword_lists").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listAccounts = createServerFn({ method: "GET" }).handler(async () => {
  const { data, error } = await supabaseAdmin
    .from("accounts")
    .select("id, name, state, account_type, system, is_va, notes")
    .order("name", { ascending: true });
  if (error) throw new Error(error.message);
  return data ?? [];
});

export const scrapePageForAccount = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z
      .object({
        url: z.string().url(),
        accountId: z.string().uuid().nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    return await scrapeUrlForAccount({ url: data.url, accountId: data.accountId ?? null });
  });

export const listScrapedPages = createServerFn({ method: "GET" }).handler(async () => {
  const { data, error } = await supabaseAdmin
    .from("scraped_pages")
    .select("id, account_id, url, title, extracted, fetched_at")
    .order("fetched_at", { ascending: false })
    .limit(50);
  if (error) throw new Error(error.message);
  return data ?? [];
});
