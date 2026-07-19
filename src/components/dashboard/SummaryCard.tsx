import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";

function CountUp({ value, className }: { value: number; className?: string }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    const start = performance.now();
    const dur = 700;
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      setN(Math.round(value * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <span className={className}>{n}</span>;
}

export function SummaryCard({ total, highPriority }: { total: number; highPriority: number }) {
  return (
    <div
      className="fade-up grid grid-cols-1 gap-6 rounded-md border-l-4 border-primary bg-gradient-to-r from-surface-2 to-surface px-6 py-6 md:grid-cols-3"
      style={{ minHeight: 120 }}
    >
      <div>
        <CountUp
          value={total}
          className="font-display text-5xl font-bold leading-none text-primary"
        />
        <div className="mt-2 text-xs uppercase tracking-wider text-muted-foreground">
          Leads Discovered Today
        </div>
      </div>

      <div className="md:border-l md:border-border md:pl-6">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-6 w-6 text-danger" />
          <CountUp
            value={highPriority}
            className="font-display text-4xl font-bold leading-none text-danger"
          />
        </div>
        <div className="mt-2 text-xs uppercase tracking-wider text-muted-foreground">
          High Priority Opportunities
        </div>
      </div>

      <div className="md:border-l md:border-border md:pl-6">
        <div className="flex items-center gap-2 text-success">
          <span className="pulse-dot inline-block h-2 w-2 rounded-full bg-success" />
          <span className="text-sm font-medium">Live monitoring</span>
        </div>
        <div className="mt-2 text-[11px] text-muted-foreground">Sync status shown in header</div>
        <div className="mt-1 text-[11px] uppercase tracking-wider text-muted-foreground">
          Territory: OK · AR · LA · TX
        </div>
      </div>
    </div>
  );
}
