import dayjs from "dayjs";
import { StudyEntry } from "../data/types";

// ── Streak ────────────────────────────────────────────────────────────────────

/**
 * Count the current study streak (consecutive study days) going backwards
 * from `today`.
 *
 * - If today has no entries the streak is still "alive" (user hasn't missed
 *   today yet) — we start counting from yesterday.
 * - `gracePeriod` is the max number of consecutive missed days that don't
 *   break the streak (default 0 = must study every day).
 * - Returns the number of STUDY days in the streak (missed grace days are not
 *   counted).
 */
export function calculateStreak(
  entries: StudyEntry[],
  today: string,   // "YYYY-MM-DD"
  gracePeriod = 0
): number {
  const studyDates = new Set(entries.map((e) => e.date));

  // If today has no study, back up one day (today is still "open")
  const startDate = studyDates.has(today)
    ? dayjs(today)
    : dayjs(today).subtract(1, "day");

  let streak = 0;
  let consecutiveMissed = 0;
  let cursor = startDate;
  const limit = dayjs(today);

  for (let i = 0; i < 3650; i++) {
    const dateStr = cursor.format("YYYY-MM-DD");

    if (studyDates.has(dateStr)) {
      streak++;
      consecutiveMissed = 0;
    } else {
      consecutiveMissed++;
      if (consecutiveMissed > gracePeriod) break;
    }

    cursor = cursor.subtract(1, "day");
    if (limit.diff(cursor, "day") > 3650) break;
  }

  return streak;
}

// ── Time formatting ───────────────────────────────────────────────────────────

export function fmtMinutes(totalMinutes: number): string {
  if (totalMinutes <= 0) return "0m";
  const h = Math.floor(totalMinutes / 60);
  const m = Math.round(totalMinutes % 60);
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  return `${m}m`;
}

// ── Week helpers ──────────────────────────────────────────────────────────────

/** ISO "YYYY-MM-DD" for Monday of the week containing `date`. */
export function mondayOf(date: string): string {
  const d = dayjs(date);
  const dow = d.day(); // 0=Sun … 6=Sat
  const toMonday = dow === 0 ? 6 : dow - 1;
  return d.subtract(toMonday, "day").format("YYYY-MM-DD");
}

/** ISO "YYYY-MM-DD" for Sunday of the week containing `date`. */
export function sundayOf(date: string): string {
  return dayjs(mondayOf(date)).add(6, "day").format("YYYY-MM-DD");
}
