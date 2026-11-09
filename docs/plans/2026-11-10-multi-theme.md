# Multi-theme SEO Pages — Phase 1 Implementation Plan

**Goal:** Every SEO page renders in three themes (`bright` default, `atlas`, `harbour`) selected by `<html data-theme>`, with identical HTML across themes.

**Spec:** [docs/specs/2026-11-10-multi-theme-design.md](../specs/2026-11-10-multi-theme-design.md).

**Architecture:** Per-theme `--bs-*` custom properties in `app/globals.css`, exposed to Tailwind 4 through `@theme inline` as semantic utilities; a handful of `bs-*` component classes carry the structural differences. A blocking inline script in `<head>` resolves the theme before first paint. Fonts come from `next/font` as CSS variables; only the default theme's fonts preload.

---

### Task 1: Theme resolution

- `lib/theme.ts`: `THEMES`, `DEFAULT_THEME`, `isTheme`, `resolveTheme({ query, stored })`, and `themeBootScript()` which serialises the same constants into the inline script.
- `lib/theme.test.ts`: query beats stored, invalid values fall through, default when nothing set, script mentions every theme.

### Task 2: Root layout

- `app/layout.tsx`: `<html data-theme={DEFAULT_THEME}>`, font variables on `<html>`, boot script first in `<head>`.
- Fonts: Bricolage Grotesque + DM Sans (`preload: true`), Newsreader + IBM Plex Sans (`preload: false`). Inter stays for the map app.

### Task 3: Tokens and component classes

- `app/globals.css`: `[data-theme=…]` variable blocks, `@theme inline` mapping, `@layer components` for `bs-page`, `bs-section`, `bs-hero`, `bs-h1`, `bs-h2`, `bs-label`, `bs-figure`, `bs-btn`, `bs-btn-quiet`, `bs-note`, `bs-link`.
- `.scroll-shadow-x` reads `--bs-surface` instead of hard-coded white.

### Task 4: Convert components

In order, replacing hard-coded colour/font classes with semantic ones and wrapping content blocks in `bs-section`:

1. `PageShell`, `BrandLogo` usage, `SchoolLinkCard`, `RankingLinks`
2. `SchoolBody` and `components/seo/school/*` (SVG colours via `var(--bs-*)`)
3. `SuburbBody`, `CatchmentBody`, `StateIndexBody`, `BrowseBody`
4. `RankingBody`, `RankingTable`

Guard: `rg "(text|bg|border)-(gray|slate|indigo|blue|amber)-" components/seo` returns nothing except documented exceptions.

### Task 5: Verify

- `npx tsc --noEmit`, `npm test`, `npm run lint` (pre-existing failures in `scripts/analyze_*.js` excluded).
- Dev server: school, suburb, catchment, ranking, browse pages in each theme via `?theme=`, desktop and 375px, `en` and `zh`. Check no flash of the wrong theme on load.
