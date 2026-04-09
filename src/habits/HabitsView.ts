import { ItemView, Notice, TFile, WorkspaceLeaf } from "obsidian";
import dayjs from "dayjs";
import TrackerPlugin from "../main";
import { HabitDefinition } from "../settings/types";
import { HabitEntry } from "../shared/data/types";
import { HabitWriter } from "./HabitWriter";
import { MoodPanel } from "./stats/MoodPanel";

export const HABITS_VIEW_TYPE = "tracker-habits-view";

export class HabitsView extends ItemView {
  private moodPanel: MoodPanel | null = null;

  constructor(leaf: WorkspaceLeaf, private plugin: TrackerPlugin) {
    super(leaf);
  }

  getViewType(): string    { return HABITS_VIEW_TYPE; }
  getDisplayText(): string { return "Habits tracker"; }
  getIcon(): string        { return "check-square"; }

  async onOpen(): Promise<void> {
    const root = this.containerEl.children[1] as HTMLElement;
    root.empty();
    root.addClass("tracker-habits-view");

    const today = dayjs().format("YYYY-MM-DD");

    // ── Header ────────────────────────────────────────────────────────────────
    const header = root.createDiv({ cls: "tracker-habits-header" });
    header.createEl("h2", { text: "Habits", cls: "tracker-habits-title" });
    header.createSpan({ cls: "tracker-habits-date", text: dayjs().format("dddd, MMM D") });

    // ── Today's check-off list ────────────────────────────────────────────────
    const section = root.createDiv({ cls: "tracker-section tracker-habits-today" });
    section.createEl("h3", { text: "Today", cls: "tracker-section-heading" });
    this.renderHabitList(section, today);

    // ── Streak summary ────────────────────────────────────────────────────────
    const streakSection = root.createDiv({ cls: "tracker-section tracker-habits-streaks" });
    streakSection.createEl("h3", { text: "Streaks", cls: "tracker-section-heading" });
    this.renderStreaks(streakSection, today);

    // ── Mood chart ────────────────────────────────────────────────────────────
    const moodSection = root.createDiv({ cls: "tracker-section tracker-habits-mood" });
    moodSection.createEl("h3", { text: "Mood over time", cls: "tracker-section-heading" });
    this.moodPanel = new MoodPanel(moodSection, this.plugin.store, this.plugin.settings);
    this.moodPanel.render();
  }

  async onClose(): Promise<void> {
    this.moodPanel?.destroy();
    this.moodPanel = null;
  }

  // ── Habit list ────────────────────────────────────────────────────────────

  private renderHabitList(container: HTMLElement, today: string): void {
    const defs = this.plugin.settings.habit_definitions;
    if (defs.length === 0) {
      container.createEl("p", {
        cls: "tracker-chart-empty",
        text: "No habits defined yet — add some in Settings → Habits.",
      });
      return;
    }

    const list = container.createEl("ul", { cls: "tracker-habit-list" });
    for (const def of defs) {
      this.renderHabitRow(list, def, today);
    }
  }

  private renderHabitRow(list: HTMLElement, def: HabitDefinition, today: string): void {
    const logged = this.plugin.store
      .getHabitLogs({ habit_name: def.name, date_from: today, date_to: today })[0] ?? null;

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

    // Progress label for quantity with target
    if (def.type === "quantity" && def.target_per_day) {
      const current = typeof logged?.value === "number" ? logged.value : 0;
      const prog = identity.createSpan({ cls: "tracker-habit-progress-label" });
      prog.setText(`${current} / ${def.target_per_day}${def.unit ? " " + def.unit : ""}`);
    }

    // Actions
    const actions = li.createDiv({ cls: "tracker-habit-actions" });
    if (def.type === "quantity") {
      this.renderQuantityActions(actions, def, logged, today);
    } else {
      this.renderBinaryActions(actions, def, logged, today);
    }

    // Progress bar for quantity with target (below the row)
    if (def.type === "quantity" && def.target_per_day) {
      const current = typeof logged?.value === "number" ? logged.value : 0;
      const pct = Math.min(100, Math.round((current / def.target_per_day) * 100));
      const bar = li.createDiv({ cls: "tracker-habit-progress-bar-wrap" });
      const fill = bar.createDiv({ cls: "tracker-habit-progress-bar-fill" });
      fill.style.width = `${pct}%`;
      fill.style.background = def.color;
    }
  }

  // ── Binary actions ────────────────────────────────────────────────────────

  private renderBinaryActions(
    container: HTMLElement,
    def: HabitDefinition,
    logged: HabitEntry | null,
    today: string,
  ): void {
    container.empty();

    if (logged === null) {
      const doneBtn = container.createEl("button", {
        cls: "tracker-habit-btn tracker-habit-btn-done",
        text: "✓ Done",
      });
      doneBtn.addEventListener("click", () =>
        this.writeLog(def, true, logged, today, container));

      const skipBtn = container.createEl("button", {
        cls: "tracker-habit-btn tracker-habit-btn-skip",
        text: "✗ Skip",
      });
      skipBtn.addEventListener("click", () =>
        this.writeLog(def, false, logged, today, container));

    } else {
      const isDone = logged.value === true || logged.value === 1;
      const badge = container.createEl("span", {
        cls: `tracker-habit-badge ${isDone ? "tracker-habit-badge-done" : "tracker-habit-badge-skip"}`,
        text: isDone ? "✓ Done" : "✗ Skipped",
      });
      if (isDone) badge.style.setProperty("--habit-color", def.color);

      const removeBtn = container.createEl("button", {
        cls: "tracker-habit-btn tracker-habit-btn-remove",
        text: "×",
        attr: { "aria-label": "Remove log" },
      });
      removeBtn.addEventListener("click", () =>
        this.removeLog(logged, container, def, today));
    }
  }

  // ── Quantity actions ──────────────────────────────────────────────────────

  private renderQuantityActions(
    container: HTMLElement,
    def: HabitDefinition,
    logged: HabitEntry | null,
    today: string,
  ): void {
    container.empty();

    const currentVal = typeof logged?.value === "number" ? logged.value : 0;

    if (logged === null) {
      // Stepper + Log
      this.buildQuantityStepper(container, def, 0, (val) => {
        this.writeLog(def, val, null, today, container);
      });
    } else {
      // Show logged value + unit
      const badge = container.createEl("span", {
        cls: "tracker-habit-badge tracker-habit-badge-done",
        text: `${currentVal}${def.unit ? " " + def.unit : ""}`,
      });
      badge.style.setProperty("--habit-color", def.color);

      // Edit button reopens the stepper inline
      const editBtn = container.createEl("button", {
        cls: "tracker-habit-btn",
        text: "Edit",
      });
      editBtn.addEventListener("click", async () => {
        // Remove old entry, then show stepper pre-filled
        await this.removeLogSilent(logged);
        container.empty();
        this.buildQuantityStepper(container, def, currentVal, (val) => {
          this.writeLog(def, val, null, today, container);
        });
      });

      const removeBtn = container.createEl("button", {
        cls: "tracker-habit-btn tracker-habit-btn-remove",
        text: "×",
        attr: { "aria-label": "Remove log" },
      });
      removeBtn.addEventListener("click", () =>
        this.removeLog(logged, container, def, today));
    }
  }

  private buildQuantityStepper(
    container: HTMLElement,
    def: HabitDefinition,
    initial: number,
    onLog: (val: number) => void,
  ): void {
    const wrap = container.createDiv({ cls: "tracker-quantity-stepper" });

    const decBtn = wrap.createEl("button", {
      cls: "tracker-habit-btn tracker-quantity-step",
      text: "−",
    });

    const input = wrap.createEl("input", {
      cls: "tracker-quantity-input",
      attr: { type: "number", min: "0", step: "1", value: String(initial) },
    });
    if (def.unit) input.setAttribute("placeholder", def.unit);

    const incBtn = wrap.createEl("button", {
      cls: "tracker-habit-btn tracker-quantity-step",
      text: "+",
    });

    decBtn.addEventListener("click", () => {
      const v = Math.max(0, (parseFloat(input.value) || 0) - 1);
      input.value = String(v);
    });
    incBtn.addEventListener("click", () => {
      const v = (parseFloat(input.value) || 0) + 1;
      input.value = String(v);
    });

    const logBtn = wrap.createEl("button", {
      cls: "tracker-habit-btn tracker-habit-btn-done",
      text: "Log",
    });
    logBtn.addEventListener("click", () => {
      const val = parseFloat(input.value);
      if (isNaN(val) || val < 0) {
        input.addClass("tracker-input-error");
        return;
      }
      onLog(val);
    });
  }

  // ── Write / remove ────────────────────────────────────────────────────────

  private async writeLog(
    def: HabitDefinition,
    value: boolean | number,
    prev: HabitEntry | null,
    today: string,
    actionsEl: HTMLElement,
  ): Promise<void> {
    // Remove old entry first if editing
    if (prev) await this.removeLogSilent(prev);

    const writer = new HabitWriter(this.app, this.plugin.settings);
    try {
      const { file } = await writer.write({ date: today, habit_name: def.name, value });
      await this.plugin.scanner?.scanFile(
        this.app.vault.getAbstractFileByPath(file.path) as TFile,
      );
      const newLogged = this.plugin.store
        .getHabitLogs({ habit_name: def.name, date_from: today, date_to: today })[0] ?? null;

      if (def.type === "quantity") {
        this.renderQuantityActions(actionsEl, def, newLogged, today);
      } else {
        this.renderBinaryActions(actionsEl, def, newLogged, today);
      }

      // Refresh progress bar fill if present
      const li = actionsEl.closest("li") as HTMLElement | null;
      if (li && def.type === "quantity" && def.target_per_day) {
        const fill = li.querySelector<HTMLElement>(".tracker-habit-progress-bar-fill");
        const progLabel = li.querySelector<HTMLElement>(".tracker-habit-progress-label");
        const current = typeof newLogged?.value === "number" ? newLogged.value : 0;
        if (fill) {
          const pct = Math.min(100, Math.round((current / def.target_per_day!) * 100));
          fill.style.width = `${pct}%`;
        }
        if (progLabel) {
          progLabel.setText(`${current} / ${def.target_per_day}${def.unit ? " " + def.unit : ""}`);
        }
      }
    } catch (err) {
      console.error("Tracker: failed to log habit", err);
      new Notice("Tracker: could not write to daily note — check console");
    }
  }

  private async removeLog(
    entry: HabitEntry,
    actionsEl: HTMLElement,
    def: HabitDefinition,
    today: string,
  ): Promise<void> {
    await this.removeLogSilent(entry);
    const li = actionsEl.closest("li") as HTMLElement | null;
    if (li && def.type === "quantity" && def.target_per_day) {
      const fill = li.querySelector<HTMLElement>(".tracker-habit-progress-bar-fill");
      const progLabel = li.querySelector<HTMLElement>(".tracker-habit-progress-label");
      if (fill) fill.style.width = "0%";
      if (progLabel) {
        progLabel.setText(`0 / ${def.target_per_day}${def.unit ? " " + def.unit : ""}`);
      }
    }
    if (def.type === "quantity") {
      this.renderQuantityActions(actionsEl, def, null, today);
    } else {
      this.renderBinaryActions(actionsEl, def, null, today);
    }
  }

  private async removeLogSilent(entry: HabitEntry): Promise<void> {
    const file = this.app.vault.getAbstractFileByPath(entry.source_file);
    if (!(file instanceof TFile)) return;
    const content = await this.app.vault.read(file);
    const lines   = content.split("\n");
    const lineIdx = entry.source_line - 1;
    if (lineIdx >= 0 && lineIdx < lines.length) {
      lines.splice(lineIdx, 1);
      await this.app.vault.modify(file, lines.join("\n"));
      await this.plugin.scanner?.scanFile(file);
    }
  }

  // ── Streaks ───────────────────────────────────────────────────────────────

  private renderStreaks(container: HTMLElement, today: string): void {
    const defs = this.plugin.settings.habit_definitions;
    if (defs.length === 0) return;

    const grid = container.createDiv({ cls: "tracker-habit-streak-grid" });
    for (const def of defs) {
      const streak = this.calcHabitStreak(def, today);
      const card = grid.createDiv({ cls: "tracker-stat-card" });
      card.style.setProperty("--habit-color", def.color);
      card.createDiv({ cls: "tracker-stat-value tracker-habit-streak-value", text: String(streak) });
      const lbl = card.createDiv({ cls: "tracker-stat-label" });
      lbl.setText((def.emoji ? def.emoji + " " : "") + def.name);
    }
  }

  private calcHabitStreak(def: HabitDefinition, today: string): number {
    const logs = this.plugin.store.getHabitLogs({ habit_name: def.name });

    const doneDates = new Set<string>();
    for (const e of logs) {
      if (def.type === "quantity") {
        const target = def.target_per_day ?? 1;
        if (typeof e.value === "number" && e.value >= target) doneDates.add(e.date);
      } else {
        if (e.value === true || e.value === 1) doneDates.add(e.date);
      }
    }

    let streak = 0;
    let cursor = dayjs(today);
    if (!doneDates.has(today)) cursor = cursor.subtract(1, "day");
    while (doneDates.has(cursor.format("YYYY-MM-DD"))) {
      streak++;
      cursor = cursor.subtract(1, "day");
    }
    return streak;
  }
}
