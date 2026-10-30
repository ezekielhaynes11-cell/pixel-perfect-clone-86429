// Gate for every app server function: caller must be signed in AND hold the
// 'rep' or 'admin' role. Server functions are public RPC endpoints, so this —
// not the route guard — is the real security boundary.
import { createMiddleware } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const requireRep = createMiddleware({ type: "function" })
  .middleware([requireSupabaseAuth])
  .server(async ({ next, context }) => {
    const { data, error } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId);
    if (error) throw new Error("Unauthorized: could not verify role");
    const roles = (data ?? []).map((r) => r.role);
    if (!roles.includes("rep") && !roles.includes("admin")) {
      throw new Error("Forbidden: your account has not been granted access");
    }
    return next({ context: { roles } });
  });
