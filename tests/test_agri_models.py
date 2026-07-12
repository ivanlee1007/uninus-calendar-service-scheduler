import importlib.util
import sys
import types
from pathlib import Path

import pytest

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
SensorProfile = agri.SensorProfile
EvidenceSession = agri.EvidenceSession
EvidenceCaptureCoordinator = agri.EvidenceCaptureCoordinator
create_ai_evidence_draft = agri.create_ai_evidence_draft
capture_entity_snapshot = agri.capture_entity_snapshot
traceability_export_package = agri.traceability_export_package


def test_sensor_profile_roundtrip_normalizes_a_dynamic_entity_list():
    profile = SensorProfile.create(
        plot_id="plot_1",
        name="北區果園灌溉感測器",
        entity_ids=[
            " sensor.soil_moisture ",
            "sensor.irrigation_flow",
            "sensor.soil_moisture",
            "",
        ],
    )

    records = TraceabilityRecordSet(sensor_profiles={profile.profile_id: profile})
    loaded = TraceabilityRecordSet.from_dict(records.as_dict())

    assert profile.profile_id.startswith("sensor_profile_")
    assert loaded.sensor_profiles[profile.profile_id].plot_id == "plot_1"
    assert loaded.sensor_profiles[profile.profile_id].name == "北區果園灌溉感測器"
    assert loaded.sensor_profiles[profile.profile_id].entity_ids == [
        "sensor.soil_moisture",
        "sensor.irrigation_flow",
    ]


def test_operation_profile_roundtrip_adds_actions_entity_roles_and_evidence_policy():
    profile = SensorProfile.create(
        plot_id="plot_1",
        name="北區果園灌溉佐證設定",
        entity_ids=["sensor.soil_moisture"],
        action_entity_ids=[" script.start_irrigation ", "script.stop_irrigation"],
        control_entity_ids=["switch.irrigation_valve"],
        observation_entities=[
            {
                "entity_id": " sensor.soil_moisture ",
                "role": "soil_moisture",
                "required": True,
                "max_age_seconds": 300,
                "capture": ["before", "during", "after"],
            }
        ],
        start_actions=[
            {
                "service": "script.turn_on",
                "target": {"entity_id": "script.start_irrigation"},
                "data": {},
            }
        ],
        end_actions=[
            {
                "service": "script.turn_on",
                "target": {"entity_id": "script.stop_irrigation"},
                "data": {},
            }
        ],
        evidence_policy={"sample_interval_seconds": 60, "max_samples": 120},
    )

    loaded = SensorProfile.from_dict(profile.as_dict())

    assert loaded.action_entity_ids == ["script.start_irrigation", "script.stop_irrigation"]
    assert loaded.control_entity_ids == ["switch.irrigation_valve"]
    assert loaded.observation_entities[0]["entity_id"] == "sensor.soil_moisture"
    assert loaded.observation_entities[0]["required"] is True
    assert loaded.start_actions[0]["service"] == "script.turn_on"
    assert loaded.end_actions[0]["target"]["entity_id"] == "script.stop_irrigation"
    assert loaded.evidence_policy == {"sample_interval_seconds": 60, "max_samples": 120}
    assert loaded.entity_ids == ["sensor.soil_moisture"]


def test_sensor_profile_requires_name_and_at_least_one_entity():
    for name, entity_ids in [("", ["sensor.temperature"]), ("環境", [])]:
        try:
            SensorProfile.create(plot_id="plot_1", name=name, entity_ids=entity_ids)
        except ValueError:
            continue
        raise AssertionError("invalid sensor profile was accepted")


def test_traceability_package_separates_raw_sessions_from_ai_narratives():
    session = EvidenceSession.start(operation_id="op_1", start_snapshot={})
    session.finish(end_snapshot={}, ended_at="2026-07-12T08:30:00+08:00")
    ai_draft = create_ai_evidence_draft(
        session,
        title="AI draft",
        narrative="summary",
        model_identity="model",
        policy_version="v1",
    )
    records = TraceabilityRecordSet(
        evidence_sessions={session.session_id: session},
        evidence={ai_draft.evidence_id: ai_draft},
    )

    package = traceability_export_package(records)

    assert package["raw_evidence_sessions"][0]["raw_evidence_hash"] == session.raw_evidence_hash
    assert package["ai_evidence_drafts"][0]["content"]["source_session_id"] == session.session_id
    assert package["counts"]["evidence_sessions"] == 1
    assert package["counts"]["ai_evidence_drafts"] == 1


def test_ai_evidence_draft_is_sourced_versioned_and_does_not_mutate_raw_session():
    session = EvidenceSession.start(operation_id="op_1", start_snapshot={"sensor.soil": {"state": "18"}})
    session.finish(end_snapshot={"sensor.soil": {"state": "31"}}, ended_at="2026-07-12T08:30:00+08:00")
    raw_before = session.as_dict()

    draft = create_ai_evidence_draft(
        session,
        title="北區果園灌溉佐證草稿",
        narrative="土壤濕度由 18 上升至 31。",
        model_identity="hermes-agent/gpt-5.6",
        policy_version="irrigation-v1",
        generated_at="2026-07-12T08:31:00+08:00",
    )

    assert draft.operation_id == "op_1"
    assert draft.evidence_type == "ai_summary_draft"
    assert draft.content["review_status"] == "pending_farmer_review"
    assert draft.content["source_raw_evidence_hash"] == session.raw_evidence_hash
    assert draft.content["model_identity"] == "hermes-agent/gpt-5.6"
    assert draft.content["policy_version"] == "irrigation-v1"
    assert session.as_dict() == raw_before


def test_capture_entity_snapshot_preserves_raw_state_metadata_and_missing_entities():
    states = {
        "sensor.soil": types.SimpleNamespace(
            state="18.2",
            attributes={"unit_of_measurement": "%", "friendly_name": "Soil moisture"},
            last_changed=types.SimpleNamespace(isoformat=lambda: "2026-07-12T07:59:00+08:00"),
            last_updated=types.SimpleNamespace(isoformat=lambda: "2026-07-12T07:59:30+08:00"),
        )
    }

    snapshot = capture_entity_snapshot(
        ["sensor.soil", "sensor.missing"],
        states.get,
        captured_at="2026-07-12T08:00:00+08:00",
    )

    assert snapshot["sensor.soil"] == {
        "state": "18.2",
        "unit": "%",
        "friendly_name": "Soil moisture",
        "available": True,
        "last_changed": "2026-07-12T07:59:00+08:00",
        "last_updated": "2026-07-12T07:59:30+08:00",
        "captured_at": "2026-07-12T08:00:00+08:00",
    }
    assert snapshot["sensor.missing"]["available"] is False
    assert snapshot["sensor.missing"]["captured_at"] == "2026-07-12T08:00:00+08:00"


def test_evidence_session_captures_start_and_finish_as_a_hashed_raw_bundle():
    session = EvidenceSession.start(
        operation_id="op_1",
        profile_id="sensor_profile_1",
        start_snapshot={
            "sensor.soil_moisture": {"state": "18.2", "unit": "%", "captured_at": "2026-07-12T08:00:00+08:00"}
        },
        started_at="2026-07-12T08:00:00+08:00",
    )

    session.finish(
        end_snapshot={
            "sensor.soil_moisture": {"state": "31.7", "unit": "%", "captured_at": "2026-07-12T08:30:00+08:00"}
        },
        service_calls=[
            {"phase": "start", "service": "script.turn_on", "entity_id": "script.irrigate", "success": True},
            {"phase": "end", "service": "switch.turn_off", "entity_id": "switch.valve", "success": True},
        ],
        ended_at="2026-07-12T08:30:00+08:00",
    )
    loaded = EvidenceSession.from_dict(session.as_dict())

    assert loaded.session_id.startswith("evidence_session_")
    assert loaded.status == "ready_for_ai"
    assert loaded.start_snapshot["sensor.soil_moisture"]["state"] == "18.2"
    assert loaded.end_snapshot["sensor.soil_moisture"]["state"] == "31.7"
    assert loaded.service_calls[1]["phase"] == "end"
    assert len(loaded.raw_evidence_hash) == 64
    assert loaded.raw_evidence_hash == session.raw_evidence_hash


def test_traceability_records_persist_evidence_sessions_backward_compatibly():
    session = EvidenceSession.start(operation_id="op_1", start_snapshot={})
    records = TraceabilityRecordSet(evidence_sessions={session.session_id: session})

    loaded = TraceabilityRecordSet.from_dict(records.as_dict())
    legacy = TraceabilityRecordSet.from_dict({})

    assert loaded.evidence_sessions[session.session_id].status == "capturing"
    assert legacy.evidence_sessions == {}


def test_capture_coordinator_opens_idempotent_session_and_finishes_raw_bundle():
    profile = SensorProfile.create(
        plot_id="plot_1",
        name="Irrigation evidence",
        entity_ids=["sensor.soil"],
        control_entity_ids=["switch.valve"],
        action_entity_ids=["script.irrigate"],
    )
    operation = AgriOperation.create(
        cycle_id="cycle_1",
        operation_type="irrigation",
        profile_id=profile.profile_id,
    )
    records = TraceabilityRecordSet(
        operations={operation.operation_id: operation},
        sensor_profiles={profile.profile_id: profile},
    )
    states = {
        "sensor.soil": types.SimpleNamespace(state="18", attributes={}, last_changed=None, last_updated=None),
        "switch.valve": types.SimpleNamespace(state="off", attributes={}, last_changed=None, last_updated=None),
        "script.irrigate": types.SimpleNamespace(state="off", attributes={}, last_changed=None, last_updated=None),
    }
    coordinator = EvidenceCaptureCoordinator(records, states.get)

    first = coordinator.start(operation.operation_id, captured_at="2026-07-12T08:00:00+08:00")
    duplicate = coordinator.start(operation.operation_id, captured_at="2026-07-12T08:00:01+08:00")
    coordinator.record_service_call(
        first.session_id,
        phase="start",
        service="script.turn_on",
        target={"entity_id": "script.irrigate"},
        success=True,
    )
    states["sensor.soil"].state = "31"
    finished = coordinator.finish(first.session_id, captured_at="2026-07-12T08:30:00+08:00")
    duplicate_finish = coordinator.finish(first.session_id, captured_at="2026-07-12T08:30:01+08:00")

    assert duplicate.session_id == first.session_id
    assert set(first.start_snapshot) == {"sensor.soil", "switch.valve", "script.irrigate"}
    assert finished.end_snapshot["sensor.soil"]["state"] == "31"
    assert finished.service_calls[0]["success"] is True
    assert finished.status == "ready_for_ai"
    assert duplicate_finish.session_id == finished.session_id
    assert len(records.evidence) == 1
    evidence = next(iter(records.evidence.values()))
    assert evidence.operation_id == operation.operation_id
    assert evidence.evidence_type == "raw_evidence_bundle"
    assert evidence.content["session_id"] == finished.session_id
    assert evidence.content["raw_evidence_hash"] == finished.raw_evidence_hash


def test_agri_operation_binds_operation_profile_and_start_end_actions():
    operation = AgriOperation.create(
        cycle_id="cycle_1",
        operation_type="灌溉",
        profile_id="sensor_profile_1",
        start_actions=[
            {"service": "script.turn_on", "target": {"entity_id": "script.irrigate"}, "data": {}}
        ],
        end_actions=[
            {"service": "switch.turn_off", "target": {"entity_id": "switch.valve"}, "data": {}}
        ],
    )

    loaded = AgriOperation.from_dict(operation.as_dict())

    assert loaded.profile_id == "sensor_profile_1"
    assert loaded.start_actions[0]["target"]["entity_id"] == "script.irrigate"
    assert loaded.end_actions[0]["service"] == "switch.turn_off"
    assert loaded.record_hash == operation.record_hash


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
        "sensor_profile_count": 0,
        "evidence_session_count": 0,
        "recent_operations": [operation.as_dict()],
    }



def test_crop_cycle_identity_generates_missing_lot_and_trace_code():
    farm = Farm.create(name="靜安農場")
    plot = Plot.create(farm_id=farm.farm_id, name="A 區", product="番茄")
    existing = CropCycle.create(
        plot_id=plot.plot_id,
        product="番茄",
        variety="",
        lot_number="LOT-20260710-001",
        trace_code="TRACE-20260710-001",
        start_date="2026-07-10",
    )
    records = TraceabilityRecordSet(
        farms={farm.farm_id: farm},
        plots={plot.plot_id: plot},
        cycles={existing.cycle_id: existing},
    )

    lot_number, trace_code = records.prepare_cycle_identity(
        plot_id=plot.plot_id,
        product="小黃瓜",
        variety="綠寶",
        start_date="2026-07-10",
        lot_number="",
        trace_code="",
    )

    assert lot_number == "LOT-20260710-002"
    assert trace_code == "TRACE-20260710-002"


def test_crop_cycle_identity_rejects_unidentifiable_duplicate_cycle():
    farm = Farm.create(name="靜安農場")
    plot = Plot.create(farm_id=farm.farm_id, name="A 區", product="番茄")
    existing = CropCycle.create(
        plot_id=plot.plot_id,
        product="番茄",
        variety="玉女",
        lot_number="LOT-20260710-001",
        trace_code="TRACE-20260710-001",
        start_date="2026-07-10",
    )
    records = TraceabilityRecordSet(
        farms={farm.farm_id: farm},
        plots={plot.plot_id: plot},
        cycles={existing.cycle_id: existing},
    )

    try:
        records.prepare_cycle_identity(
            plot_id=plot.plot_id,
            product="番茄",
            variety="玉女",
            start_date="2026-07-10",
            lot_number="LOT-20260710-002",
            trace_code="TRACE-20260710-002",
        )
    except ValueError as err:
        assert "相同場區、產品、品種與開始日期" in str(err)
    else:
        raise AssertionError("duplicate crop cycle should be rejected")


def test_crop_cycle_identity_rejects_duplicate_trace_code():
    farm = Farm.create(name="靜安農場")
    plot = Plot.create(farm_id=farm.farm_id, name="A 區", product="番茄")
    existing = CropCycle.create(
        plot_id=plot.plot_id,
        product="番茄",
        variety="玉女",
        lot_number="LOT-20260710-001",
        trace_code="TRACE-20260710-001",
        start_date="2026-07-10",
    )
    records = TraceabilityRecordSet(cycles={existing.cycle_id: existing})

    try:
        records.prepare_cycle_identity(
            plot_id=plot.plot_id,
            product="小黃瓜",
            variety="綠寶",
            start_date="2026-07-11",
            lot_number="LOT-20260711-001",
            trace_code="TRACE-20260710-001",
        )
    except ValueError as err:
        assert "追溯碼已存在" in str(err)
    else:
        raise AssertionError("duplicate trace code should be rejected")


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



def test_traceability_export_package_includes_minimal_integrity_checks():
    farm = Farm.create(name="綠竹農場", operator="王小農")
    plot = Plot.create(farm_id=farm.farm_id, name="A 區", product="芒果")
    cycle = CropCycle.create(plot_id=plot.plot_id, product="芒果", lot_number="LOT-OK")
    operation = AgriOperation.create(cycle_id=cycle.cycle_id, operation_type="灌溉", actual_start="2026-02-01T07:00:00+08:00")
    evidence = EvidenceRecord.create(operation_id=operation.operation_id, title="土壤濕度", content={"after": 32})
    records = TraceabilityRecordSet(
        farms={farm.farm_id: farm},
        plots={plot.plot_id: plot},
        cycles={cycle.cycle_id: cycle},
        operations={operation.operation_id: operation},
        evidence={evidence.evidence_id: evidence},
    )

    package = traceability_export_package(records, cycle_id=cycle.cycle_id)

    assert package["integrity"]["ok"] is True
    assert package["integrity"]["warning_count"] == 0
    check_ids = {item["id"] for item in package["integrity"]["checks"]}
    assert {"has_farm", "has_plot", "has_cycle", "has_operations", "has_evidence", "rows_match_cycle"} <= check_ids


def test_traceability_export_package_integrity_warns_for_missing_evidence_and_empty_cycle():
    cycle = CropCycle.create(plot_id="plot_missing", product="芒果", lot_number="LOT-WARN")
    records = TraceabilityRecordSet(cycles={cycle.cycle_id: cycle})

    package = traceability_export_package(records, cycle_id=cycle.cycle_id)

    assert package["integrity"]["ok"] is False
    failed_ids = {item["id"] for item in package["integrity"]["checks"] if item["status"] == "warning"}
    assert {"has_farm", "has_plot", "has_operations", "has_evidence"} <= failed_ids



def test_traceability_records_delete_only_unlinked_master_data():
    farm = Farm.create(name="可刪除農場")
    plot = Plot.create(farm_id=farm.farm_id, name="可刪除場區")
    cycle = CropCycle.create(plot_id=plot.plot_id, product="芒果")
    records = TraceabilityRecordSet(
        farms={farm.farm_id: farm},
        plots={plot.plot_id: plot},
        cycles={cycle.cycle_id: cycle},
    )

    assert records.deletion_blockers("farm", farm.farm_id) == ["場區 1 筆"]
    assert records.deletion_blockers("plot", plot.plot_id) == ["生產週期 1 筆"]
    assert records.deletion_blockers("cycle", cycle.cycle_id) == []
    assert records.delete_unlinked("cycle", cycle.cycle_id) is True
    assert records.delete_unlinked("plot", plot.plot_id) is True
    assert records.delete_unlinked("farm", farm.farm_id) is True
    assert records.farms == records.plots == records.cycles == {}


def test_traceability_records_block_cycle_delete_when_operation_or_evidence_is_linked():
    farm = Farm.create(name="關聯農場")
    plot = Plot.create(farm_id=farm.farm_id, name="關聯場區")
    cycle = CropCycle.create(plot_id=plot.plot_id, product="芒果")
    operation = AgriOperation.create(cycle_id=cycle.cycle_id, operation_type="灌溉")
    evidence = EvidenceRecord.create(operation_id=operation.operation_id, title="不可失去的佐證")
    records = TraceabilityRecordSet(
        farms={farm.farm_id: farm},
        plots={plot.plot_id: plot},
        cycles={cycle.cycle_id: cycle},
        operations={operation.operation_id: operation},
        evidence={evidence.evidence_id: evidence},
    )

    assert records.deletion_blockers("cycle", cycle.cycle_id) == ["農務作業 1 筆", "佐證資料 1 筆"]
    assert records.delete_unlinked("cycle", cycle.cycle_id) is False
    assert cycle.cycle_id in records.cycles



def test_traceability_records_clear_returns_to_empty_new_install_state():
    farm = Farm.create(name="待清空農場")
    plot = Plot.create(farm_id=farm.farm_id, name="待清空場區")
    cycle = CropCycle.create(plot_id=plot.plot_id, product="芒果")
    operation = AgriOperation.create(cycle_id=cycle.cycle_id, operation_type="灌溉")
    evidence = EvidenceRecord.create(operation_id=operation.operation_id, title="待清空佐證")
    records = TraceabilityRecordSet(
        farms={farm.farm_id: farm},
        plots={plot.plot_id: plot},
        cycles={cycle.cycle_id: cycle},
        operations={operation.operation_id: operation},
        evidence={evidence.evidence_id: evidence},
    )

    summary = records.clear()

    assert summary == {
        "farm_count": 1,
        "plot_count": 1,
        "cycle_count": 1,
        "operation_count": 1,
        "evidence_count": 1,
        "sensor_profile_count": 0,
        "evidence_session_count": 0,
    }
    assert records.as_dict() == {
        "farms": {}, "plots": {}, "cycles": {}, "operations": {}, "evidence": {},
        "sensor_profiles": {}, "evidence_sessions": {}
    }


def test_duplicate_farm_is_rejected_after_normalizing_text():
    existing = Farm.create(
        name="青禾農場", operator="林青禾", address="台中市新社區青禾路1號", phone="04-25810001"
    )
    records = TraceabilityRecordSet(farms={existing.farm_id: existing})
    duplicate = Farm.create(
        name="  青禾農場 ", operator="林青禾", address="台中市新社區青禾路1號", phone="04-25810001"
    )

    with pytest.raises(ValueError, match="相同農場資料已存在"):
        records.ensure_unique_farm(duplicate)


def test_duplicate_plot_is_rejected_within_the_same_farm():
    existing = Plot.create(
        farm_id="farm_1", name="A 區", product="小番茄", tgap_category="蔬菜", area="0.1 公頃", location="北側"
    )
    records = TraceabilityRecordSet(plots={existing.plot_id: existing})
    duplicate = Plot.create(
        farm_id="farm_1", name="a 區", product="小番茄", tgap_category="蔬菜", area="0.1 公頃", location="北側"
    )

    with pytest.raises(ValueError, match="相同場區資料已存在"):
        records.ensure_unique_plot(duplicate)


def test_duplicate_operation_profile_is_rejected_for_the_same_plot():
    existing = SensorProfile.create(
        plot_id="plot_1", name="A 區灌溉", entity_ids=["sensor.temperature", "sensor.humidity"]
    )
    records = TraceabilityRecordSet(sensor_profiles={existing.profile_id: existing})
    duplicate = SensorProfile.create(
        plot_id="plot_1", name="a 區灌溉", entity_ids=["sensor.humidity", "sensor.temperature"]
    )

    with pytest.raises(ValueError, match="相同 Operation Profile 已存在"):
        records.ensure_unique_sensor_profile(duplicate)


def test_duplicate_agri_operation_is_rejected_for_same_cycle_and_business_fields():
    existing = AgriOperation.create(
        cycle_id="cycle_1", operation_type="灌溉", actual_start="2026-07-12T14:30:00+08:00",
        operator="林青禾", material_name="地下水", quantity=30, unit="分鐘", notes="A 區滴灌"
    )
    records = TraceabilityRecordSet(operations={existing.operation_id: existing})
    duplicate = AgriOperation.create(
        cycle_id="cycle_1", operation_type="灌溉", actual_start="2026-07-12T14:30:00+08:00",
        operator="林青禾", material_name="地下水", quantity="30", unit="分鐘", notes="A 區滴灌"
    )

    with pytest.raises(ValueError, match="相同農務作業已存在"):
        records.ensure_unique_operation(duplicate)


def test_duplicate_evidence_is_rejected_for_same_operation_and_content():
    existing = EvidenceRecord.create(
        operation_id="op_1", evidence_type="sensor_snapshot", title="灌溉快照",
        content={"humidity": 71, "temperature": 29}, source_entity="sensor.humidity", uri=""
    )
    records = TraceabilityRecordSet(evidence={existing.evidence_id: existing})
    duplicate = EvidenceRecord.create(
        operation_id="op_1", evidence_type="sensor_snapshot", title=" 灌溉快照 ",
        content={"temperature": 29, "humidity": 71}, source_entity="sensor.humidity", uri=""
    )

    with pytest.raises(ValueError, match="相同佐證資料已存在"):
        records.ensure_unique_evidence(duplicate)
