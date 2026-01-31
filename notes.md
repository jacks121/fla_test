# Notes: Flower Seedling Automation Design Input

## Sources

### Source 1: 2026-01-31-flower-seedling-automation-design.md

- Location: docs/plans/2026-01-31-flower-seedling-automation-design.md
- Key points:
  - Speed-first automation via pre-printed 2D labels + location codes.
  - Separate plant_id (lifetime) and dish_id (can change) to support transfers.
  - Core workflows: create/split/merge (no location), batch placement, status updates, transfer.
  - Batch scanning patterns and quick undo are critical for speed and error control.
  - Label lifecycle: non-reuse, inventory management, 2D preferred, pre-print recommended.
  - Minimal data model: plant, dish, event, location, staff.
  - Phased rollout: split/merge + placement first, then status, then scanner/PDA.
  - Open details: label size, short code format, batch scan completion, status enums.

## Synthesized Findings

### Development Plan Implications

- Must define MVP scope that aligns with phase 1 rollout.
- Needs data model + event log design first, then mobile capture flows.
- Requires label generation strategy and inventory tracking.
- Must include transfer workflow as first-class event.
- Must plan for device progression without changing workflows.
- Should include risk mitigation: scan order validation, undo, duplicate detection.

### Backlog Structuring

- Iterations should align to Phase 1-6 milestones from the dev plan.
- Requirements can be grouped by epics: labels/IDs, events/data model, scan flows, reporting, pilot rollout.
- Track dependencies: data model before scan flows; events before reporting; labels before field use.

### POC Constraints (New)

- Use mock data and mock QR codes only.
- Prioritize a demoable workflow over production completeness.
- Keep scope minimal: show scanning flows and event logging with in-memory or simple storage.
- POC should be a single-page app accessible from mobile browsers.
- Use bottom tab navigation with four modes: split/merge, placement, status, transfer.

## Server Backend Notes

- Backend will be a minimal Express app with lowdb JSON storage.
- API surface based on Required APIs in docs/plans/2026-01-31-flower-seedling-automation-poc-impl.md.
- Event-driven writes: split/merge/place/status/transfer.
- Storage: meta (locations/trays/status enum), plants, dishes, events.
