# Uninus Calendar Service Scheduler

A Home Assistant custom integration and Lovelace card for creating **Local Calendar events that execute Home Assistant services when the event starts**.

> Recommended pattern: schedule `script.turn_on` or `scene.turn_on` from calendar events, and keep complex automation logic inside Home Assistant scripts/scenes.

## Status

Initial MVP implementation.

Implemented:

- Custom integration with Config Flow
- Allowlist for executable services
- `create_event_action` service that creates a Local Calendar event and stores the bound Home Assistant action
- Restart-safe storage under Home Assistant `.storage`
- Runtime timers rebuilt from stored future actions
- Manual `test_action`, `delete_event_action`, and `reload_actions` services
- Status sensor exposing stored actions and the next action
- Lovelace card for creating scheduled actions
- GitHub Actions CI for Python syntax, tests, JSON validation, and frontend syntax

Current MVP limitation:

- `delete_event_action` removes the stored service action but does not delete the Local Calendar event yet.
- Calendar event edits made directly in the native Local Calendar UI are not yet reconciled back into stored actions.
- Repeating calendar events are not yet expanded into multiple action runs.

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
