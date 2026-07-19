import { useState, useRef, useEffect } from "react";
import {
  Building2,
  Stethoscope,
  Satellite,
  SlidersHorizontal,
  X,
  Check,
  Zap,
  Flag,
  MapPin,
  Factory,
} from "lucide-react";
import { sources } from "@/data/leads";
import {
  type SignalType,
  type AccountType,
  type TerritoryState,
  type Filters,
  emptyFilters,
  signalTypeOptions,
} from "./filters";

// Type-only re-exports are erased at build time, so they don't affect Fast
// Refresh. Value constants (emptyFilters, signalTypeOptions) are imported from
// "./filters" directly by consumers.
export type { SignalType, AccountType, TerritoryState, Filters };

const signalLabels: Record<SignalType, string> = {
  recall: "Recall",
  rfp: "RFP",
  funding: "Funding",
  m_and_a: "M&A",
  expansion: "Expansion",
  sentiment: "Sentiment",
  incumbency: "Incumbency",
};

export const accountTypeOptions: AccountType[] = ["va", "non_va"];
const accountTypeLabels: Record<AccountType, string> = {
  va: "VA",
  non_va: "Non-VA",
};

export const stateOptions: TerritoryState[] = ["TX", "OK", "AR", "LA"];

export const vendorOptions = [
  "GE Healthcare",
  "Mindray",
  "SonoSite",
  "Fujifilm",
  "Samsung",
  "Canon Medical",
  "Siemens Healthineers",
  "Butterfly Network",
  "Clarius",
];

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
  width = "w-64",
  children,
}: {
  open: boolean;
  onClose: () => void;
  width?: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useOutside(ref, onClose);
  if (!open) return null;
  return (
    <div
      ref={ref}
      className={`fade-up absolute left-0 top-full z-30 mt-2 ${width} rounded-md border border-border bg-surface-2 p-2 shadow-xl`}
    >
      {children}
    </div>
  );
}

function MultiSelect<T extends string>({
  options,
  selected,
  onToggle,
  labelFor,
}: {
  options: readonly T[];
  selected: readonly T[];
  onToggle: (v: T) => void;
  labelFor?: (v: T) => string;
}) {
  return (
    <div className="max-h-48 overflow-y-auto scrollbar-thin">
      {options.length === 0 ? (
        <div className="px-2 py-1.5 text-xs text-muted-foreground/60">None available</div>
      ) : (
        options.map((o) => {
          const isOn = (selected as readonly string[]).includes(o);
          return (
            <button
              key={o}
              onClick={() => onToggle(o)}
              className="flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-sm transition-colors hover:bg-surface-3"
            >
              <span className="truncate">{labelFor ? labelFor(o) : o}</span>
              {isOn && <Check className="h-3.5 w-3.5 text-primary" />}
            </button>
          );
        })
      )}
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

// A titled section inside the "More filters" popover.
function FilterSection({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border-b border-border/60 py-2 last:border-b-0">
      <div className="mb-1 flex items-center gap-1.5 px-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {icon}
        {title}
      </div>
      {children}
    </div>
  );
}

export function FilterBar({
  filters,
  onChange,
  hospitals,
  specialties,
}: {
  filters: Filters;
  onChange: (f: Filters) => void;
  hospitals: string[];
  specialties: string[];
}) {
  const [open, setOpen] = useState<string | null>(null);

  // "More filters" bundles the five less-used facets. Its badge shows the total
  // number of selections across them.
  const moreCount =
    filters.accountTypes.length +
    filters.vendors.length +
    filters.hospitals.length +
    filters.specialties.length +
    filters.sources.length;

  // Clear-all appears only when a real facet is active. minConfidence is
  // intentionally excluded — it has no UI control here and defaults to 0.
  const anyActive = filters.states.length + filters.signalTypes.length + moreCount > 0;

  const toggle = <K extends keyof Filters>(
    key: K,
    v: Filters[K] extends Array<infer U> ? U : never,
  ) => {
    const arr = filters[key] as unknown as string[];
    const next = arr.includes(v as string) ? arr.filter((x) => x !== v) : [...arr, v as string];
    onChange({ ...filters, [key]: next });
  };

  return (
    <div className="sticky top-16 z-30 -mx-6 mb-6 border-b border-border bg-background/90 px-6 py-3 backdrop-blur">
      <div className="flex flex-wrap items-center gap-2">
        <FilterButton
          icon={<MapPin className="h-3.5 w-3.5" />}
          label="State"
          count={filters.states.length}
          active={filters.states.length > 0 || open === "st"}
          onClick={() => setOpen(open === "st" ? null : "st")}
        >
          <FilterPopover open={open === "st"} onClose={() => setOpen(null)}>
            <MultiSelect
              options={stateOptions}
              selected={filters.states}
              onToggle={(v) => toggle("states", v as never)}
            />
          </FilterPopover>
        </FilterButton>

        <FilterButton
          icon={<Zap className="h-3.5 w-3.5" />}
          label="Signal"
          count={filters.signalTypes.length}
          active={filters.signalTypes.length > 0 || open === "sig"}
          onClick={() => setOpen(open === "sig" ? null : "sig")}
        >
          <FilterPopover open={open === "sig"} onClose={() => setOpen(null)}>
            <MultiSelect
              options={signalTypeOptions}
              selected={filters.signalTypes}
              onToggle={(v) => toggle("signalTypes", v as never)}
              labelFor={(v) => signalLabels[v]}
            />
          </FilterPopover>
        </FilterButton>

        <FilterButton
          icon={<SlidersHorizontal className="h-3.5 w-3.5" />}
          label="More filters"
          count={moreCount}
          active={moreCount > 0 || open === "more"}
          onClick={() => setOpen(open === "more" ? null : "more")}
        >
          <FilterPopover open={open === "more"} onClose={() => setOpen(null)} width="w-72">
            <div className="max-h-[70vh] overflow-y-auto scrollbar-thin">
              <FilterSection icon={<Flag className="h-3 w-3" />} title="Account">
                <MultiSelect
                  options={accountTypeOptions}
                  selected={filters.accountTypes}
                  onToggle={(v) => toggle("accountTypes", v as never)}
                  labelFor={(v) => accountTypeLabels[v]}
                />
              </FilterSection>
              <FilterSection icon={<Factory className="h-3 w-3" />} title="Vendor">
                <MultiSelect
                  options={vendorOptions}
                  selected={filters.vendors}
                  onToggle={(v) => toggle("vendors", v as never)}
                />
              </FilterSection>
              <FilterSection icon={<Building2 className="h-3 w-3" />} title="Hospital">
                <MultiSelect
                  options={hospitals}
                  selected={filters.hospitals}
                  onToggle={(v) => toggle("hospitals", v as never)}
                />
              </FilterSection>
              <FilterSection icon={<Stethoscope className="h-3 w-3" />} title="Specialty">
                <MultiSelect
                  options={specialties}
                  selected={filters.specialties}
                  onToggle={(v) => toggle("specialties", v as never)}
                />
              </FilterSection>
              <FilterSection icon={<Satellite className="h-3 w-3" />} title="Source">
                <MultiSelect
                  options={sources}
                  selected={filters.sources}
                  onToggle={(v) => toggle("sources", v as never)}
                />
              </FilterSection>
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
