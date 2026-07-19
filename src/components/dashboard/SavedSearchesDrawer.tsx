import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { X, Bookmark, Bell, BellOff, Trash2, Plus } from "lucide-react";
import { toast } from "sonner";
import { listSavedSearches, upsertSavedSearch, deleteSavedSearch } from "@/lib/leads.functions";
import { emptyFilters, type Filters } from "./filters";

interface SavedSearchRow {
  id: string;
  name: string;
  filter: Filters;
  alert_threshold: number;
  alerts_enabled: boolean;
  created_at: string;
}

export function SavedSearchesDrawer({
  open,
  onClose,
  currentFilters,
  onApply,
}: {
  open: boolean;
  onClose: () => void;
  currentFilters: Filters;
  onApply: (f: Filters) => void;
}) {
  const qc = useQueryClient();
  const list = useServerFn(listSavedSearches);
  const upsert = useServerFn(upsertSavedSearch);
  const del = useServerFn(deleteSavedSearch);
  const [newName, setNewName] = useState("");
  const [threshold, setThreshold] = useState(85);

  const q = useQuery({
    queryKey: ["saved_searches"],
    queryFn: () => list(),
    enabled: open,
  });

  const create = useMutation({
    mutationFn: () =>
      upsert({
        data: {
          name: newName.trim() || "Untitled view",
          filter: currentFilters,
          alert_threshold: threshold,
          alerts_enabled: true,
        },
      }),
    onSuccess: () => {
      setNewName("");
      qc.invalidateQueries({ queryKey: ["saved_searches"] });
      toast.success("Saved");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Save failed"),
  });

  const toggle = useMutation({
    mutationFn: (row: SavedSearchRow) =>
      upsert({
        data: {
          id: row.id,
          name: row.name,
          filter: row.filter,
          alert_threshold: row.alert_threshold,
          alerts_enabled: !row.alerts_enabled,
        },
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["saved_searches"] }),
  });

  const remove = useMutation({
    mutationFn: (id: string) => del({ data: { id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["saved_searches"] });
      toast.success("Deleted");
    },
  });

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm">
      <div className="fade-up flex h-full w-full max-w-md flex-col border-l border-border bg-surface">
        <div className="flex items-center justify-between border-b border-border p-4">
          <div className="flex items-center gap-2">
            <Bookmark className="h-4 w-4 text-primary" />
            <h2 className="font-display text-base font-semibold">Saved views</h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="border-b border-border bg-surface-2 p-4">
          <div className="mb-2 text-[11px] uppercase tracking-wider text-muted-foreground">
            Save current filters as a view
          </div>
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder='e.g. "Texas cath labs"'
            className="mb-2 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
          />
          <div className="mb-3 flex items-center gap-2 text-xs text-muted-foreground">
            <span>Alert at ≥</span>
            <input
              type="number"
              min={0}
              max={100}
              value={threshold}
              onChange={(e) => setThreshold(Number(e.target.value))}
              className="w-16 rounded border border-border bg-surface px-2 py-1 text-sm"
            />
            <span>% confidence</span>
          </div>
          <button
            onClick={() => create.mutate()}
            disabled={create.isPending}
            className="flex w-full items-center justify-center gap-1.5 rounded-md bg-primary py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            <Plus className="h-3.5 w-3.5" />
            {create.isPending ? "Saving…" : "Save view"}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto scrollbar-thin p-3">
          {q.isLoading ? (
            <div className="p-6 text-center text-sm text-muted-foreground">Loading…</div>
          ) : (q.data ?? []).length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">No saved views yet.</div>
          ) : (
            <ul className="space-y-2">
              {(q.data as unknown as SavedSearchRow[]).map((s) => (
                <li
                  key={s.id}
                  className="rounded-md border border-border bg-surface-2 p-3 transition-colors hover:border-primary/40"
                >
                  <div className="flex items-start gap-2">
                    <div className="flex-1">
                      <div className="font-semibold text-foreground">{s.name}</div>
                      <FilterSummary filter={s.filter} />
                    </div>
                    <button
                      onClick={() => toggle.mutate(s)}
                      title={s.alerts_enabled ? "Alerts on" : "Alerts off"}
                      className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-surface-3"
                    >
                      {s.alerts_enabled ? (
                        <Bell className="h-4 w-4 text-primary" />
                      ) : (
                        <BellOff className="h-4 w-4" />
                      )}
                    </button>
                    <button
                      onClick={() => remove.mutate(s.id)}
                      className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-destructive/20 hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground">
                    <span>Alert ≥ {s.alert_threshold}%</span>
                    <button
                      onClick={() => {
                        onApply({ ...emptyFilters, ...s.filter });
                        onClose();
                      }}
                      className="text-primary hover:underline"
                    >
                      Apply
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function FilterSummary({ filter }: { filter: Filters }) {
  const bits: string[] = [];
  if (filter.hospitals?.length)
    bits.push(`${filter.hospitals.length} hospital${filter.hospitals.length === 1 ? "" : "s"}`);
  if (filter.specialties?.length) bits.push(`${filter.specialties.length} specialty`);
  if (filter.sources?.length)
    bits.push(`${filter.sources.length} source${filter.sources.length === 1 ? "" : "s"}`);
  if (filter.minConfidence) bits.push(`≥${filter.minConfidence}%`);
  return (
    <div className="mt-0.5 text-xs text-muted-foreground">
      {bits.length === 0 ? "All leads" : bits.join(" · ")}
    </div>
  );
}
