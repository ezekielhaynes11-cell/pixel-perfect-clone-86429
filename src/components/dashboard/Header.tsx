import { RefreshCw, ChevronDown, Zap } from "lucide-react";

export function DashboardHeader() {
  return (
    <header className="sticky top-0 z-40 h-16 border-b border-border bg-gradient-to-b from-surface to-background">
      <div className="mx-auto flex h-full max-w-[1600px] items-center gap-6 px-6">
        <div className="flex items-center gap-2 font-display text-base font-bold tracking-tight">
          <Zap className="h-5 w-5 text-primary" fill="currentColor" />
          <span>Yield Architect</span>
          <span className="ml-2 hidden rounded-sm bg-surface-2 px-1.5 py-0.5 font-sans text-[10px] uppercase tracking-wider text-muted-foreground sm:inline">
            Phillips Medical
          </span>
        </div>

        <div className="flex-1" />

        <div className="hidden items-center gap-2 text-xs text-muted-foreground md:flex">
          <RefreshCw className="spin-slow h-3.5 w-3.5 text-primary" />
          <span>Data synced 2 minutes ago</span>
        </div>

        <div className="flex-1" />

        <button className="flex items-center gap-2 rounded-md px-2 py-1.5 transition-colors hover:bg-surface-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
            MK
          </div>
          <span className="hidden text-sm sm:inline">Mike Klein</span>
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        </button>
      </div>
    </header>
  );
}
