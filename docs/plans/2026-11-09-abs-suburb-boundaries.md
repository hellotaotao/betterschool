# ABS Suburb Boundaries Implementation Plan

**Goal:** Join ABS SAL 2026 suburb boundaries to the suburb pages and to every published zone variant, so catchment pages list the suburbs a zone covers and suburb pages list the zones that cover them, plus a "nearby schools" section that needs no new data.

**Spec:** [docs/specs/2026-10-27-abs-suburb-boundaries-design.md](../specs/2026-10-27-abs-suburb-boundaries-design.md). Section numbers below (§4.1 etc.) refer to it.

**Architecture:** A new `abs` source follows the catchment pattern: `fetch → parse → build → validate` scripts, pure helpers in a shared `.mjs` with vitest coverage, outputs under `data/abs/processed/`, merged into `schools.canonical.json` by `build-canonical-schools.mjs`. Pages read the merged data server-side through `lib/schoolsData.ts`; nothing new reaches the client projection or the map.

**Tech Stack:** Node ESM scripts, `shapefile` and `proj4` (existing), `polygon-clipping` (new, build-time only), Next.js 16 server components, Vitest.

## Changes from the spec

1. **SAL geometry is not written to `data/abs/processed/`.** Processed files are committed, and SAL as GeoJSON exceeds 100 MB. `parse` verifies the shapefile and writes a small report; `build` reads geometry straight from `data/abs/raw/`, which is gitignored like every other raw download.
2. **"Zones covering a suburb" is derived at request time, not stored.** Each catchment entry in canonical carries its own `suburbs` list (§4.2). Inverting ~6,400 entries × ~7 rows on the server is cheap and keeps one copy of the overlap data.
3. **`public/data/suburbs.canonical.json` holds only the suburb → SAL match** (§4.1), keyed by the exact ACARA `state|suburb` text.

---

### Task 1: Scaffolding

**Files:**
- Modify: `package.json`, `.gitignore`

- [ ] `npm install --save-dev polygon-clipping`, beside `shapefile` and `proj4`, which are also build-time-only devDependencies.
- [ ] Add scripts:

```json
"abs:sal:fetch": "node scripts/fetch-abs-sal.mjs",
"abs:sal:parse": "node scripts/parse-abs-sal.mjs",
"abs:sal:build": "node scripts/build-abs-sal.mjs",
"abs:sal:validate": "node scripts/validate-abs-sal.mjs",
```

- [ ] `.gitignore`: add `data/abs/raw/` under the "Catchment raw downloads" block, with the same "regenerate with" comment.
- [ ] Commit: `chore(data): scaffold the ABS SAL pipeline`.

### Task 2: Pure helpers, test first

**Files:**
- Create: `scripts/abs-sal-common.mjs`, `scripts/abs-sal-common.test.mjs`

Constants live here, as in `tas-catchment-common.mjs`: `ZIP_URL` (from §3), `RAW_DIR = 'data/abs/raw'`, `PROCESSED_DIR = 'data/abs/processed'`, `SHAPEFILE_BASE = 'SAL_2026_AUST_GDA2020'`, `EDITION = 'ASGS Edition 4'`, `LICENCE = 'CC BY 4.0'`, `ATTRIBUTION = 'Australian Bureau of Statistics'`, `STATE_BY_STE = { 1: 'NSW', 2: 'VIC', 3: 'QLD', 4: 'SA', 5: 'WA', 6: 'TAS', 7: 'NT', 8: 'ACT', 9: 'OT' }`, and the thresholds `MATCH_MAX_KM = 2`, `MIN_ZONE_SHARE = 0.01`, `MIN_SAL_SHARE = 0.10`.

Functions, each with tests written before the body:

- [ ] `normaliseSuburbName(value)` — lowercase; delete `'`, `’` and `.`; fold every other non-alphanumeric run into one space; trim. Kept separate from `normaliseName` in `catchment-common.mjs`, which turns an apostrophe into a space and so splits "St Mary's" from "St Marys". The spec's 96.5% unique-name rate was measured with this deletion rule.
  - Tests: `"St. Kilda"` → `"st kilda"`; `"O'Connor"` → `"oconnor"`; `"Mount  Druitt"` → `"mount druitt"`.
- [ ] `stripSalQualifier(name)` — drop one trailing `" (…)"`. Tests: `"Carramar (NSW)"` → `"Carramar"`; `"Richmond (Vic.)"` → `"Richmond"`; a name without a qualifier is unchanged.
- [ ] `matchSuburb({ points, candidates, distanceToKm })` — the §4.1 decision, with geometry passed in as functions so the test needs no shapefile. `points` are the suburb's school `[lng, lat]`; each candidate carries `contains(point)`; `distanceToKm(candidate, point)` gives the distance to its boundary. Returns `{ sal_code, sal_name, method }` or `{ unmatched: reason }`.
  - `method: 'name_contained'` — one candidate, at least one point inside.
  - `method: 'name_near'` plus `distance_km` — one candidate, nearest point within `MATCH_MAX_KM`.
  - `method: 'name_disambiguated'` — several candidates, exactly one containing a point.
  - Unmatched reasons: `no_sal_name`, `too_far` (with the distance), `ambiguous` (with candidate codes).
  - Tests: one per branch, plus a case where two candidates both contain a point (→ `ambiguous`).
- [ ] `albersAreaKm2(geometry)` — project with `proj4` to EPSG:9473 (`+proj=aea +lat_0=0 +lon_0=132 +lat_1=-18 +lat_2=-36 +x_0=0 +y_0=0 +ellps=GRS80 +units=m +no_defs`), shoelace, holes subtracted, MultiPolygon summed.
  - Test: a 0.01° square at Sydney agrees with `geometryAreaKm2` from `catchment-common.mjs` within 0.5%; a polygon with a hole subtracts it.
- [ ] `overlapRows(zoneGeometry, candidates)` — for each candidate SAL whose bbox meets the zone bbox, `polygonClipping.intersection` in degree space, area of the result via `albersAreaKm2`, then `zone_share` and `sal_share` against the two full areas. Keep a row when `zone_share ≥ MIN_ZONE_SHARE` or `sal_share ≥ MIN_SAL_SHARE`. Both shares are rounded to 4 decimals, rows sorted by `zone_share` descending. A clipping exception is rethrown with the SAL code attached, so the build stops on it rather than dropping a suburb silently.
  - Tests with hand-built squares: a zone fully inside one SAL (one row, `zone_share` 1); a zone split 50/50; a 0.5% sliver dropped; a small SAL entirely inside a large zone kept through `sal_share`.
- [ ] Run `npx vitest run scripts/abs-sal-common.test.mjs` and see it pass.
- [ ] Commit: `feat(data): ABS SAL join and overlap helpers`.

### Task 3: Fetch and parse

**Files:**
- Create: `scripts/fetch-abs-sal.mjs`, `scripts/parse-abs-sal.mjs`
- Output (committed): `data/abs/processed/fetch-manifest.json`, `data/abs/processed/parse-report.json`

- [ ] `fetch-abs-sal.mjs` mirrors `fetch-tas-catchment.mjs`: download `ZIP_URL`, `unzip -o -q` into `RAW_DIR`, require `.shp .dbf .shx .prj .CPG` for `SHAPEFILE_BASE`, write the manifest (URL, bytes, etag, last-modified, fetched_at).
- [ ] `parse-abs-sal.mjs` reads the shapefile once and fails unless:
  - the `.prj` names GDA2020;
  - every record has non-empty `SAL_CODE26`, `SAL_NAME26`, `STE_CODE26` and a finite `AREASQKM26`;
  - `SAL_CODE26` is unique and its first digit equals `STE_CODE26`;
  - every ring is closed (`ringIsClosed` from `catchment-common.mjs`).

  It writes the per-state feature counts and total to `parse-report.json`. Expected totals from §3: 15,358 overall, NSW 4,554 … OT 5. A different total is printed, not fatal: ABS may reissue the file.
- [ ] Run both. Commit the two processed files: `feat(data): fetch and verify ABS SAL 2026`.

### Task 4: Build the layer

**Files:**
- Create: `scripts/build-abs-sal.mjs`
- Output (committed): `data/abs/processed/sal-layer.json`, `data/abs/processed/unmatched.json`

- [ ] Load SAL features from the raw shapefile with their bbox and `albersAreaKm2` area. Use the computed area, not `AREASQKM26`, so both sides of every share use one method. Log the median ratio between the two as a sanity check.
- [ ] Build a 0.1° grid index of SAL bboxes for candidate lookup, as in the measurement script.
- [ ] **Suburbs (§4.1).** Group the ACARA location layer (`data/acara/processed/school-location-2025.json`) by the exact `state|suburb` text. For each group, find candidates by `state + normaliseSuburbName(stripSalQualifier(name))` and call `matchSuburb`. Containment uses `pointInGeometry` from `catchment-common.mjs`. Distance is point-to-segment over the SAL rings in local kilometres, the same as `distanceKm`'s scale.
- [ ] **Overlaps (§4.2).** For every state in `catchmentLayerPaths`, read `public/data/catchment/<st>/index.json`. For each distinct `geometry_url`, future variants included, run `overlapRows` against the grid candidates in the same state. Key the result by `geometry_url`.
- [ ] Write:

```text
sal-layer.json
  { edition, sal_year: 2026, source_url, licence, attribution, generated_at,
    thresholds: { match_max_km, min_zone_share, min_sal_share },
    suburbs:  { "<STATE>|<suburb>": { sal_code, sal_name, method, distance_km? } },
    overlaps: { "<geometry_url>": [{ sal_code, sal_name, zone_share, sal_share }] } }
unmatched.json
  [{ state, suburb, reason, detail }]
```

- [ ] Print the §4.1 table (accepted per method, unmatched per reason) and the §4.2 distribution (rows per zone: p10, median, p90, max). Compare with the spec's measured numbers: 4,668 accepted, median 6, p90 17. Treat a drift of more than a few percent as a bug to explain before moving on.
- [ ] Commit both outputs: `feat(data): match suburbs to ABS SAL and intersect every zone`.

### Task 5: Validate

**Files:**
- Create: `scripts/validate-abs-sal.mjs`

Fails on:

- [ ] suburb match rate below 97%, or any `unmatched.json` entry without a reason;
- [ ] a `geometry_url` from a zoned state's index with no overlap row;
- [ ] any overlap for WA or NT;
- [ ] a share outside 0–1, or one SAL twice in the same zone;
- [ ] a zone's `zone_share` sum outside `[0.95, 1.01]`.

Run it once before fixing that last band. Coastal zones that extend over water can sum below 0.95. If real zones do, list them, confirm they are coastal, and lower the floor with a comment naming the cases. If the sum exceeds 1.01, SALs overlap each other, which is a parse or clipping bug.

- [ ] Commit: `feat(data): validate the ABS SAL layer`.

### Task 6: Merge into canonical

**Files:**
- Modify: `scripts/build-canonical-schools.mjs`, `scripts/validate-canonical-schools.mjs`, `types/school.ts`, `types/school.test.ts`
- Output: `public/data/schools.canonical.json`, `public/data/suburbs.canonical.json`, `public/data/schools.metadata.json`

- [ ] `types/school.ts`: add

```ts
/** A suburb this zone overlaps (ABS SAL 2026). Shares are of area, not of addresses. */
export interface ZoneSuburb {
  sal_code: string;
  sal_name: string;
  /** Overlap area / zone area. */
  zone_share: number;
  /** Overlap area / suburb area. */
  sal_share: number;
}
```

  and an optional `suburbs?: ZoneSuburb[]` on `SchoolCatchment`. `MapSchoolCatchment` stays a `Pick` without it. Extend `types/school.test.ts` so it fails if `suburbs` ever enters the client projection.
- [ ] `build-canonical-schools.mjs`: read `data/abs/processed/sal-layer.json` when present, as an optional layer like `year12Path`. Attach `overlaps[geometry_url]` to each catchment entry as `suburbs`, and write `suburbs` to `public/data/suburbs.canonical.json` with the layer header fields. Add `metadata.provenance.suburb_boundaries` (source, edition, licence, attribution, method) and `metadata.coverage.suburb_boundaries` with matched, unmatched and zones-with-overlap counts.
- [ ] `validate-canonical-schools.mjs`: every catchment in a zoned state other than WA or NT has a non-empty `suburbs` when the layer is present.
- [ ] Run `npm run canonical:build && npm run canonical:validate`. Record the canonical file's growth in the commit message; the estimate is about 4 MB on 24 MB.
- [ ] Commit: `feat(data): attach ABS suburb overlaps to catchments`.

### Task 7: Server data access, test first

**Files:**
- Create: `lib/suburbCoverage.ts`, `lib/suburbCoverage.test.ts`
- Modify: `lib/schoolsData.ts`

Pure logic in `lib/suburbCoverage.ts`:

- [ ] `coverageLevel(salShare): 'all' | 'most' | 'part'` — `≥ 0.95` all, `≥ 0.5` most, else part. Test both boundaries exactly.
- [ ] `invertOverlaps(schools)` → `Map<sal_code, CoveringZone[]>`, where `CoveringZone = { school, catchment, zone_share, sal_share }`. Test with two fixture schools whose catchments share a SAL.
- [ ] `groupCoveringZones(zones)` — group by `catchment.kind` (`primary`, `secondary`, `future`), then within a VIC or QLD school keep one row per year variant. Sort each group by `sal_share` descending. Test ordering and grouping.
- [ ] `nearestBySchoolType(origin, schools, { excludeSuburb, perGroup })` — two lists: primary-age (Primary + Combined) and secondary-age (Secondary + Combined), nearest first, skipping the suburb's own schools. Special schools are left out: their intake is by assessment, not by where a family lives. Test that a Combined school can appear in both lists and that the suburb's own schools never appear.

In `lib/schoolsData.ts`, cached like the other indexes:

- [ ] `getSuburbSal(group)` — look up `state|group.suburb` in `suburbs.canonical.json`, falling back to the group's other distinct `school.suburb` spellings (two spellings can share a slug).
- [ ] `getZonesCoveringSuburb(group)` — `getSuburbSal`, then the cached `invertOverlaps` map.
- [ ] `getSuburbPageForSal(salCode)` — reverse of the match, for links from catchment pages. `undefined` when no suburb page exists.
- [ ] `getNearbySchoolsForSuburb(group, perGroup = 5)` — `nearestBySchoolType` from `group.lat/lng` over `getSchoolsForState(group.state)`.
- [ ] Commit: `feat(seo): suburb-zone coverage lookups`.

### Task 8: Catchment page

**Files:**
- Modify: `components/seo/pages/CatchmentBody.tsx`, `messages/en.json`, `messages/zh.json`, `lib/schoolsData.ts` (drop `getZoneSuburbs` once unused)

- [ ] In each zone section (the `zones.map` block), put a "Suburbs this zone covers" table above the other-schools list. Columns: suburb name, linked through `getSuburbPageForSal` when a page exists; coverage level plus `sal_share` as a percentage; share of the zone. Order by `zone_share`.
- [ ] Below the table, one line from §6.1: these are ABS approximations of suburb boundaries; a zone boundary can run down the middle of a street; "part" means some addresses in that suburb are in the zone and some are not. The existing finder link stays where it is.
- [ ] Remove `insideSuburbs` and `insideSuburbsCaveat` from the body and from both message files, and remove `getZoneSuburbs` and the `suburbs` field of `CatchmentZoneSection`.
- [ ] `metaTitle` and `metaDescription`: include the first three suburbs by `zone_share` and a count of the rest. Add `*One` variants wherever a count can be one, following `a2ef69e`.
- [ ] Add the ABS attribution to the page's `sourceLinks` (`PageShell`), beside the state catchment source. Only pages that render SAL data get it; Task 9 does the same on suburb pages.
- [ ] New keys in both `en` and `zh`; `lib/i18n.test.ts` enforces parity.
- [ ] Commit: `feat(seo): catchment pages list the suburbs a zone covers`.

### Task 9: Suburb page

**Files:**
- Modify: `components/seo/pages/SuburbBody.tsx`, `messages/en.json`, `messages/zh.json`

- [ ] Replace the `zoned.length > 0` list in the zones section with a covering-zones table from `getZonesCoveringSuburb`, grouped by kind: school name linked to its catchment page, coverage level plus `sal_share`. The suburb's own zoned schools appear in it naturally. Keep the `zonesPresent` sentence above it.
- [ ] Keep every absence branch distinct (data principle 7):
  - no `zoneState` (WA, NT): `zonesOtherState`, unchanged;
  - no SAL match: today's rendering, unchanged;
  - SA with rows: add one sentence saying SA publishes zones for only some government schools, so the list may be incomplete;
  - SA with no rows: `zonesNonePartial`, unchanged;
  - TAS: add one sentence saying high-school entitlement follows the primary school attended, which is why only primary and district zones are listed.
- [ ] Add a "Nearby schools" section after the zones section from `getNearbySchoolsForSuburb`: two short lists with straight-line distance, each entry a `SchoolLinkCard`. It renders for every suburb, WA and NT included.
- [ ] Commit: `feat(seo): suburb pages list the zones that cover them and nearby schools`.

### Task 10: Verify, document, ship

- [ ] `npm test`; `npx eslint` on every changed file. The repo-wide lint already reports nine errors in untracked `scripts/analyze_*.js`, which are not part of this work.
- [ ] `npm run build`, then the `betterschool-prod` preview on port 3001. Check, in English and Chinese:
  - `/catchment/nsw/pittwater-high-school-mona-vale` lists Mona Vale, Newport and neighbours with levels, and links the ones that have pages;
  - `/suburb/nsw/abbotsford` shows the covering primary and secondary zones and nearby schools;
  - one SA suburb with zones and one without; one TAS suburb; one WA suburb (zones absent, nearby present);
  - one of the 132 unmatched suburbs, such as `/suburb/nsw/auburn-south`, renders as before plus nearby schools.
- [ ] Re-measure the body word count of Abbotsford (228 before) and of the Pittwater catchment page (356 before) with the script used for the spec, and note both in the spec.
- [ ] Update `CLAUDE.md`: the ABS commands, the `abs` branch of the pipeline diagram, the `suburbs` field and `suburbs.canonical.json`, and a short note under data principles saying SAL is an ABS approximation and the copy says so.
- [ ] Set the spec's status to implemented, with the main commit and the measured numbers.
- [ ] Commit only the files this work touched (`git diff --cached --stat` before each commit), then push to `main`.
- [ ] Four weeks after release, repeat the Search Console sampling from spec §1 and add the result to the spec.
