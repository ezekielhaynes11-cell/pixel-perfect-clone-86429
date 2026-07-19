// Fail-fast check that VITE_SUPABASE_* are inlined into the production bundle.
// If these are undefined in the browser, the published site renders an empty feed.
const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (typeof window !== "undefined" && (!url || !key)) {
  console.error(
    "%c[FATAL] Supabase env missing in production bundle — published site will be empty.\n" +
      "Expected VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY to be defined at build time.\n" +
      `Got: VITE_SUPABASE_URL=${url ? "set" : "MISSING"}, VITE_SUPABASE_PUBLISHABLE_KEY=${key ? "set" : "MISSING"}`,
    "background:#b00020;color:#fff;font-weight:bold;padding:4px 8px;",
  );
}

export {};
