import { createFileRoute, redirect } from "@tanstack/react-router";
import { z } from "zod";

import { resolveSafeDashboardRedirect } from "@/lib/redirect-guard";

const AuthRedirectSearchSchema = z.object({ redirect: z.string().optional() });

// This dashboard operates without sign-in. Redirect any legacy /auth links straight to the feed.
export const Route = createFileRoute("/auth")({
  validateSearch: AuthRedirectSearchSchema,
  beforeLoad: ({ search }) => {
    const destination = resolveSafeDashboardRedirect(search.redirect);
    throw redirect({ href: destination, replace: true });
  },
  component: () => null,
});
