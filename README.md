# BetterSchool.au

A map-first tool for Australian parents choosing a school, live at
[www.betterschool.au](https://www.betterschool.au).

It starts from an address rather than a school: pick a place you live, or
might move to, and see what that location gives you — the schools around it,
the government school zones it falls in, and official ACARA figures for each
school. Every field carries its source, and a value the data cannot support is
shown as unknown rather than guessed.

- **Map** (`/schools`): 11,034 schools from ACARA's 2025 collection, filters,
  search, "what is this location zoned for?", and a zone overlay.
- **Zones**: government intake areas for NSW, VIC, QLD, SA, TAS and ACT,
  stored at the published precision.
- **Pages**: a page per school, suburb and zone, in English and Chinese,
  generated on demand from the same dataset.

## Running it

Requires Node 20+.

```bash
npm ci
npm run dev        # http://localhost:3000
npm test
npm run build && npm run start
```

The app has no database or API. It reads prebuilt JSON from `public/data/`,
which is committed, so the commands above need no data step. Rebuilding the
data from the ACARA spreadsheets and the state catchment sources is a separate
pipeline (`npm run acara:*`, `npm run <state>:catchment:*`,
`npm run canonical:build`).

## For contributors

[CLAUDE.md](CLAUDE.md) is the full guide: architecture, the data pipeline in
order, the data principles every field follows, and the conventions. Product
direction is in [docs/strategy/](docs/strategy/).
