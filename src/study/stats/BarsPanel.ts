import dayjs from "dayjs";
import { EntryStore } from "../../shared/data/EntryStore";
import { BarChart, BarDatum, BarSegment } from "../../shared/charts/BarChart";
import { StudyTag } from "../../settings/types";

type BottomRange = "30d" | "12w" | "12m";

export class BarsPanel {
  private chart7: BarChart | null = null;
  private chartBottom: BarChart | null = null;
  private bottomRange: BottomRange = "30d";

  constructor(
    private container: HTMLElement,
    private store: EntryStore,
    private tags: StudyTag[],
  ) {
    container.addClass("tracker-bars-panel");
  }

  render(): void {
    this.container.empty();

    const chartsRow = this.container.createDiv({ cls: "tracker-bars-row" });

    // ── Last 7 days ───────────────────────────────────────────────────────────
    const left = chartsRow.createDiv({ cls: "tracker-bars-chart" });
    left.createEl("h4", { text: "Last 7 days", cls: "tracker-bars-heading" });
    this.chart7 = new BarChart(left);
    this.chart7.render(this.buildDailyData(7));

    // ── Bottom chart (30d / 12w / 12m) ────────────────────────────────────────
    const right = chartsRow.createDiv({ cls: "tracker-bars-chart" });

    const rangeRow = right.createDiv({ cls: "tracker-bars-range-row" });
    rangeRow.createEl("h4", { text: "Last 30 days", cls: "tracker-bars-heading" });

    const sel = rangeRow.createEl("select", { cls: "tracker-bars-range-select" });
    (
      [
        ["30d", "30 days"],
        ["12w", "12 weeks"],
        ["12m", "12 months"],
      ] as [BottomRange, string][]
    ).forEach(([val, label]) => {
      const opt = sel.createEl("option", { text: label, value: val });
      opt.selected = val === this.bottomRange;
    });
    sel.addEventListener("change", () => {
      this.bottomRange = sel.value as BottomRange;
      rangeRow.querySelector("h4")!.textContent = sel.options[sel.selectedIndex].text;
      this.chartBottom?.destroy();
      this.chartBottom = new BarChart(right);
      this.chartBottom.render(this.buildBottomData());
    });

    this.chartBottom = new BarChart(right);
    this.chartBottom.render(this.buildBottomData());
  }

  // ── Data builders ─────────────────────────────────────────────────────────

  private getTagColor(tagName: string): string {
    return (
      this.tags.find((t) => t.name === tagName)?.color ??
      "var(--interactive-accent)"
    );
  }

  private buildDailyData(days: number): BarDatum[] {
    const today = dayjs();
    const result: BarDatum[] = [];

    for (let i = days - 1; i >= 0; i--) {
      const date = today.subtract(i, "day");
      const dateStr = date.format("YYYY-MM-DD");
      const sessions = this.store.getStudySessions({
        date_from: dateStr,
        date_to: dateStr,
      });
      result.push(this.buildDatum(dateStr, date.format("ddd"), sessions));
    }
    return result;
  }

  private buildWeeklyData(weeks: number): BarDatum[] {
    const today = dayjs();
    const result: BarDatum[] = [];

    for (let i = weeks - 1; i >= 0; i--) {
      const weekEnd   = today.subtract(i * 7, "day");
      const weekStart = weekEnd.subtract(6, "day");
      const from = weekStart.format("YYYY-MM-DD");
      const to   = weekEnd.format("YYYY-MM-DD");
      const sessions = this.store.getStudySessions({ date_from: from, date_to: to });
      result.push(this.buildDatum(from, weekStart.format("MMM D"), sessions));
    }
    return result;
  }

  private buildMonthlyData(months: number): BarDatum[] {
    const today = dayjs();
    const result: BarDatum[] = [];

    for (let i = months - 1; i >= 0; i--) {
      const month = today.subtract(i, "month");
      const from  = month.startOf("month").format("YYYY-MM-DD");
      const to    = month.endOf("month").format("YYYY-MM-DD");
      const sessions = this.store.getStudySessions({ date_from: from, date_to: to });
      result.push(this.buildDatum(from, month.format("MMM"), sessions));
    }
    return result;
  }

  private buildBottomData(): BarDatum[] {
    if (this.bottomRange === "30d") return this.buildDailyData(30);
    if (this.bottomRange === "12w") return this.buildWeeklyData(12);
    return this.buildMonthlyData(12);
  }

  private buildDatum(
    date: string,
    label: string,
    sessions: ReturnType<EntryStore["getStudySessions"]>
  ): BarDatum {
    // Aggregate minutes by tag
    const tagTotals = new Map<string, number>();
    for (const s of sessions) {
      const tag = s.tags[0] ?? ""; // primary tag
      tagTotals.set(tag, (tagTotals.get(tag) ?? 0) + s.duration_minutes);
    }

    const segments: BarSegment[] = Array.from(tagTotals.entries()).map(
      ([tag, minutes]) => ({
        tag,
        minutes,
        color: tag ? this.getTagColor(tag) : "var(--text-muted)",
      })
    );

    return {
      label,
      date,
      segments,
      total: segments.reduce((s, seg) => s + seg.minutes, 0),
    };
  }

  destroy(): void {
    this.chart7?.destroy();
    this.chartBottom?.destroy();
  }
}
