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
            "status": self.status,
            "created_at": self.created_at,
            "record_hash": self.record_hash,
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


@dataclass(slots=True)
class TraceabilityRecordSet:
    """In-memory view of agricultural traceability records."""

    farms: dict[str, Farm] = field(default_factory=dict)
    plots: dict[str, Plot] = field(default_factory=dict)
    cycles: dict[str, CropCycle] = field(default_factory=dict)
    operations: dict[str, AgriOperation] = field(default_factory=dict)
    evidence: dict[str, EvidenceRecord] = field(default_factory=dict)

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
        )

    def as_dict(self) -> dict[str, Any]:
        return {
            "farms": {key: item.as_dict() for key, item in self.farms.items()},
            "plots": {key: item.as_dict() for key, item in self.plots.items()},
            "cycles": {key: item.as_dict() for key, item in self.cycles.items()},
            "operations": {key: item.as_dict() for key, item in self.operations.items()},
            "evidence": {key: item.as_dict() for key, item in self.evidence.items()},
        }

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
            "recent_operations": [item.as_dict() for item in recent],
        }


def traceability_export_package(records: TraceabilityRecordSet) -> dict[str, Any]:
    """Return JSON-friendly rows plus CSV and evidence metadata for export."""

    rows = records.export_operation_rows()
    fieldnames = [
        "operation_id",
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
    evidence_rows = [item.as_dict() for item in records.evidence.values()]
    return {
        "export_type": "traceability_export_package",
        "generated_at": _now(),
        "rows": rows,
        "csv": buffer.getvalue(),
        "csv_filename": f"traceability-export-{datetime.now().strftime('%Y%m%d-%H%M%S')}.csv",
        "evidence": evidence_rows,
        "summary": {
            "operation_count": len(rows),
            "evidence_count": len(evidence_rows),
            "missing_link_count": records.missing_link_count(),
        },
    }
