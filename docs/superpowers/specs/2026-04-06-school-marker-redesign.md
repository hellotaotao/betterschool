# School Marker Redesign — Design Spec

**Date:** 2026-04-06  
**Status:** Approved

## Problem

Most schools cluster in the high-score range (85–100). With linear size scaling and a narrow radius range (5–18px), a 2–3 point score difference is visually indistinguishable. Low-scoring schools also don't benefit from visual compression—they consume size "budget" that should be reserved for high-score differentiation.

Additionally, the current `CircleMarker` cannot render text inside the circle, making it impossible to display score labels.

## Solution Overview

Replace Leaflet `CircleMarker` with `Marker + DivIcon` (HTML div styled as a circle). Apply:
1. **Non-linear (quadratic) size scaling** — emphasizes high-score differences
2. **Score-based color depth** — darker shade = higher score, within each sector's hue
3. **In-circle score label** — shown when marker diameter ≥ 26px (~score ≥ 82)
4. **CSS-driven hover and selected states**

## 1. Size Scaling

Replace `getMarkerRadius` with a quadratic curve:

```
radius = 4 + ((score - 60) / 40)² × 28
```

Range: 4px (score=60) → 32px (score=100)

| Score | Old radius | New radius | Δ per 5pts |
|-------|-----------|-----------|------------|
| 60    | 5px       | 4px       | —          |
| 75    | 9px       | 7px       | 3px        |
| 85    | 12px      | 13px      | 6px        |
| 90    | 14px      | 18px      | 5px ↑      |
| 95    | 16px      | 25px      | 7px ↑      |
| 100   | 18px      | 32px      | 7px ↑      |

High-score differences (90–100) now span 14px vs. the old 4px.

## 2. Color Encoding

Color encodes **both** sector (hue) and score (lightness/shade). Interpolate linearly by score in the 60–100 range.

| Sector          | Low score (60) | High score (100) |
|-----------------|---------------|-----------------|
| Government      | `#86efac` (light green) | `#15803d` (dark green) |
| Non-government  | `#fed7aa` (light orange) | `#c2410c` (dark orange) |

Implementation: linear hex interpolation between the two endpoints based on `(score - 60) / 40`.

## 3. Score Label

- Shown when `radius ≥ 13` (diameter ≥ 26px), roughly score ≥ 82
- Text: score as integer (e.g. `"95"`)
- Style: white, bold, `font-size` scaled relative to radius (e.g. `radius * 0.75`px, clamped 10–18px)
- Centered via flexbox inside the div

## 4. Selected State

- **Glow ring**: `box-shadow: 0 0 0 6px rgba(79, 70, 229, 0.35)` (indigo, matches current color)
- **Fill**: indigo `#4f46e5` replacing sector color
- **Label**: white (unchanged)

## 5. Hover State

- CSS `transform: scale(1.25)` on the div element
- `transition: transform 0.15s ease`
- No JS state needed — pure CSS `:hover`

## 6. Files Changed

| File | Change |
|------|--------|
| `utils/schoolFilters.ts` | Update `getMarkerRadius` to quadratic formula; add `getMarkerColor(score, sector)` helper |
| `components/SchoolMap.tsx` | Replace all `CircleMarker` with `Marker + DivIcon`; remove `hoveredSchool` state |

## 7. DivIcon HTML Structure

```html
<div class="school-marker [selected] [government|non-government]"
     style="width: Xpx; height: Xpx; background: #color; ...">
  <span>95</span>   <!-- only if radius ≥ 13 -->
</div>
```

CSS applied via inline styles (DivIcon className + style string) since Leaflet DivIcon lives outside Next.js CSS scope.

## Non-Goals

- No changes to the filter panel or school list
- No zoom-level-dependent marker resizing
- No shape differentiation for sector (shapes are hard to read at small sizes)
