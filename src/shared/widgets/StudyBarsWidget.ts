import { MarkdownPostProcessorContext } from "obsidian";
import dayjs from "dayjs";
import TrackerPlugin from "../../main";
import { BarChart, BarDatum, BarSegment } from "../charts/BarChart";
import { parseConfig } from "./parseConfig";

type Range = "7d" | "30d" | "12w" | "12m";

const RANGE_LABELS: Record<Range, string> = {
  "7d": "Last 7 days", "30d": "Last 30 days",
  "12w": "Last 12 weeks", "12m": "Last 12 months",
};

/**
 * ```study-bars
 * range: 30d       # 7d | 30d | 12w | 12m  (default: 30d)
 * tag: math        # optional tag filter
 * ```
 */
export class StudyBarsWidget {
  private range: Range;
  private tag:   string | null;

  constructor(
    private el: HTMLElement,
    source: string,
    private ctx: MarkdownPostProcessorContext,
    private plugin: TrackerPlugin,
  ) {
    const cfg   = parseConfig(source);
    this.range  = (cfg["range"] as Range) ?? "30d";
    this.tag    = cfg["tag"] ?? null;
  }

  render(): void {
    this.el.addClasses(["tracker-widget", "tracker-chart-widget"]);

    // ── Controls ──────────────────────────────────────────────────────────────
    const controlRow = this.el.createDiv({ cls: "tracker-bars-range-row" });

    const heading = controlRow.createEl("h4", {
      cls: "tracker-bars-heading",
      text: RANGE_LABELS[this.range],
    });

    const sel = controlRow.createEl("select", { cls: "tracker-bars-range-select" });
    (Object.entries(RANGE_LABELS) as [Range, string][]).forEach(([val, label]) => {
      const opt = sel.createEl("option", { text: label, value: val });
      opt.selected = val === this.range;
    });

    // Tag selector (only show if multiple tags and no tag locked in config)
    let activeTag = this.tag;
    if (!this.tag && this.plugin.settings.study_tags.length > 1) {
      const tagSel = controlRow.createEl("select", { cls: "tracker-bars-range-select" });
      tagSel.createEl("option", { text: "All tags", value: "" });
      for (const t of this.plugin.settings.study_tags) {
        tagSel.createEl("option", { text: t.name, value: t.name });
      }
      tagSel.addEventListener("change", () => {
        activeTag = tagSel.value || null;
        redraw();
      });
    }

    const chartWrap = this.el.createDiv({ cls: "tracker-bars-chart" });
    let chart = new BarChart(chartWrap);

    const redraw = () => {
      chart.destroy();
      chart = new BarChart(chartWrap);
      chart.render(this.buildData(activeTag));
    };

    chart.render(this.buildData(activeTag));

    sel.addEventListener("change", () => {
      this.range = sel.value as Range;
      heading.textContent = RANGE_LABELS[this.range];
      redraw();
    });
  }

  // ── Data ──────────────────────────────────────────────────────────────────

  private buildData(tag: string | null = this.tag): BarDatum[] {
    if (this.range === "7d")  return this.dailyData(7, tag);
    if (this.range === "30d") return this.dailyData(30, tag);
    if (this.range === "12w") return this.weeklyData(12, tag);
    return this.monthlyData(12, tag);
  }

  private tagColor(name: string): string {
    return this.plugin.settings.study_tags.find((t) => t.name === name)?.color
      ?? "var(--interactive-accent)";
  }

  private datum(dateStr: string, label: string, tag: string | null): BarDatum {
    const filter = { date_from: dateStr, date_to: dateStr, ...(tag ? { tag } : {}) };
    const sessions = this.plugin.store.getStudySessions(filter);
    const totals = new Map<string, number>();
    for (const s of sessions) {
      const t = s.tags[0] ?? "";
      totals.set(t, (totals.get(t) ?? 0) + s.duration_minutes);
    }
    const segments: BarSegment[] = Array.from(totals.entries()).map(([t, m]) => ({
      tag: t, minutes: m, color: t ? this.tagColor(t) : "var(--text-muted)",
    }));
    return { label, date: dateStr, segments, total: segments.reduce((s, x) => s + x.minutes, 0) };
  }

  private datumRange(from: string, to: string, label: string, tag: string | null): BarDatum {
    const filter = { date_from: from, date_to: to, ...(tag ? { tag } : {}) };
    const sessions = this.plugin.store.getStudySessions(filter);
    const totals = new Map<string, number>();
    for (const s of sessions) {
      const t = s.tags[0] ?? "";
      totals.set(t, (totals.get(t) ?? 0) + s.duration_minutes);
    }
    const segments: BarSegment[] = Array.from(totals.entries()).map(([t, m]) => ({
      tag: t, minutes: m, color: t ? this.tagColor(t) : "var(--text-muted)",
    }));
    return { label, date: from, segments, total: segments.reduce((s, x) => s + x.minutes, 0) };
  }

  private dailyData(days: number, tag: string | null): BarDatum[] {
    const today = dayjs();
    return Array.from({ length: days }, (_, i) => {
      const d = today.subtract(days - 1 - i, "day");
      return this.datum(d.format("YYYY-MM-DD"), d.format("ddd"), tag);
    });
  }

  private weeklyData(weeks: number, tag: string | null): BarDatum[] {
    const today = dayjs();
    return Array.from({ length: weeks }, (_, i) => {
      const end   = today.subtract(i * 7, "day");
      const start = end.subtract(6, "day");
      return this.datumRange(start.format("YYYY-MM-DD"), end.format("YYYY-MM-DD"), start.format("MMM D"), tag);
    }).reverse();
  }

  private monthlyData(months: number, tag: string | null): BarDatum[] {
    const today = dayjs();
    return Array.from({ length: months }, (_, i) => {
      const m = today.subtract(months - 1 - i, "month");
      return this.datumRange(m.startOf("month").format("YYYY-MM-DD"), m.endOf("month").format("YYYY-MM-DD"), m.format("MMM"), tag);
    });
  }
}
