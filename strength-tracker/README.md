# Strength tracker

A mobile-first web app for logging strength training and body composition.
Single user, no login, no backend: everything lives in the browser's IndexedDB
and leaves the device only when you export it yourself.

The interface is in Danish; the code, database fields and this README are in
English. Every user-facing string lives in `src/i18n/da.ts`. Exercise names are
the English ones used on the gym floor ("Hip thrust", not "Hoftestød") — they
are ordinary data, so rename any of them from **Program → Øvelser**.

## Running it

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # production build into dist/
npm run preview    # serve the production build
npm test           # unit tests for the progression, plate, PR and backup logic
```

Icons are generated, not checked in as third-party assets:

```bash
node scripts/generate-icons.mjs
```

### Single-file build

`npm run build:standalone` packs the whole app — markup, styles and script —
into one HTML file in `dist-standalone/`, with no service worker and nothing
loaded from the network. Handy for hosting the app as a single page or mailing
it to yourself. Note that browsers block IndexedDB on `file://` URLs, so the
file needs to be served over http(s) rather than double-clicked.

## Deploying

The app is a static site: any host that serves files over HTTPS will do. Once
deployed, open it on the phone and use "Add to home screen". It then runs
standalone and works offline — the app makes no network requests of its own, so
after the first load only an app update needs the network.

### Netlify (no repository connection needed)

Run `npm run build`, then drag the *contents* of `dist/` — or a zip of them —
onto https://app.netlify.com/drop. `public/_redirects` and `public/_headers`
ship with the build and give Netlify the SPA fallback and the cache rules the
service worker needs.

### Vercel

Import the repository, set **Root Directory** to `strength-tracker`, and accept
the detected Vite preset (`npm run build` → `dist`). `vercel.json` already
handles SPA rewrites and the same cache headers. Note that Vercel builds the
repository's production branch, so the app has to be on that branch — or the
production branch has to be changed in Settings → Git.

## Data model

| Table | Contents |
|---|---|
| `exercises` | Stable id (`romanian_deadlift`), display name, muscle groups, equipment, smallest weight jump, default rep range |
| `templates` | Named workout (A/B/C), each entry with sets, rep range and superset group |
| `sessions` | Date, template, snapshot of the plan, duration, body weight, sleep 1-5, energy 1-5, notes |
| `setLogs` | Session, exercise, set number, weight, reps, RIR 0-4, warmup flag, PR flags |
| `bodyScans` | Date plus every scale field, tape measurements and progress photos — all optional |
| `settings` | Bar weight, available plates, rest times, sound/vibration, program start, weekly set target |

Data is scoped to the origin the app is served from. Two deployments of the
same app do not share a database — move data between them with the JSON export.

Three templates are seeded on first run (Full body A, B and C). They are
ordinary rows: edit them, delete them, add your own. Deleted templates stay
deleted; **Indstillinger → Gendan standardskabeloner** puts the originals back.

A session stores a *copy* of the template's exercises, so editing a template
never rewrites a workout that is already logged or under way.

`SEED_VERSION` guards changes to the built-in data. Version 2 switched the
exercise names from Danish to English; the migration in `ensureSeeded` only
touches an exercise still carrying the exact old seed name, so a name changed
by hand survives an update. Templates and set logs reference exercises by id,
so renaming never orphans training history.

## How the logging screen works

- Pick A, B or C. Exercises appear in template order; supersets are one screen
  with a tab per exercise and alternate automatically after each saved set.
- Each exercise opens with what you did last time, set by set:
  `Sidst (4. aug.): 80 kg x 8, 80 x 7, 80 x 6`.
- **Double progression** decides today's target. Hit the top of the rep range on
  every working set last time → add one increment (2.5 kg barbell, 2 kg dumbbell,
  configurable per exercise) and drop to the bottom of the range. Otherwise keep
  the weight and chase one more rep per set.
- Weight and reps are entered with large +/- buttons, prefilled with the target.
  After the first set of the day the weight follows what actually went on the
  bar, so deviating from the suggestion carries through the rest of the exercise.
- Saving a set starts the rest timer — 2:30 on standalone exercises, 1:15 inside
  a superset — with a beep and a vibration when it runs out. The timer is
  wall-clock based, so locking the phone does not pause it.
- Barbell exercises show which plates to load per side, and flag targets the
  available plates cannot hit exactly.
- PRs are detected as the set is saved: heaviest weight ever, most reps at a
  weight already used, and best estimated 1RM (Epley).

## Statistics

- Estimated 1RM per exercise over time with a least-squares trend line, labelled
  in kg/week. One point per training day, taking that day's best set.
- Tonnage (weight × reps over working sets) per session and per week.
- Working sets per muscle group over the last seven days, with a warning naming
  any group below the target (6 sets/week by default).
- Body weight with a 7-day moving average; the daily reading stays a thin grey
  line so day-to-day noise cannot dominate.
- Fat mass against lean body mass on one axis. It defaults to *change since the
  first measurement*, because lean mass is roughly four times fat mass and the
  absolute view flattens both trends.
- Overview tiles: week streak, sessions this month, and weeks on the program —
  with a reminder between week 8 and 12 to swap exercise variations.

## Export and import

**Indstillinger → Data**:

- **Eksportér alt (JSON)** — the complete database, including body scans and
  photos. This is the backup worth taking regularly.
- **Eksportér sætlog (CSV)** — one row per set, comma separated with dot
  decimals. In a Danish Excel, use *Data → Hent data → Fra tekst/CSV* rather
  than double-clicking, so the decimals are read correctly.
- **Importér JSON** — either merged into what is already there (rows with the
  same id are overwritten) or replacing everything.

Nothing is uploaded anywhere and there is no analytics or tracking of any kind.
Data lives in IndexedDB under the site's origin, which means clearing browser
data for the site deletes it. Export now and then.

## Layout

```
src/
  db/          Dexie schema, types and the seed data
  lib/         Pure logic: progression, plates, 1RM, PRs, stats, backup, dates
  hooks/       useRestTimer
  components/  Shared UI and the chart theme
  screens/     Train (with the log screen), Body, Stats, Program, Settings
  i18n/da.ts   Every Danish string
```

The logic in `src/lib` has no React or Dexie dependency and is covered by the
unit tests in `src/lib/*.test.ts`.
