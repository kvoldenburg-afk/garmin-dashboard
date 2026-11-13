export type Sport = "run" | "ride" | "swim" | "walk" | "hike" | "strength" | "other";

export const SPORTS: Sport[] = ["run", "ride", "swim", "walk", "hike", "strength", "other"];

export const SPORT_LABEL: Record<Sport, string> = {
  run: "Run",
  ride: "Ride",
  swim: "Swim",
  walk: "Walk",
  hike: "Hike",
  strength: "Strength",
  other: "Other",
};

/** Fixed categorical order (validated dark-surface steps). Color follows the sport, never its rank. */
export const SPORT_COLOR: Record<Sport, string> = {
  run: "#3987e5",
  ride: "#d95926",
  swim: "#199e70",
  walk: "#c98500",
  hike: "#d55181",
  strength: "#008300",
  other: "#9085e9",
};

export interface Activity {
  id: string;
  sport: Sport;
  rawType: string;
  title: string;
  /** Local start time, ISO-like "YYYY-MM-DDTHH:mm:ss" */
  start: string;
  distanceKm: number;
  durationS: number;
  movingS?: number;
  calories?: number;
  avgHr?: number;
  maxHr?: number;
  ascentM?: number;
  aerobicTE?: number;
  cadence?: number;
  avgPower?: number;
  tss?: number;
  steps?: number;
}

export interface DailyWellness {
  date: string; // YYYY-MM-DD
  steps?: number;
  restingHr?: number;
  sleepS?: number;
  sleepScore?: number;
  hrv?: number;
  bodyBattery?: number;
  stress?: number;
}

export interface Settings {
  units: "km" | "mi";
  maxHr?: number;
  restHr?: number;
  yearlyGoalKm: number;
  goalSport: Sport | "all";
}

export interface DataSet {
  source: "demo" | "csv" | "garmin";
  updatedAt: string;
  activities: Activity[];
  daily: DailyWellness[];
}
