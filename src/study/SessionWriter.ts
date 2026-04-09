import { App, TFile, TFolder, normalizePath } from "obsidian";
import dayjs from "dayjs";
import { PluginSettings } from "../settings/types";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SessionData {
  date: string;            // "YYYY-MM-DD"
  duration_minutes: number;
  tags: string[];
  note?: string;
}

export interface WriteResult {
  file: TFile;
  line: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Format minutes as a compact Dataview-compatible duration string. */
export function formatSessionDuration(minutes: number): string {
  const total = Math.max(1, Math.round(minutes));
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h > 0 && m > 0) return `${h}h${m}m`;
  if (h > 0) return `${h}h`;
  return `${m}m`;
}

// ── SessionWriter ──────────────────────────────────────────────────────────────

export class SessionWriter {
  /** Heading to append entries under (created if missing). */
  private readonly STUDY_HEADING = "## Study";

  constructor(private app: App, private settings: PluginSettings) {}

  // ── Public ────────────────────────────────────────────────────────────────

  async write(session: SessionData): Promise<WriteResult> {
    const file = await this.getOrCreateDailyNote(session.date);
    const original = await this.app.vault.read(file);
    const { content, lineNumber } = this.injectEntry(original, session);
    await this.app.vault.modify(file, content);
    return { file, line: lineNumber };
  }

  /** Build the raw markdown line for a session (exported for tests / manual entry). */
  buildEntryLine(session: SessionData): string {
    const duration = formatSessionDuration(session.duration_minutes);
    const fieldName = this.settings.study_field_name;
    const tags = session.tags.map((t) => `#${t}`).join(" ");
    const note = session.note ? ` "${session.note}"` : "";
    const tagStr = tags ? ` ${tags}` : "";
    return `- (${fieldName}:: ${duration})${tagStr}${note}`;
  }

  // ── Injection ─────────────────────────────────────────────────────────────

  private injectEntry(
    content: string,
    session: SessionData
  ): { content: string; lineNumber: number } {
    const entry = this.buildEntryLine(session);
    const lines = content.split("\n");

    const headingIdx = lines.findIndex(
      (l) => l.trim() === this.STUDY_HEADING
    );

    if (headingIdx === -1) {
      // No heading — append heading + entry at the end of the file
      const sep = content.length > 0 && !content.endsWith("\n") ? "\n" : "";
      const appended = `${content}${sep}\n${this.STUDY_HEADING}\n\n${entry}\n`;
      const lineNumber = appended.split("\n").length - 1;
      return { content: appended, lineNumber };
    }

    // Heading exists — find the end of its section
    // (stop at next heading of equal or higher level, i.e. ## or #)
    let sectionEnd = headingIdx + 1;
    while (sectionEnd < lines.length) {
      const l = lines[sectionEnd];
      if (/^#{1,2} /.test(l)) break;
      sectionEnd++;
    }

    // Walk back past trailing blank lines to find the last content line
    let insertAfter = sectionEnd - 1;
    while (insertAfter > headingIdx && lines[insertAfter].trim() === "") {
      insertAfter--;
    }

    // Insert the new entry right after the last content line in the section
    lines.splice(insertAfter + 1, 0, entry);
    return { content: lines.join("\n"), lineNumber: insertAfter + 2 }; // 1-indexed
  }

  // ── Daily note helpers ────────────────────────────────────────────────────

  private async getOrCreateDailyNote(date: string): Promise<TFile> {
    const path = this.dailyNotePath(date);
    const existing = this.app.vault.getAbstractFileByPath(path);
    if (existing instanceof TFile) return existing;

    // Create folder hierarchy if needed
    const folder = this.settings.daily_note_folder.trim();
    if (folder) await this.ensureFolder(folder);

    // Use Daily Notes template if available, else empty file
    const template = await this.readDailyNoteTemplate();
    return this.app.vault.create(path, template ?? "");
  }

  private dailyNotePath(date: string): string {
    const filename = dayjs(date).format(this.settings.date_format);
    const folder = this.settings.daily_note_folder.trim();
    return normalizePath(folder ? `${folder}/${filename}.md` : `${filename}.md`);
  }

  private async ensureFolder(folderPath: string): Promise<void> {
    const parts = normalizePath(folderPath).split("/");
    let current = "";
    for (const part of parts) {
      current = current ? `${current}/${part}` : part;
      const existing = this.app.vault.getAbstractFileByPath(current);
      if (!existing) {
        await this.app.vault.createFolder(current);
      } else if (!(existing instanceof TFolder)) {
        throw new Error(`Tracker: path "${current}" exists but is not a folder`);
      }
    }
  }

  private async readDailyNoteTemplate(): Promise<string | null> {
    try {
      // Try to read the Daily Notes core plugin's template setting
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const dailyPlugin = (this.app as any).internalPlugins?.plugins?.["daily-notes"];
      if (!dailyPlugin?.enabled) return null;
      const templatePath: string | undefined =
        dailyPlugin.instance?.options?.template;
      if (!templatePath) return null;
      const normalized = normalizePath(
        templatePath.endsWith(".md") ? templatePath : `${templatePath}.md`
      );
      const file = this.app.vault.getAbstractFileByPath(normalized);
      if (!(file instanceof TFile)) return null;
      return await this.app.vault.read(file);
    } catch {
      return null;
    }
  }
}
