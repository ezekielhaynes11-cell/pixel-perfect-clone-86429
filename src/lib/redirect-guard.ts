export function resolveSafeDashboardRedirect(candidate?: string): string {
  if (!candidate || !candidate.startsWith("/") || candidate.startsWith("//")) {
    return "/";
  }
  if (candidate.startsWith("/auth")) {
    return "/";
  }
  return candidate;
}
