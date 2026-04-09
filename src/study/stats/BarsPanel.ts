import dayjs from "dayjs";
import { EntryStore } from "../../shared/data/EntryStore";
import { AreaChart, AreaDatum } from "../../shared/charts/AreaChart";
import { StudyTag } from "../../settings/types";

type Range = "4w" | "12w" | "12m";

const RANGE_LABELS: Record<Range, string> = {
  "4w":  "Last 4 weeks",
  "12w": "Last 12 weeks",
  "12m": "Last 12 months",
};

export class BarsPanel {
  private chart: AreaChart | null = null;
  private range: Range = "12w";
  private activeTag: string | null = null;

  constructor(
    private container: HTMLElement,
    private store: EntryStore,
    private tags: StudyTag[],
  ) {
    container.addClass("tracker-bars-panel");
  }

  render(): void {
    this.container.empty();

    // ── Controls ──────────────────────────────────────────────────────────
    const controls = this.container.createDiv({ cls: "tracker-bars-range-row" });

    const rangeSel = controls.createEl("select", { cls: "tracker-bars-range-select" });
    (Object.entries(RANGE_LABELS) as [Range, string][]).forEach(([val, label]) => {
      const opt = rangeSel.createEl("option", { text: label, value: val });
      opt.selected = val === this.range;
    });

    if (this.tags.length > 1) {
      const tagSel = controls.createEl("select", { cls: "tracker-bars-range-select" });
      tagSel.createEl("option", { text: "All tags", value: "" });
      for (const t of this.tags) {
        tagSel.createEl("option", { text: t.name, value: t.name });
      }
      tagSel.addEventListener("change", () => {
        this.activeTag = tagSel.value || null;
        redraw();
      });
    }

    // ── Chart ─────────────────────────────────────────────────────────────
    const wrap = this.container.createDiv({ cls: "tracker-area-wrap" });
    this.chart = new AreaChart(wrap);
    this.chart.render(this.buildData());

    const redraw = () => {
      this.chart?.destroy();
      this.chart = new AreaChart(wrap);
      this.chart.render(this.buildData());
    };

    rangeSel.addEventListener("change", () => {
      this.range = rangeSel.value as Range;
      redraw();
    });
  }

  // ── Data ──────────────────────────────────────────────────────────────────

  private buildData(): AreaDatum[] {
    if (this.range === "4w")  return this.weeklyData(4);
    if (this.range === "12w") return this.weeklyData(12);
    return this.monthlyData(12);
  }

  private weeklyData(weeks: number): AreaDatum[] {
    const today = dayjs();
    return Array.from({ length: weeks }, (_, i) => {
      const end   = today.subtract((weeks - 1 - i) * 7, "day");
      const start = end.subtract(6, "day");
      const minutes = this.store.getTotalMinutes({
        date_from: start.format("YYYY-MM-DD"),
        date_to:   end.format("YYYY-MM-DD"),
        ...(this.activeTag ? { tag: this.activeTag } : {}),
      });
      return { label: start.format("MMM D"), minutes };
    });
  }

  private monthlyData(months: number): AreaDatum[] {
    const today = dayjs();
    return Array.from({ length: months }, (_, i) => {
      const m = today.subtract(months - 1 - i, "month");
      const minutes = this.store.getTotalMinutes({
        date_from: m.startOf("month").format("YYYY-MM-DD"),
        date_to:   m.endOf("month").format("YYYY-MM-DD"),
        ...(this.activeTag ? { tag: this.activeTag } : {}),
      });
      return { label: m.format("MMM"), minutes };
    });
  }

  destroy(): void {
    this.chart?.destroy();
  }
}
