import { useState, useRef, useEffect } from "react";
import {
  Building2,
  Stethoscope,
  Satellite,
  BarChart3,
  X,
  Check,
} from "lucide-react";
import { hospitals, specialties, sources, type LeadSource } from "@/data/leads";

export interface Filters {
  hospitals: string[];
  specialties: string[];
  sources: LeadSource[];
  minConfidence: number;
}

export const emptyFilters: Filters = {
  hospitals: [],
  specialties: [],
  sources: [],
  minConfidence: 0,
};

function useOutside(ref: React.RefObject<HTMLDivElement | null>, cb: () => void) {
  useEffect(() => {
    const fn = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) cb();
    };
    document.addEventListener("mousedown", fn);
    return () => document.removeEventListener("mousedown", fn);
  }, [ref, cb]);
}

function FilterPopover({
  open,
  onClose,
  children,
}: {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useOutside(ref, onClose);
  if (!open) return null;
  return (
    <div
      ref={ref}
      className="fade-up absolute left-0 top-full z-30 mt-2 w-64 rounded-md border border-border bg-surface-2 p-2 shadow-xl"
    >
      {children}
    </div>
  );
}

function MultiSelect({
  options,
  selected,
  onToggle,
}: {
  options: string[];
  selected: string[];
  onToggle: (v: string) => void;
}) {
  return (
    <div className="max-h-64 overflow-y-auto scrollbar-thin">
      {options.map((o) => {
        const isOn = selected.includes(o);
        return (
          <button
            key={o}
            onClick={() => onToggle(o)}
            className="flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-sm transition-colors hover:bg-surface-3"
          >
            <span className="truncate">{o}</span>
            {isOn && <Check className="h-3.5 w-3.5 text-primary" />}
          </button>
        );
      })}
    </div>
  );
}

function FilterButton({
  icon,
  label,
  count,
  active,
  onClick,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  count?: number;
  active: boolean;
  onClick: () => void;
  children?: React.ReactNode;
}) {
  return (
    <div className="relative">
      <button
        onClick={onClick}
        className={`flex h-9 items-center gap-2 rounded-md border px-3 text-sm transition-colors ${
          active
            ? "border-primary bg-primary/10 text-primary"
            : "border-border bg-surface-2 text-foreground hover:bg-surface-3"
        }`}
      >
        {icon}
        <span>{label}</span>
        {count ? (
          <span className="rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-semibold text-primary-foreground">
            {count}
          </span>
        ) : null}
      </button>
      {children}
    </div>
  );
}

export function FilterBar({
  filters,
  onChange,
}: {
  filters: Filters;
  onChange: (f: Filters) => void;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const anyActive =
    filters.hospitals.length +
      filters.specialties.length +
      filters.sources.length +
      (filters.minConfidence > 0 ? 1 : 0) >
    0;

  const toggle = <K extends keyof Filters>(key: K, v: Filters[K] extends Array<infer U> ? U : never) => {
    const arr = filters[key] as unknown as string[];
    const next = arr.includes(v as string) ? arr.filter((x) => x !== v) : [...arr, v as string];
    onChange({ ...filters, [key]: next });
  };

  return (
    <div className="sticky top-16 z-30 -mx-6 mb-6 border-b border-border bg-background/90 px-6 py-3 backdrop-blur">
      <div className="flex flex-wrap items-center gap-2">
        <FilterButton
          icon={<Building2 className="h-3.5 w-3.5" />}
          label="Hospital"
          count={filters.hospitals.length}
          active={filters.hospitals.length > 0 || open === "h"}
          onClick={() => setOpen(open === "h" ? null : "h")}
        >
          <FilterPopover open={open === "h"} onClose={() => setOpen(null)}>
            <MultiSelect
              options={hospitals}
              selected={filters.hospitals}
              onToggle={(v) => toggle("hospitals", v as never)}
            />
          </FilterPopover>
        </FilterButton>

        <FilterButton
          icon={<Stethoscope className="h-3.5 w-3.5" />}
          label="Specialty"
          count={filters.specialties.length}
          active={filters.specialties.length > 0 || open === "s"}
          onClick={() => setOpen(open === "s" ? null : "s")}
        >
          <FilterPopover open={open === "s"} onClose={() => setOpen(null)}>
            <MultiSelect
              options={specialties}
              selected={filters.specialties}
              onToggle={(v) => toggle("specialties", v as never)}
            />
          </FilterPopover>
        </FilterButton>

        <FilterButton
          icon={<Satellite className="h-3.5 w-3.5" />}
          label="Source"
          count={filters.sources.length}
          active={filters.sources.length > 0 || open === "src"}
          onClick={() => setOpen(open === "src" ? null : "src")}
        >
          <FilterPopover open={open === "src"} onClose={() => setOpen(null)}>
            <MultiSelect
              options={sources}
              selected={filters.sources}
              onToggle={(v) => toggle("sources", v as never)}
            />
          </FilterPopover>
        </FilterButton>

        <FilterButton
          icon={<BarChart3 className="h-3.5 w-3.5" />}
          label={`Min Confidence: ${filters.minConfidence}%`}
          active={filters.minConfidence > 0 || open === "c"}
          onClick={() => setOpen(open === "c" ? null : "c")}
        >
          <FilterPopover open={open === "c"} onClose={() => setOpen(null)}>
            <div className="px-2 py-3">
              <input
                type="range"
                min={0}
                max={100}
                step={25}
                value={filters.minConfidence}
                onChange={(e) =>
                  onChange({ ...filters, minConfidence: Number(e.target.value) })
                }
                className="w-full accent-primary"
              />
              <div className="mt-2 flex justify-between text-[10px] text-muted-foreground">
                <span>0</span>
                <span>25</span>
                <span>50</span>
                <span>75</span>
                <span>100</span>
              </div>
            </div>
          </FilterPopover>
        </FilterButton>

        {anyActive && (
          <button
            onClick={() => onChange(emptyFilters)}
            className="ml-auto flex items-center gap-1 px-2 py-1 text-xs text-muted-foreground transition-colors hover:text-destructive"
          >
            <X className="h-3.5 w-3.5" />
            Clear all
          </button>
        )}
      </div>
    </div>
  );
}
