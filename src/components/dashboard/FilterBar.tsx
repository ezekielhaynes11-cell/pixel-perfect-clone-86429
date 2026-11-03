import { useState, useRef, useEffect, useMemo } from "react";
import {
  Building2,
  Stethoscope,
  Database,
  SlidersHorizontal,
  X,
  Check,
  Zap,
  Flag,
  MapPin,
  Factory,
  AlertTriangle,
  CalendarClock,
  CalendarRange,
  Layers,
  HeartPulse,
  ArrowUpDown,
} from "lucide-react";
import {
  sources,
  SOURCE_LABELS,
  LEAD_TYPE_OPTIONS,
  LEAD_TYPE_LABELS,
  DATE_PRESET_LABELS,
  SORT_OPTION_OPTIONS,
  SORT_OPTION_LABELS,
  classifyLeadType,
  type DatePreset,
  type Lead,
  type LeadSource,
  type LeadType,
  type SortOption,
} from "@/data/leads";
import {
  type SignalType,
  type AccountType,
  type TerritoryState,
  type Filters,
  emptyFilters,
  signalTypeOptions,
} from "./filters";

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

const QUICK_DATE_PRESETS: readonly Exclude<DatePreset, "custom">[] = [
  "all",
  "today",
  "3d",
  "7d",
  "14d",
  "30d",
];

function useOutside(ref: React.RefObject<HTMLDivElement | null>, onOutside: () => void) {
  useEffect(() => {
    const handleMouseDown = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        onOutside();
      }
    };
    document.addEventListener("mousedown", handleMouseDown);
    return () => document.removeEventListener("mousedown", handleMouseDown);
  }, [ref, onOutside]);
}

function FilterPopover({
  open,
  onClose,
  width = "w-64",
  align = "left",
  children,
}: {
  open: boolean;
  onClose: () => void;
  width?: string;
  align?: "left" | "right";
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useOutside(ref, onClose);
  if (!open) return null;
  const posClass = align === "right" ? "right-0" : "left-0";
  return (
    <div
      ref={ref}
      className={`fade-up absolute ${posClass} top-full z-30 mt-2 ${width} rounded-md border border-border bg-surface-2 p-2 shadow-xl`}
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
  countFor,
}: {
  options: readonly T[];
  selected: readonly T[];
  onToggle: (option: T) => void;
  labelFor?: (option: T) => string;
  countFor?: (option: T) => number;
}) {
  if (options.length === 0) {
    return <div className="px-2 py-1.5 text-xs text-muted-foreground/60">None available</div>;
  }

  return (
    <div className="max-h-56 overflow-y-auto scrollbar-thin">
      {options.map((option) => {
        const isSelected = (selected as readonly string[]).includes(option);
        const optionCount = countFor ? countFor(option) : undefined;
        return (
          <button
            key={option}
            type="button"
            onClick={() => onToggle(option)}
            className="flex w-full items-center justify-between gap-2 rounded px-2 py-1.5 text-left text-sm transition-colors hover:bg-surface-3"
          >
            <span className="truncate">{labelFor ? labelFor(option) : option}</span>
            <span className="flex shrink-0 items-center gap-1.5">
              {optionCount !== undefined && (
                <span className="rounded bg-surface px-1.5 py-0.5 text-[10px] text-muted-foreground">
                  {optionCount}
                </span>
              )}
              {isSelected && <Check className="h-3.5 w-3.5 text-primary" />}
            </span>
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
        type="button"
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

function ActiveChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-0.5 text-xs text-primary">
      <span>{label}</span>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${label} filter`}
        className="rounded-full p-0.5 transition-colors hover:bg-primary/20"
      >
        <X className="h-3 w-3" />
      </button>
    </span>
  );
}

export function FilterBar({
  filters,
  onChange,
  hospitals,
  specialties,
  facetLeads = [],
  todayCount = 0,
  highPriorityCount = 0,
  ruralCount = 0,
}: {
  filters: Filters;
  onChange: (nextFilters: Filters) => void;
  hospitals: string[];
  specialties: string[];
  facetLeads?: readonly Lead[];
  todayCount?: number;
  highPriorityCount?: number;
  ruralCount?: number;
}) {
  const [openMenu, setOpenMenu] = useState<string | null>(null);

  const leadTypeCounts = useMemo(() => {
    const counts = new Map<LeadType, number>();
    for (const item of facetLeads) {
      const kind = classifyLeadType(item);
      counts.set(kind, (counts.get(kind) ?? 0) + 1);
    }
    return counts;
  }, [facetLeads]);

  const sourceCounts = useMemo(() => {
    const counts = new Map<LeadSource, number>();
    for (const item of facetLeads) {
      counts.set(item.source, (counts.get(item.source) ?? 0) + 1);
    }
    return counts;
  }, [facetLeads]);

  const moreCount =
    filters.accountTypes.length +
    filters.vendors.length +
    filters.hospitals.length +
    filters.specialties.length;

  const hasCustomDates = Boolean(filters.dateFrom || filters.dateTo);
  const dateFilterActive = filters.onlyToday || filters.datePreset !== "all" || hasCustomDates;

  const anyActive =
    dateFilterActive ||
    filters.onlyHighPriority ||
    filters.onlyRural ||
    filters.leadTypes.length +
      filters.sources.length +
      filters.states.length +
      filters.signalTypes.length +
      moreCount >
      0;

  const toggleArrayValue = <K extends keyof Filters>(
    key: K,
    target: Filters[K] extends Array<infer U> ? U : never,
  ) => {
    const currentList = filters[key] as unknown as string[];
    const targetStr = target as string;
    const updatedList = currentList.includes(targetStr)
      ? currentList.filter((item) => item !== targetStr)
      : [...currentList, targetStr];
    onChange({ ...filters, [key]: updatedList });
  };

  const applyDatePreset = (preset: DatePreset) => {
    onChange({
      ...filters,
      datePreset: preset,
      onlyToday: preset === "today",
      dateFrom: preset === "custom" ? filters.dateFrom : "",
      dateTo: preset === "custom" ? filters.dateTo : "",
    });
  };

  const dateButtonLabel = filters.onlyToday
    ? "Date: Today"
    : filters.datePreset !== "all"
      ? `Date: ${DATE_PRESET_LABELS[filters.datePreset]}`
      : "Date";

  return (
    <div className="sticky top-16 z-30 -mx-6 mb-6 border-b border-border bg-background/90 px-6 py-3 backdrop-blur">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          aria-pressed={filters.onlyToday}
          onClick={() => {
            const nextToday = !filters.onlyToday;
            onChange({
              ...filters,
              onlyToday: nextToday,
              datePreset: nextToday
                ? "today"
                : filters.datePreset === "today"
                  ? "all"
                  : filters.datePreset,
            });
          }}
          className={`flex h-9 items-center gap-2 rounded-md border px-3 text-sm font-medium transition-colors ${
            filters.onlyToday
              ? "border-primary bg-primary/15 text-primary"
              : "border-border bg-surface-2 text-foreground hover:bg-surface-3"
          }`}
        >
          <CalendarClock className="h-3.5 w-3.5" />
          <span>Leads Today</span>
          <span
            className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
              filters.onlyToday
                ? "bg-primary text-primary-foreground"
                : "bg-surface text-muted-foreground"
            }`}
          >
            {todayCount}
          </span>
        </button>

        <button
          type="button"
          aria-pressed={filters.onlyHighPriority}
          onClick={() => onChange({ ...filters, onlyHighPriority: !filters.onlyHighPriority })}
          className={`flex h-9 items-center gap-2 rounded-md border px-3 text-sm font-medium transition-colors ${
            filters.onlyHighPriority
              ? "border-danger/70 bg-danger/15 text-danger"
              : "border-border bg-surface-2 text-foreground hover:bg-surface-3"
          }`}
        >
          <AlertTriangle className="h-3.5 w-3.5" />
          <span>Priority Leads</span>
          <span
            className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
              filters.onlyHighPriority ? "bg-danger text-white" : "bg-surface text-muted-foreground"
            }`}
          >
            {highPriorityCount}
          </span>
        </button>

        <button
          type="button"
          aria-pressed={filters.onlyRural}
          onClick={() => onChange({ ...filters, onlyRural: !filters.onlyRural })}
          className={`flex h-9 items-center gap-2 rounded-md border px-3 text-sm font-medium transition-colors ${
            filters.onlyRural
              ? "border-emerald-500/70 bg-emerald-500/15 text-emerald-300"
              : "border-border bg-surface-2 text-foreground hover:bg-surface-3"
          }`}
        >
          <HeartPulse className="h-3.5 w-3.5" />
          <span>Rural RHT</span>
          <span
            className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
              filters.onlyRural
                ? "bg-emerald-500 text-slate-950"
                : "bg-surface text-muted-foreground"
            }`}
          >
            {ruralCount}
          </span>
        </button>

        <div className="mx-1 hidden h-5 w-px bg-border sm:block" />

        <FilterButton
          icon={<CalendarRange className="h-3.5 w-3.5" />}
          label={dateButtonLabel}
          active={dateFilterActive || openMenu === "date"}
          onClick={() => setOpenMenu(openMenu === "date" ? null : "date")}
        >
          <FilterPopover open={openMenu === "date"} onClose={() => setOpenMenu(null)} width="w-72">
            <div className="space-y-1">
              {QUICK_DATE_PRESETS.map((preset) => {
                const isCurrent =
                  preset === "today"
                    ? filters.onlyToday || filters.datePreset === "today"
                    : !filters.onlyToday && filters.datePreset === preset;
                return (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => applyDatePreset(preset)}
                    className="flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-sm transition-colors hover:bg-surface-3"
                  >
                    <span>{DATE_PRESET_LABELS[preset]}</span>
                    {isCurrent && <Check className="h-3.5 w-3.5 text-primary" />}
                  </button>
                );
              })}
            </div>
            <div className="mt-2 border-t border-border/60 pt-2">
              <div className="mb-1.5 px-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Custom Date Range
              </div>
              <div className="grid grid-cols-2 gap-2 px-1">
                <label className="text-[11px] text-muted-foreground">
                  From
                  <input
                    type="date"
                    value={filters.dateFrom}
                    onChange={(event) =>
                      onChange({
                        ...filters,
                        onlyToday: false,
                        datePreset: event.target.value || filters.dateTo ? "custom" : "all",
                        dateFrom: event.target.value,
                      })
                    }
                    className="mt-0.5 w-full rounded border border-border bg-surface px-2 py-1 text-xs text-foreground outline-none focus:border-primary"
                  />
                </label>
                <label className="text-[11px] text-muted-foreground">
                  To
                  <input
                    type="date"
                    value={filters.dateTo}
                    onChange={(event) =>
                      onChange({
                        ...filters,
                        onlyToday: false,
                        datePreset: filters.dateFrom || event.target.value ? "custom" : "all",
                        dateTo: event.target.value,
                      })
                    }
                    className="mt-0.5 w-full rounded border border-border bg-surface px-2 py-1 text-xs text-foreground outline-none focus:border-primary"
                  />
                </label>
              </div>
            </div>
          </FilterPopover>
        </FilterButton>

        <FilterButton
          icon={<Layers className="h-3.5 w-3.5" />}
          label="Lead Type"
          count={filters.leadTypes.length}
          active={filters.leadTypes.length > 0 || openMenu === "leadType"}
          onClick={() => setOpenMenu(openMenu === "leadType" ? null : "leadType")}
        >
          <FilterPopover
            open={openMenu === "leadType"}
            onClose={() => setOpenMenu(null)}
            width="w-72"
          >
            <MultiSelect
              options={LEAD_TYPE_OPTIONS}
              selected={filters.leadTypes}
              onToggle={(option) => toggleArrayValue("leadTypes", option as never)}
              labelFor={(option) => LEAD_TYPE_LABELS[option]}
              countFor={(option) => leadTypeCounts.get(option) ?? 0}
            />
          </FilterPopover>
        </FilterButton>

        <FilterButton
          icon={<Database className="h-3.5 w-3.5" />}
          label="Data Source"
          count={filters.sources.length}
          active={filters.sources.length > 0 || openMenu === "source"}
          onClick={() => setOpenMenu(openMenu === "source" ? null : "source")}
        >
          <FilterPopover
            open={openMenu === "source"}
            onClose={() => setOpenMenu(null)}
            width="w-72"
          >
            <MultiSelect
              options={sources}
              selected={filters.sources}
              onToggle={(option) => toggleArrayValue("sources", option as never)}
              labelFor={(option) => SOURCE_LABELS[option] ?? option}
              countFor={(option) => sourceCounts.get(option) ?? 0}
            />
          </FilterPopover>
        </FilterButton>

        <FilterButton
          icon={<MapPin className="h-3.5 w-3.5" />}
          label="State"
          count={filters.states.length}
          active={filters.states.length > 0 || openMenu === "state"}
          onClick={() => setOpenMenu(openMenu === "state" ? null : "state")}
        >
          <FilterPopover open={openMenu === "state"} onClose={() => setOpenMenu(null)}>
            <MultiSelect
              options={stateOptions}
              selected={filters.states}
              onToggle={(option) => toggleArrayValue("states", option as never)}
            />
          </FilterPopover>
        </FilterButton>

        <FilterButton
          icon={<Zap className="h-3.5 w-3.5" />}
          label="Signal"
          count={filters.signalTypes.length}
          active={filters.signalTypes.length > 0 || openMenu === "signal"}
          onClick={() => setOpenMenu(openMenu === "signal" ? null : "signal")}
        >
          <FilterPopover open={openMenu === "signal"} onClose={() => setOpenMenu(null)}>
            <MultiSelect
              options={signalTypeOptions}
              selected={filters.signalTypes}
              onToggle={(option) => toggleArrayValue("signalTypes", option as never)}
              labelFor={(option) => signalLabels[option]}
            />
          </FilterPopover>
        </FilterButton>

        <FilterButton
          icon={<SlidersHorizontal className="h-3.5 w-3.5" />}
          label="More filters"
          count={moreCount}
          active={moreCount > 0 || openMenu === "more"}
          onClick={() => setOpenMenu(openMenu === "more" ? null : "more")}
        >
          <FilterPopover open={openMenu === "more"} onClose={() => setOpenMenu(null)} width="w-72">
            <div className="max-h-[70vh] overflow-y-auto scrollbar-thin">
              <FilterSection icon={<Flag className="h-3 w-3" />} title="Account">
                <MultiSelect
                  options={accountTypeOptions}
                  selected={filters.accountTypes}
                  onToggle={(option) => toggleArrayValue("accountTypes", option as never)}
                  labelFor={(option) => accountTypeLabels[option]}
                />
              </FilterSection>
              <FilterSection icon={<Factory className="h-3 w-3" />} title="Vendor">
                <MultiSelect
                  options={vendorOptions}
                  selected={filters.vendors}
                  onToggle={(option) => toggleArrayValue("vendors", option as never)}
                />
              </FilterSection>
              <FilterSection icon={<Building2 className="h-3 w-3" />} title="Hospital">
                <MultiSelect
                  options={hospitals}
                  selected={filters.hospitals}
                  onToggle={(option) => toggleArrayValue("hospitals", option as never)}
                />
              </FilterSection>
              <FilterSection icon={<Stethoscope className="h-3 w-3" />} title="Specialty">
                <MultiSelect
                  options={specialties}
                  selected={filters.specialties}
                  onToggle={(option) => toggleArrayValue("specialties", option as never)}
                />
              </FilterSection>
            </div>
          </FilterPopover>
        </FilterButton>

        <div className="relative ml-auto">
          <button
            type="button"
            onClick={() => setOpenMenu(openMenu === "sort" ? null : "sort")}
            className="flex h-9 items-center gap-1.5 rounded-md border border-border bg-surface-2 px-3 text-xs font-medium text-foreground/90 transition-colors hover:bg-surface-3"
            title="Sort leads"
          >
            <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground" />
            <span>{SORT_OPTION_LABELS[filters.sortBy]}</span>
          </button>
          <FilterPopover
            open={openMenu === "sort"}
            onClose={() => setOpenMenu(null)}
            width="w-56"
            align="right"
          >
            {SORT_OPTION_OPTIONS.map((sortMode: SortOption) => (
              <button
                key={sortMode}
                type="button"
                onClick={() => {
                  onChange({ ...filters, sortBy: sortMode });
                  setOpenMenu(null);
                }}
                className="flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-sm transition-colors hover:bg-surface-3"
              >
                <span>{SORT_OPTION_LABELS[sortMode]}</span>
                {filters.sortBy === sortMode && <Check className="h-3.5 w-3.5 text-primary" />}
              </button>
            ))}
          </FilterPopover>
        </div>
      </div>

      {anyActive && (
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5 border-t border-border/50 pt-2">
          {filters.onlyRural && (
            <ActiveChip
              label="Campaign: Rural RHT ($50B)"
              onRemove={() => onChange({ ...filters, onlyRural: false })}
            />
          )}
          {filters.onlyHighPriority && (
            <ActiveChip
              label="Priority Leads"
              onRemove={() => onChange({ ...filters, onlyHighPriority: false })}
            />
          )}
          {dateFilterActive && (
            <ActiveChip
              label={
                filters.onlyToday || filters.datePreset === "today"
                  ? "Date: Today"
                  : filters.datePreset === "custom"
                    ? `Date: ${filters.dateFrom || "…"} → ${filters.dateTo || "…"}`
                    : `Date: ${DATE_PRESET_LABELS[filters.datePreset]}`
              }
              onRemove={() =>
                onChange({
                  ...filters,
                  onlyToday: false,
                  datePreset: "all",
                  dateFrom: "",
                  dateTo: "",
                })
              }
            />
          )}
          {filters.leadTypes.map((kind) => (
            <ActiveChip
              key={`lt:${kind}`}
              label={`Type: ${LEAD_TYPE_LABELS[kind]}`}
              onRemove={() => toggleArrayValue("leadTypes", kind as never)}
            />
          ))}
          {filters.sources.map((src) => (
            <ActiveChip
              key={`src:${src}`}
              label={`Source: ${SOURCE_LABELS[src] ?? src}`}
              onRemove={() => toggleArrayValue("sources", src as never)}
            />
          ))}
          {filters.states.map((st) => (
            <ActiveChip
              key={`st:${st}`}
              label={`State: ${st}`}
              onRemove={() => toggleArrayValue("states", st as never)}
            />
          ))}
          {filters.signalTypes.map((sig) => (
            <ActiveChip
              key={`sig:${sig}`}
              label={`Signal: ${signalLabels[sig]}`}
              onRemove={() => toggleArrayValue("signalTypes", sig as never)}
            />
          ))}
          <button
            type="button"
            onClick={() => onChange({ ...emptyFilters, sortBy: filters.sortBy })}
            className="ml-auto flex items-center gap-1 px-2 py-0.5 text-xs text-muted-foreground transition-colors hover:text-destructive"
          >
            <X className="h-3.5 w-3.5" />
            Clear filters
          </button>
        </div>
      )}
    </div>
  );
}
