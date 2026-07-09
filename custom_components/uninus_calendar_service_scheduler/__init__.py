"""Uninus Calendar Service Scheduler integration."""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Any

import voluptuous as vol
from homeassistant.components import frontend
from homeassistant.components.http import StaticPathConfig
from homeassistant.components.panel_custom import async_register_panel
from homeassistant.config_entries import ConfigEntry
from homeassistant.const import CONF_DESCRIPTION, CONF_ENTITY_ID
from homeassistant.core import HomeAssistant, ServiceCall, SupportsResponse
from homeassistant.helpers import config_validation as cv
from homeassistant.helpers import device_registry as dr
from homeassistant.helpers.event import async_call_later
from homeassistant.helpers.typing import ConfigType

from .agri import AgriOperation, CropCycle, Farm, Plot, _stable_hash
from .agri_storage import AgriStore
from .const import (
    CARD_FILENAME,
    CARD_RESOURCE_URL,
    CONF_ALLOWED_SERVICES,
    DEFAULT_ALLOWED_SERVICES,
    DEFAULT_BLOCKED_SERVICES,
    DOMAIN,
    PANEL_URL,
    PANEL_URL_PATH,
    PANEL_WEBCOMPONENT,
    SERVICE_CREATE_AGRI_OPERATION,
    SERVICE_CREATE_CROP_CYCLE,
    SERVICE_CREATE_EVENT_ACTION,
    SERVICE_CREATE_FARM,
    SERVICE_CREATE_PLOT,
    SERVICE_DELETE_EVENT_ACTION,
    SERVICE_EXPORT_TRACEABILITY_RECORDS,
    SERVICE_RELOAD_ACTIONS,
    SERVICE_TEST_ACTION,
    SERVICE_UPDATE_AGRI_OPERATION,
    SERVICE_UPDATE_CROP_CYCLE,
    SERVICE_UPDATE_EVENT_ACTION,
    SERVICE_UPDATE_FARM,
    SERVICE_UPDATE_PLOT,
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
        vol.Optional("all_day", default=False): cv.boolean,
        vol.Optional("location"): cv.string,
        vol.Optional("rrule"): cv.string,
        vol.Optional("service", default=""): cv.string,
        vol.Optional("target", default={}): dict,
        vol.Optional("data", default={}): dict,
        vol.Optional("end_service", default=""): cv.string,
        vol.Optional("end_target", default={}): dict,
        vol.Optional("end_data", default={}): dict,
        vol.Optional(CONF_DESCRIPTION): cv.string,
    }
)

DELETE_SCHEMA = vol.Schema({vol.Required("action_id"): cv.string})
TEST_SCHEMA = vol.Schema({vol.Required("action_id"): cv.string})
UPDATE_SCHEMA = CREATE_SCHEMA.extend(
    {
        vol.Required("action_id"): cv.string,
        vol.Optional("calendar_event_uid"): cv.string,
    }
)

CREATE_FARM_SCHEMA = vol.Schema(
    {
        vol.Required("name"): cv.string,
        vol.Optional("operator", default=""): cv.string,
        vol.Optional("address", default=""): cv.string,
        vol.Optional("phone", default=""): cv.string,
    }
)
CREATE_PLOT_SCHEMA = vol.Schema(
    {
        vol.Required("farm_id"): cv.string,
        vol.Required("name"): cv.string,
        vol.Optional("product", default=""): cv.string,
        vol.Optional("tgap_category", default=""): cv.string,
        vol.Optional("area", default=""): cv.string,
        vol.Optional("location", default=""): cv.string,
    }
)
CREATE_CROP_CYCLE_SCHEMA = vol.Schema(
    {
        vol.Required("plot_id"): cv.string,
        vol.Required("product"): cv.string,
        vol.Optional("variety", default=""): cv.string,
        vol.Optional("lot_number", default=""): cv.string,
        vol.Optional("trace_code", default=""): cv.string,
        vol.Optional("start_date", default=""): cv.string,
        vol.Optional("expected_harvest_date", default=""): cv.string,
    }
)
UPDATE_FARM_SCHEMA = CREATE_FARM_SCHEMA.extend(
    {
        vol.Required("farm_id"): cv.string,
        vol.Optional("status"): cv.string,
        vol.Optional("archived_at"): cv.string,
    }
)
UPDATE_PLOT_SCHEMA = CREATE_PLOT_SCHEMA.extend(
    {
        vol.Required("plot_id"): cv.string,
        vol.Optional("status"): cv.string,
        vol.Optional("archived_at"): cv.string,
    }
)
UPDATE_CROP_CYCLE_SCHEMA = CREATE_CROP_CYCLE_SCHEMA.extend(
    {
        vol.Required("cycle_id"): cv.string,
        vol.Optional("actual_harvest_date", default=""): cv.string,
        vol.Optional("status"): cv.string,
        vol.Optional("archived_at"): cv.string,
    }
)
CREATE_AGRI_OPERATION_SCHEMA = vol.Schema(
    {
        vol.Required("cycle_id"): cv.string,
        vol.Required("operation_type"): cv.string,
        vol.Optional("scheduled_start", default=""): cv.string,
        vol.Optional("actual_start", default=""): cv.string,
        vol.Optional("operator", default=""): cv.string,
        vol.Optional("material_name", default=""): cv.string,
        vol.Optional("quantity"): object,
        vol.Optional("unit", default=""): cv.string,
        vol.Optional("sensor_snapshot", default={}): dict,
        vol.Optional("sensor_entities", default=[]): list,
        vol.Optional("notes", default=""): cv.string,
        vol.Optional("calendar_entity", default=""): cv.string,
        vol.Optional("calendar_event_uid", default=""): cv.string,
        vol.Optional("status"): cv.string,
    }
)

UPDATE_AGRI_OPERATION_SCHEMA = CREATE_AGRI_OPERATION_SCHEMA.extend(
    {
        vol.Required("operation_id"): cv.string,
    }
)


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
    await _register_panel(hass)
    for delay in (10, 30):
        async_call_later(
            hass,
            delay,
            lambda _now: hass.async_create_task(_ensure_lovelace_resource(hass)),
        )
    store = ActionStore(hass)
    await store.async_load()
    agri_store = AgriStore(hass)
    await agri_store.async_load()
    scheduler = CalendarServiceScheduler(hass, store)
    data = _entry_data(hass)
    data["entry"] = entry
    data["store"] = store
    data["agri_store"] = agri_store
    data["scheduler"] = scheduler

    await scheduler.async_reload()
    _register_services_once(hass)
    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)
    return True


async def _register_panel(hass: HomeAssistant) -> None:
    """Register the standalone scheduler calendar panel."""
    await async_register_panel(
        hass,
        frontend_url_path=PANEL_URL_PATH,
        webcomponent_name=PANEL_WEBCOMPONENT,
        module_url=PANEL_URL,
        sidebar_title="Uninus Calendar",
        sidebar_icon="mdi:calendar-clock",
        config={"title": "Uninus Calendar Service Scheduler"},
        require_admin=False,
        config_panel_domain=DOMAIN,
    )


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
    frontend.async_remove_panel(hass, PANEL_URL_PATH)
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



def _blocked_services(hass: HomeAssistant) -> list[str]:
    """Return high-risk service denylist patterns."""
    return DEFAULT_BLOCKED_SERVICES


def _validate_service_pair(hass: HomeAssistant, service: str) -> None:
    """Validate service syntax and block known high-risk services.

    The scheduler allows all Home Assistant services except the explicit
    high-risk denylist. The legacy allowed_services option remains for backward
    compatibility and is not enforced.
    """
    if not service:
        return
    split_service(service)
    if is_service_allowed(service, _blocked_services(hass)):
        raise vol.Invalid(
            f"Service {service!r} is blocked because it is considered high risk."
        )

def _register_services_once(hass: HomeAssistant) -> None:
    """Register domain services once per HA runtime."""
    data = _entry_data(hass)
    if data.get("services_registered"):
        return

    async def _create(call: ServiceCall) -> dict[str, Any]:
        scheduler: CalendarServiceScheduler = _entry_data(hass)["scheduler"]
        store: ActionStore = _entry_data(hass)["store"]
        service = call.data.get("service") or ""
        end_service = call.data.get("end_service") or ""
        if not service and not end_service:
            raise vol.Invalid("Configure at least one start or end service action.")
        _validate_service_pair(hass, service)
        _validate_service_pair(hass, end_service)
        action = ScheduledAction.create(
            calendar_entity=call.data["calendar_entity"],
            summary=call.data["summary"],
            start=call.data["start"],
            end=call.data.get("end"),
            service=service,
            target=dict(call.data.get("target") or {}),
            data=dict(call.data.get("data") or {}),
            end_service=end_service,
            end_target=dict(call.data.get("end_target") or {}),
            end_data=dict(call.data.get("end_data") or {}),
            description=call.data.get(CONF_DESCRIPTION),
            location=call.data.get("location"),
            rrule=call.data.get("rrule"),
            all_day=bool(call.data.get("all_day")),
        )
        event_data = {
            "summary": action.summary,
            CONF_DESCRIPTION: action.calendar_description(),
        }
        if action.all_day:
            event_data["start_date"] = action.start[:10]
            event_data["end_date"] = (action.end or action.start)[:10]
        else:
            event_data["start_date_time"] = action.start
            event_data["end_date_time"] = action.end or action.start
        if action.location:
            event_data["location"] = action.location
        if action.rrule:
            event_data["rrule"] = action.rrule
        await hass.services.async_call(
            "calendar",
            "create_event",
            event_data,
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

    async def _update(call: ServiceCall) -> dict[str, Any]:
        scheduler: CalendarServiceScheduler = _entry_data(hass)["scheduler"]
        store: ActionStore = _entry_data(hass)["store"]
        action_id = call.data["action_id"]
        action = store.actions.get(action_id)
        service = call.data.get("service") or ""
        end_service = call.data.get("end_service") or ""
        if not service and not end_service:
            raise vol.Invalid("Configure at least one start or end service action.")
        _validate_service_pair(hass, service)
        _validate_service_pair(hass, end_service)
        if action is None:
            action = ScheduledAction.create(
                calendar_entity=call.data["calendar_entity"],
                summary=call.data["summary"],
                start=call.data["start"],
                end=call.data.get("end"),
                service=service,
                target=dict(call.data.get("target") or {}),
                data=dict(call.data.get("data") or {}),
                end_service=end_service,
                end_target=dict(call.data.get("end_target") or {}),
                end_data=dict(call.data.get("end_data") or {}),
                description=call.data.get(CONF_DESCRIPTION),
                location=call.data.get("location"),
                rrule=call.data.get("rrule"),
                all_day=bool(call.data.get("all_day")),
            )
            action.action_id = action_id
        action.calendar_entity = call.data["calendar_entity"]
        action.summary = call.data["summary"]
        action.start = call.data["start"]
        action.end = call.data.get("end")
        action.service = service
        action.target = dict(call.data.get("target") or {})
        action.data = dict(call.data.get("data") or {})
        action.end_service = end_service
        action.end_target = dict(call.data.get("end_target") or {})
        action.end_data = dict(call.data.get("end_data") or {})
        action.description = call.data.get(CONF_DESCRIPTION)
        action.location = call.data.get("location")
        action.rrule = call.data.get("rrule")
        action.all_day = bool(call.data.get("all_day"))
        action.calendar_event_uid = call.data.get("calendar_event_uid")
        action.last_run = None
        action.last_result = None
        await store.async_add(action)
        scheduler.async_schedule(action)
        return {"action_id": action_id, "action": action.as_dict()}

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

    def _sensor_snapshot(call: ServiceCall) -> dict[str, Any]:
        snapshot = dict(call.data.get("sensor_snapshot") or {})
        for entity_id in call.data.get("sensor_entities") or []:
            state = hass.states.get(str(entity_id))
            if state is None:
                snapshot[str(entity_id)] = {"state": None, "available": False}
                continue
            snapshot[str(entity_id)] = {
                "state": state.state,
                "unit": state.attributes.get("unit_of_measurement"),
                "friendly_name": state.attributes.get("friendly_name"),
                "available": True,
            }
        return snapshot

    def _notify_agri_changed() -> None:
        scheduler: CalendarServiceScheduler | None = _entry_data(hass).get("scheduler")
        if scheduler is not None:
            scheduler._notify()  # noqa: SLF001 - reuse existing status sensor listener path

    async def _create_farm(call: ServiceCall) -> dict[str, Any]:
        agri_store: AgriStore = _entry_data(hass)["agri_store"]
        farm = Farm.create(
            name=call.data["name"],
            operator=call.data.get("operator") or "",
            address=call.data.get("address") or "",
            phone=call.data.get("phone") or "",
        )
        await agri_store.async_add_farm(farm)
        _notify_agri_changed()
        return {"farm_id": farm.farm_id, "farm": farm.as_dict()}

    async def _create_plot(call: ServiceCall) -> dict[str, Any]:
        agri_store: AgriStore = _entry_data(hass)["agri_store"]
        farm_id = call.data["farm_id"]
        if farm_id not in agri_store.records.farms:
            raise vol.Invalid(f"Unknown farm_id {farm_id!r}")
        plot = Plot.create(
            farm_id=farm_id,
            name=call.data["name"],
            product=call.data.get("product") or "",
            tgap_category=call.data.get("tgap_category") or "",
            area=call.data.get("area") or "",
            location=call.data.get("location") or "",
        )
        await agri_store.async_add_plot(plot)
        _notify_agri_changed()
        return {"plot_id": plot.plot_id, "plot": plot.as_dict()}

    async def _create_crop_cycle(call: ServiceCall) -> dict[str, Any]:
        agri_store: AgriStore = _entry_data(hass)["agri_store"]
        plot_id = call.data["plot_id"]
        if plot_id not in agri_store.records.plots:
            raise vol.Invalid(f"Unknown plot_id {plot_id!r}")
        cycle = CropCycle.create(
            plot_id=plot_id,
            product=call.data["product"],
            variety=call.data.get("variety") or "",
            lot_number=call.data.get("lot_number") or "",
            trace_code=call.data.get("trace_code") or "",
            start_date=call.data.get("start_date") or "",
            expected_harvest_date=call.data.get("expected_harvest_date") or "",
        )
        await agri_store.async_add_cycle(cycle)
        _notify_agri_changed()
        return {"cycle_id": cycle.cycle_id, "cycle": cycle.as_dict()}

    async def _update_farm(call: ServiceCall) -> dict[str, Any]:
        agri_store: AgriStore = _entry_data(hass)["agri_store"]
        farm_id = call.data["farm_id"]
        existing = agri_store.records.farms.get(farm_id)
        if existing is None:
            raise vol.Invalid(f"Unknown farm_id {farm_id!r}")
        farm = Farm(
            farm_id=farm_id,
            name=call.data["name"],
            operator=call.data.get("operator") or "",
            address=call.data.get("address") or "",
            phone=call.data.get("phone") or "",
            status=call.data.get("status") or existing.status,
            archived_at=call.data.get("archived_at") or existing.archived_at,
            created_at=existing.created_at,
        )
        await agri_store.async_update_farm(farm)
        _notify_agri_changed()
        return {"farm_id": farm.farm_id, "farm": farm.as_dict()}

    async def _update_plot(call: ServiceCall) -> dict[str, Any]:
        agri_store: AgriStore = _entry_data(hass)["agri_store"]
        plot_id = call.data["plot_id"]
        existing = agri_store.records.plots.get(plot_id)
        if existing is None:
            raise vol.Invalid(f"Unknown plot_id {plot_id!r}")
        farm_id = call.data["farm_id"]
        if farm_id not in agri_store.records.farms:
            raise vol.Invalid(f"Unknown farm_id {farm_id!r}")
        plot = Plot(
            plot_id=plot_id,
            farm_id=farm_id,
            name=call.data["name"],
            product=call.data.get("product") or "",
            tgap_category=call.data.get("tgap_category") or "",
            area=call.data.get("area") or "",
            location=call.data.get("location") or "",
            status=call.data.get("status") or existing.status,
            archived_at=call.data.get("archived_at") or existing.archived_at,
            created_at=existing.created_at,
        )
        await agri_store.async_update_plot(plot)
        _notify_agri_changed()
        return {"plot_id": plot.plot_id, "plot": plot.as_dict()}

    async def _update_crop_cycle(call: ServiceCall) -> dict[str, Any]:
        agri_store: AgriStore = _entry_data(hass)["agri_store"]
        cycle_id = call.data["cycle_id"]
        existing = agri_store.records.cycles.get(cycle_id)
        if existing is None:
            raise vol.Invalid(f"Unknown cycle_id {cycle_id!r}")
        plot_id = call.data["plot_id"]
        if plot_id not in agri_store.records.plots:
            raise vol.Invalid(f"Unknown plot_id {plot_id!r}")
        cycle = CropCycle(
            cycle_id=cycle_id,
            plot_id=plot_id,
            product=call.data["product"],
            variety=call.data.get("variety") or "",
            lot_number=call.data.get("lot_number") or "",
            trace_code=call.data.get("trace_code") or "",
            start_date=call.data.get("start_date") or "",
            expected_harvest_date=call.data.get("expected_harvest_date") or "",
            actual_harvest_date=call.data.get("actual_harvest_date") or existing.actual_harvest_date,
            status=call.data.get("status") or existing.status,
            archived_at=call.data.get("archived_at") or existing.archived_at,
            created_at=existing.created_at,
        )
        await agri_store.async_update_cycle(cycle)
        _notify_agri_changed()
        return {"cycle_id": cycle.cycle_id, "cycle": cycle.as_dict()}

    async def _create_agri_operation(call: ServiceCall) -> dict[str, Any]:
        agri_store: AgriStore = _entry_data(hass)["agri_store"]
        cycle_id = call.data["cycle_id"]
        if cycle_id not in agri_store.records.cycles:
            raise vol.Invalid(f"Unknown cycle_id {cycle_id!r}")
        operation = AgriOperation.create(
            cycle_id=cycle_id,
            operation_type=call.data["operation_type"],
            scheduled_start=call.data.get("scheduled_start") or "",
            actual_start=call.data.get("actual_start") or "",
            operator=call.data.get("operator") or "",
            material_name=call.data.get("material_name") or "",
            quantity=call.data.get("quantity"),
            unit=call.data.get("unit") or "",
            sensor_snapshot=_sensor_snapshot(call),
            notes=call.data.get("notes") or "",
            calendar_entity=call.data.get("calendar_entity") or "",
            calendar_event_uid=call.data.get("calendar_event_uid") or "",
            status=call.data.get("status"),
        )
        await agri_store.async_add_operation(operation)
        _notify_agri_changed()
        return {"operation_id": operation.operation_id, "operation": operation.as_dict()}


    async def _update_agri_operation(call: ServiceCall) -> dict[str, Any]:
        agri_store: AgriStore = _entry_data(hass)["agri_store"]
        operation_id = call.data["operation_id"]
        existing = agri_store.records.operations.get(operation_id)
        if existing is None:
            raise vol.Invalid(f"Unknown operation_id {operation_id!r}")
        cycle_id = call.data["cycle_id"]
        if cycle_id not in agri_store.records.cycles:
            raise vol.Invalid(f"Unknown cycle_id {cycle_id!r}")
        operation = AgriOperation(
            operation_id=operation_id,
            cycle_id=cycle_id,
            operation_type=call.data["operation_type"],
            scheduled_start=call.data.get("scheduled_start") or "",
            actual_start=call.data.get("actual_start") or "",
            operator=call.data.get("operator") or "",
            material_name=call.data.get("material_name") or "",
            quantity=call.data.get("quantity"),
            unit=call.data.get("unit") or "",
            sensor_snapshot=_sensor_snapshot(call),
            notes=call.data.get("notes") or "",
            calendar_entity=call.data.get("calendar_entity") or existing.calendar_entity,
            calendar_event_uid=call.data.get("calendar_event_uid") or existing.calendar_event_uid,
            status=call.data.get("status") or existing.status,
            created_at=existing.created_at,
        )
        operation.record_hash = _stable_hash(operation.as_dict())
        await agri_store.async_add_operation(operation)
        _notify_agri_changed()
        return {"operation_id": operation.operation_id, "operation": operation.as_dict()}

    async def _export_traceability_records(call: ServiceCall) -> dict[str, Any]:
        agri_store: AgriStore = _entry_data(hass)["agri_store"]
        return {
            "rows": agri_store.records.export_operation_rows(),
            "summary": agri_store.records.state_attributes(),
        }

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
        SERVICE_UPDATE_EVENT_ACTION,
        _update,
        schema=UPDATE_SCHEMA,
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
    hass.services.async_register(
        DOMAIN,
        SERVICE_CREATE_FARM,
        _create_farm,
        schema=CREATE_FARM_SCHEMA,
        supports_response=SupportsResponse.ONLY,
    )
    hass.services.async_register(
        DOMAIN,
        SERVICE_UPDATE_FARM,
        _update_farm,
        schema=UPDATE_FARM_SCHEMA,
        supports_response=SupportsResponse.ONLY,
    )
    hass.services.async_register(
        DOMAIN,
        SERVICE_CREATE_PLOT,
        _create_plot,
        schema=CREATE_PLOT_SCHEMA,
        supports_response=SupportsResponse.ONLY,
    )
    hass.services.async_register(
        DOMAIN,
        SERVICE_UPDATE_PLOT,
        _update_plot,
        schema=UPDATE_PLOT_SCHEMA,
        supports_response=SupportsResponse.ONLY,
    )
    hass.services.async_register(
        DOMAIN,
        SERVICE_CREATE_CROP_CYCLE,
        _create_crop_cycle,
        schema=CREATE_CROP_CYCLE_SCHEMA,
        supports_response=SupportsResponse.ONLY,
    )
    hass.services.async_register(
        DOMAIN,
        SERVICE_UPDATE_CROP_CYCLE,
        _update_crop_cycle,
        schema=UPDATE_CROP_CYCLE_SCHEMA,
        supports_response=SupportsResponse.ONLY,
    )
    hass.services.async_register(
        DOMAIN,
        SERVICE_CREATE_AGRI_OPERATION,
        _create_agri_operation,
        schema=CREATE_AGRI_OPERATION_SCHEMA,
        supports_response=SupportsResponse.ONLY,
    )

    hass.services.async_register(
        DOMAIN,
        SERVICE_UPDATE_AGRI_OPERATION,
        _update_agri_operation,
        schema=UPDATE_AGRI_OPERATION_SCHEMA,
        supports_response=SupportsResponse.ONLY,
    )
    hass.services.async_register(
        DOMAIN,
        SERVICE_EXPORT_TRACEABILITY_RECORDS,
        _export_traceability_records,
        supports_response=SupportsResponse.ONLY,
    )
    data["services_registered"] = True


async def async_remove_config_entry_device(
    hass: HomeAssistant, entry: ConfigEntry, device_entry: dr.DeviceEntry
) -> bool:
    """Allow removing devices from UI."""
    return True
