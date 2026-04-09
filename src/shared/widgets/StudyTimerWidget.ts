import { MarkdownRenderChild, MarkdownPostProcessorContext, Notice } from "obsidian";
import dayjs from "dayjs";
import TrackerPlugin from "../../main";
import { TimerPhase } from "../../study/timer/TimerEngine";
import { parseConfig } from "./parseConfig";

// ── Helpers (kept local to avoid circular deps) ───────────────────────────────

function fmtSeconds(s: number): string {
  const totalSecs = Math.max(0, Math.floor(s));
  const h   = Math.floor(totalSecs / 3600);
  const m   = Math.floor((totalSecs % 3600) / 60);
  const sec = totalSecs % 60;
  const mm  = String(m).padStart(2, "0");
  const ss  = String(sec).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

function fmtMinutes(m: number): string {
  if (m <= 0) return "0m";
  const h   = Math.floor(m / 60);
  const min = Math.round(m % 60);
  if (h > 0 && min > 0) return `${h}h ${min}m`;
  if (h > 0) return `${h}h`;
  return `${min}m`;
}

const PHASE_EMOJI: Record<TimerPhase, string> = {
  work: "🎯", short_break: "☕", long_break: "🏖",
};
const PHASE_LABEL: Record<TimerPhase, string> = {
  work: "Work", short_break: "Short break", long_break: "Long break",
};

// ── Widget ────────────────────────────────────────────────────────────────────

/**
 * Inline timer widget for daily notes.
 *
 * ```study-timer
 * tag: math     # optional – locks the tag for this widget
 * ```
 *
 * Shares the plugin-level TimerEngine so state is in sync with the Study view.
 * Uses MarkdownRenderChild so event listeners are cleaned up when the note
 * is navigated away from.
 */
export class StudyTimerWidget extends MarkdownRenderChild {
  private lockedTag: string | null;
  private tagChipMap = new Map<string, HTMLButtonElement>();

  // DOM refs
  private headerEl!: HTMLElement;
  private clockEl!: HTMLElement;
  private playBtn!: HTMLButtonElement;
  private skipBtn!: HTMLButtonElement;
  private todayEl!: HTMLElement;
  private nextEl!: HTMLElement;

  constructor(
    containerEl: HTMLElement,
    source: string,
    ctx: MarkdownPostProcessorContext,
    private plugin: TrackerPlugin,
  ) {
    super(containerEl);
    const cfg = parseConfig(source);
    this.lockedTag = cfg["tag"] ?? null;
    // If a tag is locked in the config, apply it immediately so sessions
    // started from this widget are tagged correctly.
    if (this.lockedTag) this.plugin.activeStudyTag = this.lockedTag;
    ctx.addChild(this);
  }

  onload(): void {
    this.buildUI();
  }

  // ── UI construction ───────────────────────────────────────────────────────

  private buildUI(): void {
    const el = this.containerEl;
    el.addClasses(["tracker-widget", "tracker-timer-widget"]);

    // Mode selector
    const modeRow = el.createDiv({ cls: "tracker-timer-mode-row" });
    const modes: Array<{ mode: import("../../study/timer/TimerEngine").TimerMode; label: string }> = [
      { mode: "stopwatch", label: "Stopwatch" },
      { mode: "timer",     label: "Timer" },
      { mode: "pomodoro",  label: "Pomodoro" },
    ];
    for (const { mode, label } of modes) {
      const btn = modeRow.createEl("button", {
        cls: "tracker-timer-mode-btn",
        text: label,
      });
      btn.addEventListener("click", () => {
        const engine = this.plugin.timerEngine;
        if (engine.state === "running" || engine.state === "paused") return;
        engine.configure(mode);
        this.plugin.stopTimerTick();
        this.plugin.saveTimerSnapshot(engine.getSnapshot());
        this.refreshDisplay();
      });
      this.register(() => {}); // placeholder so we can update active state in refreshDisplay
      // store ref by mode for active highlighting
      (btn as HTMLButtonElement & { dataset: DOMStringMap }).dataset["mode"] = mode;
    }

    // Header: phase info (pomodoro only)
    this.headerEl = el.createDiv({ cls: "tracker-timer-widget-header" });

    // Clock
    this.clockEl = el.createDiv({ cls: "tracker-timer-widget-clock" });

    // Controls
    const controls = el.createDiv({ cls: "tracker-timer-widget-controls" });

    this.playBtn = controls.createEl("button", {
      cls: "tracker-btn tracker-btn-play tracker-timer-widget-play",
    });
    this.playBtn.addEventListener("click", () => this.onPlayPause());

    const resetBtn = controls.createEl("button", {
      cls: "tracker-btn tracker-btn-reset",
      text: "↻",
      attr: { "aria-label": "Reset" },
    });
    resetBtn.addEventListener("click", () => this.onReset());

    this.skipBtn = controls.createEl("button", {
      cls: "tracker-btn tracker-btn-skip",
      text: "Skip →",
      attr: { "aria-label": "Skip phase" },
    });
    this.skipBtn.addEventListener("click", () => this.onSkip());

    // Tag row
    this.buildTagRow(el);

    // Footer
    const footer = el.createDiv({ cls: "tracker-timer-widget-footer" });
    this.todayEl = footer.createSpan({ cls: "tracker-timer-widget-today" });
    this.nextEl  = footer.createSpan({ cls: "tracker-timer-widget-next" });
    this.nextEl.style.display = "none";

    // Subscribe to engine events — Component.register() calls the fn on unload
    this.register(
      this.plugin.timerEngine.on("tick", () => this.refreshDisplay())
    );
    this.register(
      this.plugin.timerEngine.on("phase_end", () => this.refreshDisplay())
    );

    this.refreshDisplay();
  }

  private buildTagRow(parent: HTMLElement): void {
    const tags = this.plugin.settings.study_tags;
    if (tags.length === 0) return;

    const row = parent.createDiv({ cls: "tracker-tag-row" });

    if (this.lockedTag) {
      // Show a static non-interactive chip
      const tag = tags.find((t) => t.name === this.lockedTag);
      if (tag) {
        const chip = row.createEl("span", {
          cls: "tracker-tag-chip is-active",
          text: `#${tag.name}`,
        });
        chip.style.setProperty("--tag-color", tag.color);
      }
    } else {
      for (const tag of tags) {
        const btn = row.createEl("button", {
          cls: "tracker-tag-chip tracker-tag-chip-btn",
          text: `#${tag.name}`,
        });
        btn.style.setProperty("--tag-color", tag.color);
        btn.addEventListener("click", () => this.toggleTag(tag.name));
        this.tagChipMap.set(tag.name, btn);
      }
      // Reflect the current active tag on first render
      this.syncTagChips();
    }
  }

  private toggleTag(name: string): void {
    this.plugin.activeStudyTag =
      this.plugin.activeStudyTag === name ? null : name;
    this.syncTagChips();
  }

  private syncTagChips(): void {
    this.tagChipMap.forEach((btn, name) => {
      btn.toggleClass("is-active", name === this.plugin.activeStudyTag);
    });
  }

  // ── Display refresh ───────────────────────────────────────────────────────

  private refreshDisplay(): void {
    const engine = this.plugin.timerEngine;
    const { mode, state, phase, current_cycle, elapsed_seconds, target_seconds } = engine;
    const isPomo = mode === "pomodoro";

    // Highlight active mode button
    this.containerEl.querySelectorAll<HTMLButtonElement>(".tracker-timer-mode-btn").forEach((btn) => {
      btn.toggleClass("is-active", btn.dataset["mode"] === mode);
      btn.disabled = state === "running" || state === "paused";
    });

    // Header: show phase info for pomodoro, hide otherwise
    if (isPomo) {
      this.headerEl.setText(`${PHASE_EMOJI[phase]} ${PHASE_LABEL[phase]} · Session ${current_cycle}`);
      this.headerEl.style.display = "";
    } else {
      this.headerEl.style.display = "none";
    }

    // Clock
    let displaySecs: number;
    if (mode === "stopwatch") {
      displaySecs = elapsed_seconds;
    } else {
      displaySecs =
        target_seconds !== undefined
          ? Math.max(0, target_seconds - elapsed_seconds)
          : 0;
    }
    this.clockEl.setText(fmtSeconds(displaySecs));
    this.clockEl.toggleClass("is-running",  state === "running");
    this.clockEl.toggleClass("is-finished", state === "finished");

    // Play button
    if (state === "running") {
      this.playBtn.setText("⏸");
      this.playBtn.ariaLabel = "Pause";
    } else {
      this.playBtn.setText("▶");
      this.playBtn.ariaLabel = state === "paused" ? "Resume" : "Start";
    }
    const noTarget = mode === "timer" && target_seconds === undefined;
    this.playBtn.disabled = noTarget && state === "idle";

    // Skip button
    this.skipBtn.style.display = isPomo ? "" : "none";
    this.skipBtn.disabled = state !== "running" && state !== "paused";

    // Keep tag chips in sync (another UI may have changed the active tag)
    this.syncTagChips();

    // Today total
    const today = dayjs().format("YYYY-MM-DD");
    const totalMin = this.plugin.store.getTotalMinutes({
      date_from: today,
      date_to: today,
    });
    this.todayEl.setText(`Today: ${fmtMinutes(totalMin)}`);

    // Next phase hint
    if (isPomo && state === "finished") {
      this.nextEl.setText(`Next: ${this.nextPhaseLabel()}`);
      this.nextEl.style.display = "block";
    } else {
      this.nextEl.style.display = "none";
    }
  }

  private nextPhaseLabel(): string {
    const { phase, current_cycle } = this.plugin.timerEngine;
    const { cycles_before_long } = this.plugin.settings.pomodoro;
    if (phase === "work") {
      return current_cycle >= cycles_before_long ? "Long break" : "Short break";
    }
    const nextSession = phase === "short_break" ? current_cycle + 1 : 1;
    return `Work · Session ${nextSession}`;
  }

  // ── Control handlers ──────────────────────────────────────────────────────

  private onPlayPause(): void {
    const engine = this.plugin.timerEngine;
    const { state } = engine;
    if (state === "running") {
      engine.pause();
      this.plugin.stopTimerTick();
    } else if (state === "paused") {
      engine.resume();
      this.plugin.startTimerTick();
    } else {
      engine.start();
      if (engine.state === "running") this.plugin.startTimerTick();
    }
    this.refreshDisplay();
    this.plugin.saveTimerSnapshot(engine.getSnapshot());
  }

  private onReset(): void {
    const engine = this.plugin.timerEngine;
    if (
      engine.mode === "stopwatch" &&
      (engine.state === "running" || engine.state === "paused") &&
      engine.elapsed_seconds >= 60
    ) {
      this.plugin.saveStudySession(engine.elapsed_seconds / 60);
    }
    engine.reset();
    this.plugin.stopTimerTick();
    this.refreshDisplay();
    this.plugin.saveTimerSnapshot(engine.getSnapshot());
  }

  private onSkip(): void {
    const engine = this.plugin.timerEngine;
    if (
      engine.mode === "pomodoro" &&
      engine.phase === "work" &&
      (engine.state === "running" || engine.state === "paused") &&
      engine.elapsed_seconds >= 60
    ) {
      const minutes = engine.elapsed_seconds / 60;
      this.plugin.saveStudySession(minutes);
      new Notice(`⏩ Partial session logged (${fmtMinutes(minutes)})`);
    }
    engine.skip();
    this.plugin.stopTimerTick();
    this.refreshDisplay();
    this.plugin.saveTimerSnapshot(engine.getSnapshot());
  }
}
