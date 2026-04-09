import { MarkdownPostProcessorContext, Notice, TFile } from "obsidian";
import dayjs from "dayjs";
import TrackerPlugin from "../../main";
import { MoodEntry } from "../data/types";
import { extractDateFromFilename } from "../data/VaultScanner";

/**
 * Renders an inline mood-logging widget for a `mood` code block.
 *
 * Example:
 * ```mood
 * ```
 */
export class MoodWidget {
  private date: string;

  constructor(
    private el: HTMLElement,
    private ctx: MarkdownPostProcessorContext,
    private plugin: TrackerPlugin,
  ) {
    const basename = ctx.sourcePath.split("/").pop()?.replace(/\.md$/, "") ?? "";
    this.date = extractDateFromFilename(
      basename,
      plugin.settings.date_format,
      dayjs().format("YYYY-MM-DD"),
    );
  }

  render(): void {
    this.el.empty();
    this.el.addClasses(["tracker-widget", "tracker-mood-widget"]);

    const logged = this.plugin.store
      .getMoodEntries({ date_from: this.date, date_to: this.date })[0] ?? null;

    this.renderPicker(logged);
  }

  private renderPicker(logged: MoodEntry | null): void {
    const { mood_scale_type, mood_emojis } = this.plugin.settings;

    const wrap = this.el.createDiv({ cls: "tracker-mood-picker" });

    if (logged !== null) {
      const current = wrap.createDiv({ cls: "tracker-mood-current" });
      current.createSpan({ cls: "tracker-mood-label", text: "Today: " });
      current.createSpan({ cls: "tracker-mood-value", text: String(logged.value) });

      const changeBtn = current.createEl("button", {
        cls: "tracker-habit-btn tracker-mood-change-btn",
        text: "Change",
      });
      changeBtn.addEventListener("mousedown", async (e) => { e.preventDefault();
        await this.removeLog(logged);
        this.el.empty();
        this.el.addClasses(["tracker-widget", "tracker-mood-widget"]);
        this.renderPicker(null);
      });
      return;
    }

    const prompt = wrap.createDiv({ cls: "tracker-mood-prompt" });
    prompt.createSpan({ cls: "tracker-mood-label", text: "How are you feeling?" });

    const options = wrap.createDiv({ cls: "tracker-mood-options" });

    if (mood_scale_type === "emoji") {
      for (const emoji of mood_emojis) {
        const btn = options.createEl("button", {
          cls: "tracker-mood-option tracker-mood-emoji-btn",
          text: emoji,
          attr: { "aria-label": `Log mood: ${emoji}` },
        });
        btn.addEventListener("mousedown", (e) => { e.preventDefault(); this.logMood(emoji); });
      }
    } else {
      const max = mood_scale_type === "1-10" ? 10 : 5;
      for (let i = 1; i <= max; i++) {
        const btn = options.createEl("button", {
          cls: "tracker-mood-option tracker-mood-num-btn",
          text: String(i),
          attr: { "aria-label": `Log mood: ${i}` },
        });
        btn.addEventListener("mousedown", (e) => { e.preventDefault(); this.logMood(i); });
      }
    }
  }

  // ── IO ────────────────────────────────────────────────────────────────────

  private async logMood(value: string | number): Promise<void> {
    const file = this.plugin.app.vault.getAbstractFileByPath(this.ctx.sourcePath);
    if (!(file instanceof TFile)) return;

    const fieldName  = this.plugin.settings.mood_field_name;
    const inlineVal  = `(${fieldName}:: ${value})`;

    try {
      const content = await this.plugin.app.vault.read(file);
      const info    = this.ctx.getSectionInfo(this.el);
      const newContent = info
        ? this.injectIntoCodeBlock(content, inlineVal, info.lineStart, info.lineEnd)
        : this.injectMoodEntry(content, `- ${inlineVal}`);
      await this.plugin.app.vault.modify(file, newContent);
      await this.plugin.scanner?.scanFile(file);

      const logged = this.plugin.store
        .getMoodEntries({ date_from: this.date, date_to: this.date })[0] ?? null;
      this.el.empty();
      this.el.addClasses(["tracker-widget", "tracker-mood-widget"]);
      this.renderPicker(logged);
    } catch (err) {
      console.error("Tracker: mood widget write error", err);
      new Notice("Tracker: could not write mood — check console");
    }
  }

  private async removeLog(entry: MoodEntry): Promise<void> {
    const file = this.plugin.app.vault.getAbstractFileByPath(entry.source_file);
    if (!(file instanceof TFile)) return;
    const content = await this.plugin.app.vault.read(file);
    const lines   = content.split("\n");
    const idx     = entry.source_line - 1;
    if (idx >= 0 && idx < lines.length) {
      // Clear the line rather than splicing — preserves code block fence structure
      lines[idx] = "";
      await this.plugin.app.vault.modify(file, lines.join("\n"));
      await this.plugin.scanner?.scanFile(file);
    }
  }

  /** Write the inline value inside the code block fences (preferred). */
  private injectIntoCodeBlock(content: string, inlineVal: string, lineStart: number, lineEnd: number): string {
    const lines = content.split("\n");
    return [
      ...lines.slice(0, lineStart + 1),
      inlineVal,
      ...lines.slice(lineEnd),
    ].join("\n");
  }

  /** Fallback: inject the entry under a `## Mood` heading, or append at end. */
  private injectMoodEntry(content: string, entry: string): string {
    const HEADING = "## Mood";
    const lines   = content.split("\n");
    const hIdx    = lines.findIndex((l) => l.trim() === HEADING);

    if (hIdx === -1) {
      const sep = content.length > 0 && !content.endsWith("\n") ? "\n" : "";
      return `${content}${sep}\n${HEADING}\n\n${entry}\n`;
    }

    let sectionEnd = hIdx + 1;
    while (sectionEnd < lines.length && !/^#{1,2} /.test(lines[sectionEnd])) sectionEnd++;

    let insertAfter = sectionEnd - 1;
    while (insertAfter > hIdx && lines[insertAfter].trim() === "") insertAfter--;

    lines.splice(insertAfter + 1, 0, entry);
    return lines.join("\n");
  }
}
