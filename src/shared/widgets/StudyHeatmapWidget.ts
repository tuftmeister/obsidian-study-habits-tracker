import { MarkdownPostProcessorContext } from "obsidian";
import dayjs from "dayjs";
import TrackerPlugin from "../../main";
import { Heatmap, HeatmapDay, HeatmapOptions } from "../charts/Heatmap";
import { parseConfig } from "./parseConfig";

type HeatmapView = "year" | "month" | "week";

/**
 * ```study-heatmap
 * view: year       # year | month | week  (default: year)
 * tag:  math       # optional tag filter
 * ```
 */
export class StudyHeatmapWidget {
  private tag:  string | null;
  private view: HeatmapView;

  constructor(
    private el: HTMLElement,
    source: string,
    private ctx: MarkdownPostProcessorContext,
    private plugin: TrackerPlugin,
  ) {
    const cfg  = parseConfig(source);
    this.tag   = cfg["tag"]  ?? null;
    this.view  = (cfg["view"] as HeatmapView) ?? "year";
  }

  render(): void {
    this.el.addClasses(["tracker-widget", "tracker-chart-widget"]);

    // ── Controls row ──────────────────────────────────────────────────────────
    const controlRow = this.el.createDiv({ cls: "tracker-heatmap-filter" });

    // View selector
    const viewSel = controlRow.createEl("select", { cls: "tracker-heatmap-filter-select" });
    (["year", "month", "week"] as HeatmapView[]).forEach((v) => {
      const opt = viewSel.createEl("option", {
        text: v.charAt(0).toUpperCase() + v.slice(1),
        value: v,
      });
      opt.selected = v === this.view;
    });

    // Tag selector (only show if multiple tags and no tag locked in config)
    let activeTag = this.tag;
    if (!this.tag && this.plugin.settings.study_tags.length > 1) {
      controlRow.createSpan({ text: " ", cls: "tracker-heatmap-filter-label" });
      const tagSel = controlRow.createEl("select", { cls: "tracker-heatmap-filter-select" });
      tagSel.createEl("option", { text: "All tags", value: "" });
      for (const t of this.plugin.settings.study_tags) {
        tagSel.createEl("option", { text: t.name, value: t.name });
      }
      tagSel.addEventListener("change", () => {
        activeTag = tagSel.value || null;
        redraw();
      });
    }

    // ── Chart area ────────────────────────────────────────────────────────────
    const wrap = this.el.createDiv();
    let heatmap = new Heatmap(wrap);
    const opts: HeatmapOptions = { onDayClick: (d) => this.openDay(d) };

    const redraw = () => {
      wrap.empty();
      heatmap = new Heatmap(wrap);
      const data = this.buildData(activeTag);
      if (this.view === "month") heatmap.renderMonth(data, opts);
      else if (this.view === "week") heatmap.renderWeek(data, opts);
      else heatmap.render(data, opts);
    };

    viewSel.addEventListener("change", () => {
      this.view = viewSel.value as HeatmapView;
      redraw();
    });

    redraw();
  }

  private buildData(tag: string | null): Map<string, HeatmapDay> {
    const sessions = this.plugin.store.getStudySessions(tag ? { tag } : {});
    const byDate   = new Map<string, HeatmapDay>();
    for (const s of sessions) {
      const ex = byDate.get(s.date);
      if (ex) { ex.minutes += s.duration_minutes; ex.sessions++; }
      else byDate.set(s.date, { date: s.date, minutes: s.duration_minutes, sessions: 1 });
    }
    return byDate;
  }

  private openDay(date: string): void {
    const fmt  = dayjs(date).format("YYYY-MM-DD");
    const file = this.plugin.app.vault.getMarkdownFiles().find((f) => f.basename === fmt);
    if (file) this.plugin.app.workspace.openLinkText(file.path, "", false);
  }
}
