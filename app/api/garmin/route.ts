/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Garmin Connect Personal API sync (official, read-only).
 * Env: GARMIN_API_KEY (personal API key from connect.garmin.com/app/settings/personalApiToken)
 *      SYNC_SECRET    (password the dashboard's Sync button must send)
 */
import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { toSport } from "@/lib/csv";
import type { Activity, DailyWellness } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BASE = "https://personal.connectapi.garmin.com";
const TOKEN_PATH = "/personalapitoken-service/personal-api/personal-api-key/token";

const configured = () => !!(process.env.GARMIN_API_KEY && process.env.SYNC_SECRET);

function safeEq(a: string, b: string) {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

const p2 = (n: number) => String(n).padStart(2, "0");
const ymd = (d: Date) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };

/* ---------- auth (bearer tokens last 24h; cache per warm instance) ---------- */
let cached: { token: string; exp: number } | null = null;
async function bearer(): Promise<string> {
  if (cached && cached.exp - Date.now() > 3600_000) return cached.token;
  const r = await fetch(BASE + TOKEN_PATH, {
    method: "POST",
    headers: { Accept: "*/*", Authorization: `ApiKey ${process.env.GARMIN_API_KEY}` },
    cache: "no-store",
  });
  if (!r.ok) throw new Error(`token request failed (${r.status}): ${(await r.text()).slice(0, 160)}`);
  const token = (await r.text()).trim();
  let exp = Date.now() + 23 * 3600_000;
  try { exp = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString()).exp * 1000 || exp; } catch { /* opaque token */ }
  cached = { token, exp };
  return token;
}

async function gget(path: string, params?: Record<string, string | number | undefined>): Promise<any> {
  const url = new URL(BASE + path);
  Object.entries(params ?? {}).forEach(([k, v]) => v !== undefined && url.searchParams.set(k, String(v)));
  const r = await fetch(url, { headers: { Authorization: `Bearer ${await bearer()}`, Accept: "application/json" }, cache: "no-store" });
  if (r.status === 204) return null;
  if (!r.ok) throw new Error(`${path} → ${r.status}`);
  const t = await r.text();
  return t ? JSON.parse(t) : null;
}

/** Split [from,to] into windows of at most `max` days. */
function windows(from: Date, to: Date, max: number) {
  const out: [string, string][] = [];
  for (let a = new Date(from); a <= to; a = addDays(a, max)) {
    const b = addDays(a, max - 1);
    out.push([ymd(a), ymd(b > to ? to : b)]);
  }
  return out;
}

const arr = (x: any): any[] => (Array.isArray(x) ? x : Array.isArray(x?.data) ? x.data : Array.isArray(x?.hrvSummaries) ? x.hrvSummaries
  : Array.isArray(x?.dailySleepSummaries) ? x.dailySleepSummaries : Array.isArray(x?.values) ? x.values : []);
const n = (...vals: any[]) => { for (const v of vals) if (typeof v === "number" && isFinite(v)) return v; return undefined; };

function mapActivity(a: any): Activity {
  const typeKey: string = a.activityType?.typeKey ?? "other";
  return {
    id: `gc-${a.activityId}`,
    sport: toSport(typeKey.replace(/_/g, " ")),
    rawType: typeKey.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase()),
    title: a.activityName || typeKey,
    start: String(a.startTimeLocal).replace(" ", "T").slice(0, 19),
    distanceKm: (a.distance ?? 0) / 1000,
    durationS: Math.round(a.duration ?? a.elapsedDuration ?? 0),
    movingS: a.movingDuration ? Math.round(a.movingDuration) : undefined,
    calories: a.calories ? Math.round(a.calories) : undefined,
    avgHr: a.averageHR ? Math.round(a.averageHR) : undefined,
    maxHr: a.maxHR ? Math.round(a.maxHR) : undefined,
    ascentM: a.elevationGain ? Math.round(a.elevationGain) : undefined,
    aerobicTE: a.aerobicTrainingEffect ?? undefined,
    cadence: n(a.averageRunningCadenceInStepsPerMinute) ? Math.round(a.averageRunningCadenceInStepsPerMinute) : undefined,
    avgPower: a.avgPower ? Math.round(a.avgPower) : undefined,
    tss: a.trainingStressScore ?? undefined,
    steps: a.steps ?? undefined,
  };
}

export async function GET() {
  return NextResponse.json({ configured: configured(), mode: "personal-api" });
}

export async function POST(req: Request) {
  if (!configured()) return NextResponse.json({ error: "Garmin sync is not configured on this deployment." }, { status: 501 });
  const secret = req.headers.get("x-sync-secret") ?? "";
  if (!safeEq(secret, process.env.SYNC_SECRET!)) return NextResponse.json({ error: "Wrong sync password." }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const days = Math.min(365, Math.max(7, Number(body.days) || 90));
  const limit = Math.min(3000, Math.max(20, Number(body.limit) || 1000));
  const warnings: string[] = [];

  try { await bearer(); } catch (e) {
    return NextResponse.json({ error: `Garmin rejected the API key: ${(e as Error).message}. It may have expired — create a new one at connect.garmin.com/app/settings/personalApiToken.` }, { status: 502 });
  }

  // ---- activities (paged) ----
  const raw: any[] = [];
  try {
    for (let start = 0; start < limit; start += 100) {
      const page = arr(await gget("/activitylist-service/activities/search/activities", { start, limit: 100 }));
      raw.push(...page);
      if (page.length < 100) break;
    }
  } catch (e) { warnings.push(`activities: ${(e as Error).message}`); }
  const activities = raw.map(mapActivity).sort((a, b) => a.start.localeCompare(b.start));

  // ---- daily wellness ----
  const to = new Date(), from = addDays(to, -(days - 1));
  const daily = new Map<string, DailyWellness>();
  const row = (date: string) => { let r = daily.get(date); if (!r) { r = { date }; daily.set(date, r); } return r; };
  const safe = async (label: string, f: () => Promise<void>) => { try { await f(); } catch (e) { warnings.push(`${label}: ${(e as Error).message}`); } };

  await Promise.all([
    // v2 daily summaries: steps, resting HR, stress, body battery (≤ 1 year per call; use 28-day windows to be safe)
    safe("daily summaries", async () => {
      for (const [a, b] of windows(from, to, 28)) {
        for (const d of arr(await gget("/usersummary-service/v2/dailysummaries", { startDate: a, endDate: b }))) {
          if (!d?.calendarDate) continue;
          const r = row(d.calendarDate);
          r.steps = n(d.movement?.steps?.value, d.movement?.steps?.count, d.movement?.steps?.total, d.totalSteps, r.steps);
          r.restingHr = n(d.heartRate?.restingValue, d.restingHeartRate, r.restingHr);
          r.stress = n(d.stress?.avgLevel, d.stress?.averageLevel, d.stress?.overallLevel, d.averageStressLevel, r.stress);
          r.bodyBattery = n(d.bodyBattery?.highestValue, d.bodyBattery?.maxValue, d.bodyBattery?.highest, d.bodyBatteryHighestValue, r.bodyBattery);
        }
      }
    }),
    // sleep (≤ 31 days per call)
    safe("sleep", async () => {
      for (const [a, b] of windows(from, to, 31)) {
        for (const s of arr(await gget("/sleep-service/sleep/dailySleepSummariesByDate", { startDate: a, endDate: b }))) {
          const dto = s?.dailySleepDTO ?? s;
          const date = dto?.calendarDate;
          if (!date) continue;
          const r = row(date);
          r.sleepS = n(dto.sleepTimeSeconds, dto.sleepTimeInSeconds, dto.totalSleepSeconds, r.sleepS);
          r.sleepScore = n(dto.sleepScores?.overall?.value, dto.sleepScore, dto.overallSleepScore?.value, dto.overallSleepScore, r.sleepScore);
          r.restingHr = n(r.restingHr, s.restingHeartRate);
          r.hrv = n(r.hrv, s.avgOvernightHrv);
        }
      }
    }),
    // HRV (28-day windows)
    safe("hrv", async () => {
      for (const [a, b] of windows(from, to, 28)) {
        for (const h of arr(await gget(`/hrv-service/hrv/daily/${a}/${b}`))) {
          if (h?.calendarDate) row(h.calendarDate).hrv = n(h.lastNightAvg, h.weeklyAvg);
        }
      }
    }),
    // Body battery reports (fallback for the daily peak)
    safe("body battery", async () => {
      for (const [a, b] of windows(from, to, 28)) {
        for (const d of arr(await gget("/wellness-service/wellness/bodyBattery/reports/daily", { startDate: a, endDate: b }))) {
          const date = d?.date ?? d?.calendarDate;
          const vals: any[] = d?.bodyBatteryValuesArray ?? [];
          if (date && vals.length) { const r = row(date); r.bodyBattery = n(r.bodyBattery, Math.max(...vals.map((v) => (Array.isArray(v) ? v[1] : 0) ?? 0))); }
        }
      }
    }),
  ]);

  // Steps (stats endpoint, ≤ 28 days per call) — authoritative daily totals
  {
    await safe("steps", async () => {
      for (const [a, b] of windows(from, to, 28)) {
        for (const s of arr(await gget(`/usersummary-service/stats/steps/daily/${a}/${b}`))) {
          if (s?.calendarDate) { const v = n(s.totalSteps, s.values?.totalSteps); if (v !== undefined) row(s.calendarDate).steps = v; }
        }
      }
    });
  }

  const dailyOut = [...daily.values()]
    .filter((d) => Object.keys(d).length > 1)
    .sort((a, b) => a.date.localeCompare(b.date));
  return NextResponse.json({ activities, daily: dailyOut, warnings });
}
