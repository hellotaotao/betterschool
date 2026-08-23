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

# Catchments, per state (independent of the ACARA steps above, but run before
# canonical:build so the layers get merged in). Both need 'unzip'.
npm run nsw:catchment:fetch     # download shapefiles + master dataset
npm run nsw:catchment:build     # join + emit public/data/catchment/nsw/
npm run nsw:catchment:validate  # join-rate floors, geometry and attachment checks

npm run sa:catchment:fetch      # download zone shapefiles + education sites
npm run sa:catchment:build      # join + emit public/data/catchment/sa/
npm run sa:catchment:validate
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
data.nsw.gov.au / data.sa.gov.au
  └─ scripts/{fetch,parse,build}-{nsw,sa}-catchment.mjs → catchment layers
       └─ scripts/build-canonical-schools.mjs
            → public/data/schools.canonical.json  (11,034 schools, ~15MB)
            → public/data/schools.metadata.json   (provenance + coverage counts)
            → public/data/catchment/nsw/*.json    (2,152 zones, loaded on demand)
            → public/data/catchment/sa/*.json     (130 zones, loaded on demand)
```

The catchment builds read the ACARA *location* layer rather than
`schools.canonical.json`, because canonical consumes the catchment layers —
depending on them there would be circular.

Geometry, rounding and bbox rules live in `scripts/catchment-common.mjs` and are
shared by every state; only source URLs, attribute names and the join chain are
per-state. A new state needs a `{fetch,parse,build,validate}-<state>-catchment.mjs`
set, an entry in `CATCHMENT_STATES` (`lib/catchmentLookup.ts`), one in
`STATE_INFO` (`lib/catchmentStates.ts`), and a line in `catchmentLayerPaths`
(`scripts/build-canonical-schools.mjs`). `lib/catchmentStates.test.ts` fails if
the first two disagree.

### Routes

| Route | Rendering | Canonical URLs |
|---|---|---|
| `/schools` | client-only map app | 1 |
| `/browse` | prerendered | 1 |
| `/suburb/[state]` | prerendered | 8 |
| `/school/[state]/[slug]` | on-demand ISR | 11,034 |
| `/suburb/[state]/[slug]` | on-demand ISR | 4,799 |
| `/catchment/[state]/[slug]` | on-demand ISR | 2,029 |

Every route above except the map exists twice: bare for English and under `/zh`
for Chinese — 35,743 canonical URLs in total. English keeps the unprefixed paths
it already publishes; those must not move.

The long-tail routes are the SEO surface — the map app is one client-rendered URL
and is invisible to search. The build emits zero school, suburb or catchment
pages, but the sitemap still lists every canonical URL. The first request for a
valid URL generates the page and caches it for the rest of the deployment.
These server-only routes read the prebuilt dataset off disk via
`lib/schoolsData.ts` (never import it from a client component) and link into the
app through `/schools?school=<acara_sml_id>[&catchment=1]`.

`/browse` and `/suburb/[state]` are prerendered because they are the entry
points: without them the long-tail pages are reachable only from the sitemap,
which hides them from readers and gives search engines no internal links to
weigh. The crawl path is `/browse` → `/suburb/<state>` → `/suburb/<state>/<slug>`
→ `/school/<state>/<slug>`, and the map's detail panel links back out to the
school page (`lib/slug.ts::schoolSlugFor` builds that URL client-side).

### Bilingual pages

The page bodies live in `components/seo/pages/*Body.tsx` and take a `locale`.
Route files under `app/` and `app/zh/` are ten-line shims that pass `'en'` or
`'zh'` — **never copy a page body per locale**, which is how `CLAUDE.md` and
`AGENTS.md` drifted apart until one described an architecture the project no
longer had.

- Strings live in `messages/{en,zh}.json` under `seo.*`. `lib/i18n.test.ts`
  enforces that both files carry identical keys, no empty values, and the same
  `{placeholders}` — a missing key is otherwise a blank on the page, not a type
  error.
- `lib/seoLocale.ts` builds canonical + hreflang. Each version canonicals to
  itself and lists both languages plus `x-default` → English.
- `lib/slug.ts` path helpers take an optional trailing locale; English is the
  unprefixed default, so existing call sites keep working.
- School and suburb names stay in English on Chinese pages — that is what
  parents type into a search box. Titles wrap them in Chinese framing, and
  English titles use the state abbreviation ("NSW") because that is how
  Australians search.
- Known limitation: `<html lang>` stays `en` on `/zh` pages. Only the root
  layout renders `<html>`, and reading the locale there would force every page
  out of static rendering. `PageShell` sets `lang` on its wrapper instead, which
  scopes correctly for screen readers; hreflang is what search engines target.

Slugs come from `lib/slug.ts`: `<name>-<suburb>`, because school names repeat
heavily inside a state (NSW has 47 "St Joseph's Primary School"). Only a genuine
same-suburb duplicate gets an `-<acara_sml_id>` suffix, so URLs stay stable.

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
- `lib/catchmentLookup.ts` — pure geometry (point-in-polygon, bbox prefilter)
  plus `CATCHMENT_STATES`, unit-tested; `lib/catchmentClient.ts` — the
  fetching/caching around it, which merges every state's index into one list and
  stamps each entry with the state it was read from, so a lookup spans states
  without the caller tracking which file to read. A state whose build has not run
  contributes nothing rather than failing the lookup.
- `lib/catchmentStates.ts` — per-state facts the copy depends on: the
  department's own address checker, and whether the state zones its whole
  government system.
- `components/CatchmentLookup.tsx` — "what is this location zoned for?" results.
- `lib/i18n.ts` + `messages/{en,zh}.json`. **Both message files must keep
  identical key sets**, enforced by `lib/i18n.test.ts`.
- Map locale resolves in this order (`resolveInitialLocale`): `?lang=` →
  remembered choice in `localStorage` → `navigator.languages`. The query
  parameter is how a `/zh` page hands a reader to the map without dropping
  their language; the stored value is the manual EN/中文 toggle in the top bar.
  Browser detection is only the last resort — it is often wrong for this
  audience, who frequently read Chinese on an English-language browser.
  Everything the map links out to (`mapUrl`, `schoolPath`) follows the resolved
  locale, so the "full profile" button lands on the matching language.

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
7. **Absent is not the same as none.** Four different absences, and the UI says
   which every time rather than rendering a bare empty state:
   - Catholic or Independent school → "zones do not apply to this sector".
   - NSW government school with no zone → "none published". NSW zones 2,029 of
     its 2,223 government schools, so the silence is informative.
   - SA government school with no zone → says almost nothing. SA publishes zones
     for 124 of 521 government schools and the published data gives no rule for
     which, so the page must not let a reader infer the school is unzoned.
   - Victorian school → "not collected yet".

   The same rule governs year levels. NSW publishes them per zone; SA publishes
   none, and its schools' own "Reception to Year 12" designation describes the
   *school*, not the zone — six SA schools hold both a primary and a secondary
   zone, so copying it onto each would claim the primary zone runs to Year 12.
   SA zones therefore carry an empty `year_levels`, and the UI omits the line
   rather than inventing one. `validate-sa-catchment.mjs` fails if that array
   ever arrives missing or populated.

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

Cluster bubbles are **rings sliced by the sectors they contain**, not filled
discs. Two rules constrain them, and both were broken once: the fill must come
from `SECTOR_COLORS`, never a fourth hue (a flat indigo `#4f46e5` bubble sat 19
degrees of hue from the Catholic violet, so a pair of government schools read as
"Catholic"), and the shape must not be a filled circle, because a filled circle
already means *one school* and its diameter already means enrolments. Any new
aggregate drawn on the map inherits both rules.

The same constraint binds **selection**. A selected marker keeps its sector fill
and is picked out by an achromatic white-gap-plus-slate ring; it used to flip to
the same indigo, which turned a green government school purple the moment a user
clicked it. Map state — selected, hovered, or anything added later — is drawn
with shape, weight and neutral tone. Hue belongs to sector.

## Conventions

- Comments explain **why**, not what. Match the surrounding density.
- Pure logic (filters, classifiers, parsers) gets vitest coverage; UI components
  are not unit-tested.
- Changing user-facing strings means editing **both** `messages/en.json` and
  `messages/zh.json`.
- `@/*` maps to the project root.
- Design docs live in `docs/specs/`, implementation plans in
  `docs/plans/`, strategy in `docs/strategy/`. Data work follows
  spec → plan → implement.
