import { createFileRoute, Outlet } from "@tanstack/react-router";

// Single-user dashboard route group: all pages load directly without sign-in.
export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  component: () => <Outlet />,
});
