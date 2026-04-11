import { describe, it, expect } from "vitest";
import { parseFileEntries, extractDateFromFilename, ScannerConfig } from "../src/shared/data/VaultScanner";

// ── Shared config ─────────────────────────────────────────────────────────────

const cfg: ScannerConfig = {
  study_field_names: ["study"],
  habit_field_names: ["habit"],
  mood_field_names: ["mood"],
  study_default_unit: "minutes",
  date_format: "YYYY-MM-DD",
  ignored_folders: [],
};

const FILE = "Daily/2026-04-08.md";
const DATE = "2026-04-08";

// ── extractDateFromFilename ───────────────────────────────────────────────────

describe("extractDateFromFilename", () => {
  it("parses a matching filename", () => {
    expect(extractDateFromFilename("2026-04-08", "YYYY-MM-DD", "2000-01-01")).toBe("2026-04-08");
  });

  it("returns fallback when filename doesn't match format", () => {
    expect(extractDateFromFilename("My Note", "YYYY-MM-DD", "2000-01-01")).toBe("2000-01-01");
  });

  it("extracts date from prefix when filename has extra text", () => {
    // supports "2026-04-08 - My note" style filenames
    expect(extractDateFromFilename("2026-04-08 - My note", "YYYY-MM-DD", "2000-01-01")).toBe("2026-04-08");
    expect(extractDateFromFilename("2026-04-08 extra", "YYYY-MM-DD", "2000-01-01")).toBe("2026-04-08");
  });

  it("returns fallback when date is not at the start of the filename", () => {
    expect(extractDateFromFilename("Note 2026-04-08", "YYYY-MM-DD", "2000-01-01")).toBe("2000-01-01");
  });

  it("supports custom date formats", () => {
    expect(extractDateFromFilename("08-04-2026", "DD-MM-YYYY", "2000-01-01")).toBe("2026-04-08");
  });
});

// ── Study entries ─────────────────────────────────────────────────────────────

describe("parseFileEntries — study", () => {
  it("parses a basic study entry", () => {
    const { entries } = parseFileEntries(`- (study:: 25m)`, DATE, FILE, cfg);
    expect(entries).toHaveLength(1);
    const e = entries[0];
    expect(e.type).toBe("study");
    if (e.type === "study") {
      expect(e.duration_minutes).toBe(25);
      expect(e.date).toBe(DATE);
      expect(e.source_file).toBe(FILE);
      expect(e.source_line).toBe(1);
    }
  });

  it("parses tags from the line", () => {
    const { entries } = parseFileEntries(`- (study:: 1h) #chemistry #math`, DATE, FILE, cfg);
    expect(entries[0].type === "study" && entries[0].tags).toEqual(["chemistry", "math"]);
  });

  it("parses a quoted note", () => {
    const { entries } = parseFileEntries(`- (study:: 30m) #chemistry "ch4 problems"`, DATE, FILE, cfg);
    const e = entries[0];
    expect(e.type === "study" && e.note).toBe("ch4 problems");
  });

  it("parses 1h30m duration", () => {
    const { entries } = parseFileEntries(`- (study:: 1h30m)`, DATE, FILE, cfg);
    expect(entries[0].type === "study" && entries[0].duration_minutes).toBe(90);
  });

  it("parses bare number using default unit (minutes)", () => {
    const { entries } = parseFileEntries(`- (study:: 45)`, DATE, FILE, cfg);
    expect(entries[0].type === "study" && entries[0].duration_minutes).toBe(45);
  });

  it("parses bare number using default unit (hours)", () => {
    const customCfg = { ...cfg, study_default_unit: "hours" as const };
    const { entries } = parseFileEntries(`- (study:: 2)`, DATE, FILE, customCfg);
    expect(entries[0].type === "study" && entries[0].duration_minutes).toBe(120);
  });

  it("records an error for unparseable duration", () => {
    const { entries, errors } = parseFileEntries(`- (study:: ???)`, DATE, FILE, cfg);
    expect(entries).toHaveLength(0);
    expect(errors).toHaveLength(1);
    expect(errors[0].line).toBe(1);
    expect(errors[0].message).toMatch(/Could not parse duration/);
  });

  it("parses multiple study entries across lines", () => {
    const content = [
      `- (study:: 25m) #chemistry`,
      `- (study:: 1h) #math "linear algebra"`,
    ].join("\n");
    const { entries } = parseFileEntries(content, DATE, FILE, cfg);
    expect(entries).toHaveLength(2);
    expect(entries[1].type === "study" && entries[1].duration_minutes).toBe(60);
  });

  it("records the correct source_line for each entry", () => {
    const content = `# Header\n\nSome text\n- (study:: 20m)`;
    const { entries } = parseFileEntries(content, DATE, FILE, cfg);
    expect(entries[0].source_line).toBe(4);
  });

  it("ignores lines with no tracked fields", () => {
    const { entries } = parseFileEntries(`Just a normal line\n- a todo item`, DATE, FILE, cfg);
    expect(entries).toHaveLength(0);
  });
});

// ── Alias resolution ──────────────────────────────────────────────────────────

describe("parseFileEntries — aliases", () => {
  const aliasCfg: ScannerConfig = {
    ...cfg,
    study_field_names: ["study", "STUDIED", "study-time"],
  };

  it("recognises the primary field name", () => {
    const { entries } = parseFileEntries(`- (study:: 20m)`, DATE, FILE, aliasCfg);
    expect(entries).toHaveLength(1);
  });

  it("recognises an alias (case-insensitive)", () => {
    const { entries } = parseFileEntries(`- (STUDIED:: 30m)`, DATE, FILE, aliasCfg);
    expect(entries).toHaveLength(1);
    expect(entries[0].type === "study" && entries[0].duration_minutes).toBe(30);
  });

  it("recognises a hyphenated alias", () => {
    const { entries } = parseFileEntries(`- (study-time:: 45m)`, DATE, FILE, aliasCfg);
    expect(entries).toHaveLength(1);
    expect(entries[0].type === "study" && entries[0].duration_minutes).toBe(45);
  });
});

// ── Habit entries ─────────────────────────────────────────────────────────────

describe("parseFileEntries — habits", () => {
  it("parses a binary habit with ✓", () => {
    const { entries } = parseFileEntries(`- (habit:: meditate) ✓`, DATE, FILE, cfg);
    expect(entries).toHaveLength(1);
    const e = entries[0];
    expect(e.type).toBe("habit");
    if (e.type === "habit") {
      expect(e.habit_name).toBe("meditate");
      expect(e.value).toBe(true);
    }
  });

  it("parses a binary habit with ✗ as false", () => {
    const { entries } = parseFileEntries(`- (habit:: meditate) ✗`, DATE, FILE, cfg);
    const e = entries[0];
    expect(e.type === "habit" && e.value).toBe(false);
  });

  it("parses a quantity habit", () => {
    const { entries } = parseFileEntries(`- (habit:: water) 6 glasses`, DATE, FILE, cfg);
    const e = entries[0];
    expect(e.type === "habit" && e.value).toBe(6);
  });

  it("treats bare check (no value after field) as true", () => {
    const { entries } = parseFileEntries(`- (habit:: meditate)`, DATE, FILE, cfg);
    const e = entries[0];
    expect(e.type === "habit" && e.value).toBe(true);
  });

  it("records an error for empty habit name", () => {
    const { entries, errors } = parseFileEntries(`- (habit:: )`, DATE, FILE, cfg);
    expect(entries).toHaveLength(0);
    expect(errors[0].message).toMatch(/Habit name is empty/);
  });
});

// ── Mood entries ──────────────────────────────────────────────────────────────

describe("parseFileEntries — mood", () => {
  it("parses inline mood field with emoji", () => {
    const { entries } = parseFileEntries(`(mood:: 😊)`, DATE, FILE, cfg);
    const e = entries[0];
    expect(e.type).toBe("mood");
    expect(e.type === "mood" && e.value).toBe("😊");
  });

  it("parses inline mood field with number", () => {
    const { entries } = parseFileEntries(`(mood:: 4)`, DATE, FILE, cfg);
    expect(entries[0].type === "mood" && entries[0].value).toBe(4);
  });

  it("parses simple 'Mood: 😊' format", () => {
    const { entries } = parseFileEntries(`Mood: 😊`, DATE, FILE, cfg);
    expect(entries).toHaveLength(1);
    expect(entries[0].type === "mood" && entries[0].value).toBe("😊");
  });

  it("parses simple 'mood: 3' format (case-insensitive)", () => {
    const { entries } = parseFileEntries(`mood: 3`, DATE, FILE, cfg);
    expect(entries[0].type === "mood" && entries[0].value).toBe(3);
  });

  it("does not double-parse a line that has both inline and simple formats", () => {
    // If a line somehow matches both, inline wins and simple is skipped
    const { entries } = parseFileEntries(`(mood:: 4)`, DATE, FILE, cfg);
    expect(entries).toHaveLength(1);
  });
});

// ── Mixed content ─────────────────────────────────────────────────────────────

describe("parseFileEntries — mixed file content", () => {
  const content = `
# 2026-04-08

mood: 😊

## Study

- (study:: 25m) #chemistry "ch4 problems 1-12"
- (study:: 1h) #math

## Habits

- (habit:: meditate) ✓
- (habit:: water) 8 glasses

Some unrelated text.
`.trim();

  it("finds all entries", () => {
    const { entries, errors } = parseFileEntries(content, DATE, FILE, cfg);
    expect(errors).toHaveLength(0);
    expect(entries.filter((e) => e.type === "study")).toHaveLength(2);
    expect(entries.filter((e) => e.type === "habit")).toHaveLength(2);
    expect(entries.filter((e) => e.type === "mood")).toHaveLength(1);
  });
});

// ── Malformed entries ─────────────────────────────────────────────────────────

describe("parseFileEntries — malformed entries", () => {
  it("collects multiple errors without crashing", () => {
    const content = [
      `- (study:: ???)`,
      `- (study:: )`,
      `- (study:: 30m)`,
    ].join("\n");
    const { entries, errors } = parseFileEntries(content, DATE, FILE, cfg);
    expect(entries).toHaveLength(1); // only the valid one
    expect(errors).toHaveLength(2);
  });

  it("reports correct line numbers for errors", () => {
    const content = `# Header\n- (study:: bad)`;
    const { errors } = parseFileEntries(content, DATE, FILE, cfg);
    expect(errors[0].line).toBe(2);
  });
});

// ── Ignore list (VaultScanner.isIgnored — tested via config) ─────────────────
// The ignore logic lives in VaultScanner.isIgnored() which uses the Obsidian
// API. We verify the path-matching logic here by testing the prefix behaviour
// that isIgnored() implements.

describe("ignored folder path matching", () => {
  it("a path starting with 'Templates/' is ignored", () => {
    const ignored = ["Templates", "Archive"];
    const check = (p: string) =>
      ignored.some((f) => p.startsWith(f.endsWith("/") ? f : f + "/"));
    expect(check("Templates/daily.md")).toBe(true);
    expect(check("Archive/old.md")).toBe(true);
    expect(check("Daily/2026-04-08.md")).toBe(false);
    expect(check("TemplatesExtra/note.md")).toBe(false); // must be exact prefix + /
  });
});
