"""Uninus Calendar Service Scheduler integration."""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Any

import voluptuous as vol
from homeassistant.components import frontend
from homeassistant.components.http import StaticPathConfig
from homeassistant.config_entries import ConfigEntry
from homeassistant.const import CONF_DESCRIPTION, CONF_ENTITY_ID
from homeassistant.core import HomeAssistant, ServiceCall, SupportsResponse
from homeassistant.helpers import config_validation as cv
from homeassistant.helpers import device_registry as dr
from homeassistant.helpers.event import async_call_later
from homeassistant.helpers.typing import ConfigType

from .const import (
    CALENDAR_PATCH_URL,
    CARD_FILENAME,
    CARD_RESOURCE_URL,
    CONF_ALLOWED_SERVICES,
    DEFAULT_ALLOWED_SERVICES,
    DOMAIN,
    SERVICE_CREATE_EVENT_ACTION,
    SERVICE_DELETE_EVENT_ACTION,
    SERVICE_RELOAD_ACTIONS,
    SERVICE_TEST_ACTION,
)
from .models import (
    ScheduledAction,
    is_service_allowed,
    normalize_allowed_services,
    split_service,
)
from .scheduler import CalendarServiceScheduler
from .storage import ActionStore

_LOGGER = logging.getLogger(__name__)

PLATFORMS = ["sensor"]

CREATE_SCHEMA = vol.Schema(
    {
        vol.Required("calendar_entity"): cv.entity_id,
        vol.Required("summary"): cv.string,
        vol.Required("start"): cv.string,
        vol.Optional("end"): cv.string,
        vol.Required("service"): cv.string,
        vol.Optional("target", default={}): dict,
        vol.Optional("data", default={}): dict,
        vol.Optional(CONF_DESCRIPTION): cv.string,
    }
)

DELETE_SCHEMA = vol.Schema({vol.Required("action_id"): cv.string})
TEST_SCHEMA = vol.Schema({vol.Required("action_id"): cv.string})


def _entry_data(hass: HomeAssistant) -> dict[str, Any]:
    return hass.data.setdefault(DOMAIN, {})


async def async_setup(hass: HomeAssistant, config: ConfigType) -> bool:
    """Set up YAML-less integration services."""
    return True


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Set up from config entry."""
    await hass.http.async_register_static_paths(
        [
            StaticPathConfig(
                f"/{DOMAIN}", str(Path(__file__).parent / "www"), cache_headers=False
            )
        ]
    )
    await _ensure_lovelace_resource(hass)
    frontend.add_extra_js_url(hass, CALENDAR_PATCH_URL)
    for delay in (10, 30):
        async_call_later(
            hass,
            delay,
            lambda _now: hass.async_create_task(_ensure_lovelace_resource(hass)),
        )
    store = ActionStore(hass)
    await store.async_load()
    scheduler = CalendarServiceScheduler(hass, store)
    data = _entry_data(hass)
    data["entry"] = entry
    data["store"] = store
    data["scheduler"] = scheduler

    await scheduler.async_reload()
    _register_services_once(hass)
    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)
    return True


async def _ensure_lovelace_resource(hass: HomeAssistant) -> None:
    """Add or update the Lovelace resource for the bundled custom card.

    HACS installs the integration files, but it does not automatically add
    Lovelace resources for a card bundled inside an integration repository.
    Registering it here makes remove/reinstall and version upgrades resilient:
    when the integration loads, the dashboard resource points at the currently
    bundled card with a cache-busting version query string.
    """
    try:
        from homeassistant.components.lovelace.const import LOVELACE_DATA
    except ImportError:
        _LOGGER.debug("Lovelace is not available; skipping card resource setup")
        return

    lovelace_data = hass.data.get(LOVELACE_DATA)
    resources = getattr(lovelace_data, "resources", None) if lovelace_data else None
    if resources is None or not hasattr(resources, "async_items"):
        _LOGGER.debug("Lovelace resources are not ready; skipping card resource setup")
        return
    if not hasattr(resources, "async_create_item"):
        _LOGGER.info(
            "Lovelace resources appear to be YAML-managed; add %s manually as a module resource",
            CARD_RESOURCE_URL,
        )
        return

    try:
        items = list(resources.async_items() or [])
        existing = next(
            (
                item
                for item in items
                if str(item.get("url", "")).split("?", 1)[0]
                == f"/{DOMAIN}/{CARD_FILENAME}"
            ),
            None,
        )
        if existing:
            if existing.get("url") != CARD_RESOURCE_URL or existing.get("type") != "module":
                await resources.async_update_item(
                    existing["id"], {"url": CARD_RESOURCE_URL, "res_type": "module"}
                )
            return
        await resources.async_create_item(
            {"url": CARD_RESOURCE_URL, "res_type": "module"}
        )
    except Exception:  # pragma: no cover - HA internals vary by version
        _LOGGER.exception("Failed to ensure Lovelace resource for bundled card")


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Unload config entry."""
    data = _entry_data(hass)
    scheduler: CalendarServiceScheduler | None = data.get("scheduler")
    if scheduler is not None:
        scheduler.async_cancel_all()
    frontend.remove_extra_js_url(hass, CALENDAR_PATCH_URL)
    unload_ok = await hass.config_entries.async_unload_platforms(entry, PLATFORMS)
    if unload_ok:
        data.clear()
    return unload_ok


def _options(hass: HomeAssistant) -> dict[str, Any]:
    entry = _entry_data(hass).get("entry")
    if entry is None:
        return {}
    return dict(entry.options or entry.data or {})


def _allowed_services(hass: HomeAssistant) -> list[str]:
    return normalize_allowed_services(
        _options(hass).get(CONF_ALLOWED_SERVICES, DEFAULT_ALLOWED_SERVICES)
    )


def _register_services_once(hass: HomeAssistant) -> None:
    """Register domain services once per HA runtime."""
    data = _entry_data(hass)
    if data.get("services_registered"):
        return

    async def _create(call: ServiceCall) -> dict[str, Any]:
        scheduler: CalendarServiceScheduler = _entry_data(hass)["scheduler"]
        store: ActionStore = _entry_data(hass)["store"]
        service = call.data["service"]
        allowed = _allowed_services(hass)
        if allowed and not is_service_allowed(service, allowed):
            raise vol.Invalid(
                f"Service {service!r} is not allowed. Configure the integration allowlist first."
            )
        split_service(service)
        action = ScheduledAction.create(
            calendar_entity=call.data["calendar_entity"],
            summary=call.data["summary"],
            start=call.data["start"],
            end=call.data.get("end"),
            service=service,
            target=dict(call.data.get("target") or {}),
            data=dict(call.data.get("data") or {}),
            description=call.data.get(CONF_DESCRIPTION),
        )
        await hass.services.async_call(
            "calendar",
            "create_event",
            {
                "summary": action.summary,
                "start_date_time": action.start,
                "end_date_time": action.end or action.start,
                CONF_DESCRIPTION: action.calendar_description(),
            },
            target={CONF_ENTITY_ID: action.calendar_entity},
            blocking=True,
        )
        await store.async_add(action)
        scheduler.async_schedule(action)
        return {"action_id": action.action_id, "action": action.as_dict()}

    async def _delete(call: ServiceCall) -> dict[str, Any]:
        scheduler: CalendarServiceScheduler = _entry_data(hass)["scheduler"]
        store: ActionStore = _entry_data(hass)["store"]
        action_id = call.data["action_id"]
        scheduler.async_cancel(action_id)
        action = await store.async_remove(action_id)
        return {"removed": action is not None, "action_id": action_id}

    async def _test(call: ServiceCall) -> dict[str, Any]:
        scheduler: CalendarServiceScheduler = _entry_data(hass)["scheduler"]
        action_id = call.data["action_id"]
        await scheduler.async_run_action(action_id)
        action = _entry_data(hass)["store"].actions.get(action_id)
        return {"action_id": action_id, "action": action.as_dict() if action else None}

    async def _reload(call: ServiceCall) -> dict[str, Any]:
        scheduler: CalendarServiceScheduler = _entry_data(hass)["scheduler"]
        await scheduler.async_reload()
        return scheduler.state_attributes()

    hass.services.async_register(
        DOMAIN,
        SERVICE_CREATE_EVENT_ACTION,
        _create,
        schema=CREATE_SCHEMA,
        supports_response=SupportsResponse.ONLY,
    )
    hass.services.async_register(
        DOMAIN,
        SERVICE_DELETE_EVENT_ACTION,
        _delete,
        schema=DELETE_SCHEMA,
        supports_response=SupportsResponse.ONLY,
    )
    hass.services.async_register(
        DOMAIN,
        SERVICE_TEST_ACTION,
        _test,
        schema=TEST_SCHEMA,
        supports_response=SupportsResponse.ONLY,
    )
    hass.services.async_register(
        DOMAIN,
        SERVICE_RELOAD_ACTIONS,
        _reload,
        supports_response=SupportsResponse.ONLY,
    )
    data["services_registered"] = True


async def async_remove_config_entry_device(
    hass: HomeAssistant, entry: ConfigEntry, device_entry: dr.DeviceEntry
) -> bool:
    """Allow removing devices from UI."""
    return True
