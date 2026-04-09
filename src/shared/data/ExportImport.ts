import { App, Notice } from "obsidian";
import dayjs from "dayjs";
import { EntryStore } from "./EntryStore";
import { StudyEntry } from "./types";
import { PluginSettings } from "../../settings/types";
import { SessionWriter } from "../../study/SessionWriter";

// ── CSV ───────────────────────────────────────────────────────────────────────

function csvEscape(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function buildStudyCsv(sessions: StudyEntry[]): string {
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

// ── JSON ──────────────────────────────────────────────────────────────────────

interface ExportPayload {
  version: 1;
  exported_at: string;
  study_sessions: Array<{
    date: string;
    duration_minutes: number;
    tags: string[];
    note?: string;
  }>;
}

function buildJson(sessions: StudyEntry[]): string {
  const payload: ExportPayload = {
    version: 1,
    exported_at: new Date().toISOString(),
    study_sessions: sessions.map((s) => ({
      date: s.date,
      duration_minutes: s.duration_minutes,
      tags: s.tags,
      ...(s.note ? { note: s.note } : {}),
    })),
  };
  return JSON.stringify(payload, null, 2);
}

// ── Download helper ───────────────────────────────────────────────────────────

function triggerDownload(content: string, filename: string, mime: string): void {
  const blob = new Blob([content], { type: mime });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ── Parse CSV ─────────────────────────────────────────────────────────────────

interface ParsedRow {
  date: string;
  duration_minutes: number;
  tags: string[];
  note?: string;
}

function parseCsvRow(line: string): ParsedRow | null {
  // Simple split — handles quoted fields (no embedded newlines)
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
  if (!dayjs(date, "YYYY-MM-DD", true).isValid()) return null;

  const duration_minutes = parseFloat(durRaw.trim());
  if (isNaN(duration_minutes) || duration_minutes <= 0) return null;

  const tags = (tagsRaw ?? "").trim()
    ? (tagsRaw ?? "").trim().split(/\s+/).filter(Boolean)
    : [];
  const note = (noteRaw ?? "").trim() || undefined;

  return { date, duration_minutes, tags, note };
}

// ── Public API ────────────────────────────────────────────────────────────────

export function exportCsv(store: EntryStore): void {
  const sessions = store.getStudySessions()
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const filename = `study-sessions-${dayjs().format("YYYY-MM-DD")}.csv`;
  triggerDownload(buildStudyCsv(sessions), filename, "text/csv");
  new Notice(`Exported ${sessions.length} session(s) to ${filename}`);
}

export function exportJson(store: EntryStore): void {
  const sessions = store.getStudySessions()
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const filename = `study-sessions-${dayjs().format("YYYY-MM-DD")}.json`;
  triggerDownload(buildJson(sessions), filename, "application/json");
  new Notice(`Exported ${sessions.length} session(s) to ${filename}`);
}

export async function importFile(
  app: App,
  settings: PluginSettings,
  onComplete: () => void,
): Promise<void> {
  const input = document.createElement("input");
  input.type   = "file";
  input.accept = ".csv,.json";

  input.onchange = async () => {
    const file = input.files?.[0];
    if (!file) return;

    let text: string;
    try {
      text = await file.text();
    } catch {
      new Notice("Tracker: could not read the selected file.");
      return;
    }

    let rows: ParsedRow[];
    try {
      rows = file.name.endsWith(".json")
        ? parseJsonRows(text)
        : parseCsvRows(text);
    } catch (err) {
      new Notice(`Tracker: failed to parse file — ${(err as Error).message}`);
      return;
    }

    if (rows.length === 0) {
      new Notice("Tracker: no valid sessions found in file.");
      return;
    }

    const writer = new SessionWriter(app, settings);
    let ok = 0;
    let fail = 0;

    for (const row of rows) {
      try {
        await writer.write(row);
        ok++;
      } catch {
        fail++;
      }
    }

    new Notice(
      fail > 0
        ? `Tracker: imported ${ok} session(s), ${fail} failed.`
        : `Tracker: imported ${ok} session(s).`
    );

    onComplete();
  };

  document.body.appendChild(input);
  input.click();
  document.body.removeChild(input);
}

// ── Parse helpers ─────────────────────────────────────────────────────────────

function parseCsvRows(text: string): ParsedRow[] {
  const lines = text.split(/\r?\n/).filter(Boolean);
  if (lines.length === 0) throw new Error("empty file");

  // Skip header row
  const start = lines[0].startsWith("date") ? 1 : 0;
  const rows: ParsedRow[] = [];
  for (let i = start; i < lines.length; i++) {
    const row = parseCsvRow(lines[i]);
    if (row) rows.push(row);
  }
  return rows;
}

function parseJsonRows(text: string): ParsedRow[] {
  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new Error("invalid JSON");
  }

  if (
    typeof payload !== "object" ||
    payload === null ||
    !Array.isArray((payload as ExportPayload).study_sessions)
  ) {
    throw new Error('expected object with "study_sessions" array');
  }

  const sessions = (payload as ExportPayload).study_sessions;
  const rows: ParsedRow[] = [];
  for (const s of sessions) {
    if (!s.date || typeof s.duration_minutes !== "number") continue;
    if (!dayjs(s.date, "YYYY-MM-DD", true).isValid()) continue;
    rows.push({
      date: s.date,
      duration_minutes: s.duration_minutes,
      tags: Array.isArray(s.tags) ? s.tags : [],
      note: typeof s.note === "string" ? s.note : undefined,
    });
  }
  return rows;
}
