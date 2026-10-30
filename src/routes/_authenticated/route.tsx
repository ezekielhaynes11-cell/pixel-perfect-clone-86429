import { createFileRoute, Outlet } from "@tanstack/react-router";

// Public dashboard pages; paid AI and integration actions enforce their own role checks.
export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  component: () => <Outlet />,
});
