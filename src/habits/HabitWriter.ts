import { App, TFile, TFolder, normalizePath } from "obsidian";
import dayjs from "dayjs";
import { PluginSettings } from "../settings/types";

export interface HabitWriteData {
  date: string;
  habit_name: string;
  /**
   * Binary habits: true = ✓ done, false = ✗ skipped.
   * Quantity habits: a positive number.
   */
  value: boolean | number;
}

export class HabitWriter {
  private readonly HABIT_HEADING = "## Habits";

  constructor(private app: App, private settings: PluginSettings) {}

  async write(data: HabitWriteData): Promise<{ file: TFile; line: number }> {
    const file = await this.getOrCreateDailyNote(data.date);
    return this.writeToFile(data, file);
  }

  /** Write to a specific already-open TFile (used by inline widgets). */
  async writeToFile(data: HabitWriteData, file: TFile): Promise<{ file: TFile; line: number }> {
    const original = await this.app.vault.read(file);
    const { content, lineNumber } = this.injectEntry(original, data);
    await this.app.vault.modify(file, content);
    return { file, line: lineNumber };
  }

  buildEntryLine(data: HabitWriteData): string {
    const field = this.settings.habit_field_name;
    let suffix: string;
    if (typeof data.value === "number") {
      suffix = String(data.value);
    } else {
      suffix = data.value ? "✓" : "✗";
    }
    return `- (${field}:: ${data.habit_name}) ${suffix}`;
  }

  // ── Injection ─────────────────────────────────────────────────────────────

  private injectEntry(
    content: string,
    data: HabitWriteData,
  ): { content: string; lineNumber: number } {
    const entry = this.buildEntryLine(data);
    const lines = content.split("\n");

    const headingIdx = lines.findIndex((l) => l.trim() === this.HABIT_HEADING);

    if (headingIdx === -1) {
      const sep = content.length > 0 && !content.endsWith("\n") ? "\n" : "";
      const appended = `${content}${sep}\n${this.HABIT_HEADING}\n\n${entry}\n`;
      return { content: appended, lineNumber: appended.split("\n").length - 1 };
    }

    let sectionEnd = headingIdx + 1;
    while (sectionEnd < lines.length && !/^#{1,2} /.test(lines[sectionEnd])) {
      sectionEnd++;
    }

    let insertAfter = sectionEnd - 1;
    while (insertAfter > headingIdx && lines[insertAfter].trim() === "") {
      insertAfter--;
    }

    lines.splice(insertAfter + 1, 0, entry);
    return { content: lines.join("\n"), lineNumber: insertAfter + 2 };
  }

  // ── Daily-note helpers ────────────────────────────────────────────────────

  private async getOrCreateDailyNote(date: string): Promise<TFile> {
    const path = this.dailyNotePath(date);
    const existing = this.app.vault.getAbstractFileByPath(path);
    if (existing instanceof TFile) return existing;
    const folder = this.settings.daily_note_folder.trim();
    if (folder) await this.ensureFolder(folder);
    return this.app.vault.create(path, "");
  }

  private dailyNotePath(date: string): string {
    const filename = dayjs(date).format(this.settings.date_format);
    const folder   = this.settings.daily_note_folder.trim();
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
}
