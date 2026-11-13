/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { toSport } from "@/lib/csv";
import type { Activity, DailyWellness } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const configured = () => !!(process.env.GARMIN_EMAIL && process.env.GARMIN_PASSWORD && process.env.SYNC_SECRET);

export async function GET() {
  return NextResponse.json({ configured: configured() });
}

function safeEq(a: string, b: string) {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

const p2 = (n: number) => String(n).padStart(2, "0");
const ymd = (d: Date) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;

function mapActivity(a: any): Activity {
  const typeKey: string = a.activityType?.typeKey ?? "other";
  return {
    id: `gc-${a.activityId}`,
    sport: toSport(typeKey.replace(/_/g, " ")),
    rawType: typeKey.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase()),
    title: a.activityName || typeKey,
    start: String(a.startTimeLocal).replace(" ", "T").slice(0, 19),
    distanceKm: (a.distance ?? 0) / 1000,
    durationS: Math.round(a.duration ?? 0),
    movingS: a.movingDuration ? Math.round(a.movingDuration) : undefined,
    calories: a.calories ? Math.round(a.calories) : undefined,
    avgHr: a.averageHR ? Math.round(a.averageHR) : undefined,
    maxHr: a.maxHR ? Math.round(a.maxHR) : undefined,
    ascentM: a.elevationGain ? Math.round(a.elevationGain) : undefined,
    aerobicTE: a.aerobicTrainingEffect ?? undefined,
    cadence: a.averageRunningCadenceInStepsPerMinute ? Math.round(a.averageRunningCadenceInStepsPerMinute) : undefined,
    avgPower: a.avgPower ? Math.round(a.avgPower) : undefined,
    tss: a.trainingStressScore ?? undefined,
    steps: a.steps ?? undefined,
  };
}

async function pool<T, R>(items: T[], n: number, fn: (x: T) => Promise<R>) {
  const out: R[] = [];
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => {
    while (i < items.length) { const idx = i++; out[idx] = await fn(items[idx]); }
  }));
  return out;
}

export async function POST(req: Request) {
  if (!configured()) return NextResponse.json({ error: "Garmin sync is not configured on this deployment." }, { status: 501 });
  const secret = req.headers.get("x-sync-secret") ?? "";
  if (!safeEq(secret, process.env.SYNC_SECRET!)) return NextResponse.json({ error: "Wrong sync password." }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const days = Math.min(90, Math.max(1, Number(body.days) || 30));
  const limit = Math.min(1000, Math.max(10, Number(body.limit) || 400));

  let gc: any;
  try {
    const { GarminConnect } = await import("garmin-connect");
    gc = new GarminConnect({ username: process.env.GARMIN_EMAIL!, password: process.env.GARMIN_PASSWORD! });
    await gc.login();
  } catch (e) {
    return NextResponse.json({ error: `Garmin login failed: ${(e as Error).message}. Check credentials; 2-step verification isn't supported.` }, { status: 502 });
  }

  try {
    // Activities (paged)
    const raw: any[] = [];
    for (let start = 0; start < limit; start += 100) {
      const page = await gc.getActivities(start, Math.min(100, limit - start));
      raw.push(...page);
      if (page.length < 100) break;
    }
    const activities = raw.map(mapActivity).sort((a, b) => a.start.localeCompare(b.start));

    // Daily wellness: sleep endpoint carries sleep, HRV, RHR, body battery & stress
    const dates: Date[] = [];
    for (let i = days - 1; i >= 0; i--) { const d = new Date(); d.setDate(d.getDate() - i); dates.push(d); }
    const daily: DailyWellness[] = await pool(dates, 4, async (d) => {
      const row: DailyWellness = { date: ymd(d) };
      try {
        const s: any = await gc.getSleepData(d);
        const dto = s?.dailySleepDTO ?? {};
        row.sleepS = dto.sleepTimeSeconds ?? undefined;
        row.sleepScore = dto.sleepScores?.overall?.value ?? undefined;
        row.hrv = s?.avgOvernightHrv ? Math.round(s.avgOvernightHrv) : undefined;
        row.restingHr = s?.restingHeartRate ?? undefined;
        row.stress = dto.avgSleepStress ? Math.round(dto.avgSleepStress) : undefined;
        const bb: any[] = s?.sleepBodyBattery ?? [];
        if (bb.length) row.bodyBattery = Math.max(...bb.map((x) => x.value ?? 0));
      } catch { /* day without sleep data */ }
      return row;
    });

    // Steps for the whole window in one call
    try {
      const url = `${gc.url.GC_API}/usersummary-service/stats/steps/daily/${ymd(dates[0])}/${ymd(dates[dates.length - 1])}`;
      const steps: any[] = await gc.get(url);
      const map = new Map(daily.map((d) => [d.date, d]));
      steps?.forEach((s) => { const r = map.get(s.calendarDate); if (r) r.steps = s.totalSteps; });
    } catch { /* steps optional */ }

    return NextResponse.json({ activities, daily });
  } catch (e) {
    return NextResponse.json({ error: `Garmin request failed: ${(e as Error).message}` }, { status: 502 });
  }
}
