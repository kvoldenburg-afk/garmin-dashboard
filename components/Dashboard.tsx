"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Activity, DailyWellness, DataSet, Settings, Sport } from "@/lib/types";
import { SPORT_COLOR, SPORT_LABEL, SPORTS } from "@/lib/types";
import { makeDemo } from "@/lib/demo";
import { parseGarminCsv } from "@/lib/csv";
import {
  activityLoad, addDays, avg, bySport, dayOf, fmtDate, fmtDist, fmtDur, fmtHours, fmtInt, fmtPace, fmtSpeed,
  formLabel, hrProfile, pacePerKm, parseDay, pmc, punchcard, readiness, records, startOfWeek, streaks, today,
  weekly, yearRace, ymd, zoneTime, ZONES, dist,
} from "@/lib/metrics";
import { C, HBars, Heatmap, Legend, PaceTrend, PmcChart, Punchcard, Ring, WeeklyBars, WellnessBars, WellnessLine, YearRace } from "./charts";
import {
  IconAlert, IconCheck, IconDown, IconDownload, IconFlame, IconHeart, IconHome, IconList, IconSettings, IconSync,
  IconTrend, IconTrophy, IconUp, IconUpload, IconX, SportIcon,
} from "./icons";

type Tab = "overview" | "training" | "activities" | "health" | "records";
type Range = "30d" | "90d" | "6m" | "1y" | "all";
const RANGE_DAYS: Record<Range, number> = { "30d": 30, "90d": 90, "6m": 182, "1y": 365, all: 99999 };
const RANGE_LABEL: Record<Range, string> = { "30d": "30D", "90d": "90D", "6m": "6M", "1y": "1Y", all: "All" };
const ZONE_COLORS = ["#5e5d58", "#3987e5", "#199e70", "#c98500", "#d95926"]; // ordinal, labelled

const LS_DATA = "pulse.data.v1";
const LS_SETTINGS = "pulse.settings.v1";
const LS_SECRET = "pulse.syncSecret";
const DEFAULT_SETTINGS: Settings = { units: "km", yearlyGoalKm: 2000, goalSport: "all" };

function mergeSync(data: DataSet, j: { activities: Activity[]; daily: DailyWellness[] }): DataSet {
  const key = (a: Activity) => `${a.start.slice(0, 16)}|${a.sport}`;
  const fresh = new Set(j.activities.map(key));
  const base = data.source === "demo" ? [] : data.activities.filter((a) => !fresh.has(key(a)));
  const activities = [...base, ...j.activities].sort((x, y) => x.start.localeCompare(y.start));
  const dmap = new Map((data.source === "demo" ? [] : data.daily).map((d) => [d.date, d]));
  j.daily.forEach((d) => dmap.set(d.date, { ...dmap.get(d.date), ...d }));
  // zero readings are "no data" (days before the watch was worn), not real values
  const clean = (d: DailyWellness) => {
    const o: DailyWellness = { date: d.date };
    (Object.keys(d) as (keyof DailyWellness)[]).forEach((k) => { const v = d[k]; if (k !== "date" && typeof v === "number" && v > 0) (o as any)[k] = v; });
    return o;
  };
  const daily = [...dmap.values()].map(clean).filter((d) => Object.keys(d).length > 1).sort((x, y) => x.date.localeCompare(y.date));
  return { source: "garmin", updatedAt: new Date().toISOString(), activities, daily };
}

async function runSync(secret: string, days: number) {
  const r = await fetch("/api/garmin", { method: "POST", headers: { "content-type": "application/json", "x-sync-secret": secret }, body: JSON.stringify({ days }) });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error || `Sync failed (${r.status})`);
  return j as { activities: Activity[]; daily: DailyWellness[]; warnings?: string[] };
}

function load<T>(k: string): T | undefined {
  try { const v = localStorage.getItem(k); return v ? (JSON.parse(v) as T) : undefined; } catch { return undefined; }
}
function save(k: string, v: unknown) {
  try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* quota or private mode */ }
}

export default function Dashboard() {
  const [data, setData] = useState<DataSet | null>(null);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [tab, setTab] = useState<Tab>("overview");
  const [range, setRange] = useState<Range>("90d");
  const [sport, setSport] = useState<Sport | "all">("all");
  const [dataOpen, setDataOpen] = useState(false);
  const [selected, setSelected] = useState<Activity | null>(null);
  const [autoSync, setAutoSync] = useState<"idle" | "running" | "done" | "error">("idle");
  const [apiReady, setApiReady] = useState(false);
  const [bannerPw, setBannerPw] = useState("");
  const [bannerErr, setBannerErr] = useState<string | null>(null);
  useEffect(() => { fetch("/api/garmin").then((r) => r.json()).then((j) => setApiReady(!!j.configured)).catch(() => {}); }, []);

  useEffect(() => {
    const d = load<DataSet>(LS_DATA);
    setData(d && d.activities?.length ? d : makeDemo());
    setSettings({ ...DEFAULT_SETTINGS, ...(load<Settings>(LS_SETTINGS) ?? {}) });
    const t = (typeof window !== "undefined" && (window.location.hash.slice(1) as Tab)) || "overview";
    if (["overview", "training", "activities", "health", "records"].includes(t)) setTab(t);
  }, []);
  useEffect(() => { if (data && data.source !== "demo") save(LS_DATA, data); }, [data]);
  // Background refresh: once a sync password is saved, pull new Garmin data whenever the app opens (max every 30 min).
  useEffect(() => {
    if (!data || autoSync !== "idle") return;
    const secret = (() => { try { return localStorage.getItem(LS_SECRET); } catch { return null; } })();
    if (!secret || (data.source === "garmin" && Date.now() - new Date(data.updatedAt).getTime() < 30 * 60_000)) return;
    setAutoSync("running");
    runSync(secret, data.source === "garmin" ? 14 : 180)
      .then((j) => { setData((d) => (d ? mergeSync(d, j) : d)); setAutoSync("done"); })
      .catch(() => setAutoSync("error"));
  }, [data, autoSync]);
  useEffect(() => { save(LS_SETTINGS, settings); }, [settings]);
  const go = (t: Tab) => { setTab(t); history.replaceState(null, "", `#${t}`); window.scrollTo({ top: 0 }); };

  if (!data) return <div className="shell"><div className="empty" style={{ paddingTop: 120 }}>Loading…</div></div>;

  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M3 13h4l2-5 3 9 2-6 1 2h6" /></svg></div>
          <div>Pulse<small>Garmin training dashboard</small></div>
        </div>
        <nav className="tabs" role="tablist">
          {NAV.map((n) => (
            <button key={n.id} className="tab" role="tab" aria-selected={tab === n.id} onClick={() => go(n.id)}>{n.icon}{n.label}</button>
          ))}
        </nav>
        <div className="top-actions">
          {autoSync === "running" && <span className="source-pill"><IconSync size={13} />Syncing…</span>}
          <span className="source-pill hide-sm"><i className="dot" style={{ background: data.source === "demo" ? "#c98500" : "#0ca30c" }} />
            {data.source === "demo" ? "Demo data" : data.source === "csv" ? "CSV import" : "Garmin sync"} · {fmtInt(data.activities.length)} activities</span>
          <button className="btn primary" onClick={() => setDataOpen(true)}><IconUpload size={16} /><span className="hide-sm">Data & settings</span></button>
        </div>
      </header>

      {data.source === "demo" && (apiReady ? (
        <form className="banner" onSubmit={async (e) => {
          e.preventDefault();
          setBannerErr(null); setAutoSync("running");
          try {
            const j = await runSync(bannerPw, 365);
            try { localStorage.setItem(LS_SECRET, bannerPw); } catch { /* private mode */ }
            setData((d) => (d ? mergeSync(d, j) : d)); setAutoSync("done");
          } catch (err) { setBannerErr((err as Error).message); setAutoSync("error"); }
        }}>
          <span><b>Your Garmin account is connected.</b> Enter your sync password once on this device to load your data — you&apos;re seeing demo data until then.</span>
          <span style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <input className="search" style={{ minWidth: 180 }} type="password" placeholder="Sync password" value={bannerPw} onChange={(e) => setBannerPw(e.target.value)} autoComplete="current-password" />
            <button className="btn primary" disabled={!bannerPw || autoSync === "running"}><IconSync size={16} />{autoSync === "running" ? "Syncing…" : "Load my data"}</button>
          </span>
          {bannerErr && <span style={{ width: "100%", color: "#ff8c8c", fontSize: 13 }}>{bannerErr}</span>}
        </form>
      ) : (
        <div className="banner">
          <span>You&apos;re viewing <b>demo data</b>. Import your Garmin Connect CSV or connect a live sync to see your own training.</span>
          <button className="btn primary" onClick={() => setDataOpen(true)}><IconUpload size={16} />Import my data</button>
        </div>
      ))}

      {tab !== "records" && (
        <div className="filters">
          <div className="seg" role="group" aria-label="Date range">
            {(Object.keys(RANGE_DAYS) as Range[]).map((r) => <button key={r} aria-pressed={range === r} onClick={() => setRange(r)}>{RANGE_LABEL[r]}</button>)}
          </div>
          {tab !== "health" && (
            <div className="seg" role="group" aria-label="Sport">
              <button aria-pressed={sport === "all"} onClick={() => setSport("all")}>All sports</button>
              {SPORTS.filter((s) => data.activities.some((a) => a.sport === s)).map((s) => (
                <button key={s} aria-pressed={sport === s} onClick={() => setSport(s)}><i className="dot" style={{ background: SPORT_COLOR[s] }} />{SPORT_LABEL[s]}</button>
              ))}
            </div>
          )}
        </div>
      )}

      <Views tab={tab} data={data} settings={settings} range={range} sport={sport} onSelect={setSelected} go={go} openData={() => setDataOpen(true)} />

      <nav className="bottomnav" role="tablist">
        {NAV.map((n) => <button key={n.id} role="tab" aria-selected={tab === n.id} onClick={() => go(n.id)}>{n.icon}{n.short}</button>)}
      </nav>

      {dataOpen && <DataModal data={data} setData={setData} settings={settings} setSettings={setSettings} onClose={() => setDataOpen(false)} />}
      {selected && <ActivityModal a={selected} settings={settings} hr={hrProfile(data.activities, data.daily, settings)} onClose={() => setSelected(null)} />}
    </div>
  );
}

const NAV: { id: Tab; label: string; short: string; icon: React.ReactNode }[] = [
  { id: "overview", label: "Overview", short: "Today", icon: <IconHome size={18} /> },
  { id: "training", label: "Training", short: "Training", icon: <IconTrend size={18} /> },
  { id: "activities", label: "Activities", short: "Activities", icon: <IconList size={18} /> },
  { id: "health", label: "Health", short: "Health", icon: <IconHeart size={18} /> },
  { id: "records", label: "Records", short: "Records", icon: <IconTrophy size={18} /> },
];

/* =================================================================== */

interface ViewProps {
  tab: Tab; data: DataSet; settings: Settings; range: Range; sport: Sport | "all";
  onSelect: (a: Activity) => void; go: (t: Tab) => void; openData: () => void;
}

function Views(p: ViewProps) {
  const { data, settings, range, sport } = p;
  const hr = useMemo(() => hrProfile(data.activities, data.daily, settings), [data, settings]);
  const from = useMemo(() => addDays(today(), -RANGE_DAYS[range] + 1), [range]);
  const fromKey = ymd(from);
  const sportActs = useMemo(() => (sport === "all" ? data.activities : data.activities.filter((a) => a.sport === sport)), [data, sport]);
  const inRange = useMemo(() => sportActs.filter((a) => dayOf(a) >= fromKey), [sportActs, fromKey]);
  const pmcAll = useMemo(() => pmc(sportActs, hr), [sportActs, hr]);
  const pmcRange = useMemo(() => pmcAll.filter((d) => d.date >= fromKey), [pmcAll, fromKey]);
  const dailyRange = useMemo(() => data.daily.filter((d) => d.date >= fromKey), [data.daily, fromKey]);
  const ctx = { ...p, hr, inRange, sportActs, pmcAll, pmcRange, dailyRange };
  switch (p.tab) {
    case "overview": return <Overview {...ctx} />;
    case "training": return <Training {...ctx} />;
    case "activities": return <Activities {...ctx} />;
    case "health": return <Health {...ctx} />;
    case "records": return <Records {...ctx} />;
  }
}
type Ctx = ViewProps & {
  hr: ReturnType<typeof hrProfile>; inRange: Activity[]; sportActs: Activity[];
  pmcAll: ReturnType<typeof pmc>; pmcRange: ReturnType<typeof pmc>; dailyRange: DailyWellness[];
};

function Delta({ cur, prev, fmt }: { cur: number; prev: number; fmt: (v: number) => string }) {
  if (!prev && !cur) return <div className="delta muted">No activity</div>;
  const d = cur - prev;
  const up = d >= 0;
  return (
    <div className="delta">
      {up ? <IconUp size={13} /> : <IconDown size={13} />}
      <span>{up ? "+" : "−"}{fmt(Math.abs(d))}</span><span className="muted">vs last week</span>
    </div>
  );
}

/* ----------------------------- Overview ----------------------------- */
function Overview({ data, settings, hr, sportActs, pmcAll, onSelect, go, inRange }: Ctx) {
  const u = settings.units;
  const [metric, setMetric] = useState<"distance" | "time" | "load">("distance");
  const [weeks, setWeeks] = useState(16);
  const wk = startOfWeek(today()), lastWk = addDays(wk, -7);
  const sum = (from: Date, to: Date) => {
    const a = sportActs.filter((x) => { const d = parseDay(x.start); return d >= from && d < to; });
    return { n: a.length, km: a.reduce((s, x) => s + x.distanceKm, 0), s: a.reduce((s, x) => s + x.durationS, 0), load: a.reduce((s, x) => s + activityLoad(x, hr), 0) };
  };
  const now = sum(wk, addDays(wk, 7));
  // compare against the same number of days into last week
  const dayIdx = Math.round((today().getTime() - wk.getTime()) / 864e5) + 1;
  const prev = sum(lastWk, addDays(lastWk, dayIdx));
  const last = pmcAll[pmcAll.length - 1];
  const ready = data.daily.length ? readiness(last, data.daily) : null;
  const st = streaks(sportActs);

  // yearly goal
  const year = today().getFullYear();
  const goalActs = data.activities.filter((a) => a.start.startsWith(String(year)) && (settings.goalSport === "all" || a.sport === settings.goalSport));
  const ytd = goalActs.reduce((s, a) => s + a.distanceKm, 0);
  const doy = (today().getTime() - new Date(year, 0, 1).getTime()) / 864e5 + 1;
  const expected = (settings.yearlyGoalKm * doy) / 365;
  const projected = (ytd / doy) * 365;
  const recent = [...sportActs].slice(-6).reverse();
  const readyColor = !ready ? C.fitness : ready.score >= 75 ? "#0ca30c" : ready.score >= 55 ? C.fitness : ready.score >= 35 ? "#fab219" : "#d03b3b";

  return (
    <div className="grid">
      <section className="card span-5">
        <div className="card-head"><h2>{ready ? "Training readiness" : "Form"}</h2><span className="hint">{ready ? "Estimate · form, HRV, sleep, RHR" : "Fitness − fatigue"}</span></div>
        {ready ? (
          <div className="hero">
            <Ring value={ready.score} color={readyColor}>
              <div><div className="big num">{ready.score}</div><div className="lvl">{ready.level}</div></div>
            </Ring>
            <div className="factors">
              {ready.parts.map((f) => (
                <div className="factor" key={f.label}>
                  <span className="secondary">{f.label}</span>
                  <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                    <b>{f.value}</b>
                    {f.effect >= 0 ? <IconUp size={13} /> : <IconDown size={13} />}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="empty" style={{ padding: 12 }}>
            <div style={{ fontSize: 40, fontWeight: 700 }} className="num">{last ? last.tsb.toFixed(0) : "–"}</div>
            <div className="secondary">{last ? formLabel(last.tsb) : "No data"}</div>
            <p>Readiness needs daily HRV & sleep — available with Garmin sync.</p>
          </div>
        )}
      </section>

      <section className="card span-7">
        <div className="card-head"><h2>This week</h2><span className="hint">{wk.toLocaleDateString("en-GB", { day: "numeric", month: "short" })} – today</span></div>
        <div className="kpis">
          <div className="kpi"><div className="label">Distance</div><div className="value">{dist(now.km, u).toFixed(1)}<small>{u}</small></div><Delta cur={dist(now.km, u)} prev={dist(prev.km, u)} fmt={(v) => `${v.toFixed(1)} ${u}`} /></div>
          <div className="kpi"><div className="label">Time</div><div className="value">{fmtDur(now.s, true)}</div><Delta cur={now.s} prev={prev.s} fmt={(v) => fmtDur(v, true)} /></div>
          <div className="kpi"><div className="label">Activities</div><div className="value">{now.n}</div><Delta cur={now.n} prev={prev.n} fmt={(v) => String(v)} /></div>
          <div className="kpi"><div className="label"><IconFlame size={13} />Streak</div><div className="value">{st.current}<small>days</small></div><div className="delta muted">Longest {st.longest} days</div></div>
        </div>
        <div className="section" style={{ marginTop: 14, paddingTop: 14 }}>
          <div className="form-strip">
            <div className="kpi"><div className="label"><i className="ln" style={{ width: 12, height: 2, background: C.fitness, display: "inline-block", borderRadius: 2 }} />Fitness</div><div className="value">{last?.ctl.toFixed(0) ?? "–"}</div></div>
            <div className="kpi"><div className="label"><i className="ln" style={{ width: 12, height: 2, background: C.fatigue, display: "inline-block", borderRadius: 2 }} />Fatigue</div><div className="value">{last?.atl.toFixed(0) ?? "–"}</div></div>
            <div className="kpi"><div className="label">Form</div><div className="value">{last?.tsb.toFixed(0) ?? "–"}</div><div className="delta muted" style={{ fontSize: 11 }}>{last ? formLabel(last.tsb) : ""}</div></div>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 8, gap: 8, flexWrap: "wrap" }}>
            <span><b>{year} goal</b> <span className="muted">· {settings.goalSport === "all" ? "all sports" : SPORT_LABEL[settings.goalSport]}</span></span>
            <span className="num"><b>{fmtDist(ytd, u, 0)}</b> <span className="muted">of {fmtDist(settings.yearlyGoalKm, u, 0)} · on pace for {fmtDist(projected, u, 0)}</span></span>
          </div>
          <div className="progress" title={`Expected by today: ${fmtDist(expected, u, 0)}`}>
            <span style={{ width: `${Math.min(100, (ytd / settings.yearlyGoalKm) * 100)}%`, background: ytd >= expected ? "#0ca30c" : C.fitness }} />
            <i className="pace-mark" style={{ left: `${Math.min(100, (expected / settings.yearlyGoalKm) * 100)}%` }} />
          </div>
          <div className="note" style={{ marginTop: 6 }}>{ytd >= expected ? "Ahead of schedule" : `${fmtDist(expected - ytd, u, 0)} behind schedule`} · marker shows where you should be today</div>
        </div>
      </section>

      <section className="card span-12">
        <div className="card-head"><h2>Last 12 months</h2><span className="hint">{fmtInt(streaks(sportActs.filter((a) => dayOf(a) >= ymd(addDays(today(), -365)))).activeDays)} active days</span></div>
        <Heatmap acts={sportActs} units={u} />
      </section>

      <section className="card span-8">
        <div className="card-head">
          <h2>Weekly volume</h2>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <div className="seg">{(["distance", "time", "load"] as const).map((m) => <button key={m} aria-pressed={metric === m} onClick={() => setMetric(m)}>{m === "distance" ? "Distance" : m === "time" ? "Time" : "Load"}</button>)}</div>
            <div className="seg">{[8, 16, 52].map((w) => <button key={w} aria-pressed={weeks === w} onClick={() => setWeeks(w)}>{w}w</button>)}</div>
          </div>
        </div>
        <WeeklyBars data={weekly(sportActs, weeks, metric, hr, u)} metric={metric} units={u} />
      </section>

      <section className="card span-4">
        <div className="card-head"><h2>Recent activities</h2><button className="btn ghost" style={{ padding: "4px 8px", fontSize: 12 }} onClick={() => go("activities")}>See all</button></div>
        <div className="act-list">{recent.map((a) => <ActRow key={a.id} a={a} u={u} onClick={() => onSelect(a)} compact />)}</div>
        {!recent.length && <div className="empty"><p>No activities yet.</p></div>}
      </section>

      <section className="card span-12">
        <div className="card-head"><h2>Selected range at a glance</h2><span className="hint">{inRange.length} activities</span></div>
        <div className="kpis">
          <div className="kpi"><div className="label">Distance</div><div className="value">{fmtInt(dist(inRange.reduce((s, a) => s + a.distanceKm, 0), u))}<small>{u}</small></div></div>
          <div className="kpi"><div className="label">Moving time</div><div className="value">{fmtHours(inRange.reduce((s, a) => s + a.durationS, 0))}</div></div>
          <div className="kpi"><div className="label">Elevation</div><div className="value">{fmtInt(inRange.reduce((s, a) => s + (a.ascentM ?? 0), 0) * (u === "mi" ? 3.281 : 1))}<small>{u === "mi" ? "ft" : "m"}</small></div></div>
          <div className="kpi"><div className="label">Calories</div><div className="value">{fmtInt(inRange.reduce((s, a) => s + (a.calories ?? 0), 0))}<small>kcal</small></div></div>
        </div>
      </section>
    </div>
  );
}

/* ----------------------------- Training ----------------------------- */
function Training({ settings, hr, inRange, sportActs, pmcRange, data }: Ctx) {
  const u = settings.units;
  const zones = zoneTime(inRange, hr);
  const sports = bySport(inRange);
  const [raceSport, setRaceSport] = useState<Sport | "all">(settings.goalSport);
  const race = useMemo(() => yearRace(data.activities, raceSport, u), [data.activities, raceSport, u]);
  const last = pmcRange[pmcRange.length - 1];
  const runs = inRange.filter((a) => a.sport === "run");
  return (
    <div className="grid">
      <section className="card span-12">
        <div className="card-head">
          <div><h2>Fitness, fatigue & form</h2><div className="hint" style={{ marginTop: 4 }}>42-day fitness vs 7-day fatigue from {inRange.some((a) => a.tss) ? "TSS" : "heart-rate TRIMP"} · max HR {hr.max}{hr.estimated ? " (est.)" : ""}, rest {hr.rest}</div></div>
          {last && <span className="source-pill">Form {last.tsb.toFixed(0)} · {formLabel(last.tsb)}</span>}
        </div>
        <PmcChart data={pmcRange} />
        <Legend items={[{ label: "Fitness (CTL)", color: C.fitness, kind: "line" }, { label: "Fatigue (ATL)", color: C.fatigue, kind: "line" }, { label: "Form (TSB)", color: "rgba(141,140,134,.5)" }]} />
      </section>

      <section className="card span-7">
        <div className="card-head"><h2>Running pace trend</h2><span className="hint">{runs.length} runs</span></div>
        <PaceTrend runs={runs} units={u} />
      </section>

      <section className="card span-5">
        <div className="card-head"><h2>Intensity distribution</h2><span className="hint">Time by avg-HR zone (approx.)</span></div>
        <HBars rows={zones.map((z, i) => ({ label: z.zone, value: z.seconds, color: ZONE_COLORS[i], sub: `${z.pct}%` }))} fmt={(v) => fmtHours(v)} />
        <div className="note" style={{ marginTop: 12 }}>
          Zones as % of max HR ({ZONES.slice(1).map((z) => `${Math.round(z.lo * 100)}`).join(" / ")}%).
          {zones[0].pct + zones[1].pct >= 70 ? " Mostly easy — polarised-style base." : " Consider more easy volume (aim ~80% in Z1–Z2)."}
        </div>
      </section>

      <section className="card span-7">
        <div className="card-head">
          <h2>Year vs year</h2>
          <div className="seg">
            <button aria-pressed={raceSport === "all"} onClick={() => setRaceSport("all")}>All</button>
            {(["run", "ride", "swim"] as Sport[]).filter((s) => data.activities.some((a) => a.sport === s)).map((s) => <button key={s} aria-pressed={raceSport === s} onClick={() => setRaceSport(s)}>{SPORT_LABEL[s]}</button>)}
          </div>
        </div>
        <YearRace data={race} units={u} goal={raceSport === settings.goalSport ? settings.yearlyGoalKm : undefined} />
      </section>

      <section className="card span-5">
        <div className="card-head"><h2>Sport mix</h2><span className="hint">Time in range</span></div>
        <HBars rows={sports.sort((a, b) => b.durationS - a.durationS).map((s) => ({
          label: SPORT_LABEL[s.sport], value: s.durationS, color: SPORT_COLOR[s.sport],
          sub: `${s.count}× ${s.distanceKm ? "· " + fmtDist(s.distanceKm, u, 0) : ""}`, icon: <SportIcon sport={s.sport} size={15} />,
        }))} fmt={(v) => fmtHours(v)} />
      </section>

      <section className="card span-12">
        <div className="card-head"><h2>Training clock</h2><span className="hint">Activities by weekday & start hour</span></div>
        <Punchcard grid={punchcard(inRange)} />
      </section>
    </div>
  );
}

/* ----------------------------- Activities ----------------------------- */
function ActRow({ a, u, onClick, compact }: { a: Activity; u: Settings["units"]; onClick: () => void; compact?: boolean }) {
  const pace = a.sport === "run" || a.sport === "walk" || a.sport === "hike" ? fmtPace(pacePerKm(a), u) : a.sport === "ride" ? fmtSpeed(a.distanceKm, a.movingS || a.durationS, u) : a.sport === "swim" && a.distanceKm ? `${fmtPace(pacePerKm(a) / 10, u === "mi" ? "km" : "km", false)} /100m` : "";
  return (
    <button className="act" onClick={onClick}>
      <div className="act-icon" style={{ background: `${SPORT_COLOR[a.sport]}26`, color: SPORT_COLOR[a.sport] }}><SportIcon sport={a.sport} size={20} /></div>
      <div style={{ minWidth: 0 }}>
        <div className="act-title">{a.title}</div>
        <div className="act-sub">{fmtDate(a.start, { weekday: "short", day: "numeric", month: "short" })} · {a.start.slice(11, 16)}</div>
      </div>
      <div className="act-stats">
        {a.distanceKm > 0 && <div>{fmtDist(a.distanceKm, u)}<small>distance</small></div>}
        <div className={compact && a.distanceKm > 0 ? "hide-xs" : ""}>{fmtDur(a.durationS, true)}<small>time</small></div>
        {!compact && pace && <div className="hide-xs">{pace}<small>{a.sport === "ride" ? "speed" : "pace"}</small></div>}
        {!compact && a.avgHr && <div className="hide-sm">{a.avgHr}<small>avg HR</small></div>}
      </div>
    </button>
  );
}

type SortKey = "start" | "distanceKm" | "durationS" | "avgHr" | "calories" | "ascentM" | "load";
function Activities({ inRange, settings, onSelect, hr }: Ctx) {
  const u = settings.units;
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<{ k: SortKey; dir: 1 | -1 }>({ k: "start", dir: -1 });
  const [limit, setLimit] = useState(60);
  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    const f = s ? inRange.filter((a) => `${a.title} ${a.rawType} ${a.start}`.toLowerCase().includes(s)) : inRange;
    const val = (a: Activity) => (sort.k === "load" ? activityLoad(a, hr) : sort.k === "start" ? a.start : (a[sort.k] ?? -1));
    return [...f].sort((a, b) => (val(a) > val(b) ? sort.dir : val(a) < val(b) ? -sort.dir : 0));
  }, [inRange, q, sort, hr]);
  const th = (k: SortKey, label: string, right = false) => (
    <th className={right ? "r" : ""} onClick={() => setSort((s) => ({ k, dir: s.k === k ? (s.dir === 1 ? -1 : 1) : -1 }))}>
      {label}{sort.k === k ? (sort.dir === -1 ? " ↓" : " ↑") : ""}
    </th>
  );
  return (
    <div className="grid">
      <section className="card span-12">
        <div className="card-head">
          <h2>Activities <span className="muted" style={{ fontWeight: 400 }}>· {rows.length}</span></h2>
          <input className="search" placeholder="Search title, type or date…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="hide-sm scroll-x" style={{ maxHeight: "70vh", overflowY: "auto" }}>
          <table className="tbl">
            <thead><tr>{th("start", "Date")}<th>Activity</th>{th("distanceKm", "Distance", true)}{th("durationS", "Time", true)}<th className="r">Pace / speed</th>{th("avgHr", "Avg HR", true)}{th("ascentM", "Ascent", true)}{th("calories", "Calories", true)}{th("load", "Load", true)}</tr></thead>
            <tbody>
              {rows.slice(0, limit).map((a) => (
                <tr key={a.id} onClick={() => onSelect(a)}>
                  <td className="muted">{fmtDate(a.start, { day: "2-digit", month: "short", year: "2-digit" })}</td>
                  <td><span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}><span style={{ color: SPORT_COLOR[a.sport] }}><SportIcon sport={a.sport} size={15} /></span>{a.title}</span></td>
                  <td className="r">{a.distanceKm ? fmtDist(a.distanceKm, u) : "–"}</td>
                  <td className="r">{fmtDur(a.durationS)}</td>
                  <td className="r">{a.distanceKm ? (a.sport === "ride" ? fmtSpeed(a.distanceKm, a.movingS || a.durationS, u) : fmtPace(pacePerKm(a), u)) : "–"}</td>
                  <td className="r">{a.avgHr ?? "–"}</td>
                  <td className="r">{a.ascentM ? `${fmtInt(u === "mi" ? a.ascentM * 3.281 : a.ascentM)}` : "–"}</td>
                  <td className="r">{a.calories ? fmtInt(a.calories) : "–"}</td>
                  <td className="r">{Math.round(activityLoad(a, hr))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="act-list" style={{ display: "none" }} data-mobile-list>
          {rows.slice(0, limit).map((a) => <ActRow key={a.id} a={a} u={u} onClick={() => onSelect(a)} />)}
        </div>
        <style>{`@media (max-width: 760px){ [data-mobile-list]{ display:grid !important; } }`}</style>
        {rows.length > limit && <div style={{ textAlign: "center", marginTop: 14 }}><button className="btn" onClick={() => setLimit((l) => l + 100)}>Show more</button></div>}
        {!rows.length && <div className="empty"><p>No activities match.</p></div>}
      </section>
    </div>
  );
}

/* ----------------------------- Health ----------------------------- */
function Health({ dailyRange, openData, data }: Ctx) {
  if (!data.daily.length) {
    return (
      <div className="card empty">
        <IconHeart size={32} />
        <h3>No daily health data yet</h3>
        <p>Garmin&apos;s activity CSV doesn&apos;t include sleep, HRV, resting HR or steps. Sync with the Garmin Personal API to fill this page.</p>
        <button className="btn primary" onClick={openData}><IconSync size={16} />Set up Garmin sync</button>
      </div>
    );
  }
  const a = (k: keyof DailyWellness) => avg(dailyRange.map((d) => d[k] as number | undefined));
  const sleepH = a("sleepS");
  return (
    <div className="grid">
      <section className="card span-12">
        <div className="card-head"><h2>Averages in range</h2><span className="hint">{dailyRange.length} days</span></div>
        <div className="kpis">
          <div className="kpi"><div className="label">Resting HR</div><div className="value">{a("restingHr")?.toFixed(0) ?? "–"}<small>bpm</small></div></div>
          <div className="kpi"><div className="label">Overnight HRV</div><div className="value">{a("hrv")?.toFixed(0) ?? "–"}<small>ms</small></div></div>
          <div className="kpi"><div className="label">Sleep</div><div className="value">{sleepH ? fmtDur(sleepH, true) : "–"}</div><div className="delta muted">Score {a("sleepScore")?.toFixed(0) ?? "–"}</div></div>
          <div className="kpi"><div className="label">Steps / day</div><div className="value">{a("steps") ? fmtInt(a("steps")!) : "–"}</div></div>
        </div>
      </section>
      <section className="card span-6"><div className="card-head"><h2>Resting heart rate</h2><span className="hint">bpm · 7-day avg bold</span></div><WellnessLine data={dailyRange} field="restingHr" color="#d55181" unit="bpm" /></section>
      <section className="card span-6"><div className="card-head"><h2>Overnight HRV</h2><span className="hint">ms · 7-day avg bold</span></div><WellnessLine data={dailyRange} field="hrv" color="#199e70" unit="ms" /></section>
      <section className="card span-6"><div className="card-head"><h2>Sleep duration</h2><span className="hint">hours · dashed = 8h</span></div><WellnessBars data={dailyRange} field="sleepS" color="#9085e9" unit="h" transform={(v) => v / 3600} goal={8} digits={1} /></section>
      <section className="card span-6"><div className="card-head"><h2>Sleep score</h2><span className="hint">0–100</span></div><WellnessLine data={dailyRange} field="sleepScore" cap={100} color="#9085e9" unit="" /></section>
      <section className="card span-6"><div className="card-head"><h2>Steps</h2><span className="hint">dashed = 10,000 goal</span></div><WellnessBars data={dailyRange} field="steps" color="#3987e5" unit="steps" goal={10000} /></section>
      <section className="card span-6"><div className="card-head"><h2>Body Battery (peak)</h2><span className="hint">0–100</span></div><WellnessLine data={dailyRange} field="bodyBattery" cap={100} color="#c98500" unit="" /></section>
      <section className="card span-12"><div className="card-head"><h2>Stress</h2><span className="hint">avg daily stress · lower is calmer</span></div><WellnessLine data={dailyRange} field="stress" cap={100} color="#d95926" unit="" height={180} /></section>
    </div>
  );
}

/* ----------------------------- Records ----------------------------- */
function Records({ data, settings, onSelect }: Ctx) {
  const u = settings.units;
  const [sport, setSport] = useState<Sport | "all">("all");
  const acts = sport === "all" ? data.activities : data.activities.filter((a) => a.sport === sport);
  const recs = records(acts, u);
  const st = streaks(data.activities);
  const totals = bySport(data.activities);
  const first = data.activities[0];
  return (
    <div className="grid" style={{ marginTop: 16 }}>
      <section className="card span-12">
        <div className="card-head">
          <h2>Personal records</h2>
          <div className="seg">
            <button aria-pressed={sport === "all"} onClick={() => setSport("all")}>All</button>
            {SPORTS.filter((s) => data.activities.some((a) => a.sport === s)).map((s) => <button key={s} aria-pressed={sport === s} onClick={() => setSport(s)}>{SPORT_LABEL[s]}</button>)}
          </div>
        </div>
        <div className="rec-grid">
          {recs.map((r) => (
            <div key={r.label} className={`rec ${r.activity ? "click" : ""}`} onClick={() => r.activity && onSelect(r.activity)}>
              <div className="label">{r.label}</div><div className="value">{r.value}</div><div className="sub">{r.sub}</div>
            </div>
          ))}
        </div>
        <div className="note" style={{ marginTop: 10 }}>Fastest-pace records use whole-activity average pace within each distance band.</div>
      </section>
      <section className="card span-4">
        <div className="card-head"><h2>Consistency</h2></div>
        <div className="stat-grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
          <div className="kpi"><div className="label">Current streak</div><div className="value">{st.current}<small>d</small></div></div>
          <div className="kpi"><div className="label">Longest streak</div><div className="value">{st.longest}<small>d</small></div></div>
          <div className="kpi"><div className="label">Active days</div><div className="value">{fmtInt(st.activeDays)}</div></div>
          <div className="kpi"><div className="label">Since</div><div className="value" style={{ fontSize: 18 }}>{first ? fmtDate(first.start, { month: "short", year: "numeric" }) : "–"}</div></div>
        </div>
      </section>
      <section className="card span-8">
        <div className="card-head"><h2>All-time totals</h2><span className="hint">{fmtInt(data.activities.length)} activities</span></div>
        <div className="scroll-x">
          <table className="tbl">
            <thead><tr><th>Sport</th><th className="r">Count</th><th className="r">Distance</th><th className="r">Time</th><th className="r">Calories</th></tr></thead>
            <tbody>
              {totals.map((t) => (
                <tr key={t.sport} style={{ cursor: "default" }}>
                  <td><span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}><i className="dot" style={{ background: SPORT_COLOR[t.sport] }} />{SPORT_LABEL[t.sport]}</span></td>
                  <td className="r">{fmtInt(t.count)}</td><td className="r">{t.distanceKm ? fmtDist(t.distanceKm, u, 0) : "–"}</td>
                  <td className="r">{fmtHours(t.durationS)}</td><td className="r">{fmtInt(t.calories)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

/* ----------------------------- Activity detail ----------------------------- */
function ActivityModal({ a, settings, hr, onClose }: { a: Activity; settings: Settings; hr: ReturnType<typeof hrProfile>; onClose: () => void }) {
  const u = settings.units;
  useEsc(onClose);
  const stats: [string, string][] = [
    ["Distance", a.distanceKm ? fmtDist(a.distanceKm, u, 2) : "–"],
    ["Time", fmtDur(a.durationS)],
    [a.sport === "ride" ? "Avg speed" : "Avg pace", a.distanceKm ? (a.sport === "ride" ? fmtSpeed(a.distanceKm, a.movingS || a.durationS, u) : fmtPace(pacePerKm(a), u)) : "–"],
    ["Avg HR", a.avgHr ? `${a.avgHr} bpm` : "–"],
    ["Max HR", a.maxHr ? `${a.maxHr} bpm` : "–"],
    ["Training load", String(Math.round(activityLoad(a, hr)))],
    ["Ascent", a.ascentM ? `${fmtInt(u === "mi" ? a.ascentM * 3.281 : a.ascentM)} ${u === "mi" ? "ft" : "m"}` : "–"],
    ["Calories", a.calories ? `${fmtInt(a.calories)} kcal` : "–"],
    ["Aerobic TE", a.aerobicTE ? a.aerobicTE.toFixed(1) : "–"],
  ];
  if (a.cadence) stats.push(["Cadence", `${a.cadence} spm`]);
  if (a.avgPower) stats.push(["Avg power", `${a.avgPower} W`]);
  if (a.steps) stats.push(["Steps", fmtInt(a.steps)]);
  const hrPct = a.avgHr ? a.avgHr / hr.max : 0;
  const zi = ZONES.findIndex((z) => hrPct >= z.lo && hrPct < z.hi);
  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="modal-head">
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <div className="act-icon" style={{ background: `${SPORT_COLOR[a.sport]}26`, color: SPORT_COLOR[a.sport] }}><SportIcon sport={a.sport} size={22} /></div>
            <div><h3>{a.title}</h3><div className="muted" style={{ fontSize: 13 }}>{a.rawType} · {fmtDate(a.start, { weekday: "long", day: "numeric", month: "long", year: "numeric" })} · {a.start.slice(11, 16)}</div></div>
          </div>
          <button className="btn icon-btn ghost" onClick={onClose} aria-label="Close"><IconX /></button>
        </div>
        <div className="stat-grid">{stats.map(([k, v]) => <div className="kpi" key={k}><div className="label">{k}</div><div className="value">{v}</div></div>)}</div>
        {a.avgHr ? (
          <div className="section">
            <h4>Intensity</h4>
            <div style={{ display: "flex", gap: 4 }}>
              {ZONES.map((z, i) => <div key={z.name} style={{ flex: 1, height: 8, borderRadius: 4, background: i === zi ? ZONE_COLORS[i] : "var(--surface-3)" }} title={z.name} />)}
            </div>
            <div className="note" style={{ marginTop: 6 }}>Average HR at {Math.round(hrPct * 100)}% of max → <b>{ZONES[zi]?.name}</b></div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function useEsc(fn: () => void) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === "Escape" && fn();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [fn]);
}

/* ----------------------------- Data & settings ----------------------------- */
function DataModal({ data, setData, settings, setSettings, onClose }: {
  data: DataSet; setData: (d: DataSet) => void; settings: Settings; setSettings: (s: Settings) => void; onClose: () => void;
}) {
  useEsc(onClose);
  const [csvUnit, setCsvUnit] = useState<"km" | "mi">(settings.units);
  const [mode, setMode] = useState<"replace" | "merge">("replace");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [over, setOver] = useState(false);
  const [api, setApi] = useState<{ configured: boolean } | null>(null);
  const [secret, setSecret] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [days, setDays] = useState(180);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setSecret(localStorage.getItem(LS_SECRET) ?? "");
    fetch("/api/garmin").then((r) => r.json()).then(setApi).catch(() => setApi({ configured: false }));
  }, []);

  const handleFile = useCallback(async (file: File) => {
    setMsg(null);
    try {
      const text = await file.text();
      if (file.name.endsWith(".json")) {
        const d = JSON.parse(text) as DataSet;
        if (!Array.isArray(d.activities)) throw new Error("Not a Pulse backup file.");
        setData({ ...d, updatedAt: new Date().toISOString() });
        setMsg({ ok: true, text: `Restored backup: ${d.activities.length} activities, ${d.daily?.length ?? 0} health days.` });
        return;
      }
      const res = parseGarminCsv(text, csvUnit);
      if (!res.activities.length) throw new Error("No activities found in that file.");
      let activities = res.activities;
      let daily: DailyWellness[] = [];
      if (mode === "merge" && data.source !== "demo") {
        const key = (a: Activity) => `${a.start.slice(0, 16)}|${a.sport}`;
        const seen = new Set(data.activities.map(key));
        activities = [...data.activities, ...res.activities.filter((a) => !seen.has(key(a)))].sort((x, y) => x.start.localeCompare(y.start));
        daily = data.daily;
      }
      setData({ source: data.source === "garmin" && mode === "merge" ? "garmin" : "csv", updatedAt: new Date().toISOString(), activities, daily });
      setMsg({ ok: true, text: `Imported ${res.activities.length} activities (${fmtDate(res.activities[0].start)} – ${fmtDate(res.activities[res.activities.length - 1].start)})${res.skipped ? `, skipped ${res.skipped} rows` : ""}.` });
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    }
  }, [csvUnit, mode, data, setData]);

  const sync = async () => {
    setSyncing(true); setMsg(null);
    try {
      localStorage.setItem(LS_SECRET, secret);
      const j = await runSync(secret, days);
      setData(mergeSync(data, j));
      setMsg({ ok: j.activities.length > 0 || j.daily.length > 0, text: `Synced ${j.activities.length} activities and ${j.daily.length} days of health data.${j.warnings?.length ? ` Some data was unavailable: ${j.warnings.join("; ")}` : ""}` });
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally { setSyncing(false); }
  };

  const backup = () => {
    const blob = new Blob([JSON.stringify(data)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const el = document.createElement("a");
    el.href = url; el.download = `pulse-backup-${ymd(new Date())}.json`; el.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="modal-head">
          <div><h3>Data & settings</h3><div className="muted" style={{ fontSize: 13 }}>Your data stays in this browser — nothing is uploaded except during Garmin sync.</div></div>
          <button className="btn icon-btn ghost" onClick={onClose} aria-label="Close"><IconX /></button>
        </div>

        <h4 style={{ margin: "0 0 8px", fontSize: 13, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: ".06em" }}>Import Garmin CSV</h4>
        <label className={`drop ${over ? "over" : ""}`}
          onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
          onDrop={(e) => { e.preventDefault(); setOver(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}>
          <input ref={fileRef} type="file" accept=".csv,.json,text/csv,application/json" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }} />
          <IconUpload size={26} />
          <div style={{ fontWeight: 600, marginTop: 8 }}>Drop Activities.csv here or tap to choose</div>
          <div className="note">English & German exports supported · .json backups too</div>
        </label>
        <div className="fields" style={{ marginTop: 12 }}>
          <label className="field">Distance unit in the CSV
            <select value={csvUnit} onChange={(e) => setCsvUnit(e.target.value as "km" | "mi")}><option value="km">Kilometres</option><option value="mi">Miles</option></select>
          </label>
          <label className="field">On import
            <select value={mode} onChange={(e) => setMode(e.target.value as "replace" | "merge")}><option value="replace">Replace activities</option><option value="merge">Merge (skip duplicates)</option></select>
          </label>
        </div>
        <details className="note" style={{ marginTop: 10 }}>
          <summary style={{ cursor: "pointer" }}>How to export from Garmin Connect</summary>
          <ol style={{ paddingLeft: 18, margin: "8px 0" }}>
            <li>Open <b>connect.garmin.com</b> → <b>Activities → All Activities</b>.</li>
            <li>Scroll to the bottom so every activity loads (the export only includes what&apos;s loaded).</li>
            <li>Click <b>Export CSV</b> (top right) and import the file here.</li>
          </ol>
          On your phone, save the CSV to Files / Drive and choose it from the picker above.
        </details>
        {msg && <div className={`msg ${msg.ok ? "ok" : "err"}`}>{msg.ok ? <IconCheck size={16} /> : <IconAlert size={16} />}<span>{msg.text}</span></div>}

        <div className="section">
          <h4>Live Garmin sync</h4>
          {api === null ? <div className="note">Checking…</div> : api.configured ? (
            <>
              <div className="fields">
                <label className="field">Sync password<input type="password" value={secret} onChange={(e) => setSecret(e.target.value)} placeholder="SYNC_SECRET" /></label>
                <label className="field">Health days to fetch<select value={days} onChange={(e) => setDays(+e.target.value)}>{[30, 90, 180, 365].map((d) => <option key={d} value={d}>{d === 365 ? "1 year" : `${d} days`}</option>)}</select></label>
              </div>
              <button className="btn primary" style={{ marginTop: 12, width: "100%", justifyContent: "center" }} disabled={syncing || !secret} onClick={sync}>
                <IconSync size={16} />{syncing ? "Syncing with Garmin… (up to a minute)" : "Sync now"}
              </button>
              <div className="note" style={{ marginTop: 8 }}>Uses Garmin&apos;s official Personal API: all your activities plus sleep, HRV, resting HR, Body Battery, stress and steps. After the first sync, new data is pulled automatically whenever you open the dashboard on this device.</div>
            </>
          ) : (
            <div className="note">
              Not configured yet. Create a Personal API key at connect.garmin.com → Settings → Personal API, then in Vercel → Project →
              Settings → Environment Variables add <code>GARMIN_API_KEY</code> and <code>SYNC_SECRET</code> (any password) and redeploy.
            </div>
          )}
        </div>

        <div className="section">
          <h4>Settings</h4>
          <div className="fields">
            <label className="field">Units<select value={settings.units} onChange={(e) => setSettings({ ...settings, units: e.target.value as "km" | "mi" })}><option value="km">Metric (km)</option><option value="mi">Imperial (mi)</option></select></label>
            <label className="field">Yearly goal ({settings.units})<input type="number" min={0} value={Math.round(dist(settings.yearlyGoalKm, settings.units))} onChange={(e) => setSettings({ ...settings, yearlyGoalKm: (+e.target.value || 0) * (settings.units === "mi" ? 1.609344 : 1) })} /></label>
            <label className="field">Goal sport<select value={settings.goalSport} onChange={(e) => setSettings({ ...settings, goalSport: e.target.value as Sport | "all" })}><option value="all">All sports</option>{SPORTS.map((s) => <option key={s} value={s}>{SPORT_LABEL[s]}</option>)}</select></label>
            <label className="field">Max HR (blank = auto)<input type="number" min={120} max={230} value={settings.maxHr ?? ""} onChange={(e) => setSettings({ ...settings, maxHr: e.target.value ? +e.target.value : undefined })} /></label>
            <label className="field">Resting HR (blank = auto)<input type="number" min={30} max={100} value={settings.restHr ?? ""} onChange={(e) => setSettings({ ...settings, restHr: e.target.value ? +e.target.value : undefined })} /></label>
          </div>
        </div>

        <div className="section" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="btn" onClick={backup}><IconDownload size={16} />Download backup</button>
          <button className="btn" onClick={() => { localStorage.removeItem(LS_DATA); setData(makeDemo()); setMsg({ ok: true, text: "Demo data loaded." }); }}>Load demo data</button>
          <button className="btn danger" onClick={() => { if (confirm("Remove your imported data from this browser?")) { localStorage.removeItem(LS_DATA); setData(makeDemo()); } }}>Clear my data</button>
        </div>
        <div className="note" style={{ marginTop: 10 }}>Source: {data.source} · updated {new Date(data.updatedAt).toLocaleString("en-GB")}</div>
      </div>
    </div>
  );
}
