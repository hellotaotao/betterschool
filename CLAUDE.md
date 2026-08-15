# CLAUDE.md

Guidance for Claude Code (claude.ai/code) when working in this repository.

## What this project is

**betterschool.au** — a map-first tool for Australian parents choosing a school.
The product thesis is **address-first**, not school-first: the user starts from a
place they live (or might move to) and sees what schools that location actually
gives them. Competitors (Better Education, SchoolRank, Good Schools Guide) all
start from a school and treat location as an attribute.

See [docs/strategy/2026-08-14-product-strategy.md](docs/strategy/2026-08-14-product-strategy.md)
for positioning, competitor analysis, and the feature roadmap.

## Commands

```bash
npm run dev              # dev server on localhost:3000
npm run build            # production build
npm run start            # serve the production build
npm run lint             # eslint over app components lib utils types scripts
npm test                 # vitest run
npm run test:watch       # vitest watch

# Data pipeline (run in this order after dropping new ACARA xlsx into ACARA/)
npm run acara:parse      # ACARA xlsx -> data/acara/processed/*.json
npm run acara:match      # match legacy BetterSchool records to ACARA records
npm run acara:validate   # sanity-check the parsed ACARA layer
npm run canonical:build  # merge all layers -> public/data/schools.canonical.json
npm run canonical:validate

# NSW catchments (independent of the ACARA steps above, but run before
# canonical:build so the layer gets merged in)
npm run nsw:catchment:fetch     # download shapefiles + master dataset (needs 'unzip')
npm run nsw:catchment:build     # join + emit public/data/catchment/nsw/
npm run nsw:catchment:validate  # join-rate floors, geometry and attachment checks
```

## Architecture

Next.js 16 App Router + React 19 + TypeScript + Tailwind 4. **No runtime
database and no API routes** — the app is fully static and reads a prebuilt JSON
file from `public/data/`.

```
ACARA/*.xlsx
  └─ scripts/parse-acara-*.mjs      → data/acara/processed/*.json
  └─ scripts/religion-classify.mjs  → religion layer
  └─ scripts/match-betterschool-acara.mjs → legacy metric layer
data.nsw.gov.au
  └─ scripts/{fetch,parse,build}-nsw-catchment.mjs → catchment layer
       └─ scripts/build-canonical-schools.mjs
            → public/data/schools.canonical.json  (11,034 schools, ~15MB)
            → public/data/schools.metadata.json   (provenance + coverage counts)
            → public/data/catchment/nsw/*.json    (2,152 zones, loaded on demand)
```

The catchment build reads the ACARA *location* layer rather than
`schools.canonical.json`, because canonical consumes the catchment layer —
depending on it there would be circular.

### Runtime

- `app/page.tsx` redirects to `/schools`; `app/schools/page.tsx` is the whole app.
- It client-fetches `schools.canonical.json`, cache-busted by the metadata's
  `generated_at` (`DATA_VERSION`).
- `components/SchoolMap.tsx` — Leaflet via `react-leaflet` (dynamic import,
  `ssr: false`), OpenStreetMap tiles, `L.divIcon` markers. **Not Mapbox.**
- `components/SchoolList.tsx` — list synced to the map viewport via `BoundsTracker`.
- `components/SchoolDetail.tsx`, `FilterBar.tsx`, `SearchBox.tsx`, `BottomSheet.tsx`
  (mobile layout switches on `useMediaQuery('(max-width: 768px)')`).
- `utils/schoolFilters.ts` — filter predicates + marker encoding.
- `lib/catchmentLookup.ts` — pure geometry (point-in-polygon, bbox prefilter),
  unit-tested; `lib/catchmentClient.ts` — the fetching/caching around it.
- `components/CatchmentLookup.tsx` — "what is this location zoned for?" results.
- `lib/i18n.ts` + `messages/{en,zh}.json` — locale auto-detected from
  `navigator.languages`. **Both message files must keep identical key sets.**

### Dead code

`db/database.js` and `db/locations.sqlite` are leftovers from an early SQLite
prototype. Nothing imports them. Do not extend them; delete on sight if touching
that directory.

## Data principles — read before touching any data field

These are the project's core commitments. They matter more than any feature.

1. **`Unknown` beats a wrong value.** `Unknown` is an honest, zero-cost state. A
   bad inference becomes a permanent false truth that propagates downstream.
2. **Three states, never blurred**: official (ACARA / exam authority), inferred
   (name or governing-body heuristics), and not-collected. Every inferred field
   carries a `*_source`; the UI must let a user tell them apart.
3. **Provenance on everything**: new sources go `data/<source>/raw → processed`
   with `parse-* / build-* / validate-*` scripts, and the build writes coverage
   counts (including the unknown count) into `schools.metadata.json`.
4. **NAPLAN scores are never stored.** My School's terms forbid bulk scraping and
   league tables. Link out via `myschool_url`, built from `acara_sml_id`.
5. **No public ranking or composite quality score.** Not a league table, and not
   a single blended number. This is a deliberate differentiator against
   competitors whose composite scores are unauditable.
6. **Never invent precision.** Fees store an exact figure when a source publishes
   one, otherwise a band — always with `fee_source` + `source_url` + `fee_year`.
   Catchment geometry is likewise stored unsimplified, so the reverse lookup runs
   against the published boundary rather than an approximation of our own.
7. **Absent is not the same as none.** No catchment on a Catholic school means
   "zones do not apply to this sector"; no catchment on a NSW government school
   means "none published"; on a Victorian school it means "not collected yet".
   The UI says which — it never renders a bare empty state.

### Marker encoding (and why)

Markers encode **sector → colour** and **enrolments → size**, both official ACARA
fields present for ~100% / ~90% of schools. Size uses a sqrt curve so *area*
scales with enrolments.

Markers deliberately **do not** encode `legacy_score`. That imported metric has an
opaque methodology and covers only 911 of 11,034 schools, skewed by state
(NSW 523, VIC 175, QLD 3, WA 0, NT 0) — encoding it made entire states render as
grey, which read to users as "there are no good schools here". It now survives
only as a caveated block at the bottom of the detail panel.
`utils/schoolFilters.test.ts` has a regression guard for this.

## Conventions

- Comments explain **why**, not what. Match the surrounding density.
- Pure logic (filters, classifiers, parsers) gets vitest coverage; UI components
  are not unit-tested.
- Changing user-facing strings means editing **both** `messages/en.json` and
  `messages/zh.json`.
- `@/*` maps to the project root.
- Design docs live in `docs/superpowers/specs/`, implementation plans in
  `docs/superpowers/plans/`, strategy in `docs/strategy/`. Data work follows
  spec → plan → implement.
