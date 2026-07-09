import importlib.util
import sys
import types
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PKG_NAME = "custom_components.uninus_calendar_service_scheduler"
PKG_DIR = ROOT / "custom_components" / "uninus_calendar_service_scheduler"

pkg = types.ModuleType(PKG_NAME)
pkg.__path__ = [str(PKG_DIR)]
sys.modules.setdefault(PKG_NAME, pkg)


def _load_module(name):
    spec = importlib.util.spec_from_file_location(
        f"{PKG_NAME}.{name}", PKG_DIR / f"{name}.py"
    )
    module = importlib.util.module_from_spec(spec)
    sys.modules[f"{PKG_NAME}.{name}"] = module
    spec.loader.exec_module(module)
    return module


agri = _load_module("agri")
Farm = agri.Farm
Plot = agri.Plot
CropCycle = agri.CropCycle
AgriOperation = agri.AgriOperation
TraceabilityRecordSet = agri.TraceabilityRecordSet


def test_agri_records_roundtrip_with_sensor_snapshot():
    farm = Farm.create(name="綠竹農場", operator="王小農", address="台南", phone="06-1234567")
    plot = Plot.create(
        farm_id=farm.farm_id,
        name="A 區",
        product="芒果",
        tgap_category="水果類",
        area="0.5 公頃",
    )
    cycle = CropCycle.create(
        plot_id=plot.plot_id,
        product="芒果",
        variety="愛文",
        lot_number="LOT-2026-001",
        start_date="2026-01-15",
        expected_harvest_date="2026-06-20",
    )
    operation = AgriOperation.create(
        cycle_id=cycle.cycle_id,
        operation_type="灌溉",
        scheduled_start="2026-03-01T06:00:00+08:00",
        actual_start="2026-03-01T06:03:00+08:00",
        operator="王小農",
        material_name="地下水",
        quantity=30,
        unit="分鐘",
        sensor_snapshot={"sensor.soil_moisture_a": {"before": 18.2, "after": 31.7, "unit": "%"}},
        notes="自動灌溉完成",
    )

    loaded = AgriOperation.from_dict(operation.as_dict())

    assert loaded.operation_type == "灌溉"
    assert loaded.status == "completed"
    assert loaded.sensor_snapshot["sensor.soil_moisture_a"]["after"] == 31.7
    assert loaded.record_hash == operation.record_hash


def test_traceability_record_set_exports_flat_rows_for_audit_package():
    farm = Farm.create(name="綠竹農場", operator="王小農")
    plot = Plot.create(farm_id=farm.farm_id, name="A 區", product="芒果", tgap_category="水果類")
    cycle = CropCycle.create(
        plot_id=plot.plot_id,
        product="芒果",
        variety="愛文",
        lot_number="LOT-2026-001",
        start_date="2026-01-15",
    )
    operation = AgriOperation.create(
        cycle_id=cycle.cycle_id,
        operation_type="施肥",
        actual_start="2026-02-01T07:00:00+08:00",
        operator="王小農",
        material_name="有機質肥料",
        quantity=20,
        unit="kg",
    )
    records = TraceabilityRecordSet(
        farms={farm.farm_id: farm},
        plots={plot.plot_id: plot},
        cycles={cycle.cycle_id: cycle},
        operations={operation.operation_id: operation},
    )

    rows = records.export_operation_rows()

    assert rows == [
        {
            "operation_id": operation.operation_id,
            "farm_name": "綠竹農場",
            "operator": "王小農",
            "plot_name": "A 區",
            "product": "芒果",
            "tgap_category": "水果類",
            "lot_number": "LOT-2026-001",
            "operation_type": "施肥",
            "actual_start": "2026-02-01T07:00:00+08:00",
            "material_name": "有機質肥料",
            "quantity": 20,
            "unit": "kg",
            "status": "completed",
            "record_hash": operation.record_hash,
        }
    ]


def test_traceability_record_set_state_summary_counts_missing_required_links():
    operation = AgriOperation.create(cycle_id="missing", operation_type="採收")
    records = TraceabilityRecordSet(operations={operation.operation_id: operation})

    assert records.state_attributes() == {
        "farm_count": 0,
        "plot_count": 0,
        "cycle_count": 0,
        "operation_count": 1,
        "missing_link_count": 1,
        "recent_operations": [operation.as_dict()],
    }
