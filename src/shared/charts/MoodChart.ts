import {
  select,
  scaleTime,
  scaleLinear,
  line,
  area,
  axisLeft,
  axisBottom,
  extent,
  curveCatmullRom,
  timeFormat,
} from "d3";
import dayjs from "dayjs";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface MoodPoint {
  date: string;           // "YYYY-MM-DD"
  value: string | number; // raw mood value (emoji or number)
  numeric: number;        // mapped 1-based number for y-axis
}

export interface MoodChartOptions {
  /** Y-axis tick labels. Index 0 = value 1 (lowest); last = highest. */
  yLabels?: string[];
  height?: number;
}

// ── Layout ────────────────────────────────────────────────────────────────────

const MARGIN = { top: 16, right: 16, bottom: 32, left: 36 };
const DEFAULT_HEIGHT = 160;

// ── MoodChart ─────────────────────────────────────────────────────────────────

export class MoodChart {
  private tooltip: HTMLElement;

  constructor(private container: HTMLElement) {
    container.addClass("tracker-mood-chart-container");
    this.tooltip = container.createDiv({ cls: "tracker-bar-tooltip" });
  }

  render(points: MoodPoint[], options: MoodChartOptions = {}): void {
    this.container.querySelectorAll("svg").forEach((el) => el.remove());
    this.container.querySelectorAll(".tracker-chart-empty").forEach((el) => el.remove());

    if (points.length === 0) {
      this.container.createEl("p", {
        cls: "tracker-chart-empty",
        text: "No mood entries yet — log some using the mood widget or inline field.",
      });
      return;
    }

    const totalH = options.height ?? DEFAULT_HEIGHT;
    const totalW = this.container.clientWidth || 400;
    const W = totalW - MARGIN.left - MARGIN.right;
    const H = totalH - MARGIN.top - MARGIN.bottom;

    // ── Scales ────────────────────────────────────────────────────────────────
    const dateObjs = points.map((p) => new Date(p.date));
    const [minDate, maxDate] = extent(dateObjs) as [Date, Date];

    const xScale = scaleTime()
      .domain([minDate, maxDate])
      .range([0, W]);

    const nums    = points.map((p) => p.numeric);
    const domainMin = Math.max(1, Math.min(...nums) - 0.5);
    const domainMax = Math.max(...nums) + 0.5;

    const yScale = scaleLinear()
      .domain([domainMin, domainMax])
      .nice()
      .range([H, 0]);

    // ── SVG ───────────────────────────────────────────────────────────────────
    const svg = select(this.container)
      .append("svg")
      .attr("width", totalW)
      .attr("height", totalH)
      .attr("class", "tracker-mood-svg");

    const g = svg
      .append("g")
      .attr("transform", `translate(${MARGIN.left},${MARGIN.top})`);

    // ── Gradient definition ───────────────────────────────────────────────────
    const gradId = `mg-${Math.random().toString(36).slice(2, 7)}`;
    const defs   = svg.append("defs");
    const grad   = defs.append("linearGradient")
      .attr("id", gradId).attr("x1", "0").attr("y1", "0")
      .attr("x2", "0").attr("y2", "1");
    grad.append("stop").attr("offset", "0%")
      .attr("stop-color", "var(--interactive-accent)").attr("stop-opacity", "0.18");
    grad.append("stop").attr("offset", "100%")
      .attr("stop-color", "var(--interactive-accent)").attr("stop-opacity", "0");

    // ── Area fill ─────────────────────────────────────────────────────────────
    const areaGen = area<MoodPoint>()
      .x((p) => xScale(new Date(p.date)))
      .y0(H)
      .y1((p) => yScale(p.numeric))
      .curve(curveCatmullRom.alpha(0.5));

    g.append("path")
      .datum(points)
      .attr("fill", `url(#${gradId})`)
      .attr("d", areaGen);

    // ── Line ──────────────────────────────────────────────────────────────────
    const lineGen = line<MoodPoint>()
      .x((p) => xScale(new Date(p.date)))
      .y((p) => yScale(p.numeric))
      .curve(curveCatmullRom.alpha(0.5));

    g.append("path")
      .datum(points)
      .attr("class", "tracker-mood-line")
      .attr("d", lineGen)
      .attr("fill", "none")
      .attr("stroke", "var(--interactive-accent)")
      .attr("stroke-width", 2);

    // ── Dots + tooltips ───────────────────────────────────────────────────────
    const tooltip  = this.tooltip;
    const yLabels  = options.yLabels ?? [];

    g.selectAll<SVGCircleElement, MoodPoint>(".tracker-mood-dot")
      .data(points)
      .enter()
      .append("circle")
      .attr("class", "tracker-mood-dot")
      .attr("cx", (p) => xScale(new Date(p.date)))
      .attr("cy", (p) => yScale(p.numeric))
      .attr("r", 4)
      .attr("fill", "var(--interactive-accent)")
      .attr("stroke", "var(--background-primary)")
      .attr("stroke-width", 1.5)
      .on("mouseenter", function (event: MouseEvent, p: MoodPoint) {
        const label   = dayjs(p.date).format("MMM D");
        const display = yLabels.length > 0
          ? (yLabels[p.numeric - 1] ?? String(p.value))
          : String(p.value);
        tooltip.setText(`${label}: ${display}`);
        tooltip.style.display = "block";
        positionTooltip(tooltip, event);
        select(this).attr("r", "6");
      })
      .on("mousemove", (event: MouseEvent) => positionTooltip(tooltip, event))
      .on("mouseleave", function () {
        tooltip.style.display = "none";
        select(this).attr("r", "4");
      });

    // ── Y axis ────────────────────────────────────────────────────────────────
    const maxTicks = Math.min(5, Math.max(...nums) - Math.min(...nums) + 1);
    g.append("g")
      .attr("class", "tracker-chart-axis tracker-chart-axis-y")
      .call(
        axisLeft(yScale)
          .ticks(maxTicks)
          .tickFormat((v) => {
            if (!Number.isInteger(v as number)) return "";
            const idx = (v as number) - 1;
            if (yLabels.length > 0 && idx >= 0 && idx < yLabels.length) {
              return yLabels[idx];
            }
            return String(v);
          })
      );

    // ── X axis ────────────────────────────────────────────────────────────────
    const daySpan = dayjs(maxDate).diff(dayjs(minDate), "day");
    const fmt     = daySpan > 60 ? timeFormat("%b") : timeFormat("%b %d");
    const xTicks  = Math.floor(W / 60);

    g.append("g")
      .attr("class", "tracker-chart-axis tracker-chart-axis-x")
      .attr("transform", `translate(0,${H})`)
      .call(
        axisBottom(xScale)
          .ticks(xTicks)
          .tickFormat(fmt as (d: Date | { valueOf(): number }) => string)
      );
  }

  destroy(): void {
    this.container.empty();
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function positionTooltip(el: HTMLElement, event: MouseEvent): void {
  const parent = el.parentElement;
  if (!parent) return;
  const rect = parent.getBoundingClientRect();
  let x = event.clientX - rect.left + 10;
  let y = event.clientY - rect.top - 32;
  if (x + 180 > rect.width) x = rect.width - 184;
  if (y < 0) y = event.clientY - rect.top + 10;
  el.style.left = `${x}px`;
  el.style.top  = `${y}px`;
}
