# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

FLA (花苗流程 / Flower Seedling Automation) is a POC for tracking flower seedling workflows via barcode scanning. The UI is in Chinese. It's a mobile-first single-page app for recording split, merge, placement, status, and transfer events on plant cultures (培养皿/dishes containing 花苗/plants).

## Commands

- `npm run dev` — Vite dev server on port 5173
- `npm run dev:server` — Express API server on port 8787 (with --watch)
- `npm test` — Run all tests (vitest)
- `npx vitest run src/lib/domain.test.js` — Run a single test file
- `npm run build` — Production build via Vite
- `npm run migrate` — Migrate data.json to SQLite (one-time)
- `npm run backup` — Backup SQLite database to backups/ directory

Both dev servers must run simultaneously for local development. The frontend defaults to API at `protocol//hostname:8787` (overridable via `?api=` query param).

## Architecture

### Two-tier: static frontend + Express API

**Frontend** (`index.html`, `login.html`, `src/`):
- Vanilla JS, no framework. Vite for dev/build only.
- `src/main.js` — All UI rendering and tab switching (split/merge, place, status, transfer). Renders HTML strings into `#content`, wires event listeners imperatively.
- `src/lib/api.js` — HTTP client wrapping `fetch` with Bearer token auth. All API calls go through `createApi()`.
- `src/lib/domain.js` — Client-side domain store using in-memory Maps (used in client-side tests, not in the main app flow which uses the server).
- `src/lib/merge.js`, `src/lib/history.js` — Small pure utilities for merge-queue normalization and event filtering.
- `src/lib/mockData.js` — Seed data factory (`makeInitialState()`) for client-side domain tests.

**Server** (`server/`):
- Express + SQLite (better-sqlite3, WAL mode). Data stored in `server/data.sqlite`.
- `server/app.js` — Route definitions. Single entry point for events: `POST /api/events` with `type` field dispatching to domain functions. GET routes query SQLite directly.
- `server/domain.js` — Server-side domain logic (`createDomain(db)`). Uses SQL prepared statements. Split/merge/updateStatus/transfer wrapped in SQLite transactions.
- `server/auth.js` — SQLite-backed session auth (`createAuth(db)`). Sessions persisted in `sessions` table. `POST /api/login` accepts any username/password (POC), returns a UUID token.
- `server/db.js` — SQLite setup via better-sqlite3. Schema: plants, dishes, events, locations, trays, sessions. `createDb({ memory })` is synchronous. `parseEvent()` deserializes JSON columns.
- `server/seed.js` — Seed data (locations, trays, plants, dishes, meta).
- `server/migrate-json-to-sqlite.js` — One-time migration from data.json to SQLite.
- `server/backup.js` — Backup SQLite database to backups/ with timestamp.

### Key domain concepts

- **plant** (花苗): Has lifetime ID (`P-N`), type, stage, status, bound to one dish.
- **dish** (培养皿): Has ID (`D-N`), references one plant. IDs never reuse.
- **event**: Immutable record of an action (split/merge/place/status/transfer). Has `inputIds`, `outputIds`, `meta`, `actorId`, `ts`.
- **tray** (盘子): Physical container for multiple dishes. Referenced in events but not a first-class collection.
- **location** (位置): Rack/shelf/position for placement events.

### Auth flow

1. `login.html` posts to `/api/login`, stores token in `localStorage` (`fla_token`, `fla_user`).
2. `index.html` (main app) reads token from localStorage, redirects to login if missing.
3. All API calls pass token as `Bearer` header. 401 responses trigger redirect to login.

## Testing

Tests use **vitest** + **supertest** for server integration tests.

- Client-side unit tests: `src/lib/domain.test.js`, `src/__tests__/merge.test.js`, `src/__tests__/history.test.js`
- Client-server integration: `src/__tests__/api.test.js` (starts real server on random port)
- Server tests: `server/__tests__/events.test.js`, `server/__tests__/meta.test.js`, `server/__tests__/auth.test.js`, `server/__tests__/db.test.js`, `server/__tests__/domain.test.js`

Server tests use `createDb({ memory: true })` for isolation. Each test creates its own app instance and logs in to get a token.

## Important patterns

- **Dual domain implementations**: `src/lib/domain.js` (client, Map-based) and `server/domain.js` (server, SQL-based) implement similar logic differently. The server version is authoritative.
- **Event-sourced writes**: All mutations go through `POST /api/events` with a `type` discriminator. The server dispatches to the appropriate domain function which persists data in SQLite transactions.
- **No build step for server**: The server runs directly with Node (`node server/index.js`). Only the frontend uses Vite.
