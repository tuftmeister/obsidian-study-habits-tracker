/**
 * Parses duration strings into minutes.
 *
 * Accepted formats:
 *   25m / 25 min / 25 minutes           → 25
 *   1h / 1 hr / 1 hour                  → 60
 *   1h30m / 1h 30m / 1:30               → 90
 *   1.5h                                → 90
 *   90   (bare number, unit from caller) → 90 or 5400 depending on defaultUnit
 *   90s / 90 sec / 90 seconds           → 1.5
 *
 * Returns null for inputs that cannot be parsed.
 */
export function parseDuration(
  input: string,
  defaultUnit: "minutes" | "hours" = "minutes"
): number | null {
  if (typeof input !== "string") return null;
  const s = input.trim();
  if (s === "") return null;

  // ── hours + minutes: 1h30m, 1h 30m, 1:30 ──────────────────────────────────
  const hmColon = s.match(/^(\d+):(\d{2})$/);
  if (hmColon) {
    const h = parseInt(hmColon[1], 10);
    const m = parseInt(hmColon[2], 10);
    return round2(h * 60 + m);
  }

  const hmWords = s.match(
    /^(\d+(?:\.\d+)?)\s*h(?:r|rs|our|ours)?\s*(\d+(?:\.\d+)?)\s*m(?:in|ins|inute|inutes)?$/i
  );
  if (hmWords) {
    const h = parseFloat(hmWords[1]);
    const m = parseFloat(hmWords[2]);
    return round2(h * 60 + m);
  }

  // ── hours only: 1h, 1.5h, 1 hr, 1 hour ───────────────────────────────────
  const hoursOnly = s.match(/^(\d+(?:\.\d+)?)\s*h(?:r|rs|our|ours)?$/i);
  if (hoursOnly) {
    return round2(parseFloat(hoursOnly[1]) * 60);
  }

  // ── minutes only: 25m, 25 min, 25 minutes ─────────────────────────────────
  const minutesOnly = s.match(/^(\d+(?:\.\d+)?)\s*m(?:in|ins|inute|inutes)?$/i);
  if (minutesOnly) {
    return round2(parseFloat(minutesOnly[1]));
  }

  // ── seconds: 90s, 90 sec, 90 seconds ──────────────────────────────────────
  const seconds = s.match(/^(\d+(?:\.\d+)?)\s*s(?:ec|ecs|econd|econds)?$/i);
  if (seconds) {
    return round2(parseFloat(seconds[1]) / 60);
  }

  // ── bare number — use defaultUnit ─────────────────────────────────────────
  const bare = s.match(/^(\d+(?:\.\d+)?)$/);
  if (bare) {
    const n = parseFloat(bare[1]);
    return round2(defaultUnit === "hours" ? n * 60 : n);
  }

  return null;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
