import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  TimerEngine,
  PomodoroConfig,
  PhaseEndPayload,
} from "../src/study/timer/TimerEngine";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const DEFAULT_CONFIG: PomodoroConfig = {
  work_minutes: 25,
  short_break_minutes: 5,
  long_break_minutes: 15,
  cycles_before_long: 4,
};

// Tiny config for tests that need to run through full cycles quickly
const TINY_CONFIG: PomodoroConfig = {
  work_minutes: 1,        // 60s
  short_break_minutes: 1, // 60s
  long_break_minutes: 2,  // 120s
  cycles_before_long: 2,
};

// Advance fake clock by 1s then tick — mirrors the real 250ms interval behaviour
// but at 1s resolution since tick() uses wall-clock time.
function tickN(engine: TimerEngine, n: number): void {
  for (let i = 0; i < n; i++) {
    vi.advanceTimersByTime(1000);
    engine.tick();
  }
}

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

// ── Stopwatch ─────────────────────────────────────────────────────────────────

describe("stopwatch mode", () => {
  let engine: TimerEngine;

  beforeEach(() => {
    engine = new TimerEngine(DEFAULT_CONFIG);
    engine.configure("stopwatch");
  });

  it("starts in idle state", () => {
    expect(engine.state).toBe("idle");
    expect(engine.elapsed_seconds).toBe(0);
    expect(engine.target_seconds).toBeUndefined();
  });

  it("start() transitions to running", () => {
    engine.start();
    expect(engine.state).toBe("running");
  });

  it("tick() increments elapsed_seconds", () => {
    engine.start();
    tickN(engine, 5);
    expect(engine.elapsed_seconds).toBe(5);
  });

  it("tick() fires 'tick' event each second", () => {
    engine.start();
    const ticks: number[] = [];
    engine.on<{ elapsed_seconds: number }>("tick", (p) => ticks.push(p.elapsed_seconds));
    tickN(engine, 3);
    expect(ticks).toEqual([1, 2, 3]);
  });

  it("tick() never fires phase_end", () => {
    engine.start();
    const ended = vi.fn();
    engine.on("phase_end", ended);
    tickN(engine, 10000);
    expect(ended).not.toHaveBeenCalled();
    expect(engine.state).toBe("running");
  });

  it("pause() stops elapsed from incrementing", () => {
    engine.start();
    tickN(engine, 3);
    engine.pause();
    expect(engine.state).toBe("paused");
    tickN(engine, 10); // ticks while paused should be ignored
    expect(engine.elapsed_seconds).toBe(3);
  });

  it("resume() continues from where it paused", () => {
    engine.start();
    tickN(engine, 3);
    engine.pause();
    engine.resume();
    expect(engine.state).toBe("running");
    tickN(engine, 2);
    expect(engine.elapsed_seconds).toBe(5);
  });

  it("reset() returns to idle with 0 elapsed", () => {
    engine.start();
    tickN(engine, 10);
    engine.reset();
    expect(engine.state).toBe("idle");
    expect(engine.elapsed_seconds).toBe(0);
  });

  it("tick() does nothing when idle", () => {
    engine.tick();
    expect(engine.elapsed_seconds).toBe(0);
  });

  it("start() is a no-op when already running", () => {
    engine.start();
    tickN(engine, 3);
    engine.start(); // second call
    expect(engine.elapsed_seconds).toBe(3);
  });
});

// ── Countdown timer mode ──────────────────────────────────────────────────────

describe("timer mode (countdown)", () => {
  let engine: TimerEngine;

  beforeEach(() => {
    engine = new TimerEngine(DEFAULT_CONFIG);
    engine.configure("timer", 10); // 10-second countdown
  });

  it("initialises with correct target", () => {
    expect(engine.target_seconds).toBe(10);
    expect(engine.state).toBe("idle");
  });

  it("counts down and fires phase_end at target", () => {
    engine.start();
    const events: PhaseEndPayload[] = [];
    engine.on<PhaseEndPayload>("phase_end", (p) => events.push(p));
    tickN(engine, 10);
    expect(engine.state).toBe("finished");
    expect(events).toHaveLength(1);
    expect(events[0].elapsed_seconds).toBe(10);
  });

  it("does not fire phase_end before target", () => {
    engine.start();
    const ended = vi.fn();
    engine.on("phase_end", ended);
    tickN(engine, 9);
    expect(ended).not.toHaveBeenCalled();
    expect(engine.state).toBe("running");
  });

  it("reset() brings back to idle with 0 elapsed", () => {
    engine.start();
    tickN(engine, 5);
    engine.reset();
    expect(engine.state).toBe("idle");
    expect(engine.elapsed_seconds).toBe(0);
  });

  it("does not keep running after finished", () => {
    engine.start();
    const ended = vi.fn();
    engine.on("phase_end", ended);
    tickN(engine, 20); // tick well past target
    expect(ended).toHaveBeenCalledTimes(1); // only once
    expect(engine.state).toBe("finished");
  });
});

// ── Pomodoro mode ─────────────────────────────────────────────────────────────

describe("pomodoro mode", () => {
  let engine: TimerEngine;

  beforeEach(() => {
    engine = new TimerEngine(TINY_CONFIG);
    engine.configure("pomodoro");
  });

  it("initialises on session 1, work phase", () => {
    expect(engine.phase).toBe("work");
    expect(engine.current_cycle).toBe(1);
    expect(engine.target_seconds).toBe(60); // 1 min
  });

  it("work phase ends after work_minutes", () => {
    engine.start();
    const events: PhaseEndPayload[] = [];
    engine.on<PhaseEndPayload>("phase_end", (p) => events.push(p));
    tickN(engine, 60);
    expect(engine.state).toBe("finished");
    expect(events[0].phase).toBe("work");
  });

  it("start() after work ends advances to short_break", () => {
    engine.start();
    tickN(engine, 60); // work ends
    expect(engine.state).toBe("finished");
    engine.start(); // begin break
    expect(engine.phase).toBe("short_break");
    expect(engine.target_seconds).toBe(60);
    expect(engine.current_cycle).toBe(1); // still session 1 during break
  });

  it("short break ends → work session 2 starts", () => {
    engine.start();
    tickN(engine, 60); // work 1 ends
    engine.start();
    tickN(engine, 60); // short break ends
    engine.start();
    expect(engine.phase).toBe("work");
    expect(engine.current_cycle).toBe(2);
  });

  it("reaches long break after cycles_before_long work sessions", () => {
    // TINY_CONFIG: cycles_before_long = 2
    // Session 1 work → short break → session 2 work → long break
    engine.start();
    tickN(engine, 60); // work 1
    engine.start();
    tickN(engine, 60); // short break
    engine.start();
    tickN(engine, 60); // work 2
    expect(engine.state).toBe("finished");
    engine.start();
    expect(engine.phase).toBe("long_break");
    expect(engine.current_cycle).toBe(2); // "Session 2 · Long Break"
    expect(engine.target_seconds).toBe(120); // 2 min
  });

  it("after long break, resets to session 1", () => {
    // Complete 2 full cycles to get to long break
    engine.start(); tickN(engine, 60); // work 1
    engine.start(); tickN(engine, 60); // short break
    engine.start(); tickN(engine, 60); // work 2 → long break pending
    engine.start(); tickN(engine, 120); // long break
    engine.start();
    expect(engine.phase).toBe("work");
    expect(engine.current_cycle).toBe(1);
  });

  it("elapsed resets to 0 between phases", () => {
    engine.start();
    tickN(engine, 60); // work ends
    expect(engine.elapsed_seconds).toBe(0); // reset after phase_end
  });

  // ── skip() ──────────────────────────────────────────────────────────────

  it("skip() ends current phase immediately", () => {
    engine.start();
    tickN(engine, 20); // partway through work
    const events: PhaseEndPayload[] = [];
    engine.on<PhaseEndPayload>("phase_end", (p) => events.push(p));
    engine.skip();
    expect(engine.state).toBe("finished");
    expect(events[0].phase).toBe("work");
    expect(events[0].elapsed_seconds).toBe(20);
  });

  it("skip() advances to next phase on start()", () => {
    engine.start();
    tickN(engine, 20);
    engine.skip();
    engine.start();
    expect(engine.phase).toBe("short_break");
  });

  it("skip() from paused state works", () => {
    engine.start();
    tickN(engine, 10);
    engine.pause();
    engine.skip();
    expect(engine.state).toBe("finished");
  });

  it("skip() is a no-op in stopwatch mode", () => {
    const sw = new TimerEngine(DEFAULT_CONFIG);
    sw.configure("stopwatch");
    sw.start();
    sw.skip(); // should do nothing
    expect(sw.state).toBe("running");
  });

  it("skip() is a no-op in timer mode", () => {
    const t = new TimerEngine(DEFAULT_CONFIG);
    t.configure("timer", 60);
    t.start();
    t.skip(); // no-op
    expect(t.state).toBe("running");
  });

  // ── pause/resume in pomodoro ─────────────────────────────────────────────

  it("pausing during pomodoro preserves phase and cycle", () => {
    engine.start();
    tickN(engine, 30);
    engine.pause();
    expect(engine.phase).toBe("work");
    expect(engine.current_cycle).toBe(1);
    expect(engine.elapsed_seconds).toBe(30);
  });

  it("resetting mid-phase returns to idle without advancing phase", () => {
    engine.start();
    tickN(engine, 30);
    engine.reset();
    expect(engine.state).toBe("idle");
    expect(engine.phase).toBe("work");
    expect(engine.current_cycle).toBe(1);
    expect(engine.elapsed_seconds).toBe(0);
  });
});

// ── Events ────────────────────────────────────────────────────────────────────

describe("event system", () => {
  it("off() removes the listener", () => {
    const engine = new TimerEngine(DEFAULT_CONFIG);
    engine.configure("stopwatch");
    engine.start();
    const cb = vi.fn();
    const unsub = engine.on("tick", cb);
    engine.tick();
    expect(cb).toHaveBeenCalledTimes(1);
    unsub();
    engine.tick();
    expect(cb).toHaveBeenCalledTimes(1); // not called again
  });

  it("multiple listeners on same event all fire", () => {
    const engine = new TimerEngine(DEFAULT_CONFIG);
    engine.configure("stopwatch");
    engine.start();
    const a = vi.fn(), b = vi.fn();
    engine.on("tick", a);
    engine.on("tick", b);
    engine.tick();
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
  });
});

// ── configure() guard ─────────────────────────────────────────────────────────

describe("configure()", () => {
  it("throws when called while running", () => {
    const engine = new TimerEngine(DEFAULT_CONFIG);
    engine.configure("stopwatch");
    engine.start();
    expect(() => engine.configure("timer", 60)).toThrow();
  });

  it("can reconfigure after pause", () => {
    const engine = new TimerEngine(DEFAULT_CONFIG);
    engine.configure("stopwatch");
    engine.start();
    engine.pause();
    expect(() => engine.configure("timer", 30)).not.toThrow();
    expect(engine.target_seconds).toBe(30);
  });
});

// ── Snapshot persistence ──────────────────────────────────────────────────────

describe("snapshot", () => {
  it("round-trips idle state", () => {
    const engine = new TimerEngine(DEFAULT_CONFIG);
    engine.configure("timer", 300);
    const snap = engine.getSnapshot();
    const engine2 = new TimerEngine(DEFAULT_CONFIG);
    engine2.loadSnapshot(snap);
    expect(engine2.state).toBe("idle");
    expect(engine2.mode).toBe("timer");
    expect(engine2.target_seconds).toBe(300);
  });

  it("round-trips paused state", () => {
    const engine = new TimerEngine(DEFAULT_CONFIG);
    engine.configure("stopwatch");
    engine.start();
    tickN(engine, 45);
    engine.pause();
    const snap = engine.getSnapshot();
    const engine2 = new TimerEngine(DEFAULT_CONFIG);
    engine2.loadSnapshot(snap);
    expect(engine2.state).toBe("paused");
    expect(engine2.elapsed_seconds).toBe(45);
  });

  it("round-trips pomodoro mid-session", () => {
    const engine = new TimerEngine(TINY_CONFIG);
    engine.configure("pomodoro");
    engine.start();
    tickN(engine, 60); // work 1 ends
    engine.start();    // short break begins
    tickN(engine, 30);
    engine.pause();
    const snap = engine.getSnapshot();
    const engine2 = new TimerEngine(TINY_CONFIG);
    engine2.loadSnapshot(snap);
    expect(engine2.phase).toBe("short_break");
    expect(engine2.current_cycle).toBe(1);
    expect(engine2.elapsed_seconds).toBe(30);
  });

  it("reload with wall clock: running stopwatch elapsed accumulates correctly", () => {
    const engine = new TimerEngine(DEFAULT_CONFIG);
    engine.configure("stopwatch");
    engine.start();
    tickN(engine, 10);

    // Simulate: grab snapshot, then 20 real seconds pass before reload
    const snap = engine.getSnapshot();
    snap.state = "running";
    snap.wall_clock_at_start = Date.now() - 20_000; // 20s ago
    snap.elapsed_at_start = 10; // had 10s when it was snapshotted

    const engine2 = new TimerEngine(DEFAULT_CONFIG);
    engine2.loadSnapshot(snap);
    expect(engine2.state).toBe("running");
    // Should reflect ~30s total (10 pre-snap + 20 wall-clock)
    expect(engine2.elapsed_seconds).toBeGreaterThanOrEqual(29);
    expect(engine2.elapsed_seconds).toBeLessThanOrEqual(31);
  });

  it("reload: timer that completed while Obsidian was closed lands in finished", () => {
    const engine = new TimerEngine(DEFAULT_CONFIG);
    engine.configure("timer", 300); // 5 min
    engine.start();

    const snap = engine.getSnapshot();
    snap.state = "running";
    snap.elapsed_at_start = 0;
    snap.wall_clock_at_start = Date.now() - 400_000; // 400s ago — past the 300s target

    const engine2 = new TimerEngine(DEFAULT_CONFIG);
    engine2.loadSnapshot(snap);
    expect(engine2.state).toBe("finished");
  });
});
