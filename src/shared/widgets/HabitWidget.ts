import { App, MarkdownPostProcessorContext, Notice, TFile } from "obsidian";
import dayjs from "dayjs";
import TrackerPlugin from "../../main";
import { HabitDefinition } from "../../settings/types";
import { HabitEntry } from "../data/types";
import { HabitWriter } from "../../habits/HabitWriter";
import { extractDateFromFilename } from "../data/VaultScanner";

/**
 * Renders an inline habit check-off widget for a `habit` code block.
 *
 * Code block content: one habit name per line (or empty → show all habits).
 *
 * Example:
 * ```habit
 * Meditate
 * Exercise
 * ```
 */
export class HabitWidget {
  private date: string;

  constructor(
    private el: HTMLElement,
    private source: string,
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
    this.el.addClasses(["tracker-widget", "tracker-habit-widget"]);

    const names = this.parseNames();
    const defs  = this.plugin.settings.habit_definitions;

    if (names.length === 0 && defs.length === 0) {
      this.el.createEl("p", {
        cls: "tracker-chart-empty",
        text: "No habits defined. Add some in Settings → Habits.",
      });
      return;
    }

    const targets = names.length > 0
      ? names.map((n) => defs.find((d) => d.name.toLowerCase() === n.toLowerCase()))
      : defs;

    const list = this.el.createEl("ul", { cls: "tracker-habit-list tracker-widget-list" });

    for (const def of targets) {
      if (!def) continue;
      this.renderRow(list, def);
    }
  }

  private parseNames(): string[] {
    return this.source
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
  }

  private renderRow(list: HTMLElement, def: HabitDefinition): void {
    const logged = this.plugin.store
      .getHabitLogs({ habit_name: def.name, date_from: this.date, date_to: this.date })[0] ?? null;

    const li = list.createEl("li", { cls: "tracker-habit-row" });
    li.style.setProperty("--habit-color", def.color);

    // Identity
    const identity = li.createDiv({ cls: "tracker-habit-identity" });
    if (def.emoji) {
      identity.createSpan({ cls: "tracker-habit-emoji", text: def.emoji });
    } else {
      const dot = identity.createSpan({ cls: "tracker-habit-dot" });
      dot.style.background = def.color;
    }
    identity.createSpan({ cls: "tracker-habit-name", text: def.name });

    if (def.type === "quantity" && def.target_per_day) {
      const current = typeof logged?.value === "number" ? logged.value : 0;
      identity.createSpan({
        cls: "tracker-habit-progress-label",
        text: `${current} / ${def.target_per_day}${def.unit ? " " + def.unit : ""}`,
      });
    }

    const actions = li.createDiv({ cls: "tracker-habit-actions" });
    if (def.type === "quantity") {
      this.renderQuantityActions(actions, def, logged);
    } else {
      this.renderBinaryActions(actions, def, logged);
    }

    // Progress bar
    if (def.type === "quantity" && def.target_per_day) {
      const current = typeof logged?.value === "number" ? logged.value : 0;
      const pct = Math.min(100, Math.round((current / def.target_per_day) * 100));
      const bar  = li.createDiv({ cls: "tracker-habit-progress-bar-wrap" });
      const fill = bar.createDiv({ cls: "tracker-habit-progress-bar-fill" });
      fill.style.width   = `${pct}%`;
      fill.style.background = def.color;
    }
  }

  private renderBinaryActions(
    container: HTMLElement,
    def: HabitDefinition,
    logged: HabitEntry | null,
  ): void {
    container.empty();
    if (logged === null) {
      const doneBtn = container.createEl("button", {
        cls: "tracker-habit-btn tracker-habit-btn-done", text: "✓ Done",
      });
      doneBtn.addEventListener("click", () => this.writeLog(def, true, logged, container));

      const skipBtn = container.createEl("button", {
        cls: "tracker-habit-btn tracker-habit-btn-skip", text: "✗ Skip",
      });
      skipBtn.addEventListener("click", () => this.writeLog(def, false, logged, container));
    } else {
      const isDone = logged.value === true || logged.value === 1;
      const badge = container.createEl("span", {
        cls: `tracker-habit-badge ${isDone ? "tracker-habit-badge-done" : "tracker-habit-badge-skip"}`,
        text: isDone ? "✓ Done" : "✗ Skipped",
      });
      if (isDone) badge.style.setProperty("--habit-color", def.color);

      const rm = container.createEl("button", {
        cls: "tracker-habit-btn tracker-habit-btn-remove", text: "×",
      });
      rm.addEventListener("click", () => this.removeLog(logged, container, def));
    }
  }

  private renderQuantityActions(
    container: HTMLElement,
    def: HabitDefinition,
    logged: HabitEntry | null,
  ): void {
    container.empty();
    const currentVal = typeof logged?.value === "number" ? logged.value : 0;

    if (logged === null) {
      this.buildStepper(container, def, 0, (val) =>
        this.writeLog(def, val, null, container));
    } else {
      const badge = container.createEl("span", {
        cls: "tracker-habit-badge tracker-habit-badge-done",
        text: `${currentVal}${def.unit ? " " + def.unit : ""}`,
      });
      badge.style.setProperty("--habit-color", def.color);

      const editBtn = container.createEl("button", { cls: "tracker-habit-btn", text: "Edit" });
      editBtn.addEventListener("click", async () => {
        await this.removeLogSilent(logged);
        container.empty();
        this.buildStepper(container, def, currentVal, (val) =>
          this.writeLog(def, val, null, container));
      });

      const rm = container.createEl("button", {
        cls: "tracker-habit-btn tracker-habit-btn-remove", text: "×",
      });
      rm.addEventListener("click", () => this.removeLog(logged, container, def));
    }
  }

  private buildStepper(
    container: HTMLElement,
    def: HabitDefinition,
    initial: number,
    onLog: (val: number) => void,
  ): void {
    const wrap = container.createDiv({ cls: "tracker-quantity-stepper" });
    const dec  = wrap.createEl("button", { cls: "tracker-habit-btn tracker-quantity-step", text: "−" });
    const inp  = wrap.createEl("input",  {
      cls: "tracker-quantity-input",
      attr: { type: "number", min: "0", step: "1", value: String(initial) },
    });
    const inc  = wrap.createEl("button", { cls: "tracker-habit-btn tracker-quantity-step", text: "+" });
    const log  = wrap.createEl("button", { cls: "tracker-habit-btn tracker-habit-btn-done", text: "Log" });

    dec.addEventListener("click", () => { inp.value = String(Math.max(0, (parseFloat(inp.value) || 0) - 1)); });
    inc.addEventListener("click", () => { inp.value = String((parseFloat(inp.value) || 0) + 1); });
    log.addEventListener("click", () => {
      const val = parseFloat(inp.value);
      if (isNaN(val) || val < 0) { inp.addClass("tracker-input-error"); return; }
      onLog(val);
    });
  }

  // ── IO ────────────────────────────────────────────────────────────────────

  private async writeLog(
    def: HabitDefinition,
    value: boolean | number,
    prev: HabitEntry | null,
    actionsEl: HTMLElement,
  ): Promise<void> {
    if (prev) await this.removeLogSilent(prev);
    const file = this.plugin.app.vault.getAbstractFileByPath(this.ctx.sourcePath);
    if (!(file instanceof TFile)) return;

    const writer = new HabitWriter(this.plugin.app, this.plugin.settings);
    try {
      await writer.writeToFile({ date: this.date, habit_name: def.name, value }, file);
      await this.plugin.scanner?.scanFile(file);
      const newLogged = this.plugin.store
        .getHabitLogs({ habit_name: def.name, date_from: this.date, date_to: this.date })[0] ?? null;
      if (def.type === "quantity") {
        this.renderQuantityActions(actionsEl, def, newLogged);
      } else {
        this.renderBinaryActions(actionsEl, def, newLogged);
      }
      this.refreshProgressBar(actionsEl, def, newLogged);
    } catch (err) {
      console.error("Tracker: habit widget write error", err);
      new Notice("Tracker: could not write habit — check console");
    }
  }

  private async removeLog(
    entry: HabitEntry,
    actionsEl: HTMLElement,
    def: HabitDefinition,
  ): Promise<void> {
    await this.removeLogSilent(entry);
    if (def.type === "quantity") {
      this.renderQuantityActions(actionsEl, def, null);
    } else {
      this.renderBinaryActions(actionsEl, def, null);
    }
    this.refreshProgressBar(actionsEl, def, null);
  }

  private async removeLogSilent(entry: HabitEntry): Promise<void> {
    const file = this.plugin.app.vault.getAbstractFileByPath(entry.source_file);
    if (!(file instanceof TFile)) return;
    const content = await this.plugin.app.vault.read(file);
    const lines   = content.split("\n");
    const idx     = entry.source_line - 1;
    if (idx >= 0 && idx < lines.length) {
      lines.splice(idx, 1);
      await this.plugin.app.vault.modify(file, lines.join("\n"));
      await this.plugin.scanner?.scanFile(file);
    }
  }

  private refreshProgressBar(
    actionsEl: HTMLElement,
    def: HabitDefinition,
    logged: HabitEntry | null,
  ): void {
    const li = actionsEl.closest("li") as HTMLElement | null;
    if (!li || !def.target_per_day) return;
    const fill  = li.querySelector<HTMLElement>(".tracker-habit-progress-bar-fill");
    const label = li.querySelector<HTMLElement>(".tracker-habit-progress-label");
    const current = typeof logged?.value === "number" ? logged.value : 0;
    if (fill) {
      fill.style.width = `${Math.min(100, Math.round((current / def.target_per_day) * 100))}%`;
    }
    if (label) {
      label.setText(`${current} / ${def.target_per_day}${def.unit ? " " + def.unit : ""}`);
    }
  }
}
