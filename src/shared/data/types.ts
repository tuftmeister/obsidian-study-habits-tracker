// ── Shared base ──────────────────────────────────────────────────────────────

interface BaseEntry {
  /** ISO date string: "2026-04-08" */
  date: string;
  source_file: string;
  source_line: number;
}

// ── Study ────────────────────────────────────────────────────────────────────

export interface StudyEntry extends BaseEntry {
  type: "study";
  duration_minutes: number;
  tags: string[];
  note?: string;
}

// ── Habit ────────────────────────────────────────────────────────────────────

export interface HabitEntry extends BaseEntry {
  type: "habit";
  habit_name: string;
  /** true/false for binary habits; a number for quantity habits */
  value: boolean | number;
}

// ── Mood ─────────────────────────────────────────────────────────────────────

export interface MoodEntry extends BaseEntry {
  type: "mood";
  /** Emoji string ("😊") or numeric value (1-10) */
  value: string | number;
}

// ── Union ────────────────────────────────────────────────────────────────────

export type Entry = StudyEntry | HabitEntry | MoodEntry;

// ── Query filters ────────────────────────────────────────────────────────────

export interface StudyQueryFilter {
  tag?: string;
  /** ISO date string, inclusive */
  date_from?: string;
  /** ISO date string, inclusive */
  date_to?: string;
}

export interface HabitQueryFilter {
  habit_name?: string;
  date_from?: string;
  date_to?: string;
}

export interface MoodQueryFilter {
  date_from?: string;
  date_to?: string;
}
