import { Plugin, Notice, Modal, WorkspaceLeaf } from "obsidian";
import { PluginSettings } from "./settings/types";
import { DEFAULT_SETTINGS } from "./settings/defaults";
import { TrackerSettingsTab } from "./settings/SettingsTab";
import { EntryStore } from "./shared/data/EntryStore";
import { Heatmap, HeatmapDay } from "./shared/charts/Heatmap";
import { StudyView, STUDY_VIEW_TYPE } from "./study/StudyView";
import { HabitsView, HABITS_VIEW_TYPE } from "./habits/HabitsView";
import { HabitWidget } from "./shared/widgets/HabitWidget";
import { MoodWidget } from "./shared/widgets/MoodWidget";
import { StudyHeatmapWidget } from "./shared/widgets/StudyHeatmapWidget";
import { StudyBarsWidget } from "./shared/widgets/StudyBarsWidget";
import { MoodChartWidget } from "./shared/widgets/MoodChartWidget";
import { launchConfetti } from "./shared/utils/confetti";
import { CacheManager, CacheData } from "./shared/data/CacheManager";
import { VaultScanner, ScannerConfig } from "./shared/data/VaultScanner";
import { TimerEngine, TimerSnapshot, PhaseEndPayload } from "./study/timer/TimerEngine";
import { SessionWriter } from "./study/SessionWriter";
import { StudyTimerWidget } from "./shared/widgets/StudyTimerWidget";
import dayjs from "dayjs";

// Persisted to data.json — settings and timer state live here together
interface StoredData {
  settings?: Partial<PluginSettings>;
  timer_snapshot?: TimerSnapshot;
}

export default class TrackerPlugin extends Plugin {
  settings!: PluginSettings;
  store!: EntryStore;
  cache!: CacheManager;
  scanner!: VaultScanner;
  sessionWriter!: SessionWriter;
  timerEngine!: TimerEngine;
  /** The currently-selected study tag, shared across TimerUI and the widget. */
  activeStudyTag: string | null = null;

  // In-memory mirror of data.json so we never lose keys on partial saves
  private storedData: StoredData = {};
  private timerTickId: number | null = null;
  private timerTickCount = 0;

  async onload() {
    await this.loadAllData();

    this.store = new EntryStore();
    this.cache = new CacheManager(this.app, this.manifest.id);
    this.sessionWriter = new SessionWriter(this.app, this.settings);

    // ── Shared timer engine ─────────────────────────────────────────────────
    this.timerEngine = new TimerEngine(this.settings.pomodoro);
    const savedSnap = this.storedData.timer_snapshot;
    if (savedSnap) this.timerEngine.loadSnapshot(savedSnap);
    else this.timerEngine.configure("pomodoro");
    this.timerEngine.on<PhaseEndPayload>("phase_end", (p) => this.onTimerPhaseEnd(p));
    if (this.timerEngine.state === "running") this.startTimerTick();

    this.registerView(STUDY_VIEW_TYPE,  (leaf) => new StudyView(leaf, this));
    this.registerView(HABITS_VIEW_TYPE, (leaf) => new HabitsView(leaf, this));

    this.addRibbonIcon("book-open-check", "Open study tracker", () => {
      this.openStudyView();
    });
    this.addRibbonIcon("check-square", "Open habits tracker", () => {
      this.openHabitsView();
    });

    this.addCommand({
      id: "open-study-view",
      name: "Open timer",
      callback: () => this.openStudyView(),
    });

    this.addCommand({
      id: "open-habits-view",
      name: "Open habits",
      callback: () => this.openHabitsView(),
    });

    this.addCommand({
      id: "launch-confetti",
      name: "Launch confetti 🎉",
      hotkeys: [{ modifiers: ["Mod", "Shift"], key: "y" }],
      callback: () => launchConfetti(),
    });

    await this.hydrateFromCache();

    // ── Inline code-block widgets ───────────────────────────────────────────
    this.registerMarkdownCodeBlockProcessor("habit", (source, el, ctx) => {
      const widget = new HabitWidget(el, source, ctx, this);
      widget.render();
    });

    this.registerMarkdownCodeBlockProcessor("mood", (_source, el, ctx) => {
      const widget = new MoodWidget(el, ctx, this);
      widget.render();
    });

    this.registerMarkdownCodeBlockProcessor("study-heatmap", (source, el, ctx) => {
      new StudyHeatmapWidget(el, source, ctx, this).render();
    });

    this.registerMarkdownCodeBlockProcessor("study-bars", (source, el, ctx) => {
      new StudyBarsWidget(el, source, ctx, this).render();
    });

    this.registerMarkdownCodeBlockProcessor("mood-chart", (source, el, ctx) => {
      new MoodChartWidget(el, source, ctx, this).render();
    });

    this.registerMarkdownCodeBlockProcessor("study-timer", (source, el, ctx) => {
      new StudyTimerWidget(el, source, ctx, this);
    });

    this.addSettingTab(new TrackerSettingsTab(this.app, this));

    this.addCommand({
      id: "full-rescan",
      name: "Full vault rescan",
      callback: () => this.fullRescan(),
    });

    this.addCommand({
      id: "debug-heatmap",
      name: "Debug: show heatmap",
      callback: () => this.openDebugHeatmap(),
    });

    console.log("Study & Habits Tracker: loaded");
  }

  async onunload() {
    this.stopTimerTick();
    await this.saveTimerSnapshot(this.timerEngine.getSnapshot());
    const cacheData = this.buildCacheData(new Date().toISOString());
    await this.cache.flushPending(cacheData);
    console.log("Study & Habits Tracker: unloaded");
  }

  // ── Data persistence ────────────────────────────────────────────────────────

  private async loadAllData(): Promise<void> {
    const raw = (await this.loadData()) as StoredData | null ?? {};
    // Backward-compat: if `settings` key is absent, the whole object IS settings
    const settingsSrc = raw.settings ?? raw;
    this.settings = Object.assign({}, DEFAULT_SETTINGS, settingsSrc);
    this.storedData = raw;
  }

  async saveSettings(): Promise<void> {
    this.storedData.settings = this.settings;
    await this.saveData(this.storedData);
  }

  async saveTimerSnapshot(snap: TimerSnapshot): Promise<void> {
    this.storedData.timer_snapshot = snap;
    await this.saveData(this.storedData);
  }

  getTimerSnapshot(): TimerSnapshot | undefined {
    return this.storedData.timer_snapshot;
  }

  // ── Timer engine control ────────────────────────────────────────────────────

  startTimerTick(): void {
    if (this.timerTickId !== null) return;
    this.timerTickId = window.setInterval(() => {
      this.timerEngine.tick();
      this.timerTickCount++;
      if (this.timerTickCount >= 10) {
        this.timerTickCount = 0;
        this.saveTimerSnapshot(this.timerEngine.getSnapshot());
      }
    }, 1000);
  }

  stopTimerTick(): void {
    if (this.timerTickId === null) return;
    window.clearInterval(this.timerTickId);
    this.timerTickId = null;
    this.timerTickCount = 0;
  }

  saveStudySession(minutes: number): void {
    const tags = this.activeStudyTag ? [this.activeStudyTag] : [];
    this.sessionWriter
      .write({ date: dayjs().format("YYYY-MM-DD"), duration_minutes: minutes, tags })
      .then(({ file }) => {
        this.scanner?.scanFile(
          this.app.vault.getAbstractFileByPath(file.path) as any
        );
      })
      .catch((err) => {
        console.error("Tracker: failed to write session", err);
        new Notice("Tracker: could not write to daily note — check console");
      });
  }

  private onTimerPhaseEnd(payload: PhaseEndPayload): void {
    const { phase, elapsed_seconds } = payload;
    const minutes = elapsed_seconds / 60;
    // target_seconds is still set at the moment this fires (reset happens after)
    const target = this.timerEngine.target_seconds;
    const isFullCompletion = target !== undefined && elapsed_seconds >= target;
    this.stopTimerTick();

    if (this.settings.sound_on_phase_end) this.playBeep();

    if (phase === "work") {
      this.saveStudySession(minutes);
      const h = Math.floor(minutes / 60);
      const m = Math.round(minutes % 60);
      const dur = h > 0 ? (m > 0 ? `${h}h ${m}m` : `${h}h`) : `${m}m`;
      new Notice(`🎯 Work session complete! (${dur}) — logged to daily note`);

      // Confetti only for genuine completions: a full pomodoro work phase,
      // or a timer that ran for at least 10 minutes without being skipped.
      if (this.settings.confetti_on_complete && isFullCompletion) {
        const mode = this.timerEngine.mode;
        if (mode === "pomodoro" || (mode === "timer" && minutes >= 10)) {
          launchConfetti();
        }
      }
    } else {
      const emoji = phase === "short_break" ? "☕" : "🏖";
      new Notice(`${emoji} Break over — time to work!`);
    }

    this.saveTimerSnapshot(this.timerEngine.getSnapshot());
  }

  private playBeep(): void {
    try {
      const ctx = new AudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.6);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.6);
    } catch {
      // AudioContext not available
    }
  }

  // ── Scanner factory ─────────────────────────────────────────────────────────

  buildScannerConfig(): ScannerConfig {
    const s = this.settings;
    return {
      study_field_names: [s.study_field_name, ...s.study_field_aliases],
      habit_field_names: [s.habit_field_name, ...s.habit_field_aliases],
      mood_field_names:  [s.mood_field_name,  ...s.mood_field_aliases],
      study_default_unit: s.study_default_unit,
      date_format: s.date_format,
      ignored_folders: s.ignored_folders,
    };
  }

  buildScanner(): VaultScanner {
    return new VaultScanner(this.app.vault, this.buildScannerConfig(), this.store);
  }

  // ── Cache / scan lifecycle ──────────────────────────────────────────────────

  private async hydrateFromCache(): Promise<void> {
    const cached = await this.cache.load();

    if (cached) {
      this.store.addMany(cached.entries);
      console.log(`Tracker: hydrated ${cached.entries.length} entries from cache`);
    }

    const since = cached ? new Date(cached.last_full_scan) : new Date(0);
    this.scanner = this.buildScanner();
    const { errors } = cached
      ? await this.scanner.scanIncremental(since)
      : await this.scanner.scanAll();

    this.settings.scan_errors = errors;

    const now = new Date().toISOString();
    const newCache = this.buildCacheData(now);
    if (!cached) newCache.last_full_scan = now;
    else newCache.last_full_scan = cached.last_full_scan;

    this.cache.scheduleSave(newCache);
  }

  async fullRescan(): Promise<void> {
    new Notice("Tracker: rescanning vault…");
    this.store.clear();
    this.scanner = this.buildScanner();
    const { errors } = await this.scanner.scanAll();
    this.settings.scan_errors = errors;

    const now = new Date().toISOString();
    await this.cache.save(this.buildCacheData(now));

    const count = this.store.size;
    new Notice(`Tracker: rescan complete — ${count} entries found`);
    console.log(`Tracker: full rescan done, ${count} entries, ${errors.length} errors`);
  }

  // ── View helpers ────────────────────────────────────────────────────────────

  async openStudyView(): Promise<void> {
    await this.openView(STUDY_VIEW_TYPE);
  }

  async openHabitsView(): Promise<void> {
    await this.openView(HABITS_VIEW_TYPE);
  }

  private async openView(type: string): Promise<void> {
    const { workspace } = this.app;
    let leaf = workspace.getLeavesOfType(type)[0];
    if (!leaf) {
      leaf = workspace.getLeaf(false) as WorkspaceLeaf;
      await leaf.setViewState({ type, active: true });
    }
    workspace.revealLeaf(leaf);
  }

  private openDebugHeatmap(): void {
    const modal = new Modal(this.app);
    modal.titleEl.setText("Heatmap debug");
    modal.contentEl.style.overflowX = "auto";

    const data = new Map<string, HeatmapDay>();
    for (let i = 0; i < 200; i++) {
      if (Math.random() < 0.65) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        const dateStr = date.toISOString().slice(0, 10);
        data.set(dateStr, {
          date: dateStr,
          minutes: Math.floor(Math.random() * 180) + 5,
          sessions: Math.floor(Math.random() * 4) + 1,
        });
      }
    }

    const heatmap = new Heatmap(modal.contentEl);
    heatmap.render(data, { onDayClick: (d) => console.log("Heatmap click:", d) });
    modal.open();
  }

  private buildCacheData(lastFullScan: string): CacheData {
    return {
      version: 1,
      last_full_scan: lastFullScan,
      entries: this.store.getAll(),
      file_hashes: {},
    };
  }
}
