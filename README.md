# Daily Nutrition Tracker v2

A TypeScript rewrite of the Tkinter [Daily Nutrition Tracker](../daily_nutrition_tracker) with a new UI built on
[Mantine](https://mantine.dev). It does the same things as the original:

- Search Open Food Facts by food, brand, or both, with brand autocomplete, sortable results, brand filtering and "load more".
- Log portions by weight; calories, protein, carbs and fat are worked out from the per-100 g values.
- Create custom foods from nutrition labels and keep favourites in **My foods**.
- Browse any date, see daily totals and remove entries.
- History over 1–104 weeks with per-calendar-day averages (same rules as before), a daily calories chart and CSV export.
- Optional Supabase sync to the read-only history website (the `web` folder of the original app is unchanged and still works).

## Run

Double-click `run_windows.bat`. The first run installs dependencies and builds the app; after that it opens straight away
in its own window. The background server stops by itself about 15 seconds after the window is closed, waiting for any
website sync to finish first.

Requires Node.js 24+ (it uses the built-in `node:sqlite` and runs the TypeScript server directly).

## Data

v2 keeps its data in `%USERPROFILE%\.calorie_tracker_v2\`, separate from the original app's `.calorie_tracker` folder.
The database schema is identical, so the original data can be imported later.

## Development

```
npm install
npm run dev        # Vite dev server on http://localhost:5173 plus the API on :5179
npm run typecheck
npm run build
```

- `server/` – Hono API: SQLite storage (`db.ts`), Open Food Facts search (`openFoodFacts.ts`) and Supabase sync (`sync.ts`).
- `src/` – React + Mantine frontend.
- `shared/types.ts` – types shared by both.

Search uses Open Food Facts' classic search API and falls back to their newer search service when the classic one is
unavailable. Brand suggestions use the newer service's autocomplete.
