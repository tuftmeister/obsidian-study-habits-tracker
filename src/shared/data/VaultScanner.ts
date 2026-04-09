import { TFile, Vault } from "obsidian";
import dayjs from "dayjs";
import customParseFormat from "dayjs/plugin/customParseFormat";
import { Entry, StudyEntry, HabitEntry, MoodEntry } from "./types";
import { EntryStore } from "./EntryStore";
import { parseDuration } from "./FieldParser";

dayjs.extend(customParseFormat);

// ── Config ────────────────────────────────────────────────────────────────────

export interface ScannerConfig {
  study_field_names: string[];   // [primary, ...aliases], all lowercased at use time
  habit_field_names: string[];
  mood_field_names: string[];
  study_default_unit: "minutes" | "hours";
  date_format: string;           // Day.js format string, e.g. "YYYY-MM-DD"
  ignored_folders: string[];
}

export interface ScanError {
  file: string;
  line: number;
  message: string;
}

// ── Date helpers ──────────────────────────────────────────────────────────────

/**
 * Try to parse a date from a file's basename using the configured format.
 * Returns an ISO "YYYY-MM-DD" string. Falls back to fallbackDate if the
 * basename doesn't match the format.
 */
export function extractDateFromFilename(
  basename: string,
  dateFormat: string,
  fallbackDate: string
): string {
  // Try the full basename first (exact match)
  const full = dayjs(basename, dateFormat, /* strict */ true);
  if (full.isValid()) return full.format("YYYY-MM-DD");

  // Fall back to extracting a leading prefix the same length as the format
  // e.g. "2026-04-09 - My notes" with format "YYYY-MM-DD" → "2026-04-09"
  const prefix = basename.slice(0, dateFormat.length);
  const partial = dayjs(prefix, dateFormat, /* strict */ true);
  if (partial.isValid()) return partial.format("YYYY-MM-DD");

  return fallbackDate;
}

// ── Line-level helpers ────────────────────────────────────────────────────────

// Matches (fieldname:: value) — field name may contain word chars and hyphens
const INLINE_FIELD_RE = /\(([^():]+)::[ \t]*([^)]*)\)/g;

function extractInlineFields(line: string): Array<{ name: string; value: string; end: number }> {
  const fields: Array<{ name: string; value: string; end: number }> = [];
  let match: RegExpExecArray | null;
  INLINE_FIELD_RE.lastIndex = 0;
  while ((match = INLINE_FIELD_RE.exec(line)) !== null) {
    fields.push({
      name: match[1].trim(),
      value: match[2].trim(),
      end: match.index + match[0].length,
    });
  }
  return fields;
}

function extractTags(line: string): string[] {
  const tags: string[] = [];
  const re = /#([\w-]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line)) !== null) tags.push(m[1]);
  return tags;
}

function extractQuotedNote(line: string): string | undefined {
  const m = line.match(/"([^"]*)"/);
  return m ? m[1] : undefined;
}

function parseHabitValue(afterField: string): boolean | number {
  const s = afterField.trim();
  if (!s) return true;
  if (s.includes("✓") || /\bdone\b/i.test(s) || s === "true") return true;
  if (s.includes("✗") || /\bskip(ped)?\b/i.test(s) || s === "false") return false;
  const numMatch = s.match(/^(\d+(?:\.\d+)?)/);
  if (numMatch) return parseFloat(numMatch[1]);
  return true; // any other text → treated as completed
}

function parseMoodValue(raw: string): string | number {
  const s = raw.trim();
  const n = Number(s);
  return Number.isFinite(n) ? n : s;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ── Core pure function ────────────────────────────────────────────────────────

/**
 * Parse all tracker entries from a single file's text content.
 *
 * This function has no Obsidian API dependencies and is fully unit-testable.
 * The caller is responsible for determining `date` and `filePath`.
 */
export function parseFileEntries(
  content: string,
  date: string,
  filePath: string,
  config: ScannerConfig
): { entries: Entry[]; errors: ScanError[] } {
  const entries: Entry[] = [];
  const errors: ScanError[] = [];

  const studyNames = new Set(config.study_field_names.map((n) => n.toLowerCase()));
  const habitNames = new Set(config.habit_field_names.map((n) => n.toLowerCase()));
  const moodNames  = new Set(config.mood_field_names.map((n) => n.toLowerCase()));

  const lines = content.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;
    let foundMoodInline = false;

    // ── inline fields: (fieldname:: value) ───────────────────────────────────
    const fields = extractInlineFields(line);

    for (const field of fields) {
      const name = field.name.toLowerCase();

      if (studyNames.has(name)) {
        const minutes = parseDuration(field.value, config.study_default_unit);
        if (minutes === null) {
          errors.push({
            file: filePath,
            line: lineNum,
            message: `Could not parse duration: "${field.value}"`,
          });
          continue;
        }
        const entry: StudyEntry = {
          type: "study",
          date,
          duration_minutes: minutes,
          tags: extractTags(line),
          source_file: filePath,
          source_line: lineNum,
        };
        const note = extractQuotedNote(line);
        if (note !== undefined) entry.note = note;
        entries.push(entry);

      } else if (habitNames.has(name)) {
        const habitName = field.value;
        if (!habitName) {
          errors.push({ file: filePath, line: lineNum, message: "Habit name is empty" });
          continue;
        }
        // Text after the closing ) of this specific field
        const afterField = line.slice(field.end);
        entries.push({
          type: "habit",
          date,
          habit_name: habitName,
          value: parseHabitValue(afterField),
          source_file: filePath,
          source_line: lineNum,
        } as HabitEntry);

      } else if (moodNames.has(name)) {
        foundMoodInline = true;
        entries.push({
          type: "mood",
          date,
          value: parseMoodValue(field.value),
          source_file: filePath,
          source_line: lineNum,
        } as MoodEntry);
      }
    }

    // ── simple "Mood: 😊" format (only if no inline mood field on this line) ──
    if (!foundMoodInline) {
      for (const moodName of config.mood_field_names) {
        const re = new RegExp(`^${escapeRegex(moodName)}:\\s*(.+)$`, "i");
        const m = line.match(re);
        if (m) {
          entries.push({
            type: "mood",
            date,
            value: parseMoodValue(m[1]),
            source_file: filePath,
            source_line: lineNum,
          } as MoodEntry);
          break;
        }
      }
    }
  }

  return { entries, errors };
}

// ── Obsidian-dependent scanner class ─────────────────────────────────────────

export class VaultScanner {
  constructor(
    private vault: Vault,
    private config: ScannerConfig,
    private store: EntryStore
  ) {}

  async scanAll(): Promise<{ errors: ScanError[] }> {
    this.store.clear();
    const allErrors: ScanError[] = [];

    for (const file of this.vault.getMarkdownFiles()) {
      if (this.isIgnored(file.path)) continue;
      const errs = await this.scanFile(file);
      allErrors.push(...errs);
    }

    return { errors: allErrors };
  }

  /**
   * Incremental scan: only re-parses files whose mtime is after `since`.
   * Entries from unchanged files are left as-is in the store (already hydrated
   * from cache). Returns errors from the re-scanned files only.
   */
  async scanIncremental(since: Date): Promise<{ errors: ScanError[] }> {
    const allErrors: ScanError[] = [];
    const sinceMs = since.getTime();

    for (const file of this.vault.getMarkdownFiles()) {
      if (this.isIgnored(file.path)) continue;
      if (file.stat.mtime <= sinceMs) continue;
      const errs = await this.scanFile(file);
      allErrors.push(...errs);
    }

    return { errors: allErrors };
  }

  async scanFile(file: TFile): Promise<ScanError[]> {
    const content = await this.vault.cachedRead(file);
    const date = this.getDateFromFile(file);
    const { entries, errors } = parseFileEntries(content, date, file.path, this.config);
    this.store.replaceFromFile(file.path, entries);
    return errors;
  }

  getDateFromFile(file: TFile): string {
    const fallback = dayjs(file.stat.mtime).format("YYYY-MM-DD");
    return extractDateFromFilename(file.basename, this.config.date_format, fallback);
  }

  private isIgnored(filePath: string): boolean {
    return this.config.ignored_folders.some((folder) => {
      const prefix = folder.endsWith("/") ? folder : folder + "/";
      return filePath.startsWith(prefix);
    });
  }
}
