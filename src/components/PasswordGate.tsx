import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Lock } from "lucide-react";
import { getGateStatus, unlockGate } from "@/lib/auth-gate.functions";

export function PasswordGate({ children }: { children: React.ReactNode }) {
  const getStatus = useServerFn(getGateStatus);
  const unlock = useServerFn(unlockGate);
  const [pw, setPw] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const statusQ = useQuery({ queryKey: ["gate"], queryFn: () => getStatus(), refetchOnWindowFocus: false });

  useEffect(() => {
    if (statusQ.data?.unlocked) setErr(null);
  }, [statusQ.data?.unlocked]);

  if (statusQ.isLoading) return null;
  if (!statusQ.data?.enabled || statusQ.data?.unlocked) return <>{children}</>;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const res = await unlock({ data: { password: pw } });
      if (res.unlocked) {
        statusQ.refetch();
      } else {
        setErr(res.error ?? "Incorrect password");
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <form
        onSubmit={submit}
        className="w-full max-w-sm rounded-lg border border-border bg-surface p-6 shadow-card"
      >
        <div className="mb-4 flex items-center gap-2 text-foreground">
          <Lock className="h-4 w-4 text-primary" />
          <h1 className="font-display text-lg font-semibold">Yield Architect</h1>
        </div>
        <p className="mb-4 text-sm text-muted-foreground">
          Enter the shared access password to continue.
        </p>
        <input
          type="password"
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          autoFocus
          className="mb-3 w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
          placeholder="Password"
        />
        {err && <div className="mb-3 text-xs text-destructive">{err}</div>}
        <button
          type="submit"
          disabled={busy || !pw}
          className="w-full rounded-md bg-primary py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {busy ? "Unlocking…" : "Unlock"}
        </button>
      </form>
    </div>
  );
}
