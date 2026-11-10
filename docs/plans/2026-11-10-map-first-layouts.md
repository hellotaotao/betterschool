# Map-first layouts (multi-theme phase 2)

Spec: [docs/specs/2026-11-10-multi-theme-design.md](../specs/2026-11-10-multi-theme-design.md), section 4 item 2.
Boards: FinalDesktop, FinalMobile, PageSuburb, PageCatchment, PageRanking,
PageBrowse on the design canvas.

## What changes

1. **Split hero** for school, catchment and suburb pages: a static map on one
   side, the title block on the other. Below 1024px the map sits on top at a
   fixed height and the title block follows.
2. **Ranking pages** open with the top three schools as cards, then the table.
3. **Browse** gets headline counts in the hero and a list of the suburbs with
   the most schools.

## Not in this phase

- **Address search.** The boards show an address box in the header and the
  hero. The project has no geocoder, and the map app searches only schools and
  suburbs, so a box that looked like it took an address would not. The hero's
  primary action opens the map with the zone drawn, where the reader drops a
  pin. Choosing a geocoding service is a separate decision.
- Zoom buttons. The hero map is a picture, not a slippy map; the full map is
  one click away.
- Suburb name labels on the map. No suburb boundary or centroid is in the data
  (ABS suburbs are a separate plan), and placing a name at the mean of a
  suburb's schools would put it wherever its schools cluster.

## The hero map

`components/seo/HeroMap.tsx`, server-rendered SVG plus a few HTML overlays,
no client JavaScript.

- Geometry is the published boundary projected around the frame centre
  (`lib/heroMap.ts`, equirectangular via `kmOffset`, accurate to well under a
  pixel at these spans). Vertices snap to the drawing grid and consecutive
  repeats drop; the stored geometry is untouched.
- The frame fits the focus (the school, the zone, or the suburb's schools)
  into a square viewBox. The SVG uses `meet`, so on a wide or tall figure the
  surrounding schools and zones fill the margins instead of being cropped.
- Overlays (selected-school label, numbered markers, legend, year switch) are
  HTML positioned with container query units, so text stays at its CSS size on
  a phone instead of scaling down with the SVG.
- Several boundary variants (VIC publishes one per year group) are radio
  buttons; CSS `:has()` shows the chosen one. Without `:has()` the first
  variant stays visible.
- Encoding follows the map app: sector is colour, enrolments are area,
  selection is a white gap plus an ink ring, zones are the theme's zone colour.
  Neighbouring zones are outlines only.

## Tests

- `lib/heroMap.test.ts`: frame fitting, projection direction, path snapping
  and dedupe, scale bar choice, overlay position maths.
- Existing page tests keep passing; build stays SSG/ISR.
