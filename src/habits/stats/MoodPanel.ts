import dayjs from "dayjs";
import { EntryStore } from "../../shared/data/EntryStore";
import { MoodChart, MoodPoint } from "../../shared/charts/MoodChart";
import { PluginSettings } from "../../settings/types";

type MoodRange = "30d" | "90d" | "1y";

export class MoodPanel {
  private chart: MoodChart | null = null;
  private range: MoodRange = "30d";

  constructor(
    private container: HTMLElement,
    private store: EntryStore,
    private settings: PluginSettings,
  ) {
    container.addClass("tracker-mood-panel");
  }

  render(): void {
    this.container.empty();

    // ── Range selector ────────────────────────────────────────────────────────
    const controlRow = this.container.createDiv({ cls: "tracker-bars-range-row" });
    controlRow.createEl("h4", { text: "Mood", cls: "tracker-bars-heading" });

    const sel = controlRow.createEl("select", { cls: "tracker-bars-range-select" });
    (
      [
        ["30d", "30 days"],
        ["90d", "90 days"],
        ["1y",  "1 year"],
      ] as [MoodRange, string][]
    ).forEach(([val, label]) => {
      const opt = sel.createEl("option", { text: label, value: val });
      opt.selected = val === this.range;
    });

    const chartWrap = this.container.createDiv();
    this.chart = new MoodChart(chartWrap);
    this.chart.render(this.buildPoints(), { yLabels: this.yLabels() });

    sel.addEventListener("change", () => {
      this.range = sel.value as MoodRange;
      this.chart?.destroy();
      this.chart = new MoodChart(chartWrap);
      this.chart.render(this.buildPoints(), { yLabels: this.yLabels() });
    });
  }

  // ── Data ──────────────────────────────────────────────────────────────────

  private buildPoints(): MoodPoint[] {
    const today  = dayjs();
    const days   = this.range === "30d" ? 30 : this.range === "90d" ? 90 : 365;
    const from   = today.subtract(days - 1, "day").format("YYYY-MM-DD");
    const to     = today.format("YYYY-MM-DD");

    const entries = this.store.getMoodEntries({ date_from: from, date_to: to });

    // One point per date (last entry wins if multiple on same day)
    const byDate = new Map<string, string | number>();
    for (const e of entries) byDate.set(e.date, e.value);

    const points: MoodPoint[] = [];
    for (const [date, value] of byDate) {
      const numeric = this.toNumeric(value);
      if (numeric !== null) {
        points.push({ date, value, numeric });
      }
    }
    return points.sort((a, b) => (a.date < b.date ? -1 : 1));
  }

  /** Map a raw mood value to a 1-based number for the y-axis. */
  private toNumeric(value: string | number): number | null {
    if (typeof value === "number") return value;

    // Emoji: find its index in the configured emoji set (1-based)
    const emojis = this.settings.mood_emojis;
    const idx    = emojis.indexOf(value);
    if (idx !== -1) return idx + 1;

    // Fallback: try parsing as a number
    const n = parseFloat(String(value));
    return isNaN(n) ? null : n;
  }

  /** Y-axis labels for emoji scales; empty for numeric scales. */
  private yLabels(): string[] {
    const { mood_scale_type, mood_emojis } = this.settings;
    return mood_scale_type === "emoji" ? mood_emojis : [];
  }

  destroy(): void {
    this.chart?.destroy();
  }
}
