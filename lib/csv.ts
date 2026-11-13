import Papa from "papaparse";
import type { Activity, Sport } from "./types";

/** Map a Garmin activity type string (EN/DE/FR/ES/NL-ish) to a sport bucket. */
export function toSport(raw: string): Sport {
  const t = (raw || "").toLowerCase();
  if (/swim|schwimm|natation|nataci|zwem/.test(t)) return "swim";
  if (/hik|wander|randonn|sender/.test(t)) return "hike";
  if (/walk|geh|marche|caminar|wandel/.test(t)) return "walk";
  if (/run|lauf|trail|course|carrera|hardlo|treadmill|laufband/.test(t)) return "run";
  if (/cycl|bik|ride|rad|velo|vélo|cicl|fiets|spin|gravel|mtb/.test(t)) return "ride";
  if (/strength|kraft|weight|hiit|cardio|muscu|fuerza|yoga|pilates|fitness|training/.test(t)) return "strength";
  return "other";
}

type Field =
  | "type" | "date" | "title" | "distance" | "calories" | "time" | "avgHr" | "maxHr"
  | "aerobicTE" | "cadence" | "ascent" | "power" | "tss" | "steps" | "moving";

const ALIASES: Record<Field, RegExp[]> = {
  type: [/^activity type$/, /^aktivitätstyp$/, /^type d'activité$/, /^tipo de actividad$/, /^activiteittype$/],
  date: [/^date$/, /^datum$/, /^fecha$/, /^start time$/],
  title: [/^title$/, /^titel$/, /^titre$/, /^título$/, /^name$/],
  distance: [/^distance$/, /^distanz$/, /^distancia$/, /^afstand$/],
  calories: [/^calories$/, /^kalorien$/, /^calorías$/, /^calorieën$/],
  time: [/^time$/, /^zeit$/, /^durée$/, /^tiempo$/, /^tijd$/, /^duration$/],
  avgHr: [/^avg hr$/, /herzfrequenz/i, /^fc moy/, /^fc media/, /^gem\. hartslag/],
  maxHr: [/^max hr$/, /^max\. herzfrequenz$/, /^maximale herzfrequenz$/, /^fc max/],
  aerobicTE: [/^aerobic te$/, /^aerober te$/, /aerob/],
  cadence: [/^avg run cadence$/, /schrittfrequenz/, /^avg cadence/],
  ascent: [/^total ascent$/, /^anstieg gesamt$/, /^ascent$/, /^gesamtanstieg$/, /^ascension totale$/],
  power: [/^avg power$/, /^ø leistung$/, /^durchschnittliche leistung$/],
  tss: [/training stress score/],
  steps: [/^steps$/, /^schritte$/, /^pas$/, /^pasos$/],
  moving: [/^moving time$/, /^bewegungszeit$/],
};

function norm(h: string) {
  return h.replace(/^﻿/, "").replace(/[®™]/g, "").replace(/\s+/g, " ").trim().toLowerCase();
}

function buildIndex(headers: string[]) {
  const idx: Partial<Record<Field, string>> = {};
  const normed = headers.map((h) => [h, norm(h)] as const);
  (Object.keys(ALIASES) as Field[]).forEach((f) => {
    for (const re of ALIASES[f]) {
      // avgHr: ensure we don't pick the "max" HR column
      const hit = normed.find(([, n]) => re.test(n) && !(f === "avgHr" && /max/.test(n)));
      if (hit) { idx[f] = hit[0]; break; }
    }
  });
  return idx;
}

/** Parse numbers like "1,234.5", "1.234,5", "10,52", "--". `decimalComma` decides ambiguous cases. */
export function num(v: unknown, decimalComma: boolean): number | undefined {
  if (v === null || v === undefined) return undefined;
  let s = String(v).trim();
  if (!s || s === "--" || s === "-") return undefined;
  s = s.replace(/[^\d.,\-]/g, "");
  if (!s) return undefined;
  if (decimalComma) s = s.replace(/\./g, "").replace(",", ".");
  else s = s.replace(/,/g, "");
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : undefined;
}

/** "01:02:03", "45:10", "1:02:03.4" → seconds */
export function dur(v: unknown): number | undefined {
  if (!v) return undefined;
  const s = String(v).trim();
  if (!s || s === "--") return undefined;
  const parts = s.split(":").map((p) => parseFloat(p.replace(",", ".")));
  if (parts.some((p) => !Number.isFinite(p))) return undefined;
  return parts.reduce((acc, p) => acc * 60 + p, 0);
}

function parseDate(v: string): string | undefined {
  if (!v) return undefined;
  const s = v.trim();
  // ISO-ish "2024-05-01 07:12:33"
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}T${m[4].padStart(2, "0")}:${m[5]}:${m[6] ?? "00"}`;
  // "01.05.2024 07:12" (DE)
  m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})[ ,]+(\d{1,2}):(\d{2})/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}T${m[4].padStart(2, "0")}:${m[5]}:00`;
  const d = new Date(s);
  if (!isNaN(d.getTime())) {
    const p = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:00`;
  }
  return undefined;
}

export interface ParseResult {
  activities: Activity[];
  skipped: number;
  detected: { decimalComma: boolean; unit: "km" | "mi"; columns: string[] };
}

/**
 * Parse a Garmin Connect "Activities.csv" export.
 * @param distanceUnit unit the export was written in (Garmin uses the account's unit setting)
 */
export function parseGarminCsv(text: string, distanceUnit: "km" | "mi" = "km"): ParseResult {
  const res = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: true });
  const headers = res.meta.fields ?? [];
  const idx = buildIndex(headers);
  if (!idx.date || !idx.type) {
    throw new Error(
      "This doesn't look like a Garmin Connect activities export (missing 'Activity Type' / 'Date' columns)."
    );
  }
  const german = headers.some((h) => /aktivitätstyp|datum|distanz/i.test(h));
  const decimalComma = german;
  const toKm = distanceUnit === "mi" ? 1.609344 : 1;

  const activities: Activity[] = [];
  let skipped = 0;
  res.data.forEach((row, i) => {
    const start = parseDate(row[idx.date!]);
    if (!start) { skipped++; return; }
    const rawType = row[idx.type!] ?? "";
    const sport = toSport(rawType);
    let distance = idx.distance ? num(row[idx.distance], decimalComma) ?? 0 : 0;
    // Garmin lists pool/open-water swim distances in metres (or yards)
    if (sport === "swim" && distance > 30) distance = distance / (distanceUnit === "mi" ? 1093.61 : 1000);
    else distance = distance * toKm;
    const durationS = (idx.time && dur(row[idx.time])) || (idx.moving && dur(row[idx.moving])) || 0;
    const g = (f: Field) => (idx[f] ? num(row[idx[f]!], decimalComma) : undefined);
    activities.push({
      id: `csv-${start}-${i}`,
      sport,
      rawType,
      title: (idx.title && row[idx.title]) || rawType,
      start,
      distanceKm: Math.round(distance * 1000) / 1000,
      durationS,
      movingS: idx.moving ? dur(row[idx.moving]) : undefined,
      calories: g("calories"),
      avgHr: g("avgHr"),
      maxHr: g("maxHr"),
      aerobicTE: g("aerobicTE"),
      cadence: g("cadence"),
      ascentM: g("ascent") !== undefined ? g("ascent")! * (distanceUnit === "mi" ? 0.3048 : 1) : undefined,
      avgPower: g("power"),
      tss: g("tss"),
      steps: g("steps"),
    });
  });
  activities.sort((a, b) => a.start.localeCompare(b.start));
  return {
    activities,
    skipped,
    detected: { decimalComma, unit: distanceUnit, columns: Object.values(idx) as string[] },
  };
}
