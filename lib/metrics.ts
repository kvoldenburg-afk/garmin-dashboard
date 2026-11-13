import type { Activity, DailyWellness, Settings, Sport } from "./types";
import { SPORTS } from "./types";

/* ---------- dates ---------- */
const p2 = (n: number) => String(n).padStart(2, "0");
export const ymd = (d: Date) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
export const parseDay = (s: string) => {
  const [y, m, d] = s.slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d);
};
export const dayOf = (a: Activity) => a.start.slice(0, 10);
export const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
export const startOfWeek = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); const dow = (x.getDay() + 6) % 7; x.setDate(x.getDate() - dow); return x; };
export const today = () => { const t = new Date(); t.setHours(0, 0, 0, 0); return t; };

/* ---------- formatting ---------- */
export const KM_PER_MI = 1.609344;
export const dist = (km: number, u: Settings["units"]) => (u === "mi" ? km / KM_PER_MI : km);
export function fmtDist(km: number, u: Settings["units"], digits?: number) {
  const v = dist(km, u);
  const d = digits ?? (v >= 100 ? 0 : 1);
  return `${v.toLocaleString("en-US", { maximumFractionDigits: d, minimumFractionDigits: d })} ${u}`;
}
export function fmtDur(s: number, short = false) {
  if (!s) return "0m";
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = Math.round(s % 60);
  if (short) return h ? `${h}h ${p2(m)}m` : `${m}m`;
  return h ? `${h}:${p2(m)}:${p2(sec)}` : `${m}:${p2(sec)}`;
}
export function fmtHours(s: number) {
  const h = s / 3600;
  return h >= 10 ? `${Math.round(h)}h` : `${h.toFixed(1)}h`;
}
/** pace in seconds per unit → "4:52 /km" */
export function fmtPace(secPerKm: number, u: Settings["units"], withUnit = true) {
  if (!isFinite(secPerKm) || secPerKm <= 0) return "–";
  const s = u === "mi" ? secPerKm * KM_PER_MI : secPerKm;
  const m = Math.floor(s / 60), sec = Math.round(s % 60);
  const fixed = sec === 60 ? `${m + 1}:00` : `${m}:${p2(sec)}`;
  return withUnit ? `${fixed} /${u}` : fixed;
}
export const fmtSpeed = (km: number, s: number, u: Settings["units"]) =>
  s ? `${(dist(km, u) / (s / 3600)).toFixed(1)} ${u === "mi" ? "mph" : "km/h"}` : "–";
export const fmtInt = (n: number) => Math.round(n).toLocaleString("en-US");
export const fmtDate = (s: string, opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" }) =>
  parseDay(s).toLocaleDateString("en-GB", opts);

export function pacePerKm(a: Activity) {
  return a.distanceKm > 0 ? (a.movingS || a.durationS) / a.distanceKm : NaN;
}

/* ---------- heart rate profile ---------- */
export interface HrProfile { max: number; rest: number; estimated: boolean }
export function hrProfile(acts: Activity[], daily: DailyWellness[], s: Settings): HrProfile {
  const maxes = acts.map((a) => a.maxHr).filter((v): v is number => !!v && v > 100 && v < 230).sort((a, b) => a - b);
  const observedMax = maxes.length ? maxes[Math.floor(maxes.length * 0.995)] ?? maxes[maxes.length - 1] : undefined;
  const rhrs = daily.slice(-60).map((d) => d.restingHr).filter((v): v is number => !!v).sort((a, b) => a - b);
  const medRest = rhrs.length ? rhrs[Math.floor(rhrs.length / 2)] : undefined;
  return {
    max: s.maxHr || observedMax || 190,
    rest: s.restHr || medRest || 55,
    estimated: !s.maxHr,
  };
}

/** Training load: TSS when the export has it, otherwise a TRIMP-based score scaled to a TSS-like range. */
export function activityLoad(a: Activity, hr: HrProfile) {
  if (a.tss && a.tss > 0) return a.tss;
  const min = (a.movingS || a.durationS) / 60;
  if (a.avgHr && a.avgHr > hr.rest) {
    const hrr = Math.min(1, (a.avgHr - hr.rest) / (hr.max - hr.rest));
    return min * hrr * 0.64 * Math.exp(1.92 * hrr) * 0.6;
  }
  const factor: Record<Sport, number> = { run: 1, ride: 0.75, swim: 0.85, walk: 0.3, hike: 0.6, strength: 0.55, other: 0.5 };
  return min * factor[a.sport];
}

/* ---------- daily series & performance management (CTL/ATL/TSB) ---------- */
export interface DayLoad { date: string; load: number; distanceKm: number; durationS: number; count: number }

export function dailySeries(acts: Activity[], hr: HrProfile, from: Date, to: Date): DayLoad[] {
  const map = new Map<string, DayLoad>();
  for (let d = new Date(from); d <= to; d = addDays(d, 1)) {
    const k = ymd(d);
    map.set(k, { date: k, load: 0, distanceKm: 0, durationS: 0, count: 0 });
  }
  acts.forEach((a) => {
    const row = map.get(dayOf(a));
    if (!row) return;
    row.load += activityLoad(a, hr);
    row.distanceKm += a.distanceKm;
    row.durationS += a.durationS;
    row.count += 1;
  });
  return [...map.values()];
}

export interface PmcPoint { date: string; ctl: number; atl: number; tsb: number; load: number }
export function pmc(acts: Activity[], hr: HrProfile): PmcPoint[] {
  if (!acts.length) return [];
  const first = parseDay(acts[0].start);
  const series = dailySeries(acts, hr, first, today());
  let ctl = 0, atl = 0;
  const kc = 1 - Math.exp(-1 / 42), ka = 1 - Math.exp(-1 / 7);
  return series.map((d) => {
    const tsb = ctl - atl; // form = yesterday's fitness − fatigue
    ctl += (d.load - ctl) * kc;
    atl += (d.load - atl) * ka;
    return { date: d.date, ctl: +ctl.toFixed(1), atl: +atl.toFixed(1), tsb: +tsb.toFixed(1), load: Math.round(d.load) };
  });
}

/* ---------- weekly volume by sport ---------- */
export type WeekRow = { week: string; label: string; total: number } & Partial<Record<Sport, number>>;
export function weekly(acts: Activity[], weeks: number, metric: "distance" | "time" | "load", hr: HrProfile, u: Settings["units"]): WeekRow[] {
  const end = startOfWeek(today());
  const rows: WeekRow[] = [];
  const idx = new Map<string, WeekRow>();
  for (let i = weeks - 1; i >= 0; i--) {
    const w = addDays(end, -7 * i);
    const row: WeekRow = { week: ymd(w), label: w.toLocaleDateString("en-GB", { day: "numeric", month: "short" }), total: 0 };
    rows.push(row); idx.set(row.week, row);
  }
  acts.forEach((a) => {
    const row = idx.get(ymd(startOfWeek(parseDay(a.start))));
    if (!row) return;
    const v = metric === "distance" ? dist(a.distanceKm, u) : metric === "time" ? a.durationS / 3600 : activityLoad(a, hr);
    row[a.sport] = (row[a.sport] ?? 0) + v;
    row.total += v;
  });
  rows.forEach((r) => {
    SPORTS.forEach((s) => { if (r[s] !== undefined) r[s] = +r[s]!.toFixed(1); });
    r.total = +r.total.toFixed(1);
  });
  return rows;
}

/* ---------- sport breakdown ---------- */
export function bySport(acts: Activity[]) {
  const m = new Map<Sport, { sport: Sport; count: number; durationS: number; distanceKm: number; calories: number }>();
  acts.forEach((a) => {
    const r = m.get(a.sport) ?? { sport: a.sport, count: 0, durationS: 0, distanceKm: 0, calories: 0 };
    r.count++; r.durationS += a.durationS; r.distanceKm += a.distanceKm; r.calories += a.calories ?? 0;
    m.set(a.sport, r);
  });
  return SPORTS.map((s) => m.get(s)).filter(Boolean) as NonNullable<ReturnType<typeof m.get>>[];
}

/* ---------- HR zones (approximated from avg HR, % of max) ---------- */
export const ZONES = [
  { name: "Z1 Warm-up", lo: 0, hi: 0.6 },
  { name: "Z2 Easy", lo: 0.6, hi: 0.7 },
  { name: "Z3 Aerobic", lo: 0.7, hi: 0.8 },
  { name: "Z4 Threshold", lo: 0.8, hi: 0.9 },
  { name: "Z5 Maximum", lo: 0.9, hi: 9 },
];
export function zoneTime(acts: Activity[], hr: HrProfile) {
  const out = ZONES.map((z) => ({ zone: z.name, seconds: 0, pct: 0 }));
  acts.forEach((a) => {
    if (!a.avgHr) return;
    const r = a.avgHr / hr.max;
    const i = ZONES.findIndex((z) => r >= z.lo && r < z.hi);
    if (i >= 0) out[i].seconds += a.durationS;
  });
  const tot = out.reduce((s, z) => s + z.seconds, 0) || 1;
  out.forEach((z) => (z.pct = Math.round((z.seconds / tot) * 100)));
  return out;
}

/* ---------- punchcard: weekday × hour ---------- */
export function punchcard(acts: Activity[]) {
  const grid = Array.from({ length: 7 }, () => Array(24).fill(0) as number[]);
  acts.forEach((a) => {
    const d = new Date(a.start);
    if (isNaN(d.getTime())) return;
    grid[(d.getDay() + 6) % 7][d.getHours()]++;
  });
  return grid;
}

/* ---------- streaks ---------- */
export function streaks(acts: Activity[]) {
  const days = new Set(acts.map(dayOf));
  let longest = 0, run = 0, prev: Date | null = null;
  [...days].sort().forEach((k) => {
    const d = parseDay(k);
    run = prev && Math.round((d.getTime() - prev.getTime()) / 864e5) === 1 ? run + 1 : 1;
    longest = Math.max(longest, run);
    prev = d;
  });
  let current = 0;
  let d = today();
  if (!days.has(ymd(d))) d = addDays(d, -1);
  while (days.has(ymd(d))) { current++; d = addDays(d, -1); }
  return { current, longest, activeDays: days.size };
}

/* ---------- personal records ---------- */
export interface Record_ { label: string; value: string; sub: string; activity?: Activity }
export function records(acts: Activity[], u: Settings["units"]): Record_[] {
  const runs = acts.filter((a) => a.sport === "run" && a.distanceKm > 0);
  const rides = acts.filter((a) => a.sport === "ride" && a.distanceKm > 0);
  const out: Record_[] = [];
  const best = <T,>(arr: T[], f: (x: T) => number) => arr.reduce<T | undefined>((b, x) => (b === undefined || f(x) > f(b) ? x : b), undefined);
  const sub = (a: Activity) => `${a.title} · ${fmtDate(a.start)}`;

  const lr = best(runs, (a) => a.distanceKm);
  if (lr) out.push({ label: "Longest run", value: fmtDist(lr.distanceKm, u), sub: sub(lr), activity: lr });
  const bands: [string, number, number][] = [["Fastest 5K-ish", 4.9, 7], ["Fastest 10K-ish", 9.8, 13], ["Fastest half-ish", 20.9, 25]];
  bands.forEach(([label, lo, hi]) => {
    const f = best(runs.filter((a) => a.distanceKm >= lo && a.distanceKm < hi), (a) => -pacePerKm(a));
    if (f) out.push({ label: `${label} pace`, value: fmtPace(pacePerKm(f), u), sub: sub(f), activity: f });
  });
  const rd = best(rides, (a) => a.distanceKm);
  if (rd) out.push({ label: "Longest ride", value: fmtDist(rd.distanceKm, u), sub: sub(rd), activity: rd });
  const climb = best(acts.filter((a) => a.ascentM), (a) => a.ascentM!);
  if (climb) out.push({ label: "Biggest climb", value: `${fmtInt(u === "mi" ? climb.ascentM! * 3.281 : climb.ascentM!)} ${u === "mi" ? "ft" : "m"}`, sub: sub(climb), activity: climb });
  const longest = best(acts, (a) => a.durationS);
  if (longest) out.push({ label: "Longest session", value: fmtDur(longest.durationS, true), sub: sub(longest), activity: longest });
  const cal = best(acts.filter((a) => a.calories), (a) => a.calories!);
  if (cal) out.push({ label: "Most calories", value: `${fmtInt(cal.calories!)} kcal`, sub: sub(cal), activity: cal });
  const te = best(acts.filter((a) => a.aerobicTE), (a) => a.aerobicTE!);
  if (te) out.push({ label: "Highest aerobic TE", value: te.aerobicTE!.toFixed(1), sub: sub(te), activity: te });

  // biggest week
  const weeks = new Map<string, number>();
  acts.forEach((a) => { const k = ymd(startOfWeek(parseDay(a.start))); weeks.set(k, (weeks.get(k) ?? 0) + a.distanceKm); });
  const bw = [...weeks.entries()].sort((a, b) => b[1] - a[1])[0];
  if (bw) out.push({ label: "Biggest week", value: fmtDist(bw[1], u), sub: `Week of ${fmtDate(bw[0])}` });
  return out;
}

/* ---------- year-over-year cumulative ---------- */
export function yearRace(acts: Activity[], sport: Sport | "all", u: Settings["units"]) {
  const years = [...new Set(acts.map((a) => a.start.slice(0, 4)))].sort().slice(-4);
  const perYear = new Map<string, number[]>();
  years.forEach((y) => perYear.set(y, Array(366).fill(0)));
  acts.forEach((a) => {
    if (sport !== "all" && a.sport !== sport) return;
    const y = a.start.slice(0, 4);
    const arr = perYear.get(y);
    if (!arr) return;
    const d = parseDay(a.start);
    const doy = Math.floor((d.getTime() - new Date(d.getFullYear(), 0, 1).getTime()) / 864e5);
    arr[doy] += dist(a.distanceKm, u);
  });
  const t = today();
  const curYear = String(t.getFullYear());
  const todayDoy = Math.floor((t.getTime() - new Date(t.getFullYear(), 0, 1).getTime()) / 864e5);
  const rows: Record<string, number | string | null>[] = [];
  const acc: Record<string, number> = {};
  for (let i = 0; i < 366; i += 1) {
    const row: Record<string, number | string | null> = { doy: i, label: new Date(2024, 0, i + 1).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) };
    years.forEach((y) => {
      acc[y] = (acc[y] ?? 0) + perYear.get(y)![i];
      row[y] = y === curYear && i > todayDoy ? null : +acc[y].toFixed(1);
    });
    rows.push(row);
  }
  return { years, rows: rows.filter((_, i) => i % 3 === 0 || i === todayDoy), todayDoy };
}

/* ---------- readiness (estimate) ---------- */
export function readiness(p: PmcPoint | undefined, daily: DailyWellness[]) {
  const recent = daily.slice(-1)[0];
  const base = daily.slice(-35, -7);
  const avg = (xs: (number | undefined)[]) => { const v = xs.filter((x): x is number => x !== undefined); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : undefined; };
  const hrvBase = avg(base.map((d) => d.hrv));
  const hrv7 = avg(daily.slice(-7).map((d) => d.hrv));
  const rhrBase = avg(base.map((d) => d.restingHr));
  const parts: { label: string; value: string; effect: number }[] = [];
  let score = 60;
  if (p) { const e = Math.max(-25, Math.min(15, p.tsb * 0.9)); score += e; parts.push({ label: "Form (TSB)", value: p.tsb.toFixed(0), effect: e }); }
  if (hrvBase && hrv7) { const pct = ((hrv7 - hrvBase) / hrvBase) * 100; const e = Math.max(-15, Math.min(12, pct)); score += e; parts.push({ label: "HRV vs baseline", value: `${pct >= 0 ? "+" : ""}${pct.toFixed(0)}%`, effect: e }); }
  if (recent?.sleepScore) { const e = (recent.sleepScore - 75) * 0.5; score += e; parts.push({ label: "Last sleep score", value: String(recent.sleepScore), effect: e }); }
  if (rhrBase && recent?.restingHr) { const diff = recent.restingHr - rhrBase; const e = Math.max(-10, Math.min(5, -diff * 2)); score += e; parts.push({ label: "Resting HR vs baseline", value: `${diff >= 0 ? "+" : ""}${diff.toFixed(0)} bpm`, effect: e }); }
  score = Math.round(Math.max(1, Math.min(100, score)));
  const level = score >= 75 ? "Prime" : score >= 55 ? "Ready" : score >= 35 ? "Moderate" : "Low";
  return { score, level, parts };
}

export function formLabel(tsb: number) {
  if (tsb > 15) return "Fresh – detraining risk";
  if (tsb > 5) return "Fresh – race ready";
  if (tsb > -10) return "Neutral";
  if (tsb > -30) return "Optimal – building";
  return "High risk – overreaching";
}

export function avg(xs: (number | undefined)[]) {
  const v = xs.filter((x): x is number => typeof x === "number" && isFinite(x));
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : undefined;
}

export function rolling<T>(arr: T[], f: (x: T) => number | undefined, n: number) {
  return arr.map((_, i) => avg(arr.slice(Math.max(0, i - n + 1), i + 1).map(f)));
}
