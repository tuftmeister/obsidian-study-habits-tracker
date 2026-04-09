import { MarkdownPostProcessorContext } from "obsidian";
import dayjs from "dayjs";
import TrackerPlugin from "../../main";
import { MoodChart, MoodPoint } from "../charts/MoodChart";
import { parseConfig } from "./parseConfig";

type Range = "30d" | "90d" | "1y";

const RANGE_LABELS: Record<Range, string> = {
  "30d": "30 days", "90d": "90 days", "1y": "1 year",
};

/**
 * ```mood-chart
 * range: 30d    # 30d | 90d | 1y  (default: 30d)
 * ```
 */
export class MoodChartWidget {
  private range: Range;

  constructor(
    private el: HTMLElement,
    source: string,
    private ctx: MarkdownPostProcessorContext,
    private plugin: TrackerPlugin,
  ) {
    const cfg   = parseConfig(source);
    this.range  = (cfg["range"] as Range) ?? "30d";
  }

  render(): void {
    this.el.addClasses(["tracker-widget", "tracker-chart-widget"]);

    // ── Controls ──────────────────────────────────────────────────────────────
    const controlRow = this.el.createDiv({ cls: "tracker-bars-range-row" });
    controlRow.createEl("h4", { cls: "tracker-bars-heading", text: "Mood" });

    const sel = controlRow.createEl("select", { cls: "tracker-bars-range-select" });
    (Object.entries(RANGE_LABELS) as [Range, string][]).forEach(([val, label]) => {
      const opt = sel.createEl("option", { text: label, value: val });
      opt.selected = val === this.range;
    });

    const chartWrap = this.el.createDiv({ cls: "tracker-mood-chart-container" });
    let chart = new MoodChart(chartWrap);
    chart.render(this.buildPoints(), { yLabels: this.yLabels() });

    sel.addEventListener("change", () => {
      this.range = sel.value as Range;
      chart.destroy();
      chart = new MoodChart(chartWrap);
      chart.render(this.buildPoints(), { yLabels: this.yLabels() });
    });
  }

  private buildPoints(): MoodPoint[] {
    const days    = this.range === "30d" ? 30 : this.range === "90d" ? 90 : 365;
    const today   = dayjs();
    const from    = today.subtract(days - 1, "day").format("YYYY-MM-DD");
    const to      = today.format("YYYY-MM-DD");
    const entries = this.plugin.store.getMoodEntries({ date_from: from, date_to: to });

    const byDate = new Map<string, string | number>();
    for (const e of entries) byDate.set(e.date, e.value);

    const points: MoodPoint[] = [];
    for (const [date, value] of byDate) {
      const numeric = this.toNumeric(value);
      if (numeric !== null) points.push({ date, value, numeric });
    }
    return points.sort((a, b) => (a.date < b.date ? -1 : 1));
  }

  private toNumeric(value: string | number): number | null {
    if (typeof value === "number") return value;
    const idx = this.plugin.settings.mood_emojis.indexOf(value);
    if (idx !== -1) return idx + 1;
    const n = parseFloat(String(value));
    return isNaN(n) ? null : n;
  }

  private yLabels(): string[] {
    return this.plugin.settings.mood_scale_type === "emoji"
      ? this.plugin.settings.mood_emojis
      : [];
  }
}
