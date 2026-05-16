## Problem

The dashboard shows the generic "This page didn't load" error screen. The console reveals:

```
error: { "options": { "to": "/login", "statusCode": 307 } }
The above error occurred in the <Dashboard> component.
```

In `src/routes/index.tsx` (line 111) and `src/routes/pipeline.tsx` (line 33), the code does:

```tsx
if (!user) {
  throw redirect({ to: "/login" });
}
```

TanStack Router's `redirect()` helper is only meant to be thrown from `beforeLoad` / `loader` (where the router catches it and performs the navigation). When thrown **inside a React component during render**, it bypasses the router and is caught by the nearest React error boundary — which is our `ErrorComponent` in `__root.tsx`. That's why every unauthenticated visit shows the error page instead of redirecting to `/login`.

We can't move the check into `beforeLoad` because auth state lives in the client-side `useAuth` hook (Supabase session in `localStorage`), which isn't available during SSR / route loaders without a server-side session.

## Fix

Use the router's imperative `navigate` from a `useEffect` instead of throwing during render. While the redirect is in flight, render a lightweight loading state.

### `src/routes/index.tsx`

Replace:
```tsx
if (loading) {
  return <div className="grid min-h-screen place-items-center text-muted-foreground">Loading…</div>;
}
if (!user) {
  throw redirect({ to: "/login" });
}
```

With:
```tsx
const navigate = useNavigate();
useEffect(() => {
  if (!loading && !user) navigate({ to: "/login" });
}, [loading, user, navigate]);

if (loading || !user) {
  return <div className="grid min-h-screen place-items-center text-muted-foreground">Loading…</div>;
}
```

Drop the now-unused `redirect` import; add `useNavigate` from `@tanstack/react-router` and `useEffect` from `react`.

### `src/routes/pipeline.tsx`

Same treatment — swap `throw redirect(...)` for a `useEffect` + `useNavigate` pattern with a loading fallback.

### Optional polish (same edit)

The `ErrorComponent` in `__root.tsx` could defensively re-throw values that look like router redirects so any future stray `throw redirect(...)` still works:

```tsx
function ErrorComponent({ error, reset }) {
  if (error && typeof error === "object" && "options" in error && (error as any).options?.to) {
    throw error; // let the router handle it
  }
  // ...existing UI
}
```

This is a small safety net; not required for the fix.

## Scope

- Edit `src/routes/index.tsx` — swap redirect-throw for `useEffect`+`useNavigate`.
- Edit `src/routes/pipeline.tsx` — same swap.
- (Optional) Edit `src/routes/__root.tsx` `ErrorComponent` to re-throw redirect-shaped errors.

No backend / schema / dependency changes. After the fix, signed-out users land on `/login` cleanly and signed-in users see the dashboard.
