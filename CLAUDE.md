# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

- `npm run dev` - Start development server on localhost:3000
- `npm run build` - Build production application
- `npm run start` - Start production server
- `npm run lint` - Run ESLint to check code quality

## Project Architecture

This is a Next.js 14 application that displays schools on an interactive map using Mapbox GL JS. The project follows Next.js App Router architecture.

### Key Components
- **SchoolMap** (`app/components/SchoolMap.tsx`) - Main map component using Mapbox GL to display school locations with markers and popups
- **API Route** (`app/pages/api/locations.ts`) - Next.js API endpoint that queries SQLite database for school data
- **Database Setup** (`db/database.js`) - SQLite database initialization and sample data seeding

### Database Structure
- SQLite database located at `db/locations.sqlite`
- Main table: `locations` with columns: id, name, latitude, longitude, type
- Schools are filtered by `type = 'school'` in the API query

### Key Dependencies
- **Mapbox GL JS** - Interactive map rendering (requires API token configuration)
- **SQLite3** - Local database storage
- **Deck.GL** - Advanced geospatial visualization library (installed but not actively used)
- **TailwindCSS** - Styling framework
- **TypeScript** - Type safety throughout the codebase

### Configuration Notes
- Mapbox access token needs to be set in `app/components/SchoolMap.tsx:7`
- Custom webpack config in `next.config.js` handles Mapbox GL JS compilation
- Database path in API handler may need adjustment based on deployment environment
- Geist fonts are included locally in `app/fonts/`

### Architecture Patterns
- Uses Next.js App Router with TypeScript
- Client-side components for interactive map functionality
- Server-side API routes for database queries
- Separation of database logic and presentation components