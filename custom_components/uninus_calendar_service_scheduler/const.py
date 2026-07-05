"""Constants for Uninus Calendar Service Scheduler."""

from __future__ import annotations

DOMAIN = "uninus_calendar_service_scheduler"
NAME = "Uninus Calendar Service Scheduler"
VERSION = "0.3.7"

CARD_FILENAME = "uninus-calendar-service-scheduler-card.js"
CARD_RESOURCE_URL = f"/{DOMAIN}/{CARD_FILENAME}?v={VERSION}"
PANEL_FILENAME = "uninus-calendar-service-scheduler-panel.js"
PANEL_URL = f"/{DOMAIN}/{PANEL_FILENAME}?v={VERSION}"
PANEL_URL_PATH = "uninus-calendar"
PANEL_WEBCOMPONENT = "uninus-calendar-service-scheduler-panel"

CONF_ALLOWED_SERVICES = "allowed_services"
CONF_DEFAULT_CALENDAR = "default_calendar"
CONF_SCAN_DAYS_AHEAD = "scan_days_ahead"

DEFAULT_ALLOWED_SERVICES = [
    "light.turn_on",
    "light.turn_off",
    "switch.turn_on",
    "switch.turn_off",
    "scene.turn_on",
    "script.turn_on",
    "automation.trigger",
]
DEFAULT_SCAN_DAYS_AHEAD = 30

SERVICE_CREATE_EVENT_ACTION = "create_event_action"
SERVICE_DELETE_EVENT_ACTION = "delete_event_action"
SERVICE_TEST_ACTION = "test_action"
SERVICE_RELOAD_ACTIONS = "reload_actions"

STORAGE_KEY = f"{DOMAIN}.actions"
STORAGE_VERSION = 1

ACTION_MARKER = "HA_SERVICE_ACTION_ID"
ATTR_ACTIONS = "actions"
ATTR_NEXT_ACTION = "next_action"
