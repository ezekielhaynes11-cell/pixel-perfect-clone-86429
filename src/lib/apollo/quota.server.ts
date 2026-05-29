// Best-effort daily cap for Apollo API calls.
// Per-Worker-isolate in-memory counter — NOT a strict distributed cap.
// Acceptable for current ingestion volume; upgrade to a DB-backed counter
// (apollo_usage(day, count)) if stricter enforcement is needed.

const DEFAULT_CAP = 150;

const state: { dayKey: string; count: number } = {
  dayKey: "",
  count: 0,
};

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function currentCap(): number {
  const raw = process.env.APOLLO_DAILY_CAP;
  const n = raw ? parseInt(raw, 10) : NaN;
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_CAP;
}

function rollIfNewDay() {
  const today = todayKey();
  if (state.dayKey !== today) {
    state.dayKey = today;
    state.count = 0;
  }
}

export function tryConsumeApolloCall(): boolean {
  rollIfNewDay();
  if (state.count >= currentCap()) return false;
  state.count++;
  return true;
}

export function getApolloUsage(): { used: number; cap: number; dayKey: string } {
  rollIfNewDay();
  return { used: state.count, cap: currentCap(), dayKey: state.dayKey };
}
