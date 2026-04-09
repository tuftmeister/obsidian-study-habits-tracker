import dayjs from "dayjs";
import { App } from "obsidian";
import { EntryStore } from "../../shared/data/EntryStore";
import { Heatmap, HeatmapDay, HeatmapOptions } from "../../shared/charts/Heatmap";
import { StudyTag } from "../../settings/types";

type HeatmapView = "year" | "month" | "week";

export class HeatmapPanel {
  private heatmap: Heatmap | null = null;
  private selectedTag  = "all";
  private selectedView: HeatmapView = "year";

  constructor(
    private container: HTMLElement,
    private store: EntryStore,
    private tags: StudyTag[],
    private app: App,
  ) {
    container.addClass("tracker-heatmap-panel");
  }

  render(): void {
    this.container.empty();

    // ── Controls row ──────────────────────────────────────────────────────────
    const filterRow = this.container.createDiv({ cls: "tracker-heatmap-filter" });

    // View toggle
    const viewSel = filterRow.createEl("select", { cls: "tracker-heatmap-filter-select" });
    (["year", "month", "week"] as HeatmapView[]).forEach((v) => {
      const opt = viewSel.createEl("option", {
        text: v.charAt(0).toUpperCase() + v.slice(1),
        value: v,
      });
      opt.selected = v === this.selectedView;
    });

    viewSel.addEventListener("change", () => {
      this.selectedView = viewSel.value as HeatmapView;
      this.renderHeatmap();
    });

    // Tag filter
    filterRow.createSpan({ text: " Filter: ", cls: "tracker-heatmap-filter-label" });
    const tagSel = filterRow.createEl("select", { cls: "tracker-heatmap-filter-select" });
    const allOpt = tagSel.createEl("option", { text: "All tags", value: "all" });
    allOpt.selected = this.selectedTag === "all";
    for (const tag of this.tags) {
      const opt = tagSel.createEl("option", { text: tag.name, value: tag.name });
      opt.selected = this.selectedTag === tag.name;
    }
    tagSel.addEventListener("change", () => {
      this.selectedTag = tagSel.value;
      this.renderHeatmap();
    });

    // ── Heatmap ───────────────────────────────────────────────────────────────
    const heatmapContainer = this.container.createDiv();
    this.heatmap = new Heatmap(heatmapContainer);
    this.renderHeatmap();
  }

  private renderHeatmap(): void {
    if (!this.heatmap) return;

    const filter   = this.selectedTag === "all" ? {} : { tag: this.selectedTag };
    const sessions = this.store.getStudySessions(filter);

    const byDate = new Map<string, HeatmapDay>();
    for (const s of sessions) {
      const ex = byDate.get(s.date);
      if (ex) { ex.minutes += s.duration_minutes; ex.sessions++; }
      else byDate.set(s.date, { date: s.date, minutes: s.duration_minutes, sessions: 1 });
    }

    const opts: HeatmapOptions = {
      onDayClick: (date) => {
        const files = this.app.vault.getMarkdownFiles();
        const file  = files.find((f) => f.basename === dayjs(date).format("YYYY-MM-DD"));
        if (file) this.app.workspace.openLinkText(file.path, "", false);
      },
    };

    if (this.selectedView === "month") this.heatmap.renderMonth(byDate, opts);
    else if (this.selectedView === "week") this.heatmap.renderWeek(byDate, opts);
    else this.heatmap.render(byDate, opts);
  }

  destroy(): void {
    this.heatmap?.destroy();
  }
}
