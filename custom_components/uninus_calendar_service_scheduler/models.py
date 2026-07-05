"""Pure data helpers for Uninus Calendar Service Scheduler."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Any
from uuid import uuid4

from .const import ACTION_MARKER


@dataclass(slots=True)
class ScheduledAction:
    """A service action bound to a calendar event."""

    action_id: str
    calendar_entity: str
    summary: str
    start: str
    end: str | None
    service: str
    target: dict[str, Any] = field(default_factory=dict)
    data: dict[str, Any] = field(default_factory=dict)
    description: str | None = None
    location: str | None = None
    rrule: str | None = None
    all_day: bool = False
    enabled: bool = True
    calendar_event_uid: str | None = None
    last_run: str | None = None
    last_result: str | None = None
    created_at: str | None = None

    @classmethod
    def create(
        cls,
        *,
        calendar_entity: str,
        summary: str,
        start: str,
        end: str | None,
        service: str,
        target: dict[str, Any] | None = None,
        data: dict[str, Any] | None = None,
        description: str | None = None,
        location: str | None = None,
        rrule: str | None = None,
        all_day: bool = False,
    ) -> ScheduledAction:
        """Create a new action with a generated id."""
        return cls(
            action_id=uuid4().hex,
            calendar_entity=calendar_entity,
            summary=summary,
            start=start,
            end=end,
            service=service,
            target=target or {},
            data=data or {},
            description=description,
            location=location,
            rrule=rrule,
            all_day=all_day,
            created_at=datetime.now().astimezone().isoformat(),
        )

    @classmethod
    def from_dict(cls, raw: dict[str, Any]) -> ScheduledAction:
        """Load from storage."""
        return cls(
            action_id=str(raw["action_id"]),
            calendar_entity=str(raw["calendar_entity"]),
            summary=str(raw.get("summary") or "Scheduled service action"),
            start=str(raw["start"]),
            end=raw.get("end"),
            service=str(raw["service"]),
            target=dict(raw.get("target") or {}),
            data=dict(raw.get("data") or {}),
            description=raw.get("description"),
            location=raw.get("location"),
            rrule=raw.get("rrule"),
            all_day=bool(raw.get("all_day", False)),
            enabled=bool(raw.get("enabled", True)),
            calendar_event_uid=raw.get("calendar_event_uid"),
            last_run=raw.get("last_run"),
            last_result=raw.get("last_result"),
            created_at=raw.get("created_at"),
        )

    def as_dict(self) -> dict[str, Any]:
        """Serialize for storage and service responses."""
        return {
            "action_id": self.action_id,
            "calendar_entity": self.calendar_entity,
            "summary": self.summary,
            "start": self.start,
            "end": self.end,
            "service": self.service,
            "target": self.target,
            "data": self.data,
            "description": self.description,
            "location": self.location,
            "rrule": self.rrule,
            "all_day": self.all_day,
            "enabled": self.enabled,
            "calendar_event_uid": self.calendar_event_uid,
            "last_run": self.last_run,
            "last_result": self.last_result,
            "created_at": self.created_at,
        }

    def calendar_description(self) -> str:
        """Return the calendar event description with a stable action marker."""
        parts = []
        if self.description:
            parts.append(self.description.rstrip())
        parts.append(f"{ACTION_MARKER}: {self.action_id}")
        parts.append("Created by Uninus Calendar Service Scheduler")
        return "\n\n".join(parts)


def split_service(service: str) -> tuple[str, str]:
    """Split a domain.service string."""
    if "." not in service:
        raise ValueError("service must use domain.service format")
    domain, service_name = service.split(".", 1)
    if not domain or not service_name:
        raise ValueError("service must use domain.service format")
    return domain, service_name


def normalize_allowed_services(raw: list[str] | str | None) -> list[str]:
    """Normalize allowlist input from YAML text or list."""
    if raw is None:
        return []
    if isinstance(raw, str):
        items = [line.strip() for line in raw.replace(",", "\n").splitlines()]
    else:
        items = [str(item).strip() for item in raw]
    return [item for item in items if item]


def is_service_allowed(service: str, allowed_services: list[str]) -> bool:
    """Return whether a service is allowed. domain.* wildcard is supported."""
    service = service.strip()
    for allowed in allowed_services:
        allowed = allowed.strip()
        if allowed == service:
            return True
        if allowed.endswith(".*") and service.startswith(f"{allowed[:-2]}."):
            return True
    return False
