import { select, scaleBand, scaleLinear, max, axisLeft, axisBottom, stack, stackOrderNone, stackOffsetNone } from "d3";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface BarSegment {
  tag: string;
  minutes: number;
  color: string;
}

export interface BarDatum {
  label: string;   // x-axis tick label
  date?: string;   // "YYYY-MM-DD", used for click callbacks
  segments: BarSegment[];
  total: number;
}

export interface BarChartOptions {
  height?: number;
  onBarClick?: (datum: BarDatum) => void;
}

// ── BarChart ──────────────────────────────────────────────────────────────────

const MARGIN = { top: 12, right: 8, bottom: 28, left: 36 };
const DEFAULT_HEIGHT = 140;
const TRANSITION_MS = 250;

export class BarChart {
  private tooltip: HTMLElement;

  constructor(private container: HTMLElement) {
    container.addClass("tracker-bar-chart");
    this.tooltip = container.createDiv({ cls: "tracker-bar-tooltip" });
  }

  render(data: BarDatum[], options: BarChartOptions = {}): void {
    this.container.querySelectorAll("svg").forEach((el) => el.remove());
    if (data.length === 0) {
      this.container.createEl("p", {
        cls: "tracker-chart-empty",
        text: "No data yet",
      });
      return;
    }

    const totalH = options.height ?? DEFAULT_HEIGHT;
    const totalW = this.container.clientWidth || 400;
    const W = totalW - MARGIN.left - MARGIN.right;
    const H = totalH - MARGIN.top - MARGIN.bottom;

    // Collect all unique tags in a stable order
    const allTags = Array.from(
      new Set(data.flatMap((d) => d.segments.map((s) => s.tag)))
    );

    // Build D3-stack-compatible row objects: { label, tag1: minutes, tag2: ... }
    type RowObj = { label: string; datum: BarDatum; [tag: string]: unknown };
    const rows: RowObj[] = data.map((d) => {
      const row: RowObj = { label: d.label, datum: d };
      for (const tag of allTags) {
        row[tag] = d.segments.find((s) => s.tag === tag)?.minutes ?? 0;
      }
      return row;
    });

    // Color lookup from first bar that has this tag
    const tagColor = new Map<string, string>();
    for (const d of data) {
      for (const seg of d.segments) {
        if (!tagColor.has(seg.tag)) tagColor.set(seg.tag, seg.color);
      }
    }

    // Stacks
    const stackGen = stack<RowObj>()
      .keys(allTags)
      .order(stackOrderNone)
      .offset(stackOffsetNone);
    const series = stackGen(rows);

    // Scales
    const maxVal = max(data, (d) => d.total) ?? 1;
    const useHours = maxVal > 120;

    const xScale = scaleBand()
      .domain(data.map((d) => d.label))
      .range([0, W])
      .padding(0.2);

    const yScale = scaleLinear()
      .domain([0, useHours ? maxVal / 60 : maxVal])
      .nice()
      .range([H, 0]);

    // SVG
    const svg = select(this.container)
      .append("svg")
      .attr("width", totalW)
      .attr("height", totalH)
      .attr("class", "tracker-bar-svg");

    const g = svg
      .append("g")
      .attr("transform", `translate(${MARGIN.left},${MARGIN.top})`);

    // ── Stacked bars ──────────────────────────────────────────────────────────
    const tooltip = this.tooltip;

    series.forEach((layer) => {
      const color = tagColor.get(layer.key) ?? "var(--text-muted)";
      g.selectAll(`.bar-${layer.key}`)
        .data(layer)
        .enter()
        .append("rect")
        .attr("class", "tracker-bar-segment")
        .attr("x", (d) => xScale(d.data.label) ?? 0)
        .attr("width", xScale.bandwidth())
        .attr("y", (d) => yScale(useHours ? d[1] / 60 : d[1]))
        .attr("height", (d) =>
          Math.max(
            0,
            yScale(useHours ? d[0] / 60 : d[0]) -
              yScale(useHours ? d[1] / 60 : d[1])
          )
        )
        .attr("fill", color)
        .attr("rx", 2)
        .on("mouseenter", function (event: MouseEvent, d) {
          const datum = d.data.datum;
          const lines = datum.segments
            .filter((s) => s.minutes > 0)
            .map((s) => `${s.tag || "untagged"}: ${fmtMin(s.minutes, useHours)}`)
            .join("\n");
          tooltip.setText(lines || fmtMin(datum.total, useHours));
          tooltip.style.display = "block";
          positionTooltip(tooltip, event);
        })
        .on("mousemove", (event: MouseEvent) => positionTooltip(tooltip, event))
        .on("mouseleave", () => { tooltip.style.display = "none"; });
    });

    // ── Click handler on whole bar ────────────────────────────────────────────
    if (options.onBarClick) {
      const cb = options.onBarClick;
      g.selectAll(".tracker-bar-hit")
        .data(data)
        .enter()
        .append("rect")
        .attr("class", "tracker-bar-hit")
        .attr("x", (d) => xScale(d.label) ?? 0)
        .attr("width", xScale.bandwidth())
        .attr("y", 0)
        .attr("height", H)
        .attr("fill", "transparent")
        .style("cursor", "pointer")
        .on("click", (_event, d) => cb(d));
    }

    // ── Y axis ────────────────────────────────────────────────────────────────
    const yTickCount = Math.min(5, Math.ceil(maxVal / (useHours ? 60 : 15)));
    g.append("g")
      .attr("class", "tracker-chart-axis tracker-chart-axis-y")
      .call(
        axisLeft(yScale)
          .ticks(yTickCount)
          .tickFormat((v) => (useHours ? `${v}h` : `${v}m`))
      );

    // ── X axis ────────────────────────────────────────────────────────────────
    // Show fewer ticks when bars are very narrow (30-day chart)
    const maxTicks = Math.floor(W / 24);
    const step = Math.ceil(data.length / maxTicks);
    const xAxis = axisBottom(xScale).tickValues(
      data.filter((_, i) => i % step === 0).map((d) => d.label)
    );

    g.append("g")
      .attr("class", "tracker-chart-axis tracker-chart-axis-x")
      .attr("transform", `translate(0,${H})`)
      .call(xAxis);
  }

  destroy(): void {
    this.container.empty();
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtMin(minutes: number, asHours: boolean): string {
  if (asHours) {
    const h = Math.floor(minutes / 60);
    const m = Math.round(minutes % 60);
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  }
  return `${Math.round(minutes)}m`;
}

function positionTooltip(el: HTMLElement, event: MouseEvent): void {
  const parent = el.parentElement;
  if (!parent) return;
  const rect = parent.getBoundingClientRect();
  let x = event.clientX - rect.left + 10;
  let y = event.clientY - rect.top - 32;
  if (x + 180 > rect.width) x = rect.width - 184;
  if (y < 0) y = event.clientY - rect.top + 10;
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
}
