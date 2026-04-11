import { App, PluginSettingTab, Setting } from "obsidian";
import TrackerPlugin from "../main";
import { exportCsv, exportJson, importFile } from "../shared/data/ExportImport";

export class TrackerSettingsTab extends PluginSettingTab {
  plugin: TrackerPlugin;

  constructor(app: App, plugin: TrackerPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl("h2", { text: "Study & Habits Tracker" });

    this.renderGeneral(containerEl);
    this.renderStudy(containerEl);
    this.renderHabits(containerEl);
    this.renderData(containerEl);
  }

  // ── General ────────────────────────────────────────────────────────────────

  private renderGeneral(containerEl: HTMLElement): void {
    const details = containerEl.createEl("details", { cls: "tracker-settings-section" });
    details.createEl("summary", { text: "General" });
    details.open = true;

    new Setting(details)
      .setName("Enable Study module")
      .setDesc("Timer, sessions, heatmap, and streaks.")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.study_module_enabled)
          .onChange(async (value) => {
            this.plugin.settings.study_module_enabled = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(details)
      .setName("Enable Habits module")
      .setDesc("Habit tracking and mood logging.")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.habits_module_enabled)
          .onChange(async (value) => {
            this.plugin.settings.habits_module_enabled = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(details)
      .setName("Show timer in Study view")
      .setDesc("Toggle the timer panel on the Study page. The study-timer widget and timer controls still work when hidden.")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.show_timer_in_study_view)
          .onChange(async (value) => {
            this.plugin.settings.show_timer_in_study_view = value;
            await this.plugin.saveSettings();
            this.plugin.refreshOpenViews();
          })
      );

    new Setting(details)
      .setName("Daily note folder")
      .setDesc(
        "Folder where daily notes are stored. Leave blank to search the whole vault. " +
        "Auto-detected from the Daily Notes core plugin if enabled."
      )
      .addText((text) =>
        text
          .setPlaceholder("e.g. Daily Notes")
          .setValue(this.plugin.settings.daily_note_folder)
          .onChange(async (value) => {
            this.plugin.settings.daily_note_folder = value.trim();
            await this.plugin.saveSettings();
          })
      );

    new Setting(details)
      .setName("Date format")
      .setDesc("Format used in daily note filenames. Uses Day.js tokens.")
      .addText((text) =>
        text
          .setPlaceholder("YYYY-MM-DD")
          .setValue(this.plugin.settings.date_format)
          .onChange(async (value) => {
            this.plugin.settings.date_format = value.trim() || "YYYY-MM-DD";
            await this.plugin.saveSettings();
          })
      );

    new Setting(details)
      .setName("Folders to ignore")
      .setDesc("Comma-separated list of folder paths to skip during scanning (e.g. Templates, Archive).")
      .addText((text) =>
        text
          .setPlaceholder("Templates, Archive")
          .setValue(this.plugin.settings.ignored_folders.join(", "))
          .onChange(async (value) => {
            this.plugin.settings.ignored_folders = value
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean);
            await this.plugin.saveSettings();
          })
      );

    new Setting(details)
      .setName("Theme")
      .setDesc("Chart color scheme. Auto follows Obsidian's active theme.")
      .addDropdown((dropdown) =>
        dropdown
          .addOptions({ auto: "Auto", light: "Force light", dark: "Force dark" })
          .setValue(this.plugin.settings.theme)
          .onChange(async (value) => {
            this.plugin.settings.theme = value as "auto" | "light" | "dark";
            await this.plugin.saveSettings();
          })
      );
  }

  // ── Study ───────────────────────────────────────────────────────────────────

  private renderStudy(containerEl: HTMLElement): void {
    const details = containerEl.createEl("details", { cls: "tracker-settings-section" });
    details.createEl("summary", { text: "Study" });

    new Setting(details)
      .setName("Field name")
      .setDesc("The inline field key the scanner looks for (e.g. study in (study:: 25m)).")
      .addText((text) =>
        text
          .setPlaceholder("study")
          .setValue(this.plugin.settings.study_field_name)
          .onChange(async (value) => {
            this.plugin.settings.study_field_name = value.trim() || "study";
            await this.plugin.saveSettings();
          })
      );

    new Setting(details)
      .setName("Field aliases")
      .setDesc("Additional field names that map to study sessions (e.g. STUDIED, study-time).")
      .addText((text) =>
        text
          .setPlaceholder("STUDIED, study-time")
          .setValue(this.plugin.settings.study_field_aliases.join(", "))
          .onChange(async (value) => {
            this.plugin.settings.study_field_aliases = value
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean);
            await this.plugin.saveSettings();
          })
      );

    new Setting(details)
      .setName("Default unit for bare numbers")
      .setDesc("When the value has no unit (e.g. just \"90\"), treat it as this unit.")
      .addDropdown((dropdown) =>
        dropdown
          .addOptions({ minutes: "Minutes", hours: "Hours" })
          .setValue(this.plugin.settings.study_default_unit)
          .onChange(async (value) => {
            this.plugin.settings.study_default_unit = value as "minutes" | "hours";
            await this.plugin.saveSettings();
          })
      );

    // Pomodoro
    details.createEl("h4", { text: "Pomodoro defaults" });

    new Setting(details)
      .setName("Work session (minutes)")
      .addText((text) =>
        text
          .setValue(String(this.plugin.settings.pomodoro.work_minutes))
          .onChange(async (value) => {
            const n = parseInt(value);
            if (!isNaN(n) && n > 0) {
              this.plugin.settings.pomodoro.work_minutes = n;
              await this.plugin.saveSettings();
            }
          })
      );

    new Setting(details)
      .setName("Short break (minutes)")
      .addText((text) =>
        text
          .setValue(String(this.plugin.settings.pomodoro.short_break_minutes))
          .onChange(async (value) => {
            const n = parseInt(value);
            if (!isNaN(n) && n > 0) {
              this.plugin.settings.pomodoro.short_break_minutes = n;
              await this.plugin.saveSettings();
            }
          })
      );

    new Setting(details)
      .setName("Long break (minutes)")
      .addText((text) =>
        text
          .setValue(String(this.plugin.settings.pomodoro.long_break_minutes))
          .onChange(async (value) => {
            const n = parseInt(value);
            if (!isNaN(n) && n > 0) {
              this.plugin.settings.pomodoro.long_break_minutes = n;
              await this.plugin.saveSettings();
            }
          })
      );

    new Setting(details)
      .setName("Sessions before long break")
      .addText((text) =>
        text
          .setValue(String(this.plugin.settings.pomodoro.cycles_before_long))
          .onChange(async (value) => {
            const n = parseInt(value);
            if (!isNaN(n) && n > 0) {
              this.plugin.settings.pomodoro.cycles_before_long = n;
              await this.plugin.saveSettings();
            }
          })
      );

    // Behaviour
    details.createEl("h4", { text: "Behaviour" });

    new Setting(details)
      .setName("Sound on phase end")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.sound_on_phase_end)
          .onChange(async (value) => {
            this.plugin.settings.sound_on_phase_end = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(details)
      .setName("Confetti on session complete")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.confetti_on_complete)
          .onChange(async (value) => {
            this.plugin.settings.confetti_on_complete = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(details)
      .setName("Streak grace period (days)")
      .setDesc("How many days you can miss before your streak resets. 0 = no grace period.")
      .addText((text) =>
        text
          .setValue(String(this.plugin.settings.streak_grace_period))
          .onChange(async (value) => {
            const n = parseInt(value);
            if (!isNaN(n) && n >= 0) {
              this.plugin.settings.streak_grace_period = n;
              await this.plugin.saveSettings();
            }
          })
      );

    // ── Study tags ───────────────────────────────────────────────────────────
    details.createEl("h4", { text: "Study tags" });
    this.renderStudyTags(details);
  }

  private renderStudyTags(container: HTMLElement): void {
    const listEl = container.createDiv({ cls: "tracker-habit-defs-list" });
    this.refreshStudyTagList(listEl);

    // Add form
    container.createEl("h4", { text: "Add tag" });

    let newTagName  = "";
    let newTagColor = "#7c3aed";

    new Setting(container)
      .setName("Tag name")
      .addText((t) =>
        t.setPlaceholder("e.g. math").onChange((v) => { newTagName = v.trim(); })
      );

    new Setting(container)
      .setName("Color")
      .addColorPicker((cp) =>
        cp.setValue(newTagColor).onChange((v) => { newTagColor = v; })
      );

    new Setting(container)
      .addButton((btn) =>
        btn.setButtonText("Add tag").setCta().onClick(async () => {
          if (!newTagName) return;
          this.plugin.settings.study_tags.push({ name: newTagName, color: newTagColor });
          await this.plugin.saveSettings();
          this.refreshStudyTagList(listEl);
        })
      );
  }

  private refreshStudyTagList(listEl: HTMLElement): void {
    listEl.empty();
    const tags = this.plugin.settings.study_tags;

    if (tags.length === 0) {
      listEl.createEl("p", {
        cls: "tracker-chart-empty",
        text: "No tags defined yet.",
        attr: { style: "padding:0.5em 0; font-size:0.88em;" },
      });
      return;
    }

    for (let i = 0; i < tags.length; i++) {
      const tag = tags[i];
      const row = new Setting(listEl)
        .setName(tag.name)
        .addColorPicker((cp) =>
          cp.setValue(tag.color).onChange(async (v) => {
            tag.color = v;
            await this.plugin.saveSettings();
          })
        )
        .addButton((btn) =>
          btn.setButtonText("Remove").setWarning().onClick(async () => {
            tags.splice(i, 1);
            await this.plugin.saveSettings();
            this.refreshStudyTagList(listEl);
          })
        );

      const dot = document.createElement("span");
      dot.style.cssText = `display:inline-block;width:10px;height:10px;border-radius:50%;background:${tag.color};margin-left:6px;vertical-align:middle;`;
      row.nameEl.appendChild(dot);
    }
  }

  // ── Habits ──────────────────────────────────────────────────────────────────

  private renderHabits(containerEl: HTMLElement): void {
    const details = containerEl.createEl("details", { cls: "tracker-settings-section" });
    details.createEl("summary", { text: "Habits" });

    new Setting(details)
      .setName("Habit field name")
      .setDesc("The inline field key for habit logs (e.g. habit in (habit:: meditate) ✓).")
      .addText((text) =>
        text
          .setPlaceholder("habit")
          .setValue(this.plugin.settings.habit_field_name)
          .onChange(async (value) => {
            this.plugin.settings.habit_field_name = value.trim() || "habit";
            await this.plugin.saveSettings();
          })
      );

    new Setting(details)
      .setName("Habit field aliases")
      .setDesc("Additional field names that map to habit logs.")
      .addText((text) =>
        text
          .setPlaceholder("habits")
          .setValue(this.plugin.settings.habit_field_aliases.join(", "))
          .onChange(async (value) => {
            this.plugin.settings.habit_field_aliases = value
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean);
            await this.plugin.saveSettings();
          })
      );

    new Setting(details)
      .setName("Mood field name")
      .setDesc("The inline field key for mood entries (e.g. mood in (mood:: 😊)).")
      .addText((text) =>
        text
          .setPlaceholder("mood")
          .setValue(this.plugin.settings.mood_field_name)
          .onChange(async (value) => {
            this.plugin.settings.mood_field_name = value.trim() || "mood";
            await this.plugin.saveSettings();
          })
      );

    new Setting(details)
      .setName("Mood scale type")
      .addDropdown((dropdown) =>
        dropdown
          .addOptions({
            emoji: "Emoji set",
            "1-5": "Numeric 1–5",
            "1-10": "Numeric 1–10",
            custom: "Custom",
          })
          .setValue(this.plugin.settings.mood_scale_type)
          .onChange(async (value) => {
            this.plugin.settings.mood_scale_type = value as PluginSettings["mood_scale_type"];
            await this.plugin.saveSettings();
          })
      );

    new Setting(details)
      .setName("Mood emojis")
      .setDesc("Space-separated emoji set (worst → best). Used when scale type is \"Emoji set\".")
      .addText((text) =>
        text
          .setValue(this.plugin.settings.mood_emojis.join(" "))
          .onChange(async (value) => {
            const emojis = value.split(/\s+/).filter(Boolean);
            if (emojis.length > 0) {
              this.plugin.settings.mood_emojis = emojis;
              await this.plugin.saveSettings();
            }
          })
      );

    // ── Habit definitions ───────────────────────────────────────────────────
    details.createEl("h4", { text: "Habit definitions" });
    this.renderHabitDefinitions(details);
  }

  private renderHabitDefinitions(container: HTMLElement): void {
    // Existing definitions
    const listEl = container.createDiv({ cls: "tracker-habit-defs-list" });
    this.refreshHabitDefsList(listEl);

    // ── Add form ────────────────────────────────────────────────────────────
    container.createEl("h4", { text: "Add habit" });

    let newName   = "";
    let newType: "binary" | "quantity" = "binary";
    let newColor  = "#7c3aed";
    let newEmoji  = "";
    let newUnit   = "";
    let newTarget = 0;

    new Setting(container)
      .setName("Name")
      .addText((text) =>
        text.setPlaceholder("e.g. Meditate").onChange((v) => { newName = v.trim(); })
      );

    new Setting(container)
      .setName("Type")
      .addDropdown((dd) =>
        dd
          .addOptions({ binary: "Binary (done / skip)", quantity: "Quantity (number)" })
          .setValue(newType)
          .onChange((v) => { newType = v as "binary" | "quantity"; })
      );

    new Setting(container)
      .setName("Color")
      .addColorPicker((cp) =>
        cp.setValue(newColor).onChange((v) => { newColor = v; })
      );

    new Setting(container)
      .setName("Emoji (optional)")
      .addText((text) =>
        text.setPlaceholder("🧘").onChange((v) => { newEmoji = v.trim(); })
      );

    new Setting(container)
      .setName("Unit (quantity only)")
      .setDesc("e.g. glasses, minutes, pages")
      .addText((text) =>
        text.setPlaceholder("glasses").onChange((v) => { newUnit = v.trim(); })
      );

    new Setting(container)
      .setName("Daily target (quantity only)")
      .setDesc("Leave 0 for no target.")
      .addText((text) =>
        text.setPlaceholder("8").onChange((v) => {
          newTarget = parseInt(v) || 0;
        })
      );

    new Setting(container)
      .addButton((btn) =>
        btn.setButtonText("Add habit").setCta().onClick(async () => {
          if (!newName) return;
          const id = newName.toLowerCase().replace(/\s+/g, "-");
          this.plugin.settings.habit_definitions.push({
            id,
            name: newName,
            type: newType,
            color: newColor,
            emoji:           newEmoji  || undefined,
            unit:            (newType === "quantity" && newUnit)   ? newUnit   : undefined,
            target_per_day:  (newType === "quantity" && newTarget) ? newTarget : undefined,
          });
          await this.plugin.saveSettings();
          this.refreshHabitDefsList(listEl);
        })
      );
  }

  private refreshHabitDefsList(listEl: HTMLElement): void {
    listEl.empty();
    const defs = this.plugin.settings.habit_definitions;
    if (defs.length === 0) {
      listEl.createEl("p", {
        cls: "tracker-chart-empty",
        text: "No habits defined yet.",
        attr: { style: "padding:0.5em 0; font-size:0.88em;" },
      });
      return;
    }

    for (let i = 0; i < defs.length; i++) {
      const def = defs[i];
      const descParts: string[] = [def.type];
      if (def.type === "quantity") {
        if (def.unit) descParts.push(def.unit);
        if (def.target_per_day) descParts.push(`target: ${def.target_per_day}`);
      }
      const row = new Setting(listEl)
        .setName((def.emoji ? def.emoji + " " : "") + def.name)
        .setDesc(descParts.join(" · "))
        .addButton((btn) =>
          btn.setButtonText("Remove").setWarning().onClick(async () => {
            this.plugin.settings.habit_definitions.splice(i, 1);
            await this.plugin.saveSettings();
            this.refreshHabitDefsList(listEl);
          })
        );

      // Color dot in the name
      const dot = document.createElement("span");
      dot.style.cssText = `display:inline-block;width:10px;height:10px;border-radius:50%;background:${def.color};margin-left:6px;vertical-align:middle;`;
      row.nameEl.appendChild(dot);
    }
  }

  // ── Data ────────────────────────────────────────────────────────────────────

  private renderData(containerEl: HTMLElement): void {
    const details = containerEl.createEl("details", { cls: "tracker-settings-section" });
    details.createEl("summary", { text: "Data" });

    new Setting(details)
      .setName("Full vault rescan")
      .setDesc("Rebuild the entry cache by re-reading every markdown file in the vault.")
      .addButton((btn) =>
        btn.setButtonText("Rescan now").onClick(() => {
          this.plugin.fullRescan();
        })
      );

    new Setting(details)
      .setName("Export data")
      .setDesc("Download all study sessions as a flat file.")
      .addButton((btn) =>
        btn.setButtonText("Export CSV").onClick(() => {
          exportCsv(this.plugin.store);
        })
      )
      .addButton((btn) =>
        btn.setButtonText("Export JSON").onClick(() => {
          exportJson(this.plugin.store);
        })
      );

    new Setting(details)
      .setName("Import data")
      .setDesc("Import study sessions from a previously exported CSV or JSON file. Sessions will be appended to the matching daily notes.")
      .addButton((btn) =>
        btn.setButtonText("Import file").onClick(() => {
          importFile(this.plugin.app, this.plugin.settings, () => {
            this.plugin.fullRescan();
          });
        })
      );

    // Scan errors
    const errors = this.plugin.settings.scan_errors;
    if (errors.length > 0) {
      const errDetails = details.createEl("details", { cls: "tracker-scan-errors" });
      errDetails.createEl("summary", {
        text: `Scan errors (${errors.length})`,
      });
      const ul = errDetails.createEl("ul");
      for (const err of errors) {
        ul.createEl("li", {
          text: `${err.file}:${err.line} — ${err.message}`,
        });
      }
    }
  }
}

// Re-export for convenience
import { PluginSettings } from "./types";
