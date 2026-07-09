"""Status sensor for Uninus Calendar Service Scheduler."""

from __future__ import annotations

from homeassistant.components.sensor import SensorEntity
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import CALLBACK_TYPE, HomeAssistant, callback
from homeassistant.helpers.entity_platform import AddEntitiesCallback

from .agri_storage import AgriStore
from .const import DOMAIN, NAME
from .scheduler import CalendarServiceScheduler


async def async_setup_entry(
    hass: HomeAssistant, entry: ConfigEntry, async_add_entities: AddEntitiesCallback
) -> None:
    """Set up the status sensor."""
    scheduler: CalendarServiceScheduler = hass.data[DOMAIN]["scheduler"]
    agri_store: AgriStore | None = hass.data[DOMAIN].get("agri_store")
    async_add_entities([SchedulerStatusSensor(scheduler, agri_store)], True)


class SchedulerStatusSensor(SensorEntity):
    """Expose scheduler status and actions."""

    _attr_has_entity_name = True
    _attr_name = "Status"
    _attr_icon = "mdi:calendar-clock"

    def __init__(self, scheduler: CalendarServiceScheduler, agri_store: AgriStore | None = None) -> None:
        self._scheduler = scheduler
        self._agri_store = agri_store
        self._attr_unique_id = f"{DOMAIN}_status"
        self._attr_device_info = {
            "identifiers": {(DOMAIN, DOMAIN)},
            "name": NAME,
            "manufacturer": "Uninus",
        }
        self._unsub: CALLBACK_TYPE | None = None

    @property
    def native_value(self) -> int:
        return len(self._scheduler.store.actions)

    @property
    def extra_state_attributes(self) -> dict:
        attrs = self._scheduler.state_attributes()
        if self._agri_store is not None:
            attrs["traceability"] = self._agri_store.records.state_attributes()
            attrs["traceability_records"] = self._agri_store.records.as_dict()
        return attrs

    async def async_added_to_hass(self) -> None:
        self._unsub = self._scheduler.add_listener(self._schedule_update)

    async def async_will_remove_from_hass(self) -> None:
        if self._unsub is not None:
            self._unsub()
            self._unsub = None

    @callback
    def _schedule_update(self) -> None:
        self.async_write_ha_state()
