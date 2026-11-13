import type { Activity, DailyWellness, DataSet, Sport } from "./types";

function rng(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const p2 = (n: number) => String(n).padStart(2, "0");
const ymd = (d: Date) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;

const TITLES: Record<Sport, string[]> = {
  run: ["Morning Run", "Easy Run", "Tempo Run", "Intervals 6×800", "Long Run", "Recovery Jog", "Trail Run", "Tiergarten Loop"],
  ride: ["Road Ride", "Gravel Ride", "Zwift – Watopia", "Coffee Ride", "Hill Repeats"],
  swim: ["Pool Swim", "Open Water Swim", "Swim Drills"],
  walk: ["Walk", "Evening Walk", "City Walk"],
  hike: ["Mountain Hike", "Forest Hike", "Ridge Hike"],
  strength: ["Strength", "Core & Mobility", "Gym – Legs", "Gym – Upper Body"],
  other: ["Yoga", "Bouldering", "Rowing"],
};

/** Two years of believable training + wellness data, seeded so it's stable across reloads. */
export function makeDemo(): DataSet {
  const r = rng(42);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = 730;
  const activities: Activity[] = [];
  const daily: DailyWellness[] = [];
  let fitness = 0.55; // grows over time

  for (let i = days; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dow = d.getDay();
    const season = 0.5 + 0.5 * Math.sin(((d.getMonth() - 2) / 12) * Math.PI * 2); // summer peak
    fitness = Math.min(1.1, fitness + 0.0006);
    const block = Math.floor(i / 7) % 4 === 0 ? 0.6 : 1; // recovery week every 4th
    const plan: Sport[] = [];
    if ([1, 3, 5].includes(dow) && r() < 0.85 * block) plan.push("run");
    if (dow === 0 && r() < 0.9) plan.push("run"); // long run
    if ([2, 6].includes(dow) && r() < (0.35 + 0.5 * season) * block) plan.push("ride");
    if (dow === 4 && r() < 0.6) plan.push("swim");
    if ([2, 4].includes(dow) && r() < 0.55) plan.push("strength");
    if (dow === 6 && r() < 0.18 * (0.5 + season)) plan.push("hike");
    if (r() < 0.22) plan.push("walk");
    if (r() < 0.03) plan.push("other");

    plan.forEach((sport, k) => {
      const hour = sport === "run" && dow !== 0 ? (r() < 0.6 ? 6 + Math.floor(r() * 2) : 18 + Math.floor(r() * 2))
        : sport === "strength" ? 17 + Math.floor(r() * 3)
        : 8 + Math.floor(r() * 9);
      const start = `${ymd(d)}T${p2(hour)}:${p2(Math.floor(r() * 60))}:${p2(Math.floor(r() * 60))}`;
      const titles = TITLES[sport];
      let title = titles[Math.floor(r() * titles.length)];
      let distanceKm = 0, durationS = 0, avgHr = 0, ascentM = 0, cadence: number | undefined, avgPower: number | undefined;
      if (sport === "run") {
        const long = dow === 0;
        if (long) title = "Long Run";
        distanceKm = long ? 14 + r() * 10 * fitness : 5 + r() * 6;
        const pace = (long ? 345 : 315) - fitness * 40 + (r() - 0.5) * 30; // s/km
        durationS = distanceKm * pace;
        avgHr = Math.round(long ? 148 + r() * 8 : 140 + r() * 22);
        ascentM = Math.round(distanceKm * (4 + r() * 10));
        cadence = Math.round(166 + fitness * 10 + r() * 6);
      } else if (sport === "ride") {
        distanceKm = 25 + r() * 70 * (0.5 + season);
        const speed = 24 + fitness * 5 + (r() - 0.5) * 4;
        durationS = (distanceKm / speed) * 3600;
        avgHr = Math.round(128 + r() * 18);
        ascentM = Math.round(distanceKm * (5 + r() * 12));
        avgPower = Math.round(160 + fitness * 50 + r() * 30);
      } else if (sport === "swim") {
        distanceKm = 1.5 + r() * 1.5;
        durationS = distanceKm * 10 * (115 - fitness * 10 + r() * 10);
        avgHr = Math.round(130 + r() * 15);
      } else if (sport === "walk") {
        distanceKm = 2 + r() * 5;
        durationS = distanceKm * (640 + r() * 80);
        avgHr = Math.round(95 + r() * 15);
      } else if (sport === "hike") {
        distanceKm = 9 + r() * 12;
        durationS = distanceKm * (700 + r() * 200);
        avgHr = Math.round(115 + r() * 20);
        ascentM = Math.round(400 + r() * 1100);
      } else if (sport === "strength") {
        durationS = 2400 + r() * 2400;
        avgHr = Math.round(105 + r() * 20);
      } else {
        durationS = 1800 + r() * 3600;
        avgHr = Math.round(100 + r() * 25);
      }
      const intensity = (avgHr - 55) / (190 - 55);
      activities.push({
        id: `demo-${start}-${k}`,
        sport,
        rawType: sport === "ride" ? "Cycling" : sport === "run" ? "Running" : sport[0].toUpperCase() + sport.slice(1),
        title,
        start,
        distanceKm: Math.round(distanceKm * 100) / 100,
        durationS: Math.round(durationS),
        movingS: Math.round(durationS * 0.97),
        calories: Math.round((durationS / 60) * (5 + intensity * 9)),
        avgHr,
        maxHr: Math.round(avgHr + 12 + r() * 18),
        ascentM: ascentM || undefined,
        aerobicTE: Math.round(Math.min(5, 1.5 + intensity * 3.5 + (durationS / 3600) * 0.6) * 10) / 10,
        cadence,
        avgPower,
        steps: sport === "run" || sport === "walk" || sport === "hike" ? Math.round((durationS / 60) * (cadence ?? 110)) : undefined,
      });
    });

    const load = plan.length;
    const rhr = Math.round(58 - fitness * 9 + (load > 1 ? 1 : 0) + (r() - 0.5) * 3);
    const hrv = Math.round(48 + fitness * 18 - (load > 1 ? 4 : 0) + (r() - 0.5) * 10);
    const sleepS = Math.round((6.6 + r() * 1.6 + (dow === 0 || dow === 6 ? 0.5 : 0)) * 3600);
    daily.push({
      date: ymd(d),
      steps: Math.round(6500 + r() * 6000 + (plan.includes("run") ? 7000 : 0) + (plan.includes("hike") ? 15000 : 0)),
      restingHr: rhr,
      hrv,
      sleepS,
      sleepScore: Math.round(Math.min(98, 55 + (sleepS / 3600 - 6) * 12 + r() * 14)),
      bodyBattery: Math.round(Math.min(100, 55 + (sleepS / 3600 - 6) * 15 + (hrv - 55) * 0.6 + r() * 12)),
      stress: Math.round(22 + r() * 20 + (dow >= 1 && dow <= 5 ? 6 : 0)),
    });
  }
  return { source: "demo", updatedAt: new Date().toISOString(), activities, daily };
}
