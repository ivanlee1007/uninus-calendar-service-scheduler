"""Persistent storage for agricultural traceability records."""

from __future__ import annotations

from typing import Any

from homeassistant.core import HomeAssistant
from homeassistant.helpers.storage import Store

from .agri import (
    AgriOperation,
    CropCycle,
    EvidenceRecord,
    Farm,
    Plot,
    TraceabilityRecordSet,
)
from .const import AGRI_STORAGE_KEY, AGRI_STORAGE_VERSION


class AgriStore:
    """Storage wrapper for first-version agricultural traceability records."""

    def __init__(self, hass: HomeAssistant) -> None:
        self._store: Store[dict[str, Any]] = Store(
            hass, AGRI_STORAGE_VERSION, AGRI_STORAGE_KEY
        )
        self.records = TraceabilityRecordSet()

    async def async_load(self) -> None:
        """Load agricultural records from Home Assistant storage."""
        raw = await self._store.async_load() or {}
        self.records = TraceabilityRecordSet.from_dict(raw)

    async def async_save(self) -> None:
        """Persist agricultural records."""
        await self._store.async_save(self.records.as_dict())

    async def async_add_farm(self, farm: Farm) -> None:
        self.records.farms[farm.farm_id] = farm
        await self.async_save()

    async def async_add_plot(self, plot: Plot) -> None:
        self.records.plots[plot.plot_id] = plot
        await self.async_save()

    async def async_add_cycle(self, cycle: CropCycle) -> None:
        self.records.cycles[cycle.cycle_id] = cycle
        await self.async_save()

    async def async_add_operation(self, operation: AgriOperation) -> None:
        self.records.operations[operation.operation_id] = operation
        await self.async_save()

    async def async_add_evidence(self, evidence: EvidenceRecord) -> None:
        self.records.evidence[evidence.evidence_id] = evidence
        await self.async_save()

    async def async_update_farm(self, farm: Farm) -> None:
        self.records.farms[farm.farm_id] = farm
        await self.async_save()

    async def async_update_plot(self, plot: Plot) -> None:
        self.records.plots[plot.plot_id] = plot
        await self.async_save()

    async def async_update_cycle(self, cycle: CropCycle) -> None:
        self.records.cycles[cycle.cycle_id] = cycle
        await self.async_save()
