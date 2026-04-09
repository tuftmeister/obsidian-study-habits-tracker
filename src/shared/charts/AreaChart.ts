import {
  select,
  scalePoint,
  scaleLinear,
  max,
  area,
  line,
  curveMonotoneX,
  axisLeft,
  axisBottom,
} from "d3";

export interface AreaDatum {
  label: string;
  minutes: number;
}

export interface AreaChartOptions {
  height?: number;
  color?: string;
}

const MARGIN = { top: 16, right: 16, bottom: 28, left: 44 };
const DEFAULT_HEIGHT = 180;

export class AreaChart {
  constructor(private container: HTMLElement) {
    container.addClass("tracker-area-chart");
  }

  render(data: AreaDatum[], options: AreaChartOptions = {}): void {
    this.container.querySelectorAll("svg").forEach((el) => el.remove());
    this.container.querySelectorAll(".tracker-chart-empty").forEach((el) => el.remove());

    if (data.length === 0 || data.every((d) => d.minutes === 0)) {
      this.container.createEl("p", { cls: "tracker-chart-empty", text: "No data yet" });
      return;
    }

    const color  = options.color ?? "var(--interactive-accent)";
    const totalH = options.height ?? DEFAULT_HEIGHT;
    const totalW = this.container.clientWidth || 500;
    const W = totalW - MARGIN.left - MARGIN.right;
    const H = totalH - MARGIN.top - MARGIN.bottom;

    const maxVal   = max(data, (d) => d.minutes) ?? 1;
    const useHours = maxVal > 90;

    const xScale = scalePoint<string>()
      .domain(data.map((d) => d.label))
      .range([0, W])
      .padding(0.1);

    const yScale = scaleLinear()
      .domain([0, useHours ? maxVal / 60 : maxVal])
      .nice()
      .range([H, 0]);

    const toY = (d: AreaDatum) => yScale(useHours ? d.minutes / 60 : d.minutes);
    const toX = (d: AreaDatum) => xScale(d.label) ?? 0;

    // ── SVG ────────────────────────────────────────────────────────────────
    const svg = select(this.container)
      .append("svg")
      .attr("width",  totalW)
      .attr("height", totalH)
      .attr("class",  "tracker-area-svg");
    const defs = svg.append("defs");

    // Gradient fill
    const gradId = `area-grad-${Math.random().toString(36).slice(2)}`;
    const grad = defs.append("linearGradient")
      .attr("id", gradId)
      .attr("x1", "0").attr("y1", "0")
      .attr("x2", "0").attr("y2", "1");
    grad.append("stop").attr("offset", "0%")
      .attr("stop-color", color).attr("stop-opacity", 0.35);
    grad.append("stop").attr("offset", "100%")
      .attr("stop-color", color).attr("stop-opacity", 0.02);

    const g = svg.append("g")
      .attr("transform", `translate(${MARGIN.left},${MARGIN.top})`);

    // ── Grid lines ────────────────────────────────────────────────────────
    const yTicks = yScale.ticks(4);
    g.selectAll(".tracker-area-grid")
      .data(yTicks)
      .enter()
      .append("line")
      .attr("class", "tracker-area-grid")
      .attr("x1", 0).attr("x2", W)
      .attr("y1", (d) => yScale(d)).attr("y2", (d) => yScale(d));

    // ── Area fill ─────────────────────────────────────────────────────────
    const areaGen = area<AreaDatum>()
      .x(toX).y0(H).y1(toY)
      .curve(curveMonotoneX);

    g.append("path")
      .datum(data)
      .attr("class", "tracker-area-fill")
      .attr("fill", `url(#${gradId})`)
      .attr("d", areaGen);

    // ── Line ──────────────────────────────────────────────────────────────
    const lineGen = line<AreaDatum>()
      .x(toX).y(toY)
      .curve(curveMonotoneX);

    g.append("path")
      .datum(data)
      .attr("class", "tracker-area-line")
      .attr("fill", "none")
      .attr("stroke", color)
      .attr("stroke-width", 2)
      .attr("d", lineGen);

    // ── Dots ──────────────────────────────────────────────────────────────
    g.selectAll(".tracker-area-dot")
      .data(data.filter((d) => d.minutes > 0))
      .enter()
      .append("circle")
      .attr("class", "tracker-area-dot")
      .attr("cx", toX).attr("cy", toY)
      .attr("r", 3.5)
      .attr("fill", color)
      .attr("stroke", "var(--background-primary)")
      .attr("stroke-width", 1.5);

    // ── Axes ──────────────────────────────────────────────────────────────
    g.append("g")
      .attr("class", "tracker-chart-axis tracker-chart-axis-y")
      .call(
        axisLeft(yScale)
          .ticks(4)
          .tickFormat((v) => (useHours ? `${v}h` : `${v}m`))
      );

    const maxTicks = Math.floor(W / 40);
    const step     = Math.ceil(data.length / maxTicks);
    g.append("g")
      .attr("class", "tracker-chart-axis tracker-chart-axis-x")
      .attr("transform", `translate(0,${H})`)
      .call(
        axisBottom(xScale)
          .tickValues(data.filter((_, i) => i % step === 0).map((d) => d.label))
      );
  }

  destroy(): void {
    this.container.empty();
  }
}
