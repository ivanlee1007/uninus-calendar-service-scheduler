"""Agricultural traceability helpers for first-version TAFT support."""

from __future__ import annotations

import hashlib
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


@dataclass(slots=True)
class Farm:
    """A farm/operator participating in traceability records."""

    farm_id: str
    name: str
    operator: str = ""
    address: str = ""
    phone: str = ""
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
            created_at=raw.get("created_at"),
        )

    def as_dict(self) -> dict[str, Any]:
        return {
            "farm_id": self.farm_id,
            "name": self.name,
            "operator": self.operator,
            "address": self.address,
            "phone": self.phone,
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
class TraceabilityRecordSet:
    """In-memory view of agricultural traceability records."""

    farms: dict[str, Farm] = field(default_factory=dict)
    plots: dict[str, Plot] = field(default_factory=dict)
    cycles: dict[str, CropCycle] = field(default_factory=dict)
    operations: dict[str, AgriOperation] = field(default_factory=dict)

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
        )

    def as_dict(self) -> dict[str, Any]:
        return {
            "farms": {key: item.as_dict() for key, item in self.farms.items()},
            "plots": {key: item.as_dict() for key, item in self.plots.items()},
            "cycles": {key: item.as_dict() for key, item in self.cycles.items()},
            "operations": {key: item.as_dict() for key, item in self.operations.items()},
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
            "recent_operations": [item.as_dict() for item in recent],
        }
