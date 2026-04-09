import { App, Modal, Notice } from "obsidian";
import dayjs from "dayjs";
import { PluginSettings } from "../settings/types";
import { parseDuration } from "../shared/data/FieldParser";
import { SessionWriter } from "./SessionWriter";
import { EntryStore } from "../shared/data/EntryStore";

export class ManualEntryModal extends Modal {
  private onSaved: () => void;

  constructor(
    app: App,
    private settings: PluginSettings,
    private store: EntryStore,
    onSaved: () => void,
  ) {
    super(app);
    this.onSaved = onSaved;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("tracker-manual-modal");

    contentEl.createEl("h2", { text: "Add study session", cls: "tracker-modal-title" });

    // ── Date ─────────────────────────────────────────────────────────────────
    const dateRow = contentEl.createDiv({ cls: "tracker-modal-row" });
    dateRow.createEl("label", { text: "Date", cls: "tracker-modal-label" });
    const dateInput = dateRow.createEl("input", {
      type: "date",
      cls: "tracker-modal-input",
      value: dayjs().format("YYYY-MM-DD"),
    });

    // ── Duration ──────────────────────────────────────────────────────────────
    const durRow = contentEl.createDiv({ cls: "tracker-modal-row" });
    durRow.createEl("label", { text: "Duration", cls: "tracker-modal-label" });
    const durInput = durRow.createEl("input", {
      type: "text",
      cls: "tracker-modal-input",
      placeholder: "e.g. 25m, 1h30m, 1:30",
    });
    const durHint = durRow.createEl("span", { cls: "tracker-modal-hint", text: "" });

    // Live parse feedback
    durInput.addEventListener("input", () => {
      const val = parseDuration(durInput.value, this.settings.study_default_unit);
      if (durInput.value.trim() === "") {
        durHint.textContent = "";
        durInput.removeClass("tracker-input-error");
      } else if (val === null) {
        durHint.textContent = "Cannot parse duration";
        durInput.addClass("tracker-input-error");
      } else {
        const h = Math.floor(val / 60);
        const m = Math.round(val % 60);
        durHint.textContent = h > 0 ? `= ${h}h ${m}m` : `= ${m} min`;
        durInput.removeClass("tracker-input-error");
      }
    });

    // ── Tag ───────────────────────────────────────────────────────────────────
    const tagRow = contentEl.createDiv({ cls: "tracker-modal-row" });
    tagRow.createEl("label", { text: "Tag", cls: "tracker-modal-label" });
    const tagSelect = tagRow.createEl("select", { cls: "tracker-modal-input tracker-modal-select" });
    tagSelect.createEl("option", { text: "— none —", value: "" });
    for (const tag of this.settings.study_tags) {
      tagSelect.createEl("option", { text: tag.name, value: tag.name });
    }

    // ── Note ──────────────────────────────────────────────────────────────────
    const noteRow = contentEl.createDiv({ cls: "tracker-modal-row" });
    noteRow.createEl("label", { text: "Note (optional)", cls: "tracker-modal-label" });
    const noteInput = noteRow.createEl("input", {
      type: "text",
      cls: "tracker-modal-input",
      placeholder: "Short description…",
    });

    // ── Buttons ───────────────────────────────────────────────────────────────
    const btnRow = contentEl.createDiv({ cls: "tracker-modal-btn-row" });

    const cancelBtn = btnRow.createEl("button", {
      cls: "tracker-modal-btn tracker-modal-btn-cancel",
      text: "Cancel",
    });
    cancelBtn.addEventListener("click", () => this.close());

    const saveBtn = btnRow.createEl("button", {
      cls: "tracker-modal-btn tracker-modal-btn-save",
      text: "Save session",
    });
    saveBtn.addEventListener("click", () => this.save(dateInput, durInput, tagSelect, noteInput));

    // Allow Enter to submit
    contentEl.addEventListener("keydown", (e: KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        this.save(dateInput, durInput, tagSelect, noteInput);
      } else if (e.key === "Escape") {
        this.close();
      }
    });

    // Focus duration input after open
    setTimeout(() => durInput.focus(), 50);
  }

  onClose(): void {
    this.contentEl.empty();
  }

  private async save(
    dateInput: HTMLInputElement,
    durInput: HTMLInputElement,
    tagSelect: HTMLSelectElement,
    noteInput: HTMLInputElement,
  ): Promise<void> {
    const date = dateInput.value.trim();
    if (!date || !dayjs(date, "YYYY-MM-DD", true).isValid()) {
      new Notice("Please enter a valid date.");
      dateInput.focus();
      return;
    }

    const minutes = parseDuration(durInput.value, this.settings.study_default_unit);
    if (minutes === null || minutes <= 0) {
      new Notice("Please enter a valid duration (e.g. 25m, 1h30m).");
      durInput.addClass("tracker-input-error");
      durInput.focus();
      return;
    }

    const tags = tagSelect.value ? [tagSelect.value] : [];
    const note = noteInput.value.trim() || undefined;

    const writer = new SessionWriter(this.app, this.settings);
    try {
      await writer.write({ date, duration_minutes: minutes, tags, note });
      new Notice(`Session saved: ${Math.round(minutes)} min`);
      this.close();
      this.onSaved();
    } catch (err) {
      console.error("Tracker: failed to write session", err);
      new Notice("Failed to save session. See console for details.");
    }
  }
}
