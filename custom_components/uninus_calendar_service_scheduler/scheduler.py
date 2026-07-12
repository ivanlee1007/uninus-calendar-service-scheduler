"""Runtime scheduler for stored service actions."""

from __future__ import annotations

import logging
from collections.abc import Callable
from datetime import datetime
from typing import Any

from homeassistant.core import CALLBACK_TYPE, HomeAssistant
from homeassistant.helpers.event import async_track_point_in_utc_time
from homeassistant.util import dt as dt_util

from .agri import EvidenceCaptureCoordinator
from .agri_storage import AgriStore
from .models import ScheduledAction, split_service
from .recurrence import next_phase_time
from .storage import ActionStore

_LOGGER = logging.getLogger(__name__)


class CalendarServiceScheduler:
    """Schedule and execute Home Assistant service actions."""

    def __init__(
        self, hass: HomeAssistant, store: ActionStore, agri_store: AgriStore | None = None
    ) -> None:
        self.hass = hass
        self.store = store
        self.agri_store = agri_store
        self._unsub_by_action: dict[str, CALLBACK_TYPE] = {}
        self._listeners: list[Callable[[], None]] = []

    async def _capture_linked_action_phase(
        self,
        action: ScheduledAction,
        *,
        phase: str,
        service: str,
        target: dict[str, Any],
        success: bool,
        error: str,
        when: datetime,
    ) -> None:
        if self.agri_store is None or not action.operation_id:
            return
        coordinator = EvidenceCaptureCoordinator(
            self.agri_store.records, self.hass.states.get
        )
        captured_at = dt_util.as_local(when).isoformat()
        session = next(
            (
                item
                for item in self.agri_store.records.evidence_sessions.values()
                if item.operation_id == action.operation_id and item.status == "capturing"
            ),
            None,
        )
        if phase == "start" or session is None:
            session = coordinator.start(action.operation_id, captured_at=captured_at)
        if service:
            coordinator.record_service_call(
                session.session_id,
                phase=phase,
                service=service,
                target=target,
                success=success,
                error=error,
                called_at=captured_at,
            )
        if phase == "end":
            coordinator.finish(session.session_id, captured_at=captured_at)
        await self.agri_store.async_save()

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

    def _schedule_phase(self, action: ScheduledAction, phase: str) -> None:
        service = action.service if phase == "start" else action.end_service
        if not service and not action.operation_id:
            return
        when = next_phase_time(action, phase, dt_util.utcnow())
        if when is None:
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
        self._schedule_phase(action, "start")
        self._schedule_phase(action, "end")
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
        when = triggered_at or dt_util.utcnow()
        if not service:
            await self._capture_linked_action_phase(
                action,
                phase=phase,
                service="",
                target=target,
                success=True,
                error="",
                when=when,
            )
            self._unsub_by_action.pop(f"{action.action_id}:{phase}", None)
            self._notify()
            return
        domain, service_name = split_service(service)
        if phase == "start" and self.agri_store is not None and action.operation_id:
            coordinator = EvidenceCaptureCoordinator(
                self.agri_store.records, self.hass.states.get
            )
            coordinator.start(
                action.operation_id,
                captured_at=dt_util.as_local(when).isoformat(),
            )
            await self.agri_store.async_save()
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
            await self._capture_linked_action_phase(
                action,
                phase=phase,
                service=service,
                target=target,
                success=False,
                error=str(err),
                when=when,
            )
            self._notify()
            return
        await self.store.async_update_result(
            action_id,
            last_run=dt_util.as_local(when).isoformat(),
            last_result="ok",
        )
        await self._capture_linked_action_phase(
            action,
            phase=phase,
            service=service,
            target=target,
            success=True,
            error="",
            when=when,
        )
        self._unsub_by_action.pop(f"{action_id}:{phase}", None)
        if action.rrule:
            self.async_schedule(action)
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
                when = next_phase_time(action, phase, now) if when_text and service else None
                if when is not None and dt_util.as_utc(when) > now and action.enabled:
                    future.append((dt_util.as_local(when).isoformat(), phase, action))
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
