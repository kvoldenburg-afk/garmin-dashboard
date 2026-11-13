# Pulse — Garmin training dashboard

A responsive Garmin dashboard for laptop and phone (installable as a home-screen app). Built with Next.js and Recharts, and deployed on Vercel.

## What's inside

| Tab | Highlights |
|---|---|
| **Overview** | Training-readiness ring (form, HRV, sleep and resting HR), this week vs last week, fitness/fatigue/form, yearly goal with pace marker, 12-month heatmap, weekly volume by sport, recent activities |
| **Training** | Performance management chart (CTL 42d / ATL 7d / TSB), running-pace trend with a 10-run rolling average, HR-zone intensity distribution, year-vs-year cumulative distance race, sport mix, training-clock punchcard |
| **Activities** | Sortable, searchable table (card list on mobile) with a detail sheet for each activity |
| **Health** | Resting HR, HRV, sleep duration and score, steps, Body Battery and stress (needs Garmin sync) |
| **Records** | Longest run and ride, fastest 5K/10K/half-ish pace, biggest climb, biggest week, streaks, all-time totals |

Filters: date range (30D/90D/6M/1Y/All) × sport. Units: km or mi.

## Data sources

1. **Garmin Connect CSV.** On connect.garmin.com, open Activities → All Activities, scroll to the bottom so every activity loads, then click Export CSV. Import the file from **Data & settings**. English and German exports work, including decimal commas. Data stays in your browser's localStorage.
2. **Live Garmin sync (official Garmin Connect Personal API).** Create a key at connect.garmin.com → Settings → Personal API (`/app/settings/personalApiToken`). Then add these in Vercel → Settings → Environment Variables and redeploy:
   - `GARMIN_API_KEY`: the personal API key
   - `SYNC_SECRET`: any password you choose. The dashboard asks for it once per device, so strangers can't trigger a sync.

   The sync pulls all your activities plus up to a year of sleep, HRV, resting HR, Body Battery, stress and steps. After the first sync it refreshes automatically when you open the app. Keys expire after 30 days to 1 year (Garmin emails you before that), so replace `GARMIN_API_KEY` when yours does.
3. **Demo data.** About two years of generated activities load until you import your own.

Backups: Data & settings → Download backup (JSON). Restore it by importing the .json file.

## How metrics are computed

- **Load:** TSS when the export has it. Otherwise heart-rate TRIMP (Banister), scaled to a TSS-like range. Max HR is the 99.5th-percentile observed max, and resting HR is the 60-day median. Both can be overridden in settings.
- **CTL / ATL / TSB:** exponentially weighted 42-day and 7-day load. Form = yesterday's CTL − ATL.
- **Readiness:** an *estimate*, not Garmin's proprietary score. It starts at 60 and adjusts for form, 7-day HRV vs 4-week baseline, last sleep score and RHR vs baseline.
- **Zones:** each activity's time is assigned to the zone of its average HR (% of max). Per-second zone data isn't in the CSV.

## Develop

```bash
npm install
npm run dev
```
