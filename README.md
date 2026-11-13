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
2. **Live Garmin sync (optional).** Set these environment variables in Vercel, then redeploy:
   - `GARMIN_EMAIL`: your Garmin Connect login
   - `GARMIN_PASSWORD`: your Garmin Connect password
   - `SYNC_SECRET`: any password you choose. The sync button asks for it, so nobody else can run a sync on your deployment.

   The sync pulls up to 400 recent activities plus 7–60 days of sleep, HRV, RHR, Body Battery, stress and steps. It uses the unofficial [`garmin-connect`](https://github.com/Pythe1337N/garmin-connect) library. Accounts with 2-step verification aren't supported, and Garmin may change its login without notice.
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
