import { Notice } from "obsidian";
import dayjs from "dayjs";
import TrackerPlugin from "../../main";
import { TimerEngine, TimerMode, TimerPhase, PhaseEndPayload } from "./TimerEngine";
import { parseDuration } from "../../shared/data/FieldParser";

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtSeconds(s: number): string {
  const totalSecs = Math.max(0, Math.floor(s));
  const h   = Math.floor(totalSecs / 3600);
  const m   = Math.floor((totalSecs % 3600) / 60);
  const sec = totalSecs % 60;
  const mm  = String(m).padStart(2, "0");
  const ss  = String(sec).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

function fmtMinutes(minutes: number): string {
  if (minutes <= 0) return "0m";
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  return `${m}m`;
}

const PHASE_EMOJI: Record<TimerPhase, string> = {
  work:        "🎯",
  short_break: "☕",
  long_break:  "🏖",
};

const PHASE_LABEL: Record<TimerPhase, string> = {
  work:        "Work",
  short_break: "Short break",
  long_break:  "Long break",
};

// ── TimerUI ───────────────────────────────────────────────────────────────────

export class TimerUI {
  private engine: TimerEngine;
  private unsubs: Array<() => void> = [];

  // DOM refs updated during render
  private clockEl!: HTMLElement;
  private playBtn!: HTMLButtonElement;
  private resetBtn!: HTMLButtonElement;
  private skipBtn!: HTMLButtonElement;
  private phaseRow!: HTMLElement;
  private phaseLabel!: HTMLElement;
  private durationRow!: HTMLElement;
  private durationInput!: HTMLInputElement;
  private todayStatsEl!: HTMLElement;
  private nextPhaseEl!: HTMLElement;
  private modeTabMap = new Map<TimerMode, HTMLButtonElement>();
  private tagChipMap = new Map<string, HTMLButtonElement>();

  constructor(
    private container: HTMLElement,
    private plugin: TrackerPlugin,
  ) {
    // Use the shared engine owned by the plugin
    this.engine = plugin.timerEngine;
  }

  // ── Lifecycle ────────────────────────────────────────────────────────────

  mount(): void {
    this.render();
    this.bindEngineEvents();
    this.refreshDisplay();
  }

  unmount(): void {
    this.unsubs.forEach((u) => u());
    this.unsubs = [];
  }

  // ── Render ────────────────────────────────────────────────────────────────

  private render(): void {
    this.container.empty();
    this.container.addClass("tracker-timer-container");

    this.renderModeTabs();
    this.renderPhaseRow();
    this.renderClock();
    this.renderDurationRow();
    this.renderControls();
    this.renderTagPicker();
    this.renderTodayStats();
  }

  private renderModeTabs(): void {
    const row = this.container.createDiv({ cls: "tracker-mode-tabs" });
    const modes: TimerMode[] = ["timer", "stopwatch", "pomodoro"];
    const labels: Record<TimerMode, string> = {
      timer: "Timer", stopwatch: "Stopwatch", pomodoro: "Pomodoro",
    };

    for (const mode of modes) {
      const btn = row.createEl("button", {
        cls: "tracker-mode-tab",
        text: labels[mode],
      });
      btn.addEventListener("click", () => this.switchMode(mode));
      this.modeTabMap.set(mode, btn);
    }
  }

  private renderPhaseRow(): void {
    this.phaseRow = this.container.createDiv({ cls: "tracker-phase-row" });
    this.phaseLabel = this.phaseRow.createSpan({ cls: "tracker-phase-label" });
    const gear = this.phaseRow.createEl("button", {
      cls: "tracker-phase-gear",
      text: "⚙",
      attr: { "aria-label": "Pomodoro settings" },
    });
    gear.addEventListener("click", () => {
      (this.plugin.app as any).setting?.open();
    });
  }

  private renderClock(): void {
    this.clockEl = this.container.createDiv({ cls: "tracker-clock" });
  }

  private renderDurationRow(): void {
    this.durationRow = this.container.createDiv({ cls: "tracker-duration-row" });
    this.durationRow.createSpan({ text: "Duration: " });
    this.durationInput = this.durationRow.createEl("input", {
      cls: "tracker-duration-input",
      attr: { type: "text", placeholder: "e.g. 25m, 1h30m" },
    });
    this.durationInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") this.applyTimerDuration();
    });
    this.durationInput.addEventListener("blur", () => this.applyTimerDuration());
  }

  private renderControls(): void {
    const row = this.container.createDiv({ cls: "tracker-controls" });

    this.playBtn = row.createEl("button", { cls: "tracker-btn tracker-btn-play" });
    this.playBtn.addEventListener("click", () => this.onPlayPause());

    this.resetBtn = row.createEl("button", {
      cls: "tracker-btn tracker-btn-reset",
      text: "↻",
      attr: { "aria-label": "Reset" },
    });
    this.resetBtn.addEventListener("click", () => this.onReset());

    this.skipBtn = row.createEl("button", {
      cls: "tracker-btn tracker-btn-skip",
      text: "Skip →",
      attr: { "aria-label": "Skip phase" },
    });
    this.skipBtn.addEventListener("click", () => this.onSkip());
  }

  private renderTagPicker(): void {
    const tags = this.plugin.settings.study_tags;
    if (tags.length === 0) return;

    const row = this.container.createDiv({ cls: "tracker-tag-row" });
    this.tagChipMap.clear();

    for (const tag of tags) {
      const btn = row.createEl("button", {
        cls: "tracker-tag-chip tracker-tag-chip-btn",
        text: `#${tag.name}`,
      });
      btn.style.setProperty("--tag-color", tag.color);
      btn.addEventListener("click", () => this.toggleTag(tag.name));
      this.tagChipMap.set(tag.name, btn);
    }
  }

  private toggleTag(name: string): void {
    const newTag = this.plugin.activeStudyTag === name ? null : name;
    this.plugin.activeStudyTag = newTag;
    this.tagChipMap.forEach((btn, tagName) => {
      btn.toggleClass("is-active", tagName === newTag);
    });
  }

  private renderTodayStats(): void {
    const row = this.container.createDiv({ cls: "tracker-today-stats" });
    this.todayStatsEl = row.createSpan({ cls: "tracker-today-total" });
    this.nextPhaseEl  = row.createSpan({ cls: "tracker-next-phase" });
  }

  // ── Display refresh ───────────────────────────────────────────────────────

  private refreshDisplay(): void {
    this.refreshModeTabs();
    this.refreshPhaseRow();
    this.refreshClock();
    this.refreshDurationRow();
    this.refreshControls();
    this.refreshTodayStats();
  }

  private refreshModeTabs(): void {
    this.modeTabMap.forEach((btn, mode) => {
      btn.toggleClass("is-active", mode === this.engine.mode);
    });
  }

  private refreshPhaseRow(): void {
    const isPomo = this.engine.mode === "pomodoro";
    this.phaseRow.style.display = isPomo ? "" : "none";
    if (!isPomo) return;

    const { phase, current_cycle } = this.engine;
    this.phaseLabel.setText(
      `${PHASE_EMOJI[phase]} ${PHASE_LABEL[phase]} · Session ${current_cycle}`
    );
  }

  private refreshClock(): void {
    const { mode, state, elapsed_seconds, target_seconds } = this.engine;

    let displaySeconds: number;
    if (mode === "stopwatch") {
      displaySeconds = elapsed_seconds;
    } else {
      displaySeconds =
        target_seconds !== undefined
          ? Math.max(0, target_seconds - elapsed_seconds)
          : 0;
    }
    this.clockEl.setText(fmtSeconds(displaySeconds));
    this.clockEl.toggleClass("is-finished", state === "finished");
    this.clockEl.toggleClass("is-running",  state === "running");
  }

  private refreshDurationRow(): void {
    const show = this.engine.mode === "timer" && this.engine.state === "idle";
    this.durationRow.style.display = show ? "" : "none";
  }

  private refreshControls(): void {
    const { state, mode } = this.engine;

    if (state === "running") {
      this.playBtn.setText("⏸");
      this.playBtn.ariaLabel = "Pause";
    } else {
      this.playBtn.setText("▶");
      this.playBtn.ariaLabel = state === "paused" ? "Resume" : "Start";
    }

    const noTarget = mode === "timer" && this.engine.target_seconds === undefined;
    this.playBtn.disabled = noTarget && state === "idle";

    this.skipBtn.style.display = mode === "pomodoro" ? "" : "none";
    this.skipBtn.disabled = state !== "running" && state !== "paused";
  }

  private refreshTodayStats(): void {
    const today = dayjs().format("YYYY-MM-DD");
    const totalMin = this.plugin.store.getTotalMinutes({
      date_from: today,
      date_to: today,
    });
    this.todayStatsEl.setText(`Total today: ${fmtMinutes(totalMin)}`);

    if (this.engine.mode === "pomodoro" && this.engine.state === "finished") {
      this.nextPhaseEl.setText(`Next: ${this.nextPhaseLabel()}`);
      this.nextPhaseEl.style.display = "";
    } else {
      this.nextPhaseEl.style.display = "none";
    }
  }

  private nextPhaseLabel(): string {
    const { phase, current_cycle } = this.engine;
    const { cycles_before_long } = this.plugin.settings.pomodoro;
    if (phase === "work") {
      return current_cycle >= cycles_before_long ? "Long break" : "Short break";
    }
    const nextSession = phase === "short_break" ? current_cycle + 1 : 1;
    return `Work · Session ${nextSession}`;
  }

  // ── Control handlers ──────────────────────────────────────────────────────

  private onPlayPause(): void {
    const { state } = this.engine;
    if (state === "running") {
      this.engine.pause();
      this.plugin.stopTimerTick();
    } else if (state === "paused") {
      this.engine.resume();
      this.plugin.startTimerTick();
    } else {
      this.engine.start();
      if (this.engine.state === "running") this.plugin.startTimerTick();
    }
    this.refreshDisplay();
    this.plugin.saveTimerSnapshot(this.engine.getSnapshot());
  }

  private onReset(): void {
    if (
      this.engine.mode === "stopwatch" &&
      (this.engine.state === "running" || this.engine.state === "paused") &&
      this.engine.elapsed_seconds >= 60
    ) {
      this.plugin.saveStudySession(this.engine.elapsed_seconds / 60);
    }
    this.engine.reset();
    this.plugin.stopTimerTick();
    this.refreshDisplay();
    this.plugin.saveTimerSnapshot(this.engine.getSnapshot());
  }

  private onSkip(): void {
    if (
      this.engine.mode === "pomodoro" &&
      this.engine.phase === "work" &&
      (this.engine.state === "running" || this.engine.state === "paused") &&
      this.engine.elapsed_seconds >= 60
    ) {
      const minutes = this.engine.elapsed_seconds / 60;
      this.plugin.saveStudySession(minutes);
      new Notice(`⏩ Partial session logged (${fmtMinutes(minutes)})`);
    }
    this.engine.skip();
    this.plugin.stopTimerTick();
    this.refreshDisplay();
    this.plugin.saveTimerSnapshot(this.engine.getSnapshot());
  }

  private switchMode(mode: TimerMode): void {
    if (this.engine.state === "running") {
      this.engine.pause();
      this.plugin.stopTimerTick();
    }
    try {
      this.engine.configure(mode);
    } catch {
      new Notice("Stop the timer before switching modes.");
      return;
    }
    this.refreshDisplay();
    this.plugin.saveTimerSnapshot(this.engine.getSnapshot());
  }

  private applyTimerDuration(): void {
    if (this.engine.mode !== "timer") return;
    const raw = this.durationInput.value.trim();
    if (!raw) return;
    const minutes = parseDuration(raw, this.plugin.settings.study_default_unit);
    if (minutes === null) {
      this.durationInput.addClass("tracker-input-error");
      return;
    }
    this.durationInput.removeClass("tracker-input-error");
    this.engine.configure("timer", Math.round(minutes * 60));
    this.refreshDisplay();
  }

  // ── Engine events ─────────────────────────────────────────────────────────

  private bindEngineEvents(): void {
    // Engine ticks are driven by plugin.startTimerTick(); we subscribe to
    // the tick event to keep the display in sync.
    const unsubTick = this.engine.on("tick", () => this.refreshDisplay());
    // phase_end: plugin handles session saving; we just refresh display.
    const unsubPhase = this.engine.on<PhaseEndPayload>("phase_end", () => {
      this.refreshDisplay();
    });
    this.unsubs.push(unsubTick, unsubPhase);
  }
}

