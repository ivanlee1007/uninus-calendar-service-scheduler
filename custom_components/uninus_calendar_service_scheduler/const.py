"""Constants for Uninus Calendar Service Scheduler."""

from __future__ import annotations

DOMAIN = "uninus_calendar_service_scheduler"
NAME = "Uninus Calendar Service Scheduler"
VERSION = "0.4.54"

CARD_FILENAME = "uninus-calendar-service-scheduler-card.js"
CARD_RESOURCE_URL = f"/{DOMAIN}/{CARD_FILENAME}?v={VERSION}"
PANEL_FILENAME = "uninus-calendar-service-scheduler-panel.js"
PANEL_URL = f"/{DOMAIN}/{PANEL_FILENAME}?v={VERSION}"
PANEL_URL_PATH = "uninus-calendar"
PANEL_WEBCOMPONENT = "uninus-calendar-service-scheduler-panel"

CONF_ALLOWED_SERVICES = "allowed_services"
CONF_DEFAULT_CALENDAR = "default_calendar"
CONF_SCAN_DAYS_AHEAD = "scan_days_ahead"

# Legacy allowlist kept for backward compatibility. Empty means unrestricted.
DEFAULT_ALLOWED_SERVICES = []
# Denylist for high-risk services. Everything not listed here is schedulable.
DEFAULT_BLOCKED_SERVICES = [
    "homeassistant.restart",
    "homeassistant.stop",
    "homeassistant.reload_all",
    "homeassistant.set_location",
    "hassio.host_reboot",
    "hassio.host_shutdown",
    "hassio.restore_full",
    "hassio.restore_partial",
    "hassio.app_stop",
    "hassio.app_restart",
    "hassio.addon_stop",
    "hassio.addon_restart",
    "update.install",
    "recorder.purge",
    "recorder.purge_entities",
    "recorder.disable",
]
DEFAULT_SCAN_DAYS_AHEAD = 30

SERVICE_CREATE_EVENT_ACTION = "create_event_action"
SERVICE_UPDATE_EVENT_ACTION = "update_event_action"
SERVICE_DELETE_EVENT_ACTION = "delete_event_action"
SERVICE_TEST_ACTION = "test_action"
SERVICE_RELOAD_ACTIONS = "reload_actions"
SERVICE_CREATE_FARM = "create_farm"
SERVICE_UPDATE_FARM = "update_farm"
SERVICE_CREATE_PLOT = "create_plot"
SERVICE_UPDATE_PLOT = "update_plot"
SERVICE_CREATE_CROP_CYCLE = "create_crop_cycle"
SERVICE_UPDATE_CROP_CYCLE = "update_crop_cycle"
SERVICE_CREATE_AGRI_OPERATION = "create_agri_operation"
SERVICE_UPDATE_AGRI_OPERATION = "update_agri_operation"
SERVICE_CREATE_EVIDENCE = "create_evidence"
SERVICE_EXPORT_TRACEABILITY_PACKAGE = "export_traceability_package"
SERVICE_EXPORT_TRACEABILITY_RECORDS = "export_traceability_records"

STORAGE_KEY = f"{DOMAIN}.actions"
STORAGE_VERSION = 1
AGRI_STORAGE_KEY = f"{DOMAIN}.agri_records"
AGRI_STORAGE_VERSION = 1

ACTION_MARKER = "HA_SERVICE_ACTION_ID"
ATTR_ACTIONS = "actions"
ATTR_NEXT_ACTION = "next_action"
