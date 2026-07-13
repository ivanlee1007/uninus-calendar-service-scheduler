# Uninus Calendar Service Scheduler

A Home Assistant custom integration and Lovelace card for creating **Local Calendar events that execute Home Assistant services when the event starts**.

> Recommended pattern: schedule `script.turn_on` or `scene.turn_on` from calendar events, and keep complex automation logic inside Home Assistant scripts/scenes.

## Status

MVP implementation with service scheduling and agricultural traceability governance workflows.

Implemented:

- Custom integration with Config Flow
- Allowlist for executable services
- `create_event_action` service that creates a Local Calendar event and stores the bound Home Assistant action
- Restart-safe storage under Home Assistant `.storage`
- Runtime timers rebuilt from stored future actions
- Manual `test_action`, `delete_event_action`, and `reload_actions` services
- Status sensor exposing stored actions and the next action
- Home Assistant panel for Calendar event CRUD, service scheduling, and agricultural traceability
- Agricultural traceability workbench for farms, plots, crop cycles, operations, evidence, export, and consistency repair
- Lovelace card fallback for creating scheduled actions
- GitHub Actions CI for Python syntax, tests, JSON validation, and frontend syntax

## 產銷履歷資料治理 MVP

The `/uninus-calendar` panel includes a traceability workbench designed to keep Calendar events, stored `AgriOperation` records, crop cycles, and evidence understandable and repairable from the UI.

### 產銷履歷專業工作區

The traceability workbench is a cycle-centered, full-screen workspace rather than a generic settings modal:

- Persistent context bar shows the current farm, plot, crop cycle, lot/trace code, lifecycle status, and export readiness.
- Grouped navigation separates production records, master data, and data governance.
- Operations use a compact master-detail table with semantic status/evidence/Calendar chips and a sticky save action bar.
- Evidence uses a compact searchable table or gallery with a right-side preview/edit detail panel, explicit create mode, and technical metadata disclosure.
- Farm, plot, and crop-cycle master data uses type tabs, a hierarchy breadcrumb, compact result tables, and one adaptive detail form.
- Consistency findings appear as a severity-aware issue inbox.
- Export follows a scope → integrity check → package delivery flow.
- Technical identifiers remain available under progressive disclosure instead of dominating daily workflows.

### 大量資料搜尋與顯示

Traceability workbench lists are capped for long-running farms with many records:

- 作業管理 defaults to a recent-date view and paginates operation results with 25/50/100 rows per page.
- 作業管理 includes a date-range filter and warns users to narrow searches when many records match.
- Evidence counts are aggregated once per render instead of scanning all evidence for every operation row.
- 佐證資料管理 paginates evidence results with 25/50/100 rows per page.
- 資料管理 caps farm, plot, and crop-cycle result lists and prompts users to narrow search/selection when results exceed the visible limit.

For very large deployments, metadata can later be moved behind indexed backend search, but the MVP UI avoids rendering thousands of DOM rows at once.

### 農務作業管理

Use **產銷履歷 → 作業管理** to inspect and maintain agricultural operation records.

The tab supports:

- Operation list with search, crop-cycle filter, and status filter.
- Per-operation Calendar linkage status.
- Per-operation evidence count, so delete blockers are visible.
- Editing cycle, operation type, actual time, operator, material/water source, quantity/unit, status, Calendar entity, Calendar event UID, sensor entities, and notes.
- `儲存作業` for updates.
- `封存作業`, which marks the operation as `skipped` instead of hard-deleting traceability history.

### 佐證資料管理

Use **產銷履歷 → 佐證** to manage evidence records attached to operations.

The tab supports:

- Evidence list with search and operation filter.
- Selecting existing evidence into the editor.
- Creating, editing, and deleting evidence records.
- Editing evidence type, title, source entity, URI/file reference, and JSON content.
- Inline **佐證預覽** so users can see JSON content before saving.

### AGRI Calendar event 刪除策略

When deleting a recurring Calendar event, the panel uses a two-step confirmation:

1. Choose the Calendar scope: **僅此一次**, **此次及所有未來行程**, **指定日期範圍**, or **整個重複系列**.
2. For AGRI events, choose the traceability strategy:
   - **只調整 Calendar，保留農務作業紀錄** — changes Calendar occurrences but leaves the shared operation for traceability history.
   - **同時封存受影響的農務作業** — marks the operation as `skipped` and clears Calendar linkage; available only for a non-recurring event or the entire recurring series.

For a middle date range, the panel truncates the original Calendar/action series before the range and creates a continuation series after the range. Partial deletion never archives the shared operation, preventing retained occurrences from pointing to an archived record. The confirmation shows the affected dates and the number of currently loaded occurrences before applying the change.

### 一致性掃描

Use **產銷履歷 → 一致性掃描** to review repairable data-governance issues:

- Stored operations pointing to missing Calendar events.
- Calendar AGRI events whose stored operation no longer exists.
- Duplicate operation IDs across Calendar events.
- Operations pointing to missing crop cycles.
- Evidence records pointing to missing operations.

MVP repair buttons include:

- **清除 missing Calendar linkage** for operations whose referenced Calendar event is gone.
- **刪除 orphan 佐證** for evidence records whose operation no longer exists.

### 安全刪除與封存

Traceability data favors reversible lifecycle changes over hard delete:

- Use **封存** / `skipped` for operation records that should remain auditable.
- Use **安全刪除** only for master data without references.
- If a delete is blocked, use 作業管理, 佐證資料管理, and 一致性掃描 to find the linked records first.

## Installation

### HACS custom repository

1. Add this repository as a HACS custom repository with category `Integration`.
2. Install **Uninus Calendar Service Scheduler**.
3. Restart Home Assistant.
4. Go to **Settings → Devices & services → Add integration**.
5. Search for **Uninus Calendar Service Scheduler**.

### Manual

Copy this folder into Home Assistant:

```text
custom_components/uninus_calendar_service_scheduler
```

Then restart Home Assistant and add the integration from the UI.

## Uninus Calendar panel

The integration registers its own Home Assistant panel at:

```text
/uninus-calendar
```

This panel is separate from Home Assistant's native `/calendar` page, so removing the integration removes the panel without monkey-patching the native Calendar UI. It provides a month-grid calendar view plus a service-aware event creation dialog.

The dialog supports the main native event fields plus service scheduling fields:

- Calendar
- Summary
- Location
- All day
- Start / End
- Recurrence RRULE text
- Description
- Home Assistant service
- Home Assistant native `ha-service-control` action editor when available, with service/entity selector fallback
- Explicit target entity_id field retained and merged into the scheduled service target
- Target entity_id uses Home Assistant native `ha-entity-picker` when available, with selector fallback
- Service data JSON

Creating an item calls `uninus_calendar_service_scheduler.create_event_action`, which creates the Local Calendar event and stores the bound service action.

## Lovelace card fallback

The integration also bundles a standalone Lovelace card for dashboards. The card resource is auto-registered when the integration loads. If your Lovelace resources are YAML-managed, add it manually:

```yaml
url: /uninus_calendar_service_scheduler/uninus-calendar-service-scheduler-card.js
type: module
```

Then add a card:

```yaml
type: custom:uninus-calendar-service-scheduler-card
calendar_entity: calendar.local_calendar
```

## Integration services

### `uninus_calendar_service_scheduler.create_event_action`

Creates a Local Calendar event and binds it to a Home Assistant service call.

```yaml
service: uninus_calendar_service_scheduler.create_event_action
data:
  calendar_entity: calendar.local_calendar
  summary: Night mode
  start: "2026-07-05T22:00:00+08:00"
  end: "2026-07-05T22:05:00+08:00"
  service: script.turn_on
  target:
    entity_id: script.night_mode
  data: {}
  description: Turn on night mode from calendar
```

The Local Calendar event description includes a marker like:

```text
HA_SERVICE_ACTION_ID: <action_id>
Created by Uninus Calendar Service Scheduler
```

The full executable action is stored in Home Assistant storage instead of being embedded entirely in the calendar description.

### `uninus_calendar_service_scheduler.test_action`

Immediately runs a stored action:

```yaml
service: uninus_calendar_service_scheduler.test_action
data:
  action_id: "<action_id>"
```

### `uninus_calendar_service_scheduler.delete_event_action`

Deletes the stored action and cancels its timer:

```yaml
service: uninus_calendar_service_scheduler.delete_event_action
data:
  action_id: "<action_id>"
```

### `uninus_calendar_service_scheduler.reload_actions`

Rebuilds timers from stored actions.

## Security model

The integration can execute Home Assistant services, so it uses an allowlist.

Default allowed services:

```text
light.turn_on
light.turn_off
switch.turn_on
switch.turn_off
scene.turn_on
script.turn_on
automation.trigger
```

You can edit this in the integration options. `domain.*` wildcards are supported, for example:

```text
script.*
scene.turn_on
light.*
```

Avoid allowing high-risk domains such as `homeassistant.*`, `hassio.*`, `shell_command.*`, or broad `*`-style policies.

## Development

```bash
python -m pip install -r requirements-dev.txt
python -m compileall custom_components tests
ruff check custom_components tests
pytest -q
node --check custom_components/uninus_calendar_service_scheduler/www/uninus-calendar-service-scheduler-card.js
```

## Roadmap

- Reconcile Local Calendar event edits/deletions back into stored actions
- Support deleting the linked Local Calendar event when deleting an action
- Support recurring events
- Add visual editor for existing actions
- Add service field schema rendering in the Lovelace card
- Add import/migration from calendar description metadata
