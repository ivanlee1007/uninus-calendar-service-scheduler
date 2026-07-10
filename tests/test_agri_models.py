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
compose_agri_description = agri.compose_agri_description
extract_agri_description = agri.extract_agri_description
verify_agri_payload_hash = agri.verify_agri_payload_hash
calendar_events_to_traceability_rows = agri.calendar_events_to_traceability_rows
operation_to_calendar_event_payload = agri.operation_to_calendar_event_payload
EvidenceRecord = agri.EvidenceRecord
traceability_export_package = agri.traceability_export_package


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


def test_agri_operation_can_link_to_calendar_event_for_visible_editing():
    operation = AgriOperation.create(
        cycle_id="cycle_1",
        operation_type="灌溉",
        actual_start="2026-03-01T06:03:00+08:00",
        calendar_entity="calendar.farm",
        calendar_event_uid="event-123",
    )

    loaded = AgriOperation.from_dict(operation.as_dict())

    assert loaded.calendar_entity == "calendar.farm"
    assert loaded.calendar_event_uid == "event-123"
    assert loaded.as_dict()["calendar_entity"] == "calendar.farm"


def test_agri_description_embeds_hidden_json_with_metadata_and_verifies_hash():
    description = compose_agri_description(
        human_notes="今天土壤偏乾，所以延長灌溉。",
        payload={
            "cycle_id": "cycle_1",
            "operation_type": "灌溉",
            "actual_start": "2026-03-01T06:03:00+08:00",
            "operator": "王小農",
            "material_name": "地下水",
            "quantity": 60,
            "unit": "秒",
            "sensor_entities": ["sensor.soil_moisture"],
        },
        created_at="2026-03-01T06:04:00+08:00",
        updated_at="2026-03-01T06:04:00+08:00",
    )

    extracted_notes, payload, valid = extract_agri_description(description)

    assert extracted_notes == "今天土壤偏乾，所以延長灌溉。"
    assert payload["version"] == 1
    assert payload["created_at"] == "2026-03-01T06:04:00+08:00"
    assert payload["updated_at"] == "2026-03-01T06:04:00+08:00"
    assert len(payload["record_hash"]) == 64
    assert valid is True
    assert verify_agri_payload_hash(payload) is True
    assert "UNINUS_AGRI_OPERATION_JSON" in description


def test_agri_description_detects_hash_mismatch_after_external_edit():
    description = compose_agri_description(
        human_notes="原始備註",
        payload={"cycle_id": "cycle_1", "operation_type": "灌溉", "quantity": 60},
        created_at="2026-03-01T06:04:00+08:00",
        updated_at="2026-03-01T06:04:00+08:00",
    )
    tampered = description.replace('"quantity":60', '"quantity":90')

    _notes, payload, valid = extract_agri_description(tampered)

    assert payload["quantity"] == 90
    assert valid is False


def test_legacy_agri_operation_converts_to_calendar_event_payload_with_hidden_json():
    operation = AgriOperation.create(
        cycle_id="cycle_1",
        operation_type="施肥",
        actual_start="2026-03-02T07:00:00+08:00",
        operator="王小農",
        material_name="有機質肥料",
        quantity="20",
        unit="kg",
        notes="legacy storage note",
    )

    event = operation_to_calendar_event_payload(
        operation,
        calendar_entity="calendar.farm",
        summary_prefix="農務",
    )
    notes, payload, valid = extract_agri_description(event["description"])

    assert event["calendar_entity"] == "calendar.farm"
    assert event["summary"] == "農務：施肥"
    assert event["dtstart"] == "2026-03-02T07:00:00+08:00"
    assert event["dtend"] == "2026-03-02T08:00:00+08:00"
    assert notes == "legacy storage note"
    assert payload["operation_id"] == operation.operation_id
    assert payload["cycle_id"] == "cycle_1"
    assert payload["operation_type"] == "施肥"
    assert payload["quantity"] == "20"
    assert payload["unit"] == "kg"
    assert valid is True


def test_calendar_events_with_embedded_agri_json_export_to_traceability_rows():
    description = compose_agri_description(
        human_notes="人類可讀備註",
        payload={
            "cycle_id": "cycle_1",
            "operation_type": "灌溉",
            "actual_start": "2026-03-01T06:03:00+08:00",
            "operator": "王小農",
            "material_name": "地下水",
            "quantity": "60",
            "unit": "秒",
            "sensor_entities": ["sensor.soil_moisture"],
        },
        created_at="2026-03-01T06:04:00+08:00",
        updated_at="2026-03-01T06:04:00+08:00",
    )

    rows = calendar_events_to_traceability_rows(
        [
            {
                "uid": "event-1",
                "summary": "農務：灌溉",
                "description": description,
                "start": {"dateTime": "2026-03-01T06:03:00+08:00"},
                "__calendarEntity": "calendar.farm",
            },
            {"uid": "event-2", "summary": "一般行程", "description": "no agri"},
        ]
    )

    assert rows == [
        {
            "source": "calendar_event",
            "calendar_entity": "calendar.farm",
            "calendar_event_uid": "event-1",
            "summary": "農務：灌溉",
            "notes": "人類可讀備註",
            "hash_valid": True,
            "version": 1,
            "cycle_id": "cycle_1",
            "operation_id": "",
            "operation_type": "灌溉",
            "actual_start": "2026-03-01T06:03:00+08:00",
            "operator": "王小農",
            "material_name": "地下水",
            "quantity": "60",
            "unit": "秒",
            "sensor_entities": ["sensor.soil_moisture"],
            "created_at": "2026-03-01T06:04:00+08:00",
            "updated_at": "2026-03-01T06:04:00+08:00",
            "record_hash": rows[0]["record_hash"],
        }
    ]


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
            "cycle_id": cycle.cycle_id,
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
        "evidence_count": 0,
        "recent_operations": [operation.as_dict()],
    }



def test_master_data_records_support_editing_and_archival_status():
    farm = Farm.create(name="舊農場", operator="王小農")
    plot = Plot.create(farm_id=farm.farm_id, name="A 區", product="芒果")
    cycle = CropCycle.create(plot_id=plot.plot_id, product="芒果", lot_number="LOT-1")

    updated_farm = Farm.from_dict({**farm.as_dict(), "name": "新農場", "status": "archived", "archived_at": "2026-07-09T10:00:00+08:00"})
    updated_plot = Plot.from_dict({**plot.as_dict(), "status": "inactive", "archived_at": "2026-07-09T10:01:00+08:00"})
    updated_cycle = CropCycle.from_dict({**cycle.as_dict(), "status": "archived", "actual_harvest_date": "2026-09-01", "archived_at": "2026-07-09T10:02:00+08:00"})

    assert updated_farm.name == "新農場"
    assert updated_farm.status == "archived"
    assert updated_farm.archived_at == "2026-07-09T10:00:00+08:00"
    assert updated_plot.status == "inactive"
    assert updated_plot.archived_at == "2026-07-09T10:01:00+08:00"
    assert updated_cycle.status == "archived"
    assert updated_cycle.actual_harvest_date == "2026-09-01"
    assert updated_cycle.archived_at == "2026-07-09T10:02:00+08:00"



def test_evidence_records_roundtrip_and_export_package_includes_csv():
    farm = Farm.create(name="綠竹農場", operator="王小農")
    plot = Plot.create(farm_id=farm.farm_id, name="A 區", product="芒果", tgap_category="水果類")
    cycle = CropCycle.create(
        plot_id=plot.plot_id,
        product="芒果",
        variety="愛文",
        lot_number="LOT-CSV-001",
        start_date="2026-01-15",
    )
    operation = AgriOperation.create(
        cycle_id=cycle.cycle_id,
        operation_type="灌溉",
        actual_start="2026-02-01T07:00:00+08:00",
        operator="王小農",
        material_name="地下水",
        quantity=90,
        unit="秒",
    )
    evidence = EvidenceRecord.create(
        operation_id=operation.operation_id,
        evidence_type="sensor_snapshot",
        title="灌溉前後土壤濕度",
        content={"sensor.soil_moisture": {"before": 18, "after": 32, "unit": "%"}},
        source_entity="sensor.soil_moisture",
    )
    records = TraceabilityRecordSet(
        farms={farm.farm_id: farm},
        plots={plot.plot_id: plot},
        cycles={cycle.cycle_id: cycle},
        operations={operation.operation_id: operation},
        evidence={evidence.evidence_id: evidence},
    )

    loaded = TraceabilityRecordSet.from_dict(records.as_dict())
    package = traceability_export_package(loaded)

    assert loaded.evidence[evidence.evidence_id].content["sensor.soil_moisture"]["after"] == 32
    assert len(evidence.content_hash) == 64
    assert package["summary"]["evidence_count"] == 1
    assert package["summary"]["operation_count"] == 1
    assert package["csv_filename"].endswith(".csv")
    assert "operation_id,cycle_id,farm_name,plot_name,product" in package["csv"]
    assert "LOT-CSV-001" in package["csv"]
    assert package["evidence"][0]["operation_id"] == operation.operation_id
    assert package["evidence"][0]["content_hash"] == evidence.content_hash



def test_traceability_export_package_filters_by_cycle_id_and_related_evidence():
    farm = Farm.create(name="綠竹農場", operator="王小農")
    plot = Plot.create(farm_id=farm.farm_id, name="A 區", product="芒果")
    cycle_a = CropCycle.create(plot_id=plot.plot_id, product="芒果", lot_number="LOT-A")
    cycle_b = CropCycle.create(plot_id=plot.plot_id, product="芒果", lot_number="LOT-B")
    op_a = AgriOperation.create(cycle_id=cycle_a.cycle_id, operation_type="灌溉", actual_start="2026-02-01T07:00:00+08:00")
    op_b = AgriOperation.create(cycle_id=cycle_b.cycle_id, operation_type="施肥", actual_start="2026-02-02T07:00:00+08:00")
    ev_a = EvidenceRecord.create(operation_id=op_a.operation_id, title="A 週期佐證", content={"a": 1})
    ev_b = EvidenceRecord.create(operation_id=op_b.operation_id, title="B 週期佐證", content={"b": 1})
    records = TraceabilityRecordSet(
        farms={farm.farm_id: farm},
        plots={plot.plot_id: plot},
        cycles={cycle_a.cycle_id: cycle_a, cycle_b.cycle_id: cycle_b},
        operations={op_a.operation_id: op_a, op_b.operation_id: op_b},
        evidence={ev_a.evidence_id: ev_a, ev_b.evidence_id: ev_b},
    )

    package = traceability_export_package(records, cycle_id=cycle_a.cycle_id)

    assert package["filter"] == {"cycle_id": cycle_a.cycle_id}
    assert package["summary"]["operation_count"] == 1
    assert package["summary"]["evidence_count"] == 1
    assert package["rows"][0]["operation_id"] == op_a.operation_id
    assert package["rows"][0]["cycle_id"] == cycle_a.cycle_id
    assert "cycle_id" in package["csv"].splitlines()[0]
    assert "LOT-A" in package["csv"]
    assert "LOT-B" not in package["csv"]
    assert package["evidence"][0]["evidence_id"] == ev_a.evidence_id
