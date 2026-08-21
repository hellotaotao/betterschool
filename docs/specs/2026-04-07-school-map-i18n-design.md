# School Map I18n Design

## Goal

Add lightweight internationalization for the school map UI, render English by default, and automatically switch to Chinese when the browser language preference starts with `zh`.

## Scope

- Translate UI copy only.
- Keep school dataset values unchanged.
- Do not add a manual language switcher.
- Keep the current route structure unchanged.

## Design

The page remains a client component. It boots in English, then reads `navigator.languages` after mount. When any preferred language starts with `zh`, the page switches to Chinese. This accepts a possible first-render English flash in exchange for a smaller implementation.

UI strings move out of `tsx` files into locale JSON resources. A thin `lib/i18n.ts` helper exposes dictionary lookup, locale detection, and label formatting for repeated domain values such as sector and school type.

## Components

- `messages/en.json`: English UI copy.
- `messages/zh.json`: Chinese UI copy.
- `lib/i18n.ts`: Locale detection and dictionary helpers.
- `app/schools/page.tsx`: Uses the detected locale and renders translated labels.
- `components/SchoolMap.tsx` and `utils/schoolFilters.ts`: Remove non-English comments to satisfy repository rules.

## Behavior

- Default locale is `en`.
- If `navigator.languages` or `navigator.language` contains a `zh*` value, locale becomes `zh`.
- Sidebar labels, loading states, filter chips, details panel, and legend all use translated strings.
- Sector and school type badges are translated through helper functions.

## Validation

- Run a repository-wide scan for Han characters in code files to ensure Chinese text lives only in locale JSON files.
- Run build and lint-equivalent validation. If the existing `npm run lint` script is outdated, run `npx eslint` directly on the modified source files.
