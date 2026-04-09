import { describe, it, expect, beforeEach } from "vitest";
import { EntryStore } from "../src/shared/data/EntryStore";
import { StudyEntry, HabitEntry, MoodEntry } from "../src/shared/data/types";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const study1: StudyEntry = {
  type: "study",
  date: "2026-04-01",
  duration_minutes: 30,
  tags: ["chemistry"],
  note: "ch4",
  source_file: "Daily/2026-04-01.md",
  source_line: 5,
};

const study2: StudyEntry = {
  type: "study",
  date: "2026-04-02",
  duration_minutes: 60,
  tags: ["math", "chemistry"],
  source_file: "Daily/2026-04-02.md",
  source_line: 3,
};

const study3: StudyEntry = {
  type: "study",
  date: "2026-04-03",
  duration_minutes: 45,
  tags: ["math"],
  source_file: "Daily/2026-04-03.md",
  source_line: 7,
};

const habit1: HabitEntry = {
  type: "habit",
  date: "2026-04-01",
  habit_name: "meditate",
  value: true,
  source_file: "Daily/2026-04-01.md",
  source_line: 10,
};

const habit2: HabitEntry = {
  type: "habit",
  date: "2026-04-02",
  habit_name: "water",
  value: 6,
  source_file: "Daily/2026-04-02.md",
  source_line: 8,
};

const mood1: MoodEntry = {
  type: "mood",
  date: "2026-04-01",
  value: "😊",
  source_file: "Daily/2026-04-01.md",
  source_line: 1,
};

const mood2: MoodEntry = {
  type: "mood",
  date: "2026-04-03",
  value: 4,
  source_file: "Daily/2026-04-03.md",
  source_line: 1,
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("EntryStore", () => {
  let store: EntryStore;

  beforeEach(() => {
    store = new EntryStore();
  });

  // ── Write ────────────────────────────────────────────────────────────────

  describe("add / addMany / clear", () => {
    it("starts empty", () => {
      expect(store.size).toBe(0);
      expect(store.getAll()).toEqual([]);
    });

    it("add() increments size", () => {
      store.add(study1);
      expect(store.size).toBe(1);
    });

    it("addMany() adds all entries", () => {
      store.addMany([study1, study2, habit1]);
      expect(store.size).toBe(3);
    });

    it("clear() removes everything", () => {
      store.addMany([study1, study2, habit1]);
      store.clear();
      expect(store.size).toBe(0);
    });

    it("getAll() returns a copy, not the internal array", () => {
      store.add(study1);
      const all = store.getAll();
      all.push(study2);
      expect(store.size).toBe(1); // internal array unchanged
    });
  });

  // ── replaceFromFile ───────────────────────────────────────────────────────

  describe("replaceFromFile()", () => {
    it("replaces entries from the given file", () => {
      store.addMany([study1, study2]); // study1 is from 2026-04-01.md
      const updated: StudyEntry = { ...study1, duration_minutes: 99 };
      store.replaceFromFile("Daily/2026-04-01.md", [updated]);
      const sessions = store.getStudySessions();
      expect(sessions).toHaveLength(2);
      const replaced = sessions.find((s) => s.source_file === "Daily/2026-04-01.md");
      expect(replaced?.duration_minutes).toBe(99);
    });

    it("removes all entries from a file when incoming is empty", () => {
      store.addMany([study1, study2]);
      store.replaceFromFile("Daily/2026-04-01.md", []);
      expect(store.size).toBe(1);
    });
  });

  // ── Study queries ─────────────────────────────────────────────────────────

  describe("getStudySessions()", () => {
    beforeEach(() => {
      store.addMany([study1, study2, study3, habit1, mood1]);
    });

    it("returns only study entries", () => {
      expect(store.getStudySessions()).toHaveLength(3);
    });

    it("filters by tag", () => {
      const chem = store.getStudySessions({ tag: "chemistry" });
      expect(chem).toHaveLength(2);
      expect(chem.every((e) => e.tags.includes("chemistry"))).toBe(true);
    });

    it("filters by date_from (inclusive)", () => {
      const result = store.getStudySessions({ date_from: "2026-04-02" });
      expect(result).toHaveLength(2);
      expect(result.every((e) => e.date >= "2026-04-02")).toBe(true);
    });

    it("filters by date_to (inclusive)", () => {
      const result = store.getStudySessions({ date_to: "2026-04-02" });
      expect(result).toHaveLength(2);
      expect(result.every((e) => e.date <= "2026-04-02")).toBe(true);
    });

    it("filters by date range", () => {
      const result = store.getStudySessions({
        date_from: "2026-04-02",
        date_to: "2026-04-02",
      });
      expect(result).toHaveLength(1);
      expect(result[0].date).toBe("2026-04-02");
    });

    it("filters by tag + date range combined", () => {
      const result = store.getStudySessions({
        tag: "math",
        date_from: "2026-04-02",
        date_to: "2026-04-03",
      });
      expect(result).toHaveLength(2);
    });

    it("returns empty array when no match", () => {
      expect(store.getStudySessions({ tag: "nonexistent" })).toHaveLength(0);
    });
  });

  // ── getTotalMinutes ────────────────────────────────────────────────────────

  describe("getTotalMinutes()", () => {
    beforeEach(() => store.addMany([study1, study2, study3]));

    it("sums all session durations", () => {
      expect(store.getTotalMinutes()).toBe(135); // 30 + 60 + 45
    });

    it("sums filtered by tag", () => {
      expect(store.getTotalMinutes({ tag: "math" })).toBe(105); // 60 + 45
    });

    it("returns 0 for empty store", () => {
      store.clear();
      expect(store.getTotalMinutes()).toBe(0);
    });
  });

  // ── getStudyTags ──────────────────────────────────────────────────────────

  describe("getStudyTags()", () => {
    it("returns unique sorted tags", () => {
      store.addMany([study1, study2, study3]);
      expect(store.getStudyTags()).toEqual(["chemistry", "math"]);
    });

    it("returns empty array when no study entries", () => {
      store.add(habit1);
      expect(store.getStudyTags()).toEqual([]);
    });
  });

  // ── Habit queries ─────────────────────────────────────────────────────────

  describe("getHabitLogs()", () => {
    beforeEach(() => store.addMany([study1, habit1, habit2, mood1]));

    it("returns only habit entries", () => {
      expect(store.getHabitLogs()).toHaveLength(2);
    });

    it("filters by habit_name", () => {
      const result = store.getHabitLogs({ habit_name: "water" });
      expect(result).toHaveLength(1);
      expect(result[0].value).toBe(6);
    });

    it("returns binary habit with boolean value", () => {
      const result = store.getHabitLogs({ habit_name: "meditate" });
      expect(result[0].value).toBe(true);
    });

    it("filters by date range", () => {
      const result = store.getHabitLogs({ date_from: "2026-04-02" });
      expect(result).toHaveLength(1);
      expect(result[0].habit_name).toBe("water");
    });
  });

  // ── Mood queries ──────────────────────────────────────────────────────────

  describe("getMoodEntries()", () => {
    beforeEach(() => store.addMany([study1, habit1, mood1, mood2]));

    it("returns only mood entries", () => {
      expect(store.getMoodEntries()).toHaveLength(2);
    });

    it("supports emoji values", () => {
      const result = store.getMoodEntries({ date_from: "2026-04-01", date_to: "2026-04-01" });
      expect(result[0].value).toBe("😊");
    });

    it("supports numeric values", () => {
      const result = store.getMoodEntries({ date_from: "2026-04-03" });
      expect(result[0].value).toBe(4);
    });

    it("filters by date range", () => {
      const result = store.getMoodEntries({ date_to: "2026-04-02" });
      expect(result).toHaveLength(1);
    });
  });
});
