import { ItemView, WorkspaceLeaf } from "obsidian";
import TrackerPlugin from "../main";
import { TimerUI } from "./timer/TimerUI";
import { TodayPanel } from "./stats/TodayPanel";
import { HeatmapPanel } from "./stats/HeatmapPanel";
import { BarsPanel } from "./stats/BarsPanel";
import { RecentSessions } from "./stats/RecentSessions";
import { ManualEntryModal } from "./ManualEntryModal";

export const STUDY_VIEW_TYPE = "tracker-study-view";

export class StudyView extends ItemView {
  private plugin: TrackerPlugin;
  private timerUI: TimerUI | null = null;
  private todayPanel: TodayPanel | null = null;
  private heatmapPanel: HeatmapPanel | null = null;
  private barsPanel: BarsPanel | null = null;
  private recentSessions: RecentSessions | null = null;

  constructor(leaf: WorkspaceLeaf, plugin: TrackerPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType(): string { return STUDY_VIEW_TYPE; }
  getDisplayText(): string { return "Study tracker"; }
  getIcon(): string { return "book-open-check"; }

  async onOpen(): Promise<void> {
    const root = this.containerEl.children[1] as HTMLElement;
    root.empty();
    root.addClass("tracker-study-view");

    // ── Section A: Timer ───────────────────────────────────────────────────
    if (this.plugin.settings.show_timer_in_study_view) {
      const timerSection = root.createDiv({ cls: "tracker-section tracker-section-timer" });
      this.timerUI = new TimerUI(timerSection, this.plugin);
      this.timerUI.mount();
    }

    // ── Section B: Today ───────────────────────────────────────────────────
    const todaySection = root.createDiv({ cls: "tracker-section tracker-section-today" });
    todaySection.createEl("h3", { text: "Today", cls: "tracker-section-heading" });
    this.todayPanel = new TodayPanel(
      todaySection,
      this.plugin.store,
      this.plugin.settings.streak_grace_period,
    );
    this.todayPanel.render();

    // ── Section C: Heatmap ────────────────────────────────────────────────
    const heatmapSection = root.createDiv({ cls: "tracker-section tracker-section-heatmap" });
    heatmapSection.createEl("h3", { text: "Year overview", cls: "tracker-section-heading" });
    this.heatmapPanel = new HeatmapPanel(
      heatmapSection,
      this.plugin.store,
      this.plugin.settings.study_tags,
      this.plugin.app,
    );
    this.heatmapPanel.render();

    // ── Section D: Bars ───────────────────────────────────────────────────
    const barsSection = root.createDiv({ cls: "tracker-section tracker-section-bars" });
    barsSection.createEl("h3", { text: "Recent activity", cls: "tracker-section-heading" });
    this.barsPanel = new BarsPanel(
      barsSection,
      this.plugin.store,
      this.plugin.settings.study_tags,
    );
    this.barsPanel.render();

    // ── Section E: Recent sessions ────────────────────────────────────────
    const recentSection = root.createDiv({ cls: "tracker-section tracker-section-recent" });
    recentSection.createEl("h3", { text: "Recent sessions", cls: "tracker-section-heading" });
    this.recentSessions = new RecentSessions(
      recentSection,
      this.plugin.store,
      this.plugin.app,
    );
    this.recentSessions.render();

    // ── Section F: Manual entry ───────────────────────────────────────────
    const manualSection = root.createDiv({ cls: "tracker-section tracker-section-manual" });
    const manualBtn = manualSection.createEl("button", {
      cls: "tracker-manual-entry-btn",
      text: "+ Add session manually",
    });
    manualBtn.addEventListener("click", () => {
      new ManualEntryModal(
        this.app,
        this.plugin.settings,
        this.plugin.store,
        () => this.refresh(),
      ).open();
    });
  }

  /** Re-render all data panels in-place without rebuilding the whole view. */
  refresh(): void {
    this.todayPanel?.render();
    this.heatmapPanel?.render();
    this.barsPanel?.render();
    this.recentSessions?.render();
  }

  async onClose(): Promise<void> {
    this.timerUI?.unmount();
    this.timerUI = null;
    this.todayPanel = null;
    this.heatmapPanel?.destroy();
    this.heatmapPanel = null;
    this.barsPanel?.destroy();
    this.barsPanel = null;
    this.recentSessions = null;
  }
}
