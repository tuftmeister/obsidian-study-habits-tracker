import { select } from "d3";
import dayjs from "dayjs";

// ── Layout constants ──────────────────────────────────────────────────────────

const CELL = 11;         // px
const GAP  = 2;          // px between cells
const STEP = CELL + GAP; // 13px per cell
const DOW_W = 28;        // width reserved for day-of-week labels
const MONTH_H = 18;      // height reserved for month labels
const NUM_WEEKS = 53;    // columns (52 full + 1 partial to always show current week)

// Rows 0-6 = Mon–Sun. Only label rows 0, 2, 4 (Mon, Wed, Fri).
const DOW_LABEL_ROWS: Record<number, string> = { 0: "Mon", 2: "Wed", 4: "Fri" };

// ── Intensity thresholds (minutes → level 0-4) ────────────────────────────────

function intensityLevel(minutes: number): number {
  if (minutes <= 0)   return 0;
  if (minutes <= 30)  return 1;
  if (minutes <= 60)  return 2;
  if (minutes <= 120) return 3;
  return 4;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtMinutes(m: number): string {
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem > 0 ? `${h}h ${rem}m` : `${h}h`;
}

function fmtTooltip(dateStr: string, day: HeatmapDay): string {
  const label = dayjs(dateStr).format("MMMM D, YYYY");
  if (day.minutes === 0) return label;
  const sessions = day.sessions === 1 ? "1 session" : `${day.sessions} sessions`;
  return `${label} — ${fmtMinutes(day.minutes)} across ${sessions}`;
}

// ── Public types ──────────────────────────────────────────────────────────────

export interface HeatmapDay {
  date: string;     // "YYYY-MM-DD"
  minutes: number;
  sessions: number;
}

export interface HeatmapOptions {
  /** Called when the user clicks a day cell. Receives the ISO date string. */
  onDayClick?: (date: string) => void;
}

// ── Heatmap class ─────────────────────────────────────────────────────────────

export class Heatmap {
  private tooltip: HTMLElement;

  constructor(private container: HTMLElement) {
    container.addClass("tracker-heatmap");
    this.tooltip = container.createDiv({ cls: "tracker-heatmap-tooltip" });
  }

  render(data: Map<string, HeatmapDay>, options: HeatmapOptions = {}): void {
    // Remove any previous SVG
    this.container.querySelectorAll("svg").forEach((el) => el.remove());

    const today = dayjs();
    // Monday of the current week
    const currentWeekMon = today.subtract((today.day() + 6) % 7, "day");
    // Start of grid: Monday 52 weeks before current week's Monday
    const startDate = currentWeekMon.subtract(52, "week");

    const svgW = DOW_W + NUM_WEEKS * STEP;
    const svgH = MONTH_H + 7 * STEP;

    const svg = select(this.container)
      .append("svg")
      .attr("viewBox", `0 0 ${svgW} ${svgH}`)
      .attr("preserveAspectRatio", "xMinYMid meet")
      .attr("width", "100%")
      .attr("class", "tracker-heatmap-svg");

    // ── Month labels ──────────────────────────────────────────────────────────
    const monthsG = svg.append("g").attr("class", "tracker-heatmap-months");

    for (let col = 0; col < NUM_WEEKS; col++) {
      const weekStart = startDate.add(col, "week");
      // Show a month label when this week contains the 1st of a month
      // (i.e. the 1st falls Mon–Sun of this week)
      for (let d = 0; d < 7; d++) {
        const day = weekStart.add(d, "day");
        if (day.date() === 1) {
          monthsG
            .append("text")
            .attr("x", DOW_W + col * STEP + CELL / 2)
            .attr("y", MONTH_H - 4)
            .attr("class", "tracker-heatmap-month-label")
            .text(day.format("MMM"));
          break;
        }
      }
    }

    // ── Day-of-week labels ────────────────────────────────────────────────────
    const dowG = svg.append("g").attr("class", "tracker-heatmap-dow");

    for (const [row, label] of Object.entries(DOW_LABEL_ROWS)) {
      dowG
        .append("text")
        .attr("x", DOW_W - 4)
        .attr("y", MONTH_H + Number(row) * STEP + CELL - 1)
        .attr("class", "tracker-heatmap-dow-label")
        .text(label);
    }

    // ── Cells ─────────────────────────────────────────────────────────────────
    const cellsG = svg.append("g").attr("class", "tracker-heatmap-cells");
    const tooltip = this.tooltip;

    for (let col = 0; col < NUM_WEEKS; col++) {
      for (let row = 0; row < 7; row++) {
        const date = startDate.add(col, "week").add(row, "day");
        if (date.isAfter(today)) continue; // don't render future days

        const dateStr = date.format("YYYY-MM-DD");
        const day = data.get(dateStr) ?? { date: dateStr, minutes: 0, sessions: 0 };
        const level = intensityLevel(day.minutes);

        const x = DOW_W + col * STEP;
        const y = MONTH_H + row * STEP;

        const rect = cellsG
          .append("rect")
          .attr("x", x)
          .attr("y", y)
          .attr("width", CELL)
          .attr("height", CELL)
          .attr("rx", 2)
          .attr("class", "tracker-heatmap-cell")
          .attr("data-level", level)
          .attr("data-date", dateStr);

        // Hover tooltip
        rect
          .on("mouseenter", function (event: MouseEvent) {
            tooltip.setText(fmtTooltip(dateStr, day));
            tooltip.style.display = "block";
            positionTooltip(tooltip, event);
          })
          .on("mousemove", function (event: MouseEvent) {
            positionTooltip(tooltip, event);
          })
          .on("mouseleave", function () {
            tooltip.style.display = "none";
          });

        // Click
        if (options.onDayClick) {
          const cb = options.onDayClick;
          rect
            .style("cursor", "pointer")
            .on("click", () => cb(dateStr));
        }
      }
    }
  }

  // ── Month view ────────────────────────────────────────────────────────────

  /**
   * Calendar-grid view: shows the current month (7 columns Mon–Sun, ~5 rows).
   * Each cell is larger and includes the day-number label.
   */
  renderMonth(data: Map<string, HeatmapDay>, options: HeatmapOptions = {}): void {
    this.container.querySelectorAll("svg").forEach((el) => el.remove());

    const CELL_M  = 36;
    const GAP_M   = 3;
    const STEP_M  = CELL_M + GAP_M;
    const HEAD_H  = 24;   // weekday header row
    const LABEL_W = 0;

    const today     = dayjs();
    const monthStart = today.startOf("month");
    // offset so col 0 = Monday
    const startOffset = (monthStart.day() + 6) % 7; // 0=Mon … 6=Sun
    const daysInMonth = today.daysInMonth();
    const totalCells  = startOffset + daysInMonth;
    const rows        = Math.ceil(totalCells / 7);

    const svgW = 7 * STEP_M - GAP_M + LABEL_W;
    const svgH = HEAD_H + rows * STEP_M - GAP_M;

    const svg = select(this.container)
      .append("svg")
      .attr("viewBox", `0 0 ${svgW} ${svgH}`)
      .attr("preserveAspectRatio", "xMinYMid meet")
      .attr("width", "100%")
      .attr("class", "tracker-heatmap-svg");

    const g = svg.append("g");

    // Weekday headers
    const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    DOW.forEach((d, i) => {
      g.append("text")
        .attr("x", i * STEP_M + CELL_M / 2)
        .attr("y", HEAD_H - 6)
        .attr("text-anchor", "middle")
        .attr("class", "tracker-heatmap-month-label")
        .text(d);
    });

    const tooltip = this.tooltip;

    for (let dayIdx = 0; dayIdx < daysInMonth; dayIdx++) {
      const date    = monthStart.add(dayIdx, "day");
      const dateStr = date.format("YYYY-MM-DD");
      const cell    = dayIdx + startOffset;
      const col     = cell % 7;
      const row     = Math.floor(cell / 7);

      const day   = data.get(dateStr) ?? { date: dateStr, minutes: 0, sessions: 0 };
      const level = intensityLevel(day.minutes);
      const isFuture = date.isAfter(today, "day");
      const isToday  = date.isSame(today, "day");

      const x = col * STEP_M;
      const y = HEAD_H + row * STEP_M;

      const rect = g.append("rect")
        .attr("x", x).attr("y", y)
        .attr("width", CELL_M).attr("height", CELL_M)
        .attr("rx", 4)
        .attr("class", "tracker-heatmap-cell")
        .attr("data-level", isFuture ? 0 : level)
        .attr("data-date", dateStr)
        .attr("data-today",  isToday  ? "true" : null)
        .attr("data-future", isFuture ? "true" : null);

      // Day number label
      g.append("text")
        .attr("x", x + CELL_M / 2)
        .attr("y", y + CELL_M / 2 + 4)
        .attr("text-anchor", "middle")
        .attr("class", "tracker-heatmap-day-num")
        .attr("data-level", isFuture ? 0 : level)
        .attr("data-today",  isToday  ? "true" : null)
        .attr("data-future", isFuture ? "true" : null)
        .text(date.date());

      if (!isFuture) {
        rect
          .on("mouseenter", function (event: MouseEvent) {
            tooltip.setText(fmtTooltip(dateStr, day));
            tooltip.style.display = "block";
            positionTooltip(tooltip, event);
          })
          .on("mousemove", (event: MouseEvent) => positionTooltip(tooltip, event))
          .on("mouseleave", () => { tooltip.style.display = "none"; });

        if (options.onDayClick) {
          const cb = options.onDayClick;
          rect.style("cursor", "pointer").on("click", () => cb(dateStr));
        }
      }
    }
  }

  // ── Week view ─────────────────────────────────────────────────────────────

  /** Shows the last 7 days as a single row of large cells with labels. */
  renderWeek(data: Map<string, HeatmapDay>, options: HeatmapOptions = {}): void {
    this.container.querySelectorAll("svg").forEach((el) => el.remove());

    const CELL_W  = 48;
    const CELL_H  = 54;
    const GAP_W   = 6;
    const STEP_W  = CELL_W + GAP_W;
    const HEAD_H  = 20;
    const FOOT_H  = 18;

    const today  = dayjs();
    const svgW   = 7 * STEP_W - GAP_W;
    const svgH   = HEAD_H + CELL_H + FOOT_H;

    const svg = select(this.container)
      .append("svg")
      .attr("viewBox", `0 0 ${svgW} ${svgH}`)
      .attr("preserveAspectRatio", "xMinYMid meet")
      .attr("width", "100%")
      .attr("class", "tracker-heatmap-svg");

    const g = svg.append("g");
    const tooltip = this.tooltip;

    for (let i = 0; i < 7; i++) {
      const date    = today.subtract(6 - i, "day");
      const dateStr = date.format("YYYY-MM-DD");
      const day     = data.get(dateStr) ?? { date: dateStr, minutes: 0, sessions: 0 };
      const level   = intensityLevel(day.minutes);
      const x       = i * STEP_W;

      // Day-of-week label
      g.append("text")
        .attr("x", x + CELL_W / 2).attr("y", HEAD_H - 4)
        .attr("text-anchor", "middle")
        .attr("class", "tracker-heatmap-month-label")
        .text(date.format("ddd"));

      // Cell
      const isToday = i === 6;
      const rect = g.append("rect")
        .attr("x", x).attr("y", HEAD_H)
        .attr("width", CELL_W).attr("height", CELL_H)
        .attr("rx", 6)
        .attr("class", "tracker-heatmap-cell")
        .attr("data-level", level)
        .attr("data-date", dateStr)
        .attr("data-today", isToday ? "true" : null);

      // Minutes label below the cell
      const mins = day.minutes;
      g.append("text")
        .attr("x", x + CELL_W / 2).attr("y", HEAD_H + CELL_H + 13)
        .attr("text-anchor", "middle")
        .attr("class", "tracker-heatmap-month-label")
        .text(mins > 0 ? fmtMinutes(mins) : "—");

      rect
        .on("mouseenter", function (event: MouseEvent) {
          tooltip.setText(fmtTooltip(dateStr, day));
          tooltip.style.display = "block";
          positionTooltip(tooltip, event);
        })
        .on("mousemove", (event: MouseEvent) => positionTooltip(tooltip, event))
        .on("mouseleave", () => { tooltip.style.display = "none"; });

      if (options.onDayClick) {
        const cb = options.onDayClick;
        rect.style("cursor", "pointer").on("click", () => cb(dateStr));
      }
    }
  }

  destroy(): void {
    this.container.empty();
  }
}

// ── Tooltip positioning ───────────────────────────────────────────────────────

function positionTooltip(el: HTMLElement, event: MouseEvent): void {
  const container = el.parentElement;
  if (!container) return;
  const rect = container.getBoundingClientRect();
  let x = event.clientX - rect.left + 12;
  let y = event.clientY - rect.top - 28;
  // Clamp so tooltip doesn't overflow the right edge
  const tipW = 220;
  if (x + tipW > rect.width) x = rect.width - tipW - 4;
  if (y < 0) y = event.clientY - rect.top + 12;
  el.style.left = `${x}px`;
  el.style.top  = `${y}px`;
}
