import {
  Entry,
  StudyEntry,
  HabitEntry,
  MoodEntry,
  StudyQueryFilter,
  HabitQueryFilter,
  MoodQueryFilter,
} from "./types";

export class EntryStore {
  private entries: Entry[] = [];

  // ── Write ──────────────────────────────────────────────────────────────────

  add(entry: Entry): void {
    this.entries.push(entry);
  }

  addMany(entries: Entry[]): void {
    for (const e of entries) this.entries.push(e);
  }

  /**
   * Replace all entries from a given source file.
   * Used by the incremental scanner to refresh a single file's entries.
   */
  replaceFromFile(filePath: string, incoming: Entry[]): void {
    this.entries = this.entries.filter((e) => e.source_file !== filePath);
    for (const e of incoming) this.entries.push(e);
  }

  clear(): void {
    this.entries = [];
  }

  // ── Read (all) ─────────────────────────────────────────────────────────────

  getAll(): Entry[] {
    return this.entries.slice();
  }

  get size(): number {
    return this.entries.length;
  }

  // ── Read (study) ───────────────────────────────────────────────────────────

  getStudySessions(filter: StudyQueryFilter = {}): StudyEntry[] {
    return this.entries.filter((e): e is StudyEntry => {
      if (e.type !== "study") return false;
      if (filter.tag && !e.tags.includes(filter.tag)) return false;
      if (filter.date_from && e.date < filter.date_from) return false;
      if (filter.date_to && e.date > filter.date_to) return false;
      return true;
    });
  }

  /** Total study minutes across all matching sessions. */
  getTotalMinutes(filter: StudyQueryFilter = {}): number {
    return this.getStudySessions(filter).reduce(
      (sum, e) => sum + e.duration_minutes,
      0
    );
  }

  /** All distinct tag names that appear in study entries. */
  getStudyTags(): string[] {
    const seen = new Set<string>();
    for (const e of this.entries) {
      if (e.type === "study") {
        for (const t of e.tags) seen.add(t);
      }
    }
    return Array.from(seen).sort();
  }

  // ── Read (habits) ──────────────────────────────────────────────────────────

  getHabitLogs(filter: HabitQueryFilter = {}): HabitEntry[] {
    return this.entries.filter((e): e is HabitEntry => {
      if (e.type !== "habit") return false;
      if (filter.habit_name && e.habit_name !== filter.habit_name) return false;
      if (filter.date_from && e.date < filter.date_from) return false;
      if (filter.date_to && e.date > filter.date_to) return false;
      return true;
    });
  }

  // ── Read (mood) ────────────────────────────────────────────────────────────

  getMoodEntries(filter: MoodQueryFilter = {}): MoodEntry[] {
    return this.entries.filter((e): e is MoodEntry => {
      if (e.type !== "mood") return false;
      if (filter.date_from && e.date < filter.date_from) return false;
      if (filter.date_to && e.date > filter.date_to) return false;
      return true;
    });
  }
}
