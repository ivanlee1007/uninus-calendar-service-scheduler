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
        """Cancel one action's start/end timers."""
        removed = False
        for key in list(self._unsub_by_action):
            if key == action_id or key.startswith(f"{action_id}:"):
                self._unsub_by_action.pop(key)()
                removed = True
        if removed:
            self._notify()

    def _schedule_phase(self, action: ScheduledAction, phase: str, when_text: str | None) -> None:
        if not when_text:
            return
        service = action.service if phase == "start" else action.end_service
        if not service:
            return
        when = dt_util.parse_datetime(when_text)
        if when is None:
            _LOGGER.warning("Action %s has invalid %s time %s", action.action_id, phase, when_text)
            return
        when_utc = dt_util.as_utc(when)
        if when_utc <= dt_util.utcnow():
            return

        async def _run(now: datetime) -> None:
            await self.async_run_action(action.action_id, phase=phase, triggered_at=now)

        self._unsub_by_action[f"{action.action_id}:{phase}"] = async_track_point_in_utc_time(
            self.hass, _run, when_utc
        )

    def async_schedule(self, action: ScheduledAction) -> None:
        """Schedule an action's configured start/end service actions if future."""
        self.async_cancel(action.action_id)
        if not action.enabled:
            return
        self._schedule_phase(action, "start", action.start)
        self._schedule_phase(action, "end", action.end)
        self._notify()

    async def async_run_action(
        self, action_id: str, *, phase: str = "start", triggered_at: datetime | None = None
    ) -> None:
        """Execute a stored start or end action immediately."""
        action = self.store.actions.get(action_id)
        if action is None:
            _LOGGER.warning("Scheduled action %s no longer exists", action_id)
            return
        if not action.enabled:
            _LOGGER.info("Scheduled action %s is disabled", action_id)
            return
        service = action.service if phase == "start" else action.end_service
        target = action.target if phase == "start" else action.end_target
        data = action.data if phase == "start" else action.end_data
        if not service:
            _LOGGER.info("Scheduled action %s has no %s service", action_id, phase)
            return
        domain, service_name = split_service(service)
        when = triggered_at or dt_util.utcnow()
        try:
            await self.hass.services.async_call(
                domain,
                service_name,
                service_data=data,
                target=target,
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
        self._unsub_by_action.pop(f"{action_id}:{phase}", None)
        self._notify()

    def state_attributes(self) -> dict[str, Any]:
        """Attributes exposed by the status sensor."""
        actions = [action.as_dict() for action in self.store.actions.values()]
        future = []
        now = dt_util.utcnow()
        for action in self.store.actions.values():
            for phase, when_text, service in (
                ("start", action.start, action.service),
                ("end", action.end, action.end_service),
            ):
                when = dt_util.parse_datetime(when_text) if when_text and service else None
                if when is not None and dt_util.as_utc(when) > now and action.enabled:
                    future.append((when_text, phase, action))
        future.sort(key=lambda item: item[0])
        next_action = None
        if future:
            next_action = future[0][2].as_dict() | {"next_phase": future[0][1], "next_time": future[0][0]}
        return {
            "scheduled_action_count": len(actions),
            "active_timer_count": len(self._unsub_by_action),
            "next_action": next_action,
            "actions": actions,
        }
