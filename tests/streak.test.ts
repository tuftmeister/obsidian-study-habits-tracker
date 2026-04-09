import { describe, it, expect } from "vitest";
import { calculateStreak } from "../src/shared/utils/time";
import { StudyEntry } from "../src/shared/data/types";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeEntries(dates: string[]): StudyEntry[] {
  return dates.map((date) => ({
    type: "study" as const,
    date,
    duration_minutes: 30,
    tags: [],
    source_file: "Daily/" + date + ".md",
    source_line: 1,
  }));
}

const TODAY = "2026-04-08";

// ── No grace period ───────────────────────────────────────────────────────────

describe("calculateStreak — no grace period", () => {
  it("returns 0 when there are no entries", () => {
    expect(calculateStreak([], TODAY, 0)).toBe(0);
  });

  it("returns 1 when only today has an entry", () => {
    expect(calculateStreak(makeEntries([TODAY]), TODAY, 0)).toBe(1);
  });

  it("counts consecutive days ending today", () => {
    const entries = makeEntries(["2026-04-06", "2026-04-07", TODAY]);
    expect(calculateStreak(entries, TODAY, 0)).toBe(3);
  });

  it("stops at the first gap", () => {
    // Apr 5 missing — streak is 3 (Apr 6, 7, 8)
    const entries = makeEntries(["2026-04-04", "2026-04-06", "2026-04-07", TODAY]);
    expect(calculateStreak(entries, TODAY, 0)).toBe(3);
  });

  it("streak is still alive when today has no entry yet (counts from yesterday)", () => {
    // Today (Apr 8) has no entry — look backwards from Apr 7
    const entries = makeEntries(["2026-04-06", "2026-04-07"]);
    expect(calculateStreak(entries, TODAY, 0)).toBe(2);
  });

  it("returns 0 if most recent entry was 2+ days ago (no grace)", () => {
    const entries = makeEntries(["2026-04-06"]); // Apr 7 and today both missing
    expect(calculateStreak(entries, TODAY, 0)).toBe(0);
  });

  it("returns 0 when all entries are far in the past", () => {
    const entries = makeEntries(["2026-01-01", "2026-01-02"]);
    expect(calculateStreak(entries, TODAY, 0)).toBe(0);
  });

  it("handles a single very long streak", () => {
    const dates: string[] = [];
    for (let i = 0; i < 30; i++) {
      dates.push(dayjs(TODAY).subtract(i, "day").format("YYYY-MM-DD"));
    }
    const entries = makeEntries(dates);
    expect(calculateStreak(entries, TODAY, 0)).toBe(30);
  });
});

// ── Grace period ──────────────────────────────────────────────────────────────

describe("calculateStreak — with grace period", () => {
  it("grace period 1: one missed day does not break streak", () => {
    // Apr 6 missing, streak goes through
    const entries = makeEntries(["2026-04-05", "2026-04-07", TODAY]);
    expect(calculateStreak(entries, TODAY, 1)).toBe(3);
  });

  it("grace period 1: two consecutive missed days break streak", () => {
    // Apr 5 and Apr 6 both missing
    const entries = makeEntries(["2026-04-04", "2026-04-07", TODAY]);
    expect(calculateStreak(entries, TODAY, 1)).toBe(2); // only Apr 7 + Apr 8
  });

  it("grace period 2: two missed days do not break streak", () => {
    const entries = makeEntries(["2026-04-05", TODAY]); // Apr 6 & 7 missing
    expect(calculateStreak(entries, TODAY, 2)).toBe(2);
  });

  it("grace period 2: three consecutive missed days break streak", () => {
    // Apr 4, 5, 6 all missing
    const entries = makeEntries(["2026-04-03", TODAY]);
    expect(calculateStreak(entries, TODAY, 2)).toBe(1); // only today
  });

  it("missed days are not counted in the streak total", () => {
    // Apr 5 missing (grace), Apr 6-8 present
    const entries = makeEntries(["2026-04-04", "2026-04-06", "2026-04-07", TODAY]);
    // Streak count = 4 study days (Apr 4, 6, 7, 8) — not 5 calendar days
    expect(calculateStreak(entries, TODAY, 1)).toBe(4);
  });

  it("today missing with grace 1: streak still alive from day before yesterday", () => {
    const entries = makeEntries(["2026-04-06", "2026-04-07"]); // today missing
    // today not studied → starts from Apr 7. Apr 7 ok, Apr 6 ok → streak=2
    expect(calculateStreak(entries, TODAY, 1)).toBe(2);
  });
});

// ── Edge cases ────────────────────────────────────────────────────────────────

describe("calculateStreak — edge cases", () => {
  it("duplicate entries on same day count as one study day", () => {
    const entries = [
      ...makeEntries([TODAY]),
      ...makeEntries([TODAY]), // duplicate
    ];
    expect(calculateStreak(entries, TODAY, 0)).toBe(1);
  });

  it("multiple entries on same day don't inflate streak", () => {
    const entries = makeEntries([TODAY, TODAY, "2026-04-07", "2026-04-07"]);
    expect(calculateStreak(entries, TODAY, 0)).toBe(2);
  });
});

// ── Import dayjs (used in test helpers above) ─────────────────────────────────
import dayjs from "dayjs";
