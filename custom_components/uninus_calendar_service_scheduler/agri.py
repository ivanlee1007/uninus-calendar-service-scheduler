"""Agricultural traceability helpers for first-version TAFT support."""

from __future__ import annotations

import csv
import hashlib
import io
import json
import re
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any
from uuid import uuid4


def _now() -> str:
    return datetime.now().astimezone().isoformat()


def _new_id(prefix: str) -> str:
    return f"{prefix}_{uuid4().hex}"


def _stable_hash(payload: dict[str, Any]) -> str:
    relevant = {key: value for key, value in payload.items() if key != "record_hash"}
    raw = json.dumps(relevant, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


AGRI_DESCRIPTION_MARKER = "UNINUS_AGRI_OPERATION_JSON"
_AGRI_DESCRIPTION_RE = re.compile(
    rf"\n*<!--\s*{AGRI_DESCRIPTION_MARKER}\s*(.*?)\s*{AGRI_DESCRIPTION_MARKER}\s*-->",
    re.DOTALL,
)


def _payload_with_hash(payload: dict[str, Any]) -> dict[str, Any]:
    next_payload = dict(payload)
    next_payload["record_hash"] = _stable_hash(next_payload)
    return next_payload


def verify_agri_payload_hash(payload: dict[str, Any]) -> bool:
    """Return whether an embedded agri JSON payload still matches record_hash."""

    record_hash = str(payload.get("record_hash") or "")
    return bool(record_hash) and record_hash == _stable_hash(dict(payload))


def compose_agri_description(
    *,
    human_notes: str = "",
    payload: dict[str, Any],
    created_at: str | None = None,
    updated_at: str | None = None,
) -> str:
    """Compose editable human notes plus hidden system-managed agri JSON."""

    now = _now()
    next_payload = {
        "version": 1,
        **dict(payload),
        "created_at": created_at or payload.get("created_at") or now,
        "updated_at": updated_at or now,
    }
    next_payload = _payload_with_hash(next_payload)
    raw = json.dumps(next_payload, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    parts = []
    if human_notes.strip():
        parts.append(human_notes.strip())
    parts.append(f"<!-- {AGRI_DESCRIPTION_MARKER}\n{raw}\n{AGRI_DESCRIPTION_MARKER} -->")
    return "\n\n".join(parts)


def extract_agri_description(description: str) -> tuple[str, dict[str, Any], bool]:
    """Extract human notes, agri payload, and hash validity from description."""

    raw_description = str(description or "")
    match = _AGRI_DESCRIPTION_RE.search(raw_description)
    if not match:
        return raw_description.strip(), {}, False
    human_notes = _AGRI_DESCRIPTION_RE.sub("", raw_description).strip()
    try:
        payload = json.loads(match.group(1).strip())
    except json.JSONDecodeError:
        return human_notes, {}, False
    if not isinstance(payload, dict):
        return human_notes, {}, False
    return human_notes, payload, verify_agri_payload_hash(payload)


def _event_time_value(value: Any) -> str:
    if isinstance(value, dict):
        return str(value.get("dateTime") or value.get("date") or "")
    return str(value or "")


def calendar_events_to_traceability_rows(events: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Convert Calendar events containing UNINUS_AGRI_OPERATION_JSON to export rows."""

    rows: list[dict[str, Any]] = []
    for event in events:
        notes, payload, hash_valid = extract_agri_description(str(event.get("description") or ""))
        if not payload:
            continue
        row = {
            "source": "calendar_event",
            "calendar_entity": str(event.get("__calendarEntity") or event.get("calendar_entity") or ""),
            "calendar_event_uid": str(event.get("uid") or ""),
            "summary": str(event.get("summary") or ""),
            "notes": notes,
            "hash_valid": hash_valid,
            "version": payload.get("version"),
            "cycle_id": str(payload.get("cycle_id") or ""),
            "operation_id": str(payload.get("operation_id") or ""),
            "operation_type": str(payload.get("operation_type") or ""),
            "actual_start": str(payload.get("actual_start") or _event_time_value(event.get("start"))),
            "operator": str(payload.get("operator") or ""),
            "material_name": str(payload.get("material_name") or ""),
            "quantity": payload.get("quantity"),
            "unit": str(payload.get("unit") or ""),
            "sensor_entities": list(payload.get("sensor_entities") or []),
            "created_at": str(payload.get("created_at") or ""),
            "updated_at": str(payload.get("updated_at") or ""),
            "record_hash": str(payload.get("record_hash") or ""),
        }
        rows.append(row)
    return sorted(rows, key=lambda item: str(item.get("actual_start") or ""))


def _one_hour_later_iso(iso_value: str) -> str:
    if not iso_value:
        return ""
    parsed = datetime.fromisoformat(iso_value.replace("Z", "+00:00"))
    return (parsed.timestamp() + 3600) and datetime.fromtimestamp(
        parsed.timestamp() + 3600, tz=parsed.tzinfo
    ).isoformat()


def operation_to_calendar_event_payload(
    operation: AgriOperation,
    *,
    calendar_entity: str,
    summary_prefix: str = "農務",
) -> dict[str, Any]:
    """Convert a legacy stored AgriOperation to a Calendar event payload."""

    start = operation.actual_start or operation.scheduled_start or operation.created_at or _now()
    payload = {
        "type": "agri_operation",
        "operation_id": operation.operation_id,
        "cycle_id": operation.cycle_id,
        "operation_type": operation.operation_type,
        "actual_start": start,
        "operator": operation.operator,
        "material_name": operation.material_name,
        "quantity": operation.quantity,
        "unit": operation.unit,
        "sensor_entities": list((operation.sensor_snapshot or {}).keys()),
        "legacy_record_hash": operation.record_hash,
    }
    return {
        "calendar_entity": calendar_entity,
        "summary": f"{summary_prefix}：{operation.operation_type or '作業'}",
        "dtstart": start,
        "dtend": _one_hour_later_iso(start),
        "description": compose_agri_description(
            human_notes=operation.notes,
            payload=payload,
            created_at=operation.created_at,
        ),
    }


@dataclass(slots=True)
class Farm:
    """A farm/operator participating in traceability records."""

    farm_id: str
    name: str
    operator: str = ""
    address: str = ""
    phone: str = ""
    status: str = "active"
    archived_at: str = ""
    created_at: str | None = None

    @classmethod
    def create(
        cls, *, name: str, operator: str = "", address: str = "", phone: str = ""
    ) -> Farm:
        return cls(
            farm_id=_new_id("farm"),
            name=name,
            operator=operator,
            address=address,
            phone=phone,
            status="active",
            archived_at="",
            created_at=_now(),
        )

    @classmethod
    def from_dict(cls, raw: dict[str, Any]) -> Farm:
        return cls(
            farm_id=str(raw["farm_id"]),
            name=str(raw.get("name") or ""),
            operator=str(raw.get("operator") or ""),
            address=str(raw.get("address") or ""),
            phone=str(raw.get("phone") or ""),
            status=str(raw.get("status") or "active"),
            archived_at=str(raw.get("archived_at") or ""),
            created_at=raw.get("created_at"),
        )

    def as_dict(self) -> dict[str, Any]:
        return {
            "farm_id": self.farm_id,
            "name": self.name,
            "operator": self.operator,
            "address": self.address,
            "phone": self.phone,
            "status": self.status,
            "archived_at": self.archived_at,
            "created_at": self.created_at,
        }


@dataclass(slots=True)
class SensorProfile:
    """A reusable, plot-scoped set of Home Assistant entities."""

    profile_id: str
    plot_id: str
    name: str
    entity_ids: list[str] = field(default_factory=list)
    action_entity_ids: list[str] = field(default_factory=list)
    control_entity_ids: list[str] = field(default_factory=list)
    observation_entities: list[dict[str, Any]] = field(default_factory=list)
    start_actions: list[dict[str, Any]] = field(default_factory=list)
    end_actions: list[dict[str, Any]] = field(default_factory=list)
    evidence_policy: dict[str, Any] = field(default_factory=dict)
    created_at: str | None = None

    @staticmethod
    def normalize_entity_ids(entity_ids: list[str]) -> list[str]:
        values = (str(entity_id or "").strip() for entity_id in entity_ids)
        return list(dict.fromkeys(entity_id for entity_id in values if entity_id))

    @classmethod
    def normalize_observation_entities(
        cls, items: list[dict[str, Any]]
    ) -> list[dict[str, Any]]:
        normalized: list[dict[str, Any]] = []
        seen: set[str] = set()
        for raw in items:
            item = dict(raw or {})
            entity_id = str(item.get("entity_id") or "").strip()
            if not entity_id or entity_id in seen:
                continue
            item["entity_id"] = entity_id
            normalized.append(item)
            seen.add(entity_id)
        return normalized

    @classmethod
    def create(
        cls,
        *,
        plot_id: str,
        name: str,
        entity_ids: list[str],
        action_entity_ids: list[str] | None = None,
        control_entity_ids: list[str] | None = None,
        observation_entities: list[dict[str, Any]] | None = None,
        start_actions: list[dict[str, Any]] | None = None,
        end_actions: list[dict[str, Any]] | None = None,
        evidence_policy: dict[str, Any] | None = None,
    ) -> SensorProfile:
        name = str(name or "").strip()
        normalized = cls.normalize_entity_ids(entity_ids)
        if not name:
            raise ValueError("Sensor Profile 名稱不可空白。")
        if not normalized:
            raise ValueError("Sensor Profile 至少需要一個 entity。")
        return cls(
            profile_id=_new_id("sensor_profile"),
            plot_id=str(plot_id or "").strip(),
            name=name,
            entity_ids=normalized,
            action_entity_ids=cls.normalize_entity_ids(action_entity_ids or []),
            control_entity_ids=cls.normalize_entity_ids(control_entity_ids or []),
            observation_entities=cls.normalize_observation_entities(
                observation_entities or []
            ),
            start_actions=[dict(item) for item in (start_actions or [])],
            end_actions=[dict(item) for item in (end_actions or [])],
            evidence_policy=dict(evidence_policy or {}),
            created_at=_now(),
        )

    @classmethod
    def from_dict(cls, raw: dict[str, Any]) -> SensorProfile:
        return cls(
            profile_id=str(raw["profile_id"]),
            plot_id=str(raw.get("plot_id") or ""),
            name=str(raw.get("name") or ""),
            entity_ids=cls.normalize_entity_ids(list(raw.get("entity_ids") or [])),
            action_entity_ids=cls.normalize_entity_ids(
                list(raw.get("action_entity_ids") or [])
            ),
            control_entity_ids=cls.normalize_entity_ids(
                list(raw.get("control_entity_ids") or [])
            ),
            observation_entities=cls.normalize_observation_entities(
                list(raw.get("observation_entities") or [])
            ),
            start_actions=[dict(item) for item in raw.get("start_actions") or []],
            end_actions=[dict(item) for item in raw.get("end_actions") or []],
            evidence_policy=dict(raw.get("evidence_policy") or {}),
            created_at=raw.get("created_at"),
        )

    def as_dict(self) -> dict[str, Any]:
        return {
            "profile_id": self.profile_id,
            "plot_id": self.plot_id,
            "name": self.name,
            "entity_ids": list(self.entity_ids),
            "action_entity_ids": list(self.action_entity_ids),
            "control_entity_ids": list(self.control_entity_ids),
            "observation_entities": [dict(item) for item in self.observation_entities],
            "start_actions": [dict(item) for item in self.start_actions],
            "end_actions": [dict(item) for item in self.end_actions],
            "evidence_policy": dict(self.evidence_policy),
            "created_at": self.created_at,
        }


def capture_entity_snapshot(
    entity_ids: list[str], state_getter: Any, *, captured_at: str = ""
) -> dict[str, dict[str, Any]]:
    """Capture deterministic raw state metadata for an evidence phase."""
    timestamp = captured_at or _now()
    snapshot: dict[str, dict[str, Any]] = {}
    for entity_id in SensorProfile.normalize_entity_ids(entity_ids):
        state = state_getter(entity_id)
        if state is None:
            snapshot[entity_id] = {
                "state": None,
                "unit": None,
                "friendly_name": None,
                "available": False,
                "last_changed": None,
                "last_updated": None,
                "captured_at": timestamp,
            }
            continue
        attributes = dict(getattr(state, "attributes", {}) or {})
        last_changed = getattr(state, "last_changed", None)
        last_updated = getattr(state, "last_updated", None)
        snapshot[entity_id] = {
            "state": str(getattr(state, "state", "")),
            "unit": attributes.get("unit_of_measurement"),
            "friendly_name": attributes.get("friendly_name"),
            "available": str(getattr(state, "state", "")) not in {"unknown", "unavailable"},
            "last_changed": last_changed.isoformat() if last_changed else None,
            "last_updated": last_updated.isoformat() if last_updated else None,
            "captured_at": timestamp,
        }
    return snapshot


@dataclass(slots=True)
class Plot:
    """A field/plot/facility belonging to a farm."""

    plot_id: str
    farm_id: str
    name: str
    product: str = ""
    tgap_category: str = ""
    area: str = ""
    location: str = ""
    status: str = "active"
    archived_at: str = ""
    created_at: str | None = None

    @classmethod
    def create(
        cls,
        *,
        farm_id: str,
        name: str,
        product: str = "",
        tgap_category: str = "",
        area: str = "",
        location: str = "",
    ) -> Plot:
        return cls(
            plot_id=_new_id("plot"),
            farm_id=farm_id,
            name=name,
            product=product,
            tgap_category=tgap_category,
            area=area,
            location=location,
            status="active",
            archived_at="",
            created_at=_now(),
        )

    @classmethod
    def from_dict(cls, raw: dict[str, Any]) -> Plot:
        return cls(
            plot_id=str(raw["plot_id"]),
            farm_id=str(raw.get("farm_id") or ""),
            name=str(raw.get("name") or ""),
            product=str(raw.get("product") or ""),
            tgap_category=str(raw.get("tgap_category") or ""),
            area=str(raw.get("area") or ""),
            location=str(raw.get("location") or ""),
            status=str(raw.get("status") or "active"),
            archived_at=str(raw.get("archived_at") or ""),
            created_at=raw.get("created_at"),
        )

    def as_dict(self) -> dict[str, Any]:
        return {
            "plot_id": self.plot_id,
            "farm_id": self.farm_id,
            "name": self.name,
            "product": self.product,
            "tgap_category": self.tgap_category,
            "area": self.area,
            "location": self.location,
            "status": self.status,
            "archived_at": self.archived_at,
            "created_at": self.created_at,
        }


@dataclass(slots=True)
class CropCycle:
    """A production cycle/lot for a traceable product."""

    cycle_id: str
    plot_id: str
    product: str
    variety: str = ""
    lot_number: str = ""
    trace_code: str = ""
    start_date: str = ""
    expected_harvest_date: str = ""
    actual_harvest_date: str = ""
    status: str = "active"
    archived_at: str = ""
    created_at: str | None = None

    @classmethod
    def create(
        cls,
        *,
        plot_id: str,
        product: str,
        variety: str = "",
        lot_number: str = "",
        trace_code: str = "",
        start_date: str = "",
        expected_harvest_date: str = "",
    ) -> CropCycle:
        return cls(
            cycle_id=_new_id("cycle"),
            plot_id=plot_id,
            product=product,
            variety=variety,
            lot_number=lot_number,
            trace_code=trace_code,
            start_date=start_date,
            expected_harvest_date=expected_harvest_date,
            created_at=_now(),
        )

    @classmethod
    def from_dict(cls, raw: dict[str, Any]) -> CropCycle:
        return cls(
            cycle_id=str(raw["cycle_id"]),
            plot_id=str(raw.get("plot_id") or ""),
            product=str(raw.get("product") or ""),
            variety=str(raw.get("variety") or ""),
            lot_number=str(raw.get("lot_number") or ""),
            trace_code=str(raw.get("trace_code") or ""),
            start_date=str(raw.get("start_date") or ""),
            expected_harvest_date=str(raw.get("expected_harvest_date") or ""),
            actual_harvest_date=str(raw.get("actual_harvest_date") or ""),
            status=str(raw.get("status") or "active"),
            archived_at=str(raw.get("archived_at") or ""),
            created_at=raw.get("created_at"),
        )

    def as_dict(self) -> dict[str, Any]:
        return {
            "cycle_id": self.cycle_id,
            "plot_id": self.plot_id,
            "product": self.product,
            "variety": self.variety,
            "lot_number": self.lot_number,
            "trace_code": self.trace_code,
            "start_date": self.start_date,
            "expected_harvest_date": self.expected_harvest_date,
            "actual_harvest_date": self.actual_harvest_date,
            "status": self.status,
            "archived_at": self.archived_at,
            "created_at": self.created_at,
        }


@dataclass(slots=True)
class AgriOperation:
    """A planned or completed production operation for TAFT-style records."""

    operation_id: str
    cycle_id: str
    operation_type: str
    scheduled_start: str = ""
    actual_start: str = ""
    operator: str = ""
    material_name: str = ""
    quantity: int | float | str | None = None
    unit: str = ""
    sensor_snapshot: dict[str, Any] = field(default_factory=dict)
    notes: str = ""
    calendar_entity: str = ""
    calendar_event_uid: str = ""
    profile_id: str = ""
    start_actions: list[dict[str, Any]] = field(default_factory=list)
    end_actions: list[dict[str, Any]] = field(default_factory=list)
    status: str = "planned"
    created_at: str | None = None
    record_hash: str = ""

    @classmethod
    def create(
        cls,
        *,
        cycle_id: str,
        operation_type: str,
        scheduled_start: str = "",
        actual_start: str = "",
        operator: str = "",
        material_name: str = "",
        quantity: int | float | str | None = None,
        unit: str = "",
        sensor_snapshot: dict[str, Any] | None = None,
        notes: str = "",
        calendar_entity: str = "",
        calendar_event_uid: str = "",
        profile_id: str = "",
        start_actions: list[dict[str, Any]] | None = None,
        end_actions: list[dict[str, Any]] | None = None,
        status: str | None = None,
    ) -> AgriOperation:
        operation = cls(
            operation_id=_new_id("op"),
            cycle_id=cycle_id,
            operation_type=operation_type,
            scheduled_start=scheduled_start,
            actual_start=actual_start,
            operator=operator,
            material_name=material_name,
            quantity=quantity,
            unit=unit,
            sensor_snapshot=sensor_snapshot or {},
            notes=notes,
            calendar_entity=calendar_entity,
            calendar_event_uid=calendar_event_uid,
            profile_id=str(profile_id or "").strip(),
            start_actions=[dict(item) for item in (start_actions or [])],
            end_actions=[dict(item) for item in (end_actions or [])],
            status=status or ("completed" if actual_start or sensor_snapshot else "planned"),
            created_at=_now(),
        )
        operation.record_hash = _stable_hash(operation.as_dict())
        return operation

    @classmethod
    def from_dict(cls, raw: dict[str, Any]) -> AgriOperation:
        operation = cls(
            operation_id=str(raw["operation_id"]),
            cycle_id=str(raw.get("cycle_id") or ""),
            operation_type=str(raw.get("operation_type") or ""),
            scheduled_start=str(raw.get("scheduled_start") or ""),
            actual_start=str(raw.get("actual_start") or ""),
            operator=str(raw.get("operator") or ""),
            material_name=str(raw.get("material_name") or ""),
            quantity=raw.get("quantity"),
            unit=str(raw.get("unit") or ""),
            sensor_snapshot=dict(raw.get("sensor_snapshot") or {}),
            notes=str(raw.get("notes") or ""),
            calendar_entity=str(raw.get("calendar_entity") or ""),
            calendar_event_uid=str(raw.get("calendar_event_uid") or ""),
            profile_id=str(raw.get("profile_id") or ""),
            start_actions=[dict(item) for item in raw.get("start_actions") or []],
            end_actions=[dict(item) for item in raw.get("end_actions") or []],
            status=str(raw.get("status") or "planned"),
            created_at=raw.get("created_at"),
            record_hash=str(raw.get("record_hash") or ""),
        )
        if not operation.record_hash:
            operation.record_hash = _stable_hash(operation.as_dict())
        return operation

    def as_dict(self) -> dict[str, Any]:
        return {
            "operation_id": self.operation_id,
            "cycle_id": self.cycle_id,
            "operation_type": self.operation_type,
            "scheduled_start": self.scheduled_start,
            "actual_start": self.actual_start,
            "operator": self.operator,
            "material_name": self.material_name,
            "quantity": self.quantity,
            "unit": self.unit,
            "sensor_snapshot": self.sensor_snapshot,
            "notes": self.notes,
            "calendar_entity": self.calendar_entity,
            "calendar_event_uid": self.calendar_event_uid,
            "profile_id": self.profile_id,
            "start_actions": [dict(item) for item in self.start_actions],
            "end_actions": [dict(item) for item in self.end_actions],
            "status": self.status,
            "created_at": self.created_at,
            "record_hash": self.record_hash,
        }


@dataclass(slots=True)
class EvidenceSession:
    """Immutable-source capture window for one agricultural operation run."""

    session_id: str
    operation_id: str
    profile_id: str = ""
    status: str = "capturing"
    started_at: str = ""
    ended_at: str = ""
    start_snapshot: dict[str, Any] = field(default_factory=dict)
    end_snapshot: dict[str, Any] = field(default_factory=dict)
    service_calls: list[dict[str, Any]] = field(default_factory=list)
    state_changes: list[dict[str, Any]] = field(default_factory=list)
    quality: str = "pending"
    raw_evidence_hash: str = ""

    @classmethod
    def start(
        cls,
        *,
        operation_id: str,
        profile_id: str = "",
        start_snapshot: dict[str, Any] | None = None,
        started_at: str = "",
    ) -> EvidenceSession:
        operation_id = str(operation_id or "").strip()
        if not operation_id:
            raise ValueError("Evidence Session 必須關聯農務作業。")
        return cls(
            session_id=_new_id("evidence_session"),
            operation_id=operation_id,
            profile_id=str(profile_id or "").strip(),
            status="capturing",
            started_at=started_at or _now(),
            start_snapshot=dict(start_snapshot or {}),
        )

    def finish(
        self,
        *,
        end_snapshot: dict[str, Any] | None = None,
        service_calls: list[dict[str, Any]] | None = None,
        state_changes: list[dict[str, Any]] | None = None,
        ended_at: str = "",
        quality: str = "complete",
    ) -> None:
        self.end_snapshot = dict(end_snapshot or {})
        self.service_calls = [dict(item) for item in (service_calls or [])]
        self.state_changes = [dict(item) for item in (state_changes or [])]
        self.ended_at = ended_at or _now()
        self.quality = str(quality or "complete")
        self.status = "ready_for_ai"
        self.raw_evidence_hash = _stable_hash(self._hash_payload())

    def _hash_payload(self) -> dict[str, Any]:
        payload = self.as_dict()
        payload.pop("raw_evidence_hash", None)
        return payload

    @classmethod
    def from_dict(cls, raw: dict[str, Any]) -> EvidenceSession:
        return cls(
            session_id=str(raw["session_id"]),
            operation_id=str(raw.get("operation_id") or ""),
            profile_id=str(raw.get("profile_id") or ""),
            status=str(raw.get("status") or "capturing"),
            started_at=str(raw.get("started_at") or ""),
            ended_at=str(raw.get("ended_at") or ""),
            start_snapshot=dict(raw.get("start_snapshot") or {}),
            end_snapshot=dict(raw.get("end_snapshot") or {}),
            service_calls=[dict(item) for item in raw.get("service_calls") or []],
            state_changes=[dict(item) for item in raw.get("state_changes") or []],
            quality=str(raw.get("quality") or "pending"),
            raw_evidence_hash=str(raw.get("raw_evidence_hash") or ""),
        )

    def as_dict(self) -> dict[str, Any]:
        return {
            "session_id": self.session_id,
            "operation_id": self.operation_id,
            "profile_id": self.profile_id,
            "status": self.status,
            "started_at": self.started_at,
            "ended_at": self.ended_at,
            "start_snapshot": self.start_snapshot,
            "end_snapshot": self.end_snapshot,
            "service_calls": [dict(item) for item in self.service_calls],
            "state_changes": [dict(item) for item in self.state_changes],
            "quality": self.quality,
            "raw_evidence_hash": self.raw_evidence_hash,
        }


@dataclass(slots=True)
class EvidenceRecord:
    """Evidence metadata/content referenced by agricultural traceability rows."""

    evidence_id: str
    operation_id: str = ""
    evidence_type: str = "sensor_snapshot"
    title: str = ""
    content: dict[str, Any] = field(default_factory=dict)
    source_entity: str = ""
    uri: str = ""
    content_hash: str = ""
    created_at: str | None = None

    @classmethod
    def create(
        cls,
        *,
        operation_id: str = "",
        evidence_type: str = "sensor_snapshot",
        title: str = "",
        content: dict[str, Any] | None = None,
        source_entity: str = "",
        uri: str = "",
    ) -> EvidenceRecord:
        evidence = cls(
            evidence_id=_new_id("ev"),
            operation_id=operation_id,
            evidence_type=evidence_type,
            title=title,
            content=content or {},
            source_entity=source_entity,
            uri=uri,
            created_at=_now(),
        )
        evidence.content_hash = _stable_hash(evidence.as_dict())
        return evidence

    @classmethod
    def from_dict(cls, raw: dict[str, Any]) -> EvidenceRecord:
        evidence = cls(
            evidence_id=str(raw["evidence_id"]),
            operation_id=str(raw.get("operation_id") or ""),
            evidence_type=str(raw.get("evidence_type") or "sensor_snapshot"),
            title=str(raw.get("title") or ""),
            content=dict(raw.get("content") or {}),
            source_entity=str(raw.get("source_entity") or ""),
            uri=str(raw.get("uri") or ""),
            content_hash=str(raw.get("content_hash") or ""),
            created_at=raw.get("created_at"),
        )
        if not evidence.content_hash:
            evidence.content_hash = _stable_hash(evidence.as_dict())
        return evidence

    def as_dict(self) -> dict[str, Any]:
        return {
            "evidence_id": self.evidence_id,
            "operation_id": self.operation_id,
            "evidence_type": self.evidence_type,
            "title": self.title,
            "content": self.content,
            "source_entity": self.source_entity,
            "uri": self.uri,
            "content_hash": self.content_hash,
            "created_at": self.created_at,
        }


def create_ai_evidence_draft(
    session: EvidenceSession,
    *,
    title: str,
    narrative: str,
    model_identity: str,
    policy_version: str,
    generated_at: str = "",
) -> EvidenceRecord:
    """Create a reviewable AI narrative that references immutable raw evidence."""
    if session.status != "ready_for_ai" or not session.raw_evidence_hash:
        raise ValueError("Evidence Session 尚未封存，不能產生 AI 佐證草稿。")
    clean_title = str(title or "").strip()
    clean_narrative = str(narrative or "").strip()
    clean_model = str(model_identity or "").strip()
    if not clean_title or not clean_narrative or not clean_model:
        raise ValueError("AI 佐證草稿需要 title、narrative 與 model_identity。")
    return EvidenceRecord.create(
        operation_id=session.operation_id,
        evidence_type="ai_summary_draft",
        title=clean_title,
        content={
            "narrative": clean_narrative,
            "model_identity": clean_model,
            "policy_version": str(policy_version or "").strip(),
            "generated_at": generated_at or _now(),
            "source_session_id": session.session_id,
            "source_raw_evidence_hash": session.raw_evidence_hash,
            "review_status": "pending_farmer_review",
            "ai_generated": True,
        },
        source_entity=f"evidence_session:{session.session_id}",
    )


@dataclass(slots=True)
class TraceabilityRecordSet:
    """In-memory view of agricultural traceability records."""

    farms: dict[str, Farm] = field(default_factory=dict)
    plots: dict[str, Plot] = field(default_factory=dict)
    cycles: dict[str, CropCycle] = field(default_factory=dict)
    operations: dict[str, AgriOperation] = field(default_factory=dict)
    evidence: dict[str, EvidenceRecord] = field(default_factory=dict)
    sensor_profiles: dict[str, SensorProfile] = field(default_factory=dict)
    evidence_sessions: dict[str, EvidenceSession] = field(default_factory=dict)

    @classmethod
    def from_dict(cls, raw: dict[str, Any]) -> TraceabilityRecordSet:
        return cls(
            farms={key: Farm.from_dict(value) for key, value in raw.get("farms", {}).items()},
            plots={key: Plot.from_dict(value) for key, value in raw.get("plots", {}).items()},
            cycles={key: CropCycle.from_dict(value) for key, value in raw.get("cycles", {}).items()},
            operations={
                key: AgriOperation.from_dict(value)
                for key, value in raw.get("operations", {}).items()
            },
            evidence={
                key: EvidenceRecord.from_dict(value)
                for key, value in raw.get("evidence", {}).items()
            },
            sensor_profiles={
                key: SensorProfile.from_dict(value)
                for key, value in raw.get("sensor_profiles", {}).items()
            },
            evidence_sessions={
                key: EvidenceSession.from_dict(value)
                for key, value in raw.get("evidence_sessions", {}).items()
            },
        )

    def as_dict(self) -> dict[str, Any]:
        return {
            "farms": {key: item.as_dict() for key, item in self.farms.items()},
            "plots": {key: item.as_dict() for key, item in self.plots.items()},
            "cycles": {key: item.as_dict() for key, item in self.cycles.items()},
            "operations": {key: item.as_dict() for key, item in self.operations.items()},
            "evidence": {key: item.as_dict() for key, item in self.evidence.items()},
            "sensor_profiles": {
                key: item.as_dict() for key, item in self.sensor_profiles.items()
            },
            "evidence_sessions": {
                key: item.as_dict() for key, item in self.evidence_sessions.items()
            },
        }

    @staticmethod
    def _duplicate_text(value: Any) -> str:
        """Normalize human-entered text for duplicate comparisons."""
        return " ".join(str(value or "").split()).casefold()

    @classmethod
    def _duplicate_json(cls, value: Any) -> str:
        """Return deterministic JSON after recursively normalizing strings."""

        def normalize(item: Any) -> Any:
            if isinstance(item, dict):
                return {str(key): normalize(val) for key, val in sorted(item.items())}
            if isinstance(item, list):
                return [normalize(val) for val in item]
            if isinstance(item, str):
                return cls._duplicate_text(item)
            return item

        return json.dumps(normalize(value), ensure_ascii=False, sort_keys=True, separators=(",", ":"))

    def ensure_unique_farm(self, candidate: Farm) -> None:
        def signature(item: Farm) -> tuple[str, ...]:
            return tuple(
                self._duplicate_text(value)
                for value in (item.name, item.operator, item.address, item.phone)
            )
        candidate_signature = signature(candidate)
        if any(
            record_id != candidate.farm_id and signature(item) == candidate_signature
            for record_id, item in self.farms.items()
        ):
            raise ValueError("相同農場資料已存在，請選用既有農場或修改內容。")

    def ensure_unique_plot(self, candidate: Plot) -> None:
        def signature(item: Plot) -> tuple[str, ...]:
            return (
                item.farm_id,
                *(self._duplicate_text(value) for value in (
                    item.name, item.product, item.tgap_category, item.area, item.location
                )),
            )
        candidate_signature = signature(candidate)
        if any(
            record_id != candidate.plot_id and signature(item) == candidate_signature
            for record_id, item in self.plots.items()
        ):
            raise ValueError("相同場區資料已存在，請選用既有場區或修改內容。")

    def ensure_unique_sensor_profile(self, candidate: SensorProfile) -> None:
        def signature(item: SensorProfile) -> tuple[Any, ...]:
            return (
                item.plot_id,
                self._duplicate_text(item.name),
                tuple(sorted(self._duplicate_text(value) for value in item.entity_ids)),
                tuple(sorted(self._duplicate_text(value) for value in item.action_entity_ids)),
                tuple(sorted(self._duplicate_text(value) for value in item.control_entity_ids)),
                tuple(sorted(self._duplicate_json(value) for value in item.observation_entities)),
                self._duplicate_json(item.start_actions),
                self._duplicate_json(item.end_actions),
                self._duplicate_json(item.evidence_policy),
            )

        candidate_signature = signature(candidate)
        if any(
            record_id != candidate.profile_id and signature(item) == candidate_signature
            for record_id, item in self.sensor_profiles.items()
        ):
            raise ValueError("相同 Operation Profile 已存在，請選用既有 Profile 或修改內容。")

    def ensure_unique_operation(self, candidate: AgriOperation) -> None:
        def signature(item: AgriOperation) -> tuple[Any, ...]:
            return (
                item.cycle_id,
                *(self._duplicate_text(value) for value in (
                    item.operation_type, item.scheduled_start, item.actual_start,
                    item.operator, item.material_name, item.quantity, item.unit
                )),
                self._duplicate_json(item.sensor_snapshot),
                self._duplicate_text(item.notes),
                self._duplicate_text(item.calendar_entity),
                self._duplicate_text(item.calendar_event_uid),
                self._duplicate_text(item.profile_id),
                self._duplicate_json(item.start_actions),
                self._duplicate_json(item.end_actions),
                self._duplicate_text(item.status),
            )

        candidate_signature = signature(candidate)
        if any(
            record_id != candidate.operation_id and signature(item) == candidate_signature
            for record_id, item in self.operations.items()
        ):
            raise ValueError("相同農務作業已存在，請選用既有作業或修改內容。")

    def ensure_unique_evidence(self, candidate: EvidenceRecord) -> None:
        def signature(item: EvidenceRecord) -> tuple[str, ...]:
            return (
                item.operation_id,
                self._duplicate_text(item.evidence_type),
                self._duplicate_text(item.title),
                self._duplicate_json(item.content),
                self._duplicate_text(item.source_entity),
                self._duplicate_text(item.uri),
            )
        candidate_signature = signature(candidate)
        if any(
            record_id != candidate.evidence_id and signature(item) == candidate_signature
            for record_id, item in self.evidence.items()
        ):
            raise ValueError("相同佐證資料已存在，請選用既有佐證或修改內容。")

    def export_operation_rows(self) -> list[dict[str, Any]]:
        rows: list[dict[str, Any]] = []
        for operation in sorted(
            self.operations.values(), key=lambda item: item.actual_start or item.scheduled_start
        ):
            cycle = self.cycles.get(operation.cycle_id)
            plot = self.plots.get(cycle.plot_id) if cycle else None
            farm = self.farms.get(plot.farm_id) if plot else None
            rows.append(
                {
                    "operation_id": operation.operation_id,
                    "cycle_id": operation.cycle_id,
                    "farm_name": farm.name if farm else "",
                    "operator": operation.operator or (farm.operator if farm else ""),
                    "plot_name": plot.name if plot else "",
                    "product": cycle.product if cycle else (plot.product if plot else ""),
                    "tgap_category": plot.tgap_category if plot else "",
                    "lot_number": cycle.lot_number if cycle else "",
                    "operation_type": operation.operation_type,
                    "actual_start": operation.actual_start,
                    "material_name": operation.material_name,
                    "quantity": operation.quantity,
                    "unit": operation.unit,
                    "status": operation.status,
                    "record_hash": operation.record_hash,
                }
            )
        return rows

    def missing_link_count(self) -> int:
        count = 0
        for operation in self.operations.values():
            cycle = self.cycles.get(operation.cycle_id)
            plot = self.plots.get(cycle.plot_id) if cycle else None
            farm = self.farms.get(plot.farm_id) if plot else None
            if not cycle or not plot or not farm:
                count += 1
        return count

    def clear(self) -> dict[str, int]:
        """Erase all traceability records and return the pre-clear counts."""
        summary = {
            "farm_count": len(self.farms),
            "plot_count": len(self.plots),
            "cycle_count": len(self.cycles),
            "operation_count": len(self.operations),
            "evidence_count": len(self.evidence),
            "sensor_profile_count": len(self.sensor_profiles),
            "evidence_session_count": len(self.evidence_sessions),
        }
        self.farms.clear()
        self.plots.clear()
        self.cycles.clear()
        self.operations.clear()
        self.evidence.clear()
        self.sensor_profiles.clear()
        self.evidence_sessions.clear()
        return summary

    def prepare_cycle_identity(
        self,
        *,
        plot_id: str,
        product: str,
        variety: str = "",
        start_date: str = "",
        lot_number: str = "",
        trace_code: str = "",
        exclude_cycle_id: str = "",
    ) -> tuple[str, str]:
        """Return non-empty lot/trace identifiers and reject ambiguous duplicates."""
        plot_id = str(plot_id or "").strip()
        product_key = str(product or "").strip().casefold()
        variety_key = str(variety or "").strip().casefold()
        start_key = str(start_date or "").strip()
        lot_number = str(lot_number or "").strip()
        trace_code = str(trace_code or "").strip()
        comparable = [
            cycle for cycle in self.cycles.values()
            if cycle.cycle_id != exclude_cycle_id
        ]
        for cycle in comparable:
            if trace_code and str(cycle.trace_code or "").strip().casefold() == trace_code.casefold():
                raise ValueError("追溯碼已存在，請使用唯一追溯碼。")
            if lot_number and cycle.plot_id == plot_id and str(cycle.lot_number or "").strip().casefold() == lot_number.casefold():
                raise ValueError("同一場區的批號已存在，請使用唯一批號。")
            if (
                cycle.plot_id == plot_id
                and str(cycle.product or "").strip().casefold() == product_key
                and str(cycle.variety or "").strip().casefold() == variety_key
                and str(cycle.start_date or "").strip() == start_key
            ):
                raise ValueError("相同場區、產品、品種與開始日期的生產週期已存在，請改用既有週期或調整批次資訊。")
        date_token = re.sub(r"\D", "", start_key)[:8] or re.sub(r"\D", "", _now())[:8]
        existing_lots = {str(cycle.lot_number or "").strip().casefold() for cycle in comparable if cycle.plot_id == plot_id}
        existing_traces = {str(cycle.trace_code or "").strip().casefold() for cycle in comparable}
        seq = 1
        if not lot_number or not trace_code:
            while True:
                candidate_lot = lot_number or f"LOT-{date_token}-{seq:03d}"
                candidate_trace = trace_code or f"TRACE-{date_token}-{seq:03d}"
                if candidate_lot.casefold() not in existing_lots and candidate_trace.casefold() not in existing_traces:
                    lot_number = candidate_lot
                    trace_code = candidate_trace
                    break
                seq += 1
        return lot_number, trace_code

    def deletion_blockers(self, kind: str, record_id: str) -> list[str]:
        """Return traceability references that make a hard delete unsafe."""
        if kind == "farm":
            count = sum(1 for item in self.plots.values() if item.farm_id == record_id)
            return [f"場區 {count} 筆"] if count else []
        if kind == "plot":
            count = sum(1 for item in self.cycles.values() if item.plot_id == record_id)
            blockers = [f"生產週期 {count} 筆"] if count else []
            profile_count = sum(1 for item in self.sensor_profiles.values() if item.plot_id == record_id)
            if profile_count:
                blockers.append(f"Sensor Profile {profile_count} 筆")
            return blockers
        if kind == "cycle":
            operation_ids = {
                item.operation_id
                for item in self.operations.values()
                if item.cycle_id == record_id
            }
            blockers: list[str] = []
            if operation_ids:
                blockers.append(f"農務作業 {len(operation_ids)} 筆")
            evidence_count = sum(
                1 for item in self.evidence.values() if item.operation_id in operation_ids
            )
            if evidence_count:
                blockers.append(f"佐證資料 {evidence_count} 筆")
            return blockers
        raise ValueError(f"Unknown traceability master-data kind: {kind!r}")

    def delete_unlinked(self, kind: str, record_id: str) -> bool:
        """Hard-delete a master-data record only when no references exist."""
        collections = {"farm": self.farms, "plot": self.plots, "cycle": self.cycles}
        collection = collections.get(kind)
        if collection is None:
            raise ValueError(f"Unknown traceability master-data kind: {kind!r}")
        if record_id not in collection or self.deletion_blockers(kind, record_id):
            return False
        del collection[record_id]
        return True

    def state_attributes(self) -> dict[str, Any]:
        recent = sorted(
            self.operations.values(),
            key=lambda item: item.actual_start or item.scheduled_start or item.created_at or "",
            reverse=True,
        )[:10]
        return {
            "farm_count": len(self.farms),
            "plot_count": len(self.plots),
            "cycle_count": len(self.cycles),
            "operation_count": len(self.operations),
            "missing_link_count": self.missing_link_count(),
            "evidence_count": len(self.evidence),
            "sensor_profile_count": len(self.sensor_profiles),
            "evidence_session_count": len(self.evidence_sessions),
            "recent_operations": [item.as_dict() for item in recent],
        }


class EvidenceCaptureCoordinator:
    """Coordinate deterministic evidence capture around scheduled phases."""

    def __init__(self, records: TraceabilityRecordSet, state_getter: Any) -> None:
        self.records = records
        self.state_getter = state_getter

    def _profile_for_operation(self, operation_id: str) -> SensorProfile:
        operation = self.records.operations.get(operation_id)
        if operation is None:
            raise ValueError("找不到農務作業，無法建立 Evidence Session。")
        profile = self.records.sensor_profiles.get(operation.profile_id)
        if profile is None:
            raise ValueError("農務作業尚未綁定有效的 Operation Profile。")
        return profile

    @staticmethod
    def _profile_entity_ids(profile: SensorProfile) -> list[str]:
        observation_ids = [
            str(item.get("entity_id") or "") for item in profile.observation_entities
        ]
        return SensorProfile.normalize_entity_ids(
            profile.entity_ids
            + observation_ids
            + profile.control_entity_ids
            + profile.action_entity_ids
        )

    def start(self, operation_id: str, *, captured_at: str = "") -> EvidenceSession:
        for session in self.records.evidence_sessions.values():
            if session.operation_id == operation_id and session.status == "capturing":
                return session
        profile = self._profile_for_operation(operation_id)
        session = EvidenceSession.start(
            operation_id=operation_id,
            profile_id=profile.profile_id,
            start_snapshot=capture_entity_snapshot(
                self._profile_entity_ids(profile),
                self.state_getter,
                captured_at=captured_at,
            ),
            started_at=captured_at,
        )
        self.records.evidence_sessions[session.session_id] = session
        return session

    def record_service_call(
        self,
        session_id: str,
        *,
        phase: str,
        service: str,
        target: dict[str, Any] | None,
        success: bool,
        error: str = "",
        called_at: str = "",
    ) -> EvidenceSession:
        session = self.records.evidence_sessions[session_id]
        session.service_calls.append(
            {
                "phase": str(phase),
                "service": str(service),
                "target": dict(target or {}),
                "success": bool(success),
                "error": str(error or ""),
                "called_at": called_at or _now(),
            }
        )
        return session

    def finish(self, session_id: str, *, captured_at: str = "") -> EvidenceSession:
        session = self.records.evidence_sessions[session_id]
        source_entity = f"evidence_session:{session.session_id}"
        if session.status == "ready_for_ai":
            return session
        profile = self.records.sensor_profiles.get(session.profile_id)
        if profile is None:
            raise ValueError("Evidence Session 的 Operation Profile 已不存在。")
        previous_calls = [dict(item) for item in session.service_calls]
        session.finish(
            end_snapshot=capture_entity_snapshot(
                self._profile_entity_ids(profile),
                self.state_getter,
                captured_at=captured_at,
            ),
            service_calls=previous_calls,
            ended_at=captured_at,
            quality="complete",
        )
        evidence = EvidenceRecord.create(
            operation_id=session.operation_id,
            evidence_type="raw_evidence_bundle",
            title="自動擷取農務作業原始佐證",
            content=session.as_dict(),
            source_entity=source_entity,
        )
        self.records.evidence[evidence.evidence_id] = evidence
        return session


def traceability_export_package(
    records: TraceabilityRecordSet, *, cycle_id: str = ""
) -> dict[str, Any]:
    """Return JSON-friendly rows plus CSV and evidence metadata for export."""

    source_records = records
    if cycle_id:
        operations = {
            key: item
            for key, item in records.operations.items()
            if item.cycle_id == cycle_id
        }
        operation_ids = set(operations)
        source_records = TraceabilityRecordSet(
            farms=records.farms,
            plots=records.plots,
            cycles={key: item for key, item in records.cycles.items() if key == cycle_id},
            operations=operations,
            evidence={
                key: item
                for key, item in records.evidence.items()
                if item.operation_id in operation_ids
            },
            evidence_sessions={
                key: item
                for key, item in records.evidence_sessions.items()
                if item.operation_id in operation_ids
            },
        )
    rows = source_records.export_operation_rows()
    fieldnames = [
        "operation_id",
        "cycle_id",
        "farm_name",
        "plot_name",
        "product",
        "lot_number",
        "operation_type",
        "actual_start",
        "operator",
        "material_name",
        "quantity",
        "unit",
        "status",
        "record_hash",
    ]
    buffer = io.StringIO()
    writer = csv.DictWriter(buffer, fieldnames=fieldnames, extrasaction="ignore")
    writer.writeheader()
    writer.writerows(rows)
    evidence_rows = [item.as_dict() for item in source_records.evidence.values()]
    raw_evidence_sessions = [
        item.as_dict() for item in source_records.evidence_sessions.values()
    ]
    ai_evidence_drafts = [
        item.as_dict()
        for item in source_records.evidence.values()
        if item.evidence_type == "ai_summary_draft"
    ]
    cycle = records.cycles.get(cycle_id) if cycle_id else None
    plot = records.plots.get(cycle.plot_id) if cycle else None
    farm = records.farms.get(plot.farm_id) if plot else None
    check_defs = [
        ("has_farm", "農場資料", bool(farm) if cycle_id else bool(records.farms)),
        ("has_plot", "場區資料", bool(plot) if cycle_id else bool(records.plots)),
        ("has_cycle", "生產週期資料", bool(cycle) if cycle_id else bool(records.cycles)),
        ("has_operations", "農務作業", bool(rows)),
        ("has_evidence", "佐證資料", bool(evidence_rows)),
        (
            "rows_match_cycle",
            "匯出 rows 屬於指定生產週期",
            all(row.get("cycle_id") == cycle_id for row in rows) if cycle_id else True,
        ),
        ("missing_links", "農場/場區/週期連結", source_records.missing_link_count() == 0),
    ]
    checks = [
        {
            "id": check_id,
            "label": label,
            "status": "ok" if passed else "warning",
            "message": "OK" if passed else f"缺少或不完整：{label}",
        }
        for check_id, label, passed in check_defs
    ]
    warning_count = sum(1 for item in checks if item["status"] != "ok")
    return {
        "export_type": "traceability_export_package",
        "generated_at": _now(),
        "filter": {"cycle_id": cycle_id} if cycle_id else {},
        "rows": rows,
        "csv": buffer.getvalue(),
        "csv_filename": f"traceability-export-{datetime.now().strftime('%Y%m%d-%H%M%S')}.csv",
        "json_filename": f"traceability-package-{datetime.now().strftime('%Y%m%d-%H%M%S')}.json",
        "evidence": evidence_rows,
        "raw_evidence_sessions": raw_evidence_sessions,
        "ai_evidence_drafts": ai_evidence_drafts,
        "counts": {
            "evidence_sessions": len(raw_evidence_sessions),
            "ai_evidence_drafts": len(ai_evidence_drafts),
        },
        "integrity": {
            "ok": warning_count == 0,
            "warning_count": warning_count,
            "checks": checks,
        },
        "summary": {
            "operation_count": len(rows),
            "evidence_count": len(evidence_rows),
            "missing_link_count": source_records.missing_link_count(),
            "integrity_warning_count": warning_count,
        },
    }
