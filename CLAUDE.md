# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

- `npm run dev` - Start development server on localhost:3000
- `npm run build` - Build production application
- `npm run start` - Start production server
- `npm run lint` - Run ESLint to check code quality

## Project Architecture

This is a Next.js 14 application using the App Router that displays school locations on an interactive map. The project uses Mapbox GL JS for map rendering with OpenStreetMap tiles, and SQLite for data storage.

### Key Components

- **SchoolMap** (`app/components/SchoolMap.tsx`) - Client-side map component that fetches school data and renders an interactive Mapbox GL map with markers and popups
- **API Route** (`app/api/locations/route.ts`) - Next.js App Router API endpoint that queries the SQLite database and returns school location data
- **Database Setup** (`db/database.js`) - Node.js script that initializes the SQLite database and seeds it with sample location data (currently contains generic city data, not actual schools)

### Data Flow

1. The main page (`app/page.tsx`) renders the SchoolMap component
2. SchoolMap fetches data from `/api/locations` on mount
3. The API route opens the SQLite database at `db/locations.sqlite` and queries all locations
4. SchoolMap receives the data and creates Mapbox markers for each location
5. The map auto-fits bounds to display all markers with padding

### Database Structure

- Location: `db/locations.sqlite`
- Main table: `locations`
  - `id` (INTEGER PRIMARY KEY)
  - `name` (TEXT)
  - `latitude` (REAL)
  - `longitude` (REAL)
- Note: Current sample data contains city locations (New York, LA, Chicago), not actual schools

### Key Dependencies

- **Mapbox GL JS** - Interactive map rendering (uses public demo token, should be replaced for production)
- **SQLite3** - Local database for storing location data
- **Deck.GL** - Advanced geospatial library (installed but not currently used in the codebase)
- **React Map GL** - React wrapper for Mapbox (installed but not used; the project uses vanilla Mapbox GL JS directly)

### Configuration Notes

- Mapbox access token is hardcoded in `app/components/SchoolMap.tsx:7` (currently using Mapbox's public demo token)
- The map uses OpenStreetMap tiles instead of Mapbox's default style
- Custom webpack config in `next.config.js` transpiles Mapbox GL JS with babel-loader to ensure compatibility
- Database path in the API route uses `process.cwd()` for proper resolution in both dev and production
- TypeScript path alias `@/*` maps to the project root

### Architecture Patterns

- Uses Next.js 14 App Router with TypeScript
- Client-side components ("use client") for interactive map functionality
- Server-side API routes for database queries
- Separation of concerns: database initialization, API data fetching, and UI rendering are in separate files
- Map initialization and marker rendering handled in separate useEffect hooks for better control flow
