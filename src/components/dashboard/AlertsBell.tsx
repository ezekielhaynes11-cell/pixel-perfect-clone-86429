import { useState, useRef, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Bell } from "lucide-react";
import { listAlerts, markAllAlertsRead, markAlertRead } from "@/lib/leads.functions";
import type { Lead } from "@/data/leads";

export function AlertsBell({
  leads,
  onOpenLead,
}: {
  leads: Lead[];
  onOpenLead: (lead: Lead) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const qc = useQueryClient();
  const list = useServerFn(listAlerts);
  const markOne = useServerFn(markAlertRead);
  const markAll = useServerFn(markAllAlertsRead);

  const q = useQuery({
    queryKey: ["alerts"],
    queryFn: () => list(),
    refetchInterval: 60_000,
  });

  const markOneM = useMutation({
    mutationFn: (id: string) => markOne({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["alerts"] }),
  });
  const markAllM = useMutation({
    mutationFn: () => markAll(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["alerts"] }),
  });

  useEffect(() => {
    const fn = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", fn);
    return () => document.removeEventListener("mousedown", fn);
  }, []);

  const unread = (q.data ?? []).filter((a) => !a.read_at).length;
  const leadById = new Map(leads.map((l) => [l.id, l]));

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative rounded-md p-2 text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground"
        title="Alerts"
      >
        <Bell className="h-4 w-4" />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>
      {open && (
        <div className="fade-up absolute right-0 top-full z-40 mt-2 w-80 overflow-hidden rounded-md border border-border bg-surface-2 shadow-xl">
          <div className="flex items-center justify-between border-b border-border px-3 py-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Alerts
            </span>
            <button
              onClick={() => markAllM.mutate()}
              disabled={unread === 0}
              className="text-[11px] text-primary hover:underline disabled:opacity-40"
            >
              Mark all read
            </button>
          </div>
          <div className="max-h-80 overflow-y-auto scrollbar-thin">
            {(q.data ?? []).length === 0 ? (
              <div className="p-4 text-center text-xs text-muted-foreground">
                No alerts yet. Save a view to start tracking high-confidence leads.
              </div>
            ) : (
              <ul>
                {(q.data ?? []).slice(0, 20).map((a) => {
                  const lead = leadById.get(a.lead_id);
                  return (
                    <li
                      key={a.id}
                      className={`cursor-pointer border-b border-border px-3 py-2 transition-colors hover:bg-surface-3 ${
                        a.read_at ? "opacity-60" : ""
                      }`}
                      onClick={() => {
                        markOneM.mutate(a.id);
                        if (lead) onOpenLead(lead);
                        setOpen(false);
                      }}
                    >
                      <div className="line-clamp-1 text-sm font-medium">
                        {lead?.title ?? "Lead matched a saved view"}
                      </div>
                      <div className="mt-0.5 text-[11px] text-muted-foreground">
                        {lead?.hospital ?? ""} {lead?.confidence ? `· ${lead.confidence}%` : ""}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
