// ── Types ─────────────────────────────────────────────────────────────────────

export type TimerMode  = "timer" | "stopwatch" | "pomodoro";
export type TimerState = "idle" | "running" | "paused" | "finished";
export type TimerPhase = "work" | "short_break" | "long_break";
export type TimerEvent = "tick" | "phase_end";

export interface PomodoroConfig {
  work_minutes: number;
  short_break_minutes: number;
  long_break_minutes: number;
  cycles_before_long: number;
}

export interface PhaseEndPayload {
  phase: TimerPhase;
  elapsed_seconds: number;
}

export interface TimerSnapshot {
  mode: TimerMode;
  state: TimerState;
  phase: TimerPhase;
  elapsed_seconds: number;
  target_seconds: number | undefined;
  /** 1-indexed current work session (shown as "Session N" in UI) */
  current_cycle: number;
  /**
   * Date.now() value recorded when the timer was last started or resumed.
   * Used to recompute elapsed time after an Obsidian restart.
   * Only meaningful when state === "running".
   */
  wall_clock_at_start: number | null;
  /**
   * elapsed_seconds at the moment of the last start/resume.
   * Combined with wall_clock_at_start to reconstruct elapsed after reload.
   */
  elapsed_at_start: number;
  pomodoro_config: PomodoroConfig;
}

// ── Engine ────────────────────────────────────────────────────────────────────

export class TimerEngine {
  // Public state — read by the UI
  state: TimerState = "idle";
  mode: TimerMode   = "stopwatch";
  phase: TimerPhase = "work";
  elapsed_seconds   = 0;
  target_seconds: number | undefined = undefined;
  /** 1-indexed: session 1 … cycles_before_long */
  current_cycle     = 1;

  private pomodoroConfig: PomodoroConfig;
  private wallClockAtStart: number | null = null;
  private elapsedAtStart   = 0;

  private listeners = new Map<TimerEvent, Array<(payload: unknown) => void>>();

  constructor(config: PomodoroConfig) {
    this.pomodoroConfig = { ...config };
  }

  // ── Configuration ─────────────────────────────────────────────────────────

  /**
   * Switch mode and reset to idle. Only allowed when not actively running.
   * `target_seconds` is only used for "timer" mode.
   */
  configure(mode: TimerMode, target_seconds?: number): void {
    if (this.state === "running") {
      throw new Error("Cannot reconfigure a running timer — pause or reset first");
    }
    this.mode    = mode;
    this.phase   = "work";
    this.current_cycle   = 1;
    this.elapsed_seconds = 0;
    this.elapsedAtStart  = 0;
    this.wallClockAtStart = null;
    this.state   = "idle";

    if (mode === "timer") {
      this.target_seconds = target_seconds;
    } else if (mode === "pomodoro") {
      this.target_seconds = this.pomodoroConfig.work_minutes * 60;
    } else {
      this.target_seconds = undefined; // stopwatch — no target
    }
  }

  updatePomodoroConfig(config: PomodoroConfig): void {
    this.pomodoroConfig = { ...config };
    // If we're idle/finished in pomodoro mode, refresh target
    if (this.mode === "pomodoro" && this.state === "idle") {
      this.target_seconds = this.phaseTargetSeconds(this.phase);
    }
  }

  // ── Controls ──────────────────────────────────────────────────────────────

  start(): void {
    if (this.state === "idle") {
      this.recordWallClock();
      this.state = "running";
    } else if (this.state === "finished" && this.mode === "pomodoro") {
      this.advancePomodoro();
      this.recordWallClock();
      this.state = "running";
    }
    // no-op in any other state
  }

  pause(): void {
    if (this.state !== "running") return;
    this.wallClockAtStart = null;
    this.state = "paused";
  }

  resume(): void {
    if (this.state !== "paused") return;
    this.recordWallClock();
    this.state = "running";
  }

  /** Return to the beginning of the current phase. */
  reset(): void {
    this.elapsed_seconds  = 0;
    this.elapsedAtStart   = 0;
    this.wallClockAtStart = null;
    this.state = "idle";
  }

  /**
   * Immediately end the current phase (pomodoro only).
   * Goes to "finished"; user must call start() to begin the next phase.
   */
  skip(): void {
    if (this.mode !== "pomodoro") return;
    if (this.state !== "running" && this.state !== "paused") return;
    this.emit("phase_end", {
      phase: this.phase,
      elapsed_seconds: this.elapsed_seconds,
    } satisfies PhaseEndPayload);
    this.elapsed_seconds  = 0;
    this.elapsedAtStart   = 0;
    this.wallClockAtStart = null;
    this.state = "finished";
  }

  // ── Tick (called by the View's interval) ──────────────────────────────────

  /**
   * Advance the timer by one second. Called by the View's setInterval.
   * Pure: no side-effects other than state mutation and event emission.
   */
  tick(): void {
    if (this.state !== "running") return;

    this.elapsed_seconds++;
    this.emit("tick", { elapsed_seconds: this.elapsed_seconds });

    if (this.mode === "stopwatch") return; // stopwatch never finishes

    if (
      this.target_seconds !== undefined &&
      this.elapsed_seconds >= this.target_seconds
    ) {
      this.emit("phase_end", {
        phase: this.phase,
        elapsed_seconds: this.elapsed_seconds,
      } satisfies PhaseEndPayload);
      this.elapsed_seconds  = 0;
      this.elapsedAtStart   = 0;
      this.wallClockAtStart = null;
      this.state = "finished";
    }
  }

  // ── Events ────────────────────────────────────────────────────────────────

  on<T = unknown>(event: TimerEvent, callback: (payload: T) => void): () => void {
    if (!this.listeners.has(event)) this.listeners.set(event, []);
    this.listeners.get(event)!.push(callback as (p: unknown) => void);
    return () => this.off(event, callback);
  }

  off<T = unknown>(event: TimerEvent, callback: (payload: T) => void): void {
    const cbs = this.listeners.get(event);
    if (cbs) {
      this.listeners.set(
        event,
        cbs.filter((c) => c !== (callback as (p: unknown) => void))
      );
    }
  }

  // ── Snapshot persistence ──────────────────────────────────────────────────

  getSnapshot(): TimerSnapshot {
    return {
      mode:                 this.mode,
      state:                this.state,
      phase:                this.phase,
      elapsed_seconds:      this.elapsed_seconds,
      target_seconds:       this.target_seconds,
      current_cycle:        this.current_cycle,
      wall_clock_at_start:  this.wallClockAtStart,
      elapsed_at_start:     this.elapsedAtStart,
      pomodoro_config:      { ...this.pomodoroConfig },
    };
  }

  /**
   * Restore engine state from a saved snapshot.
   * If the timer was running when saved, elapsed time is recomputed from the
   * wall clock so that closing Obsidian for an hour during a stopwatch
   * correctly reflects the hour.
   */
  loadSnapshot(snap: TimerSnapshot): void {
    this.mode             = snap.mode;
    this.phase            = snap.phase;
    this.target_seconds   = snap.target_seconds;
    this.current_cycle    = snap.current_cycle;
    this.pomodoroConfig   = { ...snap.pomodoro_config };

    if (snap.state === "running" && snap.wall_clock_at_start !== null) {
      const wallElapsed = Math.floor(
        (Date.now() - snap.wall_clock_at_start) / 1000
      );
      const totalElapsed = snap.elapsed_at_start + wallElapsed;

      if (
        this.mode !== "stopwatch" &&
        this.target_seconds !== undefined &&
        totalElapsed >= this.target_seconds
      ) {
        // Phase completed while Obsidian was closed — land in finished state
        this.elapsed_seconds  = this.target_seconds;
        this.state            = "finished";
        this.wallClockAtStart = null;
        this.elapsedAtStart   = 0;
      } else {
        this.elapsed_seconds  = totalElapsed;
        this.state            = "running";
        this.wallClockAtStart = snap.wall_clock_at_start;
        this.elapsedAtStart   = snap.elapsed_at_start;
      }
    } else {
      this.elapsed_seconds  = snap.elapsed_seconds;
      this.state            = snap.state;
      this.wallClockAtStart = null;
      this.elapsedAtStart   = snap.elapsed_at_start;
    }
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private recordWallClock(): void {
    this.elapsedAtStart   = this.elapsed_seconds;
    this.wallClockAtStart = Date.now();
  }

  /**
   * Called when start() is triggered from "finished" state in pomodoro mode.
   * Advances phase and updates target_seconds / current_cycle.
   *
   * Pomodoro cycle semantics (current_cycle is 1-indexed work session):
   *   work(1) → short_break → work(2) → … → work(N) → long_break → work(1)
   *   where N = cycles_before_long
   */
  private advancePomodoro(): void {
    if (this.phase === "work") {
      if (this.current_cycle >= this.pomodoroConfig.cycles_before_long) {
        this.phase = "long_break";
        // current_cycle stays at max (shown in UI as "Session N · Long Break")
      } else {
        this.phase = "short_break";
      }
    } else if (this.phase === "short_break") {
      this.current_cycle++;
      this.phase = "work";
    } else {
      // long_break → reset to session 1
      this.current_cycle = 1;
      this.phase = "work";
    }

    this.target_seconds   = this.phaseTargetSeconds(this.phase);
    this.elapsed_seconds  = 0;
    this.elapsedAtStart   = 0;
  }

  private phaseTargetSeconds(phase: TimerPhase): number {
    switch (phase) {
      case "work":        return this.pomodoroConfig.work_minutes * 60;
      case "short_break": return this.pomodoroConfig.short_break_minutes * 60;
      case "long_break":  return this.pomodoroConfig.long_break_minutes * 60;
    }
  }

  private emit(event: TimerEvent, payload: unknown): void {
    this.listeners.get(event)?.forEach((cb) => cb(payload));
  }
}
