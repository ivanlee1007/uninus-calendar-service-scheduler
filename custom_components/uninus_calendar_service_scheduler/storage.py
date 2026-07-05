"""Persistent storage for scheduled service actions."""

from __future__ import annotations

from typing import Any

from homeassistant.core import HomeAssistant
from homeassistant.helpers.storage import Store

from .const import STORAGE_KEY, STORAGE_VERSION
from .models import ScheduledAction


class ActionStore:
    """Small wrapper around Home Assistant storage."""

    def __init__(self, hass: HomeAssistant) -> None:
        self._store: Store[dict[str, Any]] = Store(hass, STORAGE_VERSION, STORAGE_KEY)
        self.actions: dict[str, ScheduledAction] = {}

    async def async_load(self) -> None:
        """Load all scheduled actions."""
        raw = await self._store.async_load() or {}
        actions = raw.get("actions", {})
        self.actions = {
            action_id: ScheduledAction.from_dict(action)
            for action_id, action in actions.items()
        }

    async def async_save(self) -> None:
        """Persist all scheduled actions."""
        await self._store.async_save(
            {"actions": {key: action.as_dict() for key, action in self.actions.items()}}
        )

    async def async_add(self, action: ScheduledAction) -> None:
        """Add or replace an action."""
        self.actions[action.action_id] = action
        await self.async_save()

    async def async_remove(self, action_id: str) -> ScheduledAction | None:
        """Remove an action from storage."""
        action = self.actions.pop(action_id, None)
        if action is not None:
            await self.async_save()
        return action

    async def async_update_result(
        self, action_id: str, *, last_run: str, last_result: str
    ) -> None:
        """Update last run metadata."""
        action = self.actions.get(action_id)
        if action is None:
            return
        action.last_run = last_run
        action.last_result = last_result
        await self.async_save()
