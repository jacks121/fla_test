# Flower Seedling Server Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a minimal backend (Express + lowdb) that serves meta data and records events for the current POC flows.

**Architecture:** Express app with a lowdb JSON store. A small domain layer processes events (split/merge/place/status/transfer). API handlers validate input, call domain functions, write to db, and return results. Tests use vitest + supertest with in-memory db.

**Tech Stack:** Node.js (ESM), Express, lowdb, Vitest, Supertest.

---

### Task 1: Add server dependencies and scripts

**Files:**
- Modify: `package.json`

**Step 1: Add dependencies**
- `express`, `lowdb`, `supertest` (dev), `cors` (optional for local dev)

**Step 2: Add scripts**
- `dev:server`: `node --watch server/index.js`
- `start:server`: `node server/index.js`

### Task 2: Define database and seed data

**Files:**
- Create: `server/db.js`, `server/seed.js`

**Step 1: Write failing test**
- `server/__tests__/meta.test.js` verifies `GET /api/meta` returns locations/trays.

**Step 2: Implement DB**
- lowdb JSON with defaults: `meta`, `plants`, `dishes`, `events`.
- seed locations/trays and 10 sample plants/dishes.

### Task 3: Implement API app

**Files:**
- Create: `server/app.js`, `server/index.js`

**Step 1: Write failing test**
- `server/__tests__/events.test.js` for `POST /api/events` split/merge/place.

**Step 2: Implement minimal endpoints**
- `GET /api/meta`
- `POST /api/events`
- `GET /api/events`
- `GET /api/plants`
- `GET /api/dishes`
- `GET /api/health`

### Task 4: Domain logic for events

**Files:**
- Create: `server/domain.js`

**Step 1: Write failing tests**
- split creates N plants/dishes
- merge creates 1 plant/dish
- place records tray+location
- status updates plant
- transfer moves dish

**Step 2: Implement domain helpers**
- id generation, validation, db updates

### Task 5: Wire tests + run

**Step 1:** `npm run test`
**Step 2:** fix failures until green

---

Plan complete and saved to `docs/plans/2026-01-31-flower-seedling-server-impl.md`.
Per your instruction, I will proceed with implementation without further questions.
