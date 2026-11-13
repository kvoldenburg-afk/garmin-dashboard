"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Area, Bar, BarChart, CartesianGrid, ComposedChart, Line, LineChart, ReferenceLine,
  ResponsiveContainer, Scatter, Tooltip, XAxis, YAxis, Cell,
} from "recharts";
import type { Activity, DailyWellness, Settings, Sport } from "@/lib/types";
import { SPORT_COLOR, SPORT_LABEL, SPORTS } from "@/lib/types";
import {
  addDays, dist, fmtDate, fmtDist, fmtDur, fmtHours, fmtInt, fmtPace, pacePerKm, parseDay,
  PmcPoint, rolling, startOfWeek, today, WeekRow, ymd,
} from "@/lib/metrics";

const GRID = "#26272b";
const AXIS = { stroke: "transparent", tickLine: false, tick: { fill: "#8d8c86", fontSize: 11 } } as const;
export const C = {
  fitness: "#3987e5", // blue — slot 1
  fatigue: "#d55181", // magenta
  form: "#8d8c86",
  aqua: "#199e70",
  yellow: "#c98500",
  violet: "#9085e9",
  orange: "#d95926",
};
const YEAR_COLORS = ["#5e5d58", "#9085e9", "#199e70", "#3987e5"]; // oldest → current (current = strongest)

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

/* ---------- tooltip ---------- */
function TT({ active, payload, label, title, rows }: any) {
  if (!active || !payload?.length) return null;
  const items: { name: string; value: string; color?: string; line?: boolean }[] = rows ? rows(payload, label) : payload.map((p: any) => ({ name: p.name, value: String(p.value), color: p.color }));
  return (
    <div className="tt">
      <div className="tt-title">{title ? title(label, payload) : label}</div>
      {items.map((it) => (
        <div className="row" key={it.name}>
          <span>{it.color && <i className="dot" style={{ background: it.color, borderRadius: it.line ? 2 : 3, height: it.line ? 3 : 8 }} />}{it.name}</span>
          <b>{it.value}</b>
        </div>
      ))}
    </div>
  );
}
const cursor = { stroke: "#5e5d58", strokeWidth: 1 };
const barCursor = { fill: "rgba(255,255,255,0.04)" };

export function Legend({ items }: { items: { label: string; color: string; kind?: "line" | "box" | "dash" }[] }) {
  return (
    <div className="legend">
      {items.map((i) => (
        <span key={i.label}>
          {i.kind === "line" ? <i className="ln" style={{ background: i.color }} />
            : i.kind === "dash" ? <i className="ln" style={{ background: `repeating-linear-gradient(90deg, ${i.color} 0 4px, transparent 4px 7px)` }} />
            : <i className="sw" style={{ background: i.color }} />}
          {i.label}
        </span>
      ))}
    </div>
  );
}

const shortDate = (s: string) => parseDay(s).toLocaleDateString("en-GB", { day: "numeric", month: "short" });

/* ---------- Performance management chart ---------- */
export function PmcChart({ data, height = 280 }: { data: PmcPoint[]; height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey="date" {...AXIS} tickFormatter={shortDate} minTickGap={40} />
        <YAxis {...AXIS} width={44} />
        <ReferenceLine y={0} stroke="#3a3b40" />
        <Tooltip cursor={cursor} content={<TT title={(l: string) => fmtDate(l, { weekday: "short", day: "numeric", month: "short", year: "numeric" })}
          rows={(p: any) => {
            const d = p[0].payload as PmcPoint;
            return [
              { name: "Fitness (CTL)", value: d.ctl.toFixed(0), color: C.fitness, line: true },
              { name: "Fatigue (ATL)", value: d.atl.toFixed(0), color: C.fatigue, line: true },
              { name: "Form (TSB)", value: d.tsb.toFixed(0), color: C.form },
              { name: "Day load", value: String(d.load) },
            ];
          }} />} />
        <Area type="monotone" dataKey="tsb" name="Form" stroke="none" fill={C.form} fillOpacity={0.22} isAnimationActive={false} />
        <Line type="monotone" dataKey="atl" name="Fatigue" stroke={C.fatigue} strokeWidth={2} dot={false} isAnimationActive={false} />
        <Line type="monotone" dataKey="ctl" name="Fitness" stroke={C.fitness} strokeWidth={2.5} dot={false} isAnimationActive={false} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

/* ---------- stacked weekly bars by sport ---------- */
export function WeeklyBars({ data, metric, units, height = 260 }: { data: WeekRow[]; metric: "distance" | "time" | "load"; units: Settings["units"]; height?: number }) {
  const sports = SPORTS.filter((s) => data.some((r) => (r[s] ?? 0) > 0));
  const fmt = (v: number) => metric === "distance" ? `${v.toFixed(1)} ${units}` : metric === "time" ? `${v.toFixed(1)} h` : v.toFixed(0);
  const topOf = (row: WeekRow) => [...sports].reverse().find((s) => (row[s] ?? 0) > 0);
  const shape = (sport: Sport) => (props: any) => {
    const { x, y, width, height: h, payload } = props;
    if (!h || h <= 0) return <g />;
    const r = topOf(payload) === sport ? Math.min(4, width / 2, h) : 0;
    const gap = 1; // 2px surface gap between stacked fills (1px each side)
    const yy = y + gap, hh = Math.max(0, h - gap * 2);
    return <path d={`M${x},${yy + hh} V${yy + r} Q${x},${yy} ${x + r},${yy} H${x + width - r} Q${x + width},${yy} ${x + width},${yy + r} V${yy + hh} Z`} fill={SPORT_COLOR[sport]} />;
  };
  return (
    <>
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }} barCategoryGap="22%">
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="label" {...AXIS} minTickGap={16} />
          <YAxis {...AXIS} width={44} />
          <Tooltip cursor={barCursor} content={<TT title={(l: string) => `Week of ${l}`} rows={(p: any) => {
            const row = p[0].payload as WeekRow;
            return [...sports].reverse().filter((s) => row[s]).map((s) => ({ name: SPORT_LABEL[s], value: fmt(row[s]!), color: SPORT_COLOR[s] }))
              .concat([{ name: "Total", value: fmt(row.total), color: undefined as any }]);
          }} />} />
          {sports.map((s) => <Bar key={s} dataKey={s} stackId="a" name={SPORT_LABEL[s]} fill={SPORT_COLOR[s]} shape={shape(s)} isAnimationActive={false} />)}
        </BarChart>
      </ResponsiveContainer>
      <Legend items={sports.map((s) => ({ label: SPORT_LABEL[s], color: SPORT_COLOR[s] }))} />
    </>
  );
}

/* ---------- GitHub/Strava-style calendar heatmap ---------- */
const HEAT = ["#222326", "#104281", "#1c5cab", "#2a78d6", "#5598e7", "#9ec5f4"];
export function Heatmap({ acts, units, weeks = 53 }: { acts: Activity[]; units: Settings["units"]; weeks?: number }) {
  const [hover, setHover] = useState<string | null>(null);
  const { cells, months, byDay, maxV } = useMemo(() => {
    const byDay = new Map<string, { km: number; s: number; n: number; sports: Set<Sport> }>();
    acts.forEach((a) => {
      const k = a.start.slice(0, 10);
      const r = byDay.get(k) ?? { km: 0, s: 0, n: 0, sports: new Set<Sport>() };
      r.km += a.distanceKm; r.s += a.durationS; r.n++; r.sports.add(a.sport);
      byDay.set(k, r);
    });
    const end = today();
    const start = addDays(startOfWeek(end), -7 * (weeks - 1));
    const cells: { k: string; w: number; d: number; v: number }[] = [];
    const months: { w: number; label: string }[] = [];
    let lastM = -1;
    for (let d = new Date(start), i = 0; d <= end; d = addDays(d, 1), i++) {
      const w = Math.floor(i / 7);
      const k = ymd(d);
      const v = (byDay.get(k)?.s ?? 0) / 60;
      cells.push({ k, w, d: i % 7, v });
      if (d.getDate() <= 7 && d.getMonth() !== lastM && i % 7 === 0) { months.push({ w, label: d.toLocaleDateString("en-GB", { month: "short" }) }); lastM = d.getMonth(); }
    }
    const vals = cells.map((c) => c.v).filter((v) => v > 0).sort((a, b) => a - b);
    const maxV = vals[Math.floor(vals.length * 0.95)] || 60;
    return { cells, months, byDay, maxV };
  }, [acts, weeks]);
  const [wrapRef, width] = useWidth<HTMLDivElement>();
  const gap = 3, left = 24, top = 16;
  const size = Math.max(11, Math.min(22, Math.floor((width - left) / weeks) - gap));
  const level = (v: number) => (v <= 0 ? 0 : Math.min(5, 1 + Math.floor((v / maxV) * 4)));
  const h = byDay.get(hover ?? "");
  return (
    <div>
      <div className="readout">
        {hover ? <>
          <b>{fmtDate(hover, { weekday: "short", day: "numeric", month: "short", year: "numeric" })}</b>{" · "}
          {h ? `${h.n} activit${h.n > 1 ? "ies" : "y"} · ${fmtDur(h.s, true)}${h.km > 0 ? ` · ${fmtDist(h.km, units)}` : ""} · ${[...h.sports].map((s) => SPORT_LABEL[s]).join(", ")}` : "Rest day"}
        </> : <span className="muted">Hover or tap a day</span>}
      </div>
      <div className="scroll-x" ref={(el) => { (wrapRef as any).current = el; if (el) el.scrollLeft = el.scrollWidth; }}>
        <svg className="heat" width={left + weeks * (size + gap)} height={top + 7 * (size + gap)} role="img" aria-label="Training calendar heatmap, minutes per day">
          {months.map((m) => <text key={m.w + m.label} x={left + m.w * (size + gap)} y={10} fill="#8d8c86" fontSize={10}>{m.label}</text>)}
          {["Mon", "", "Wed", "", "Fri", "", "Sun"].map((d, i) => d && <text key={d} x={0} y={top + i * (size + gap) + size / 2 + 3} fill="#8d8c86" fontSize={9}>{d}</text>)}
          {cells.map((c) => (
            <rect key={c.k} x={left + c.w * (size + gap)} y={top + c.d * (size + gap)} width={size} height={size} rx={3}
              fill={HEAT[level(c.v)]} stroke={hover === c.k ? "#f0efec" : "none"} strokeWidth={1.5}
              onMouseEnter={() => setHover(c.k)} onClick={() => setHover(c.k)} />
          ))}
        </svg>
      </div>
      <div className="legend" style={{ marginTop: 6, justifyContent: "flex-end" }}>
        <span className="muted">Less</span>{HEAT.map((c) => <i key={c} className="sw" style={{ background: c }} />)}<span className="muted">More (minutes)</span>
      </div>
    </div>
  );
}

/* ---------- punchcard (weekday × hour) ---------- */
export function Punchcard({ grid }: { grid: number[][] }) {
  const [hover, setHover] = useState<[number, number] | null>(null);
  const max = Math.max(1, ...grid.flat());
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const [wrapRef, width] = useWidth<HTMLDivElement>();
  const left = 32, top = 4;
  const cw = Math.max(22, Math.min(54, Math.floor((width - left) / 24))), ch = Math.max(26, Math.min(34, cw * 0.8));
  return (
    <div>
      <div className="readout">
        {hover ? <><b>{days[hover[0]]} {String(hover[1]).padStart(2, "0")}:00</b> · {grid[hover[0]][hover[1]]} activities</> : <span className="muted">When you train — hover or tap a cell</span>}
      </div>
      <div className="scroll-x" ref={wrapRef}>
        <svg className="punch" width={left + 24 * cw} height={top + 7 * ch + 18} role="img" aria-label="Activities by weekday and hour">
          {grid.map((row, d) => (
            <g key={d}>
              <text x={0} y={top + d * ch + ch / 2 + 4} fill="#8d8c86" fontSize={10}>{days[d]}</text>
              {row.map((v, hr) => {
                const r = v ? 2.5 + Math.sqrt(v / max) * (Math.min(cw, ch) / 2 - 3) : 1.5;
                const on = hover && hover[0] === d && hover[1] === hr;
                return (
                  <g key={hr} onMouseEnter={() => setHover([d, hr])} onClick={() => setHover([d, hr])}>
                    <rect x={left + hr * cw} y={top + d * ch} width={cw} height={ch} fill="transparent" />
                    <circle cx={left + hr * cw + cw / 2} cy={top + d * ch + ch / 2} r={r} fill={v ? C.fitness : "#2a2b30"}
                      fillOpacity={v ? 0.35 + 0.65 * (v / max) : 1} stroke={on ? "#f0efec" : "none"} strokeWidth={1.5} />
                  </g>
                );
              })}
            </g>
          ))}
          {[0, 6, 12, 18, 23].map((hr) => <text key={hr} x={left + hr * cw + cw / 2} y={top + 7 * ch + 12} fill="#8d8c86" fontSize={10} textAnchor="middle">{String(hr).padStart(2, "0")}h</text>)}
        </svg>
      </div>
    </div>
  );
}

/* ---------- horizontal bars (zones, sports) ---------- */
export function HBars({ rows, fmt }: { rows: { label: string; value: number; color: string; sub?: string; icon?: React.ReactNode }[]; fmt: (v: number) => string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <div style={{ display: "grid", gap: 10 }}>
      {rows.map((r) => (
        <div key={r.label} title={`${r.label}: ${fmt(r.value)}`}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 5, gap: 8 }}>
            <span style={{ display: "inline-flex", gap: 8, alignItems: "center", color: "var(--text-secondary)" }}>{r.icon}{r.label}</span>
            <span className="num"><b>{fmt(r.value)}</b>{r.sub && <span className="muted"> · {r.sub}</span>}</span>
          </div>
          <div style={{ height: 10, background: "var(--surface-2)", borderRadius: 4 }}>
            <div style={{ width: `${(r.value / max) * 100}%`, height: "100%", background: r.color, borderRadius: 4, minWidth: r.value ? 4 : 0 }} />
          </div>
        </div>
      ))}
    </div>
  );
}

/* ---------- running pace trend ---------- */
export function PaceTrend({ runs, units, height = 260 }: { runs: Activity[]; units: Settings["units"]; height?: number }) {
  const data = useMemo(() => {
    const pts = runs.filter((a) => a.distanceKm >= 1).map((a) => ({ t: parseDay(a.start).getTime(), pace: pacePerKm(a), a }))
      .filter((p) => isFinite(p.pace) && p.pace > 120 && p.pace < 900);
    const roll = rolling(pts, (p) => p.pace, 10);
    return pts.map((p, i) => ({ ...p, paceU: units === "mi" ? p.pace * 1.609344 : p.pace, rollU: roll[i] ? (units === "mi" ? roll[i]! * 1.609344 : roll[i]) : undefined }));
  }, [runs, units]);
  if (data.length < 2) return <div className="empty"><p>Not enough runs in this range.</p></div>;
  const ys = data.map((d) => d.paceU);
  const lo = Math.floor(Math.min(...ys) / 15) * 15, hi = Math.ceil(Math.max(...ys) / 15) * 15;
  const fmtP = (v: number) => fmtPace(units === "mi" ? v / 1.609344 : v, units, false);
  return (
    <>
      <ResponsiveContainer width="100%" height={height}>
        <ComposedChart data={data} margin={{ top: 8, right: 8, left: -6, bottom: 0 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="t" type="number" scale="time" domain={["dataMin", "dataMax"]} {...AXIS}
            tickFormatter={(t) => new Date(t).toLocaleDateString("en-GB", data[data.length - 1].t - data[0].t > 200 * 864e5 ? { month: "short", year: "2-digit" } : { day: "numeric", month: "short" })} minTickGap={40} />
          <YAxis {...AXIS} width={44} reversed domain={[lo, hi]} tickFormatter={fmtP} />
          <Tooltip cursor={cursor} content={<TT title={(_: any, p: any) => `${p[0].payload.a.title} · ${fmtDate(p[0].payload.a.start)}`}
            rows={(p: any) => {
              const d = p[0].payload;
              return [
                { name: "Pace", value: `${fmtP(d.paceU)} /${units}`, color: C.fitness },
                { name: "10-run avg", value: d.rollU ? `${fmtP(d.rollU)} /${units}` : "–", color: "#f0efec", line: true },
                { name: "Distance", value: fmtDist(d.a.distanceKm, units) },
                ...(d.a.avgHr ? [{ name: "Avg HR", value: `${d.a.avgHr} bpm` }] : []),
              ];
            }} />} />
          <Scatter dataKey="paceU" fill={C.fitness} fillOpacity={0.55} isAnimationActive={false} shape={(p: any) => <circle cx={p.cx} cy={p.cy} r={4} fill={C.fitness} fillOpacity={0.5} />} />
          <Line dataKey="rollU" stroke="#f0efec" strokeWidth={2} dot={false} isAnimationActive={false} connectNulls />
        </ComposedChart>
      </ResponsiveContainer>
      <Legend items={[{ label: "Run pace (faster ↑)", color: C.fitness }, { label: "10-run rolling average", color: "#f0efec", kind: "line" }]} />
    </>
  );
}

/* ---------- year-over-year race ---------- */
export function YearRace({ data, units, goal, height = 280 }: { data: { years: string[]; rows: any[] }; units: Settings["units"]; goal?: number; height?: number }) {
  const colors = data.years.map((_, i) => YEAR_COLORS[YEAR_COLORS.length - data.years.length + i]);
  return (
    <>
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={data.rows} margin={{ top: 8, right: 12, left: -6, bottom: 0 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="label" {...AXIS} minTickGap={36} interval="preserveStartEnd" />
          <YAxis {...AXIS} width={48} tickFormatter={(v) => fmtInt(v)} />
          {goal ? <ReferenceLine segment={[{ x: data.rows[0].label, y: 0 }, { x: data.rows[data.rows.length - 1].label, y: dist(goal, units) }]} stroke="#8d8c86" strokeDasharray="4 4" /> : null}
          <Tooltip cursor={cursor} content={<TT rows={(p: any) => p.filter((x: any) => x.value !== null).reverse().map((x: any) => ({ name: x.name, value: `${fmtInt(x.value)} ${units}`, color: x.color, line: true }))} />} />
          {data.years.map((y, i) => (
            <Line key={y} dataKey={y} name={y} stroke={colors[i]} strokeWidth={i === data.years.length - 1 ? 2.5 : 2} dot={false} isAnimationActive={false} connectNulls={false} />
          ))}
        </LineChart>
      </ResponsiveContainer>
      <Legend items={[...data.years.map((y, i) => ({ label: y, color: colors[i], kind: "line" as const })), ...(goal ? [{ label: "Goal pace", color: "#8d8c86", kind: "dash" as const }] : [])]} />
    </>
  );
}

/* ---------- wellness ---------- */
export function WellnessLine({ data, field, color, unit, height = 200, digits = 0, avgN = 7, cap }: {
  data: DailyWellness[]; field: keyof DailyWellness; color: string; unit: string; height?: number; digits?: number; avgN?: number; cap?: number;
}) {
  const rows = useMemo(() => {
    const roll = rolling(data, (d) => d[field] as number | undefined, avgN);
    return data.map((d, i) => ({ date: d.date, v: d[field] as number | undefined, avg: roll[i] }));
  }, [data, field, avgN]);
  const vals = rows.map((r) => r.v).filter((v): v is number => v !== undefined);
  if (!vals.length) return <div className="empty"><p>No data in this range.</p></div>;
  const step = hiLoStep(vals);
  const lo = Math.max(0, Math.floor(Math.min(...vals) / step) * step);
  const hi = Math.min(cap ?? Infinity, Math.ceil(Math.max(...vals) / step) * step);
  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={rows} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey="date" {...AXIS} tickFormatter={shortDate} minTickGap={40} />
        <YAxis {...AXIS} width={44} domain={[lo, hi]} ticks={Array.from({ length: Math.round((hi - lo) / step) + 1 }, (_, i) => lo + i * step)} />
        <Tooltip cursor={cursor} content={<TT title={(l: string) => fmtDate(l, { weekday: "short", day: "numeric", month: "short" })}
          rows={(p: any) => [
            { name: "Value", value: p[0].payload.v !== undefined ? `${(+p[0].payload.v).toFixed(digits)} ${unit}` : "–", color },
            { name: `${avgN}-day avg`, value: p[0].payload.avg ? `${p[0].payload.avg.toFixed(digits)} ${unit}` : "–", color: "#f0efec", line: true },
          ]} />} />
        <Line dataKey="v" stroke={color} strokeOpacity={0.45} strokeWidth={1.5} dot={false} isAnimationActive={false} connectNulls />
        <Line dataKey="avg" stroke={color} strokeWidth={2.5} dot={false} isAnimationActive={false} connectNulls />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

export function WellnessBars({ data, field, color, unit, height = 200, goal, transform = (v: number) => v, digits = 0 }: {
  data: DailyWellness[]; field: keyof DailyWellness; color: string; unit: string; height?: number; goal?: number; transform?: (v: number) => number; digits?: number;
}) {
  const rows = data.map((d) => ({ date: d.date, v: d[field] !== undefined ? +transform(d[field] as number).toFixed(digits + 1) : undefined }));
  if (!rows.some((r) => r.v !== undefined)) return <div className="empty"><p>No data in this range.</p></div>;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={rows} margin={{ top: 8, right: 8, left: -12, bottom: 0 }} barCategoryGap={rows.length > 60 ? 1 : "18%"}>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey="date" {...AXIS} tickFormatter={shortDate} minTickGap={40} />
        <YAxis {...AXIS} width={44} tickFormatter={(v) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))} />
        {goal ? <ReferenceLine y={goal} stroke="#c3c2b7" strokeDasharray="4 4" /> : null}
        <Tooltip cursor={barCursor} content={<TT title={(l: string) => fmtDate(l, { weekday: "short", day: "numeric", month: "short" })}
          rows={(p: any) => [{ name: "Value", value: p[0].payload.v !== undefined ? `${(+p[0].payload.v).toLocaleString("en-US", { maximumFractionDigits: digits })} ${unit}` : "–", color }]} />} />
        <Bar dataKey="v" radius={[3, 3, 0, 0]} isAnimationActive={false}>
          {rows.map((r) => <Cell key={r.date} fill={goal && r.v !== undefined && r.v >= goal ? color : color} fillOpacity={goal && r.v !== undefined && r.v < goal ? 0.55 : 1} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

function hiLoStep(vals: number[]) {
  const span = Math.max(1, Math.max(...vals) - Math.min(...vals));
  const raw = span / 4;
  const pow = Math.pow(10, Math.floor(Math.log10(raw)));
  return [1, 2, 5, 10].map((m) => m * pow).find((s) => s >= raw) ?? 10 * pow;
}

/* ---------- ring ---------- */
export function Ring({ value, size = 156, color, track = "#2a2b30", children }: { value: number; size?: number; color: string; track?: string; children?: React.ReactNode }) {
  const r = size / 2 - 10, c = 2 * Math.PI * r, v = Math.max(0, Math.min(100, value));
  return (
    <div className="ring-wrap" style={{ width: size, height: size }}>
      <svg width={size} height={size} role="img" aria-label={`${v} of 100`}>
        <circle cx={size / 2} cy={size / 2} r={r} stroke={track} strokeWidth={12} fill="none" />
        <circle cx={size / 2} cy={size / 2} r={r} stroke={color} strokeWidth={12} fill="none" strokeLinecap="round"
          strokeDasharray={`${(v / 100) * c} ${c}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      </svg>
      <div className="ring-center">{children}</div>
    </div>
  );
}

export { fmtHours };
