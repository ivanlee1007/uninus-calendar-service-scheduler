"""Runtime scheduler for stored service actions."""

from __future__ import annotations

import logging
from collections.abc import Callable
from datetime import datetime
from typing import Any

from homeassistant.core import CALLBACK_TYPE, HomeAssistant
from homeassistant.helpers.event import async_track_point_in_utc_time
from homeassistant.util import dt as dt_util

from .models import ScheduledAction, split_service
from .storage import ActionStore

_LOGGER = logging.getLogger(__name__)


class CalendarServiceScheduler:
    """Schedule and execute Home Assistant service actions."""

    def __init__(self, hass: HomeAssistant, store: ActionStore) -> None:
        self.hass = hass
        self.store = store
        self._unsub_by_action: dict[str, CALLBACK_TYPE] = {}
        self._listeners: list[Callable[[], None]] = []

    def add_listener(self, listener: Callable[[], None]) -> Callable[[], None]:
        """Subscribe to scheduler changes."""
        self._listeners.append(listener)

        def _remove() -> None:
            if listener in self._listeners:
                self._listeners.remove(listener)

        return _remove

    def _notify(self) -> None:
        for listener in list(self._listeners):
            listener()

    async def async_reload(self) -> None:
        """Reload all future schedules from storage."""
        self.async_cancel_all()
        for action in self.store.actions.values():
            self.async_schedule(action)
        self._notify()

    def async_cancel_all(self) -> None:
        """Cancel every registered timer."""
        for unsub in self._unsub_by_action.values():
            unsub()
        self._unsub_by_action.clear()

    def async_cancel(self, action_id: str) -> None:
        """Cancel one action timer."""
        unsub = self._unsub_by_action.pop(action_id, None)
        if unsub is not None:
            unsub()
            self._notify()

    def async_schedule(self, action: ScheduledAction) -> None:
        """Schedule an action if it is enabled and in the future."""
        self.async_cancel(action.action_id)
        if not action.enabled:
            return
        when = dt_util.parse_datetime(action.start)
        if when is None:
            _LOGGER.warning("Action %s has invalid start time %s", action.action_id, action.start)
            return
        when_utc = dt_util.as_utc(when)
        if when_utc <= dt_util.utcnow():
            return

        async def _run(now: datetime) -> None:
            await self.async_run_action(action.action_id, triggered_at=now)

        self._unsub_by_action[action.action_id] = async_track_point_in_utc_time(
            self.hass, _run, when_utc
        )
        self._notify()

    async def async_run_action(
        self, action_id: str, *, triggered_at: datetime | None = None
    ) -> None:
        """Execute a stored action immediately."""
        action = self.store.actions.get(action_id)
        if action is None:
            _LOGGER.warning("Scheduled action %s no longer exists", action_id)
            return
        if not action.enabled:
            _LOGGER.info("Scheduled action %s is disabled", action_id)
            return
        domain, service_name = split_service(action.service)
        when = triggered_at or dt_util.utcnow()
        try:
            await self.hass.services.async_call(
                domain,
                service_name,
                service_data=action.data,
                target=action.target,
                blocking=False,
                context=None,
            )
        except Exception as err:  # noqa: BLE001 - keep failure visible in HA logs
            _LOGGER.exception("Failed to run scheduled action %s", action_id)
            await self.store.async_update_result(
                action_id,
                last_run=dt_util.as_local(when).isoformat(),
                last_result=f"error: {err}",
            )
            self._notify()
            return
        await self.store.async_update_result(
            action_id,
            last_run=dt_util.as_local(when).isoformat(),
            last_result="ok",
        )
        self._unsub_by_action.pop(action_id, None)
        self._notify()

    def state_attributes(self) -> dict[str, Any]:
        """Attributes exposed by the status sensor."""
        actions = [action.as_dict() for action in self.store.actions.values()]
        future = []
        now = dt_util.utcnow()
        for action in self.store.actions.values():
            start = dt_util.parse_datetime(action.start)
            if start is not None and dt_util.as_utc(start) > now and action.enabled:
                future.append(action)
        future.sort(key=lambda item: item.start)
        return {
            "scheduled_action_count": len(actions),
            "active_timer_count": len(self._unsub_by_action),
            "next_action": future[0].as_dict() if future else None,
            "actions": actions,
        }
