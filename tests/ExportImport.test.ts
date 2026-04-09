import { describe, it, expect } from "vitest";

// Pull out the pure parsing helpers via dynamic evaluation of the module's
// internals.  Since ExportImport exports only the public API (which requires
// App/Obsidian), we re-implement the two tiny pure parsers here and test the
// round-trip CSV/JSON formats instead.

// ── Helpers copied from ExportImport.ts (pure, no Obsidian deps) ──────────────

function csvEscape(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

interface ParsedRow {
  date: string;
  duration_minutes: number;
  tags: string[];
  note?: string;
}

function parseCsvRow(line: string): ParsedRow | null {
  const fields: string[] = [];
  let inQuote = false;
  let cur = "";
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuote && line[i + 1] === '"') { cur += '"'; i++; }
      else { inQuote = !inQuote; }
    } else if (ch === "," && !inQuote) {
      fields.push(cur); cur = "";
    } else {
      cur += ch;
    }
  }
  fields.push(cur);

  const [dateRaw, durRaw, tagsRaw, noteRaw] = fields;
  if (!dateRaw || !durRaw) return null;

  const date = dateRaw.trim();
  // simple date check
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;

  const duration_minutes = parseFloat(durRaw.trim());
  if (isNaN(duration_minutes) || duration_minutes <= 0) return null;

  const tags = (tagsRaw ?? "").trim()
    ? (tagsRaw ?? "").trim().split(/\s+/).filter(Boolean)
    : [];
  const note = (noteRaw ?? "").trim() || undefined;

  return { date, duration_minutes, tags, note };
}

function parseCsvRows(text: string): ParsedRow[] {
  const lines = text.split(/\r?\n/).filter(Boolean);
  if (lines.length === 0) return [];
  const start = lines[0].startsWith("date") ? 1 : 0;
  const rows: ParsedRow[] = [];
  for (let i = start; i < lines.length; i++) {
    const row = parseCsvRow(lines[i]);
    if (row) rows.push(row);
  }
  return rows;
}

function buildStudyCsv(sessions: ParsedRow[]): string {
  const header = "date,duration_minutes,tags,note";
  const rows = sessions.map((s) =>
    [
      s.date,
      String(s.duration_minutes),
      csvEscape(s.tags.join(" ")),
      csvEscape(s.note ?? ""),
    ].join(",")
  );
  return [header, ...rows].join("\n");
}

function parseJsonRows(text: string): ParsedRow[] {
  const payload = JSON.parse(text) as { study_sessions?: unknown[] };
  if (!Array.isArray(payload.study_sessions)) {
    throw new Error("expected study_sessions array");
  }
  const rows: ParsedRow[] = [];
  for (const s of payload.study_sessions as Record<string, unknown>[]) {
    if (!s.date || typeof s.duration_minutes !== "number") continue;
    rows.push({
      date: s.date as string,
      duration_minutes: s.duration_minutes,
      tags: Array.isArray(s.tags) ? (s.tags as string[]) : [],
      note: typeof s.note === "string" ? s.note : undefined,
    });
  }
  return rows;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("csvEscape", () => {
  it("passes through plain strings", () => {
    expect(csvEscape("hello")).toBe("hello");
  });
  it("wraps strings containing commas", () => {
    expect(csvEscape("a,b")).toBe('"a,b"');
  });
  it("escapes embedded double quotes", () => {
    expect(csvEscape('say "hi"')).toBe('"say ""hi"""');
  });
});

describe("parseCsvRow", () => {
  it("parses a basic row", () => {
    const row = parseCsvRow("2026-01-01,25,math,solved problems");
    expect(row).toEqual({ date: "2026-01-01", duration_minutes: 25, tags: ["math"], note: "solved problems" });
  });

  it("parses row with no tags or note", () => {
    const row = parseCsvRow("2026-01-02,60,,");
    expect(row).toEqual({ date: "2026-01-02", duration_minutes: 60, tags: [] });
    expect(row?.note).toBeUndefined();
  });

  it("parses multiple tags separated by space", () => {
    const row = parseCsvRow("2026-01-03,30,math physics,");
    expect(row?.tags).toEqual(["math", "physics"]);
  });

  it("handles quoted note with comma", () => {
    const row = parseCsvRow('2026-01-04,45,math,"read chapter 1, 2"');
    expect(row?.note).toBe("read chapter 1, 2");
  });

  it("returns null for invalid date", () => {
    expect(parseCsvRow("not-a-date,25,math,note")).toBeNull();
  });

  it("returns null for zero duration", () => {
    expect(parseCsvRow("2026-01-01,0,math,note")).toBeNull();
  });

  it("returns null for negative duration", () => {
    expect(parseCsvRow("2026-01-01,-5,math,note")).toBeNull();
  });
});

describe("CSV round-trip", () => {
  const sessions: ParsedRow[] = [
    { date: "2026-01-01", duration_minutes: 25, tags: ["math"], note: "trig" },
    { date: "2026-01-02", duration_minutes: 60, tags: [], note: undefined },
    { date: "2026-01-03", duration_minutes: 90, tags: ["math", "physics"], note: 'note with "quotes"' },
  ];

  it("round-trips through CSV", () => {
    const csv = buildStudyCsv(sessions);
    const parsed = parseCsvRows(csv);
    expect(parsed).toHaveLength(3);
    expect(parsed[0]).toEqual(sessions[0]);
    expect(parsed[1].tags).toEqual([]);
    expect(parsed[1].note).toBeUndefined();
    expect(parsed[2].tags).toEqual(["math", "physics"]);
    expect(parsed[2].note).toBe('note with "quotes"');
  });

  it("skips header row", () => {
    const csv = buildStudyCsv(sessions);
    expect(csv.split("\n")[0]).toBe("date,duration_minutes,tags,note");
    const rows = parseCsvRows(csv);
    expect(rows).toHaveLength(sessions.length);
  });

  it("handles CRLF line endings", () => {
    const csv = buildStudyCsv(sessions).replace(/\n/g, "\r\n");
    const rows = parseCsvRows(csv);
    expect(rows).toHaveLength(sessions.length);
  });
});

describe("parseJsonRows", () => {
  it("parses valid export JSON", () => {
    const payload = JSON.stringify({
      version: 1,
      exported_at: "2026-01-01T00:00:00.000Z",
      study_sessions: [
        { date: "2026-01-01", duration_minutes: 25, tags: ["math"], note: "trig" },
        { date: "2026-01-02", duration_minutes: 60, tags: [] },
      ],
    });
    const rows = parseJsonRows(payload);
    expect(rows).toHaveLength(2);
    expect(rows[0].note).toBe("trig");
    expect(rows[1].note).toBeUndefined();
  });

  it("skips rows with missing required fields", () => {
    const payload = JSON.stringify({
      study_sessions: [
        { date: "2026-01-01" },            // missing duration_minutes
        { duration_minutes: 25 },           // missing date
        { date: "2026-01-03", duration_minutes: 30, tags: ["ok"] },
      ],
    });
    const rows = parseJsonRows(payload);
    expect(rows).toHaveLength(1);
    expect(rows[0].date).toBe("2026-01-03");
  });

  it("throws on invalid JSON", () => {
    expect(() => parseJsonRows("not json")).toThrow();
  });

  it("throws when study_sessions is missing", () => {
    expect(() => parseJsonRows('{"version":1}')).toThrow("expected study_sessions array");
  });
});
