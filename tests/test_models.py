import importlib.util
import sys
import types
from datetime import datetime
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


const = _load_module("const")
models = _load_module("models")
recurrence = _load_module("recurrence")
agri = _load_module("agri")

ACTION_MARKER = const.ACTION_MARKER
ScheduledAction = models.ScheduledAction
is_service_allowed = models.is_service_allowed
normalize_allowed_services = models.normalize_allowed_services
split_service = models.split_service
next_occurrence_start = recurrence.next_occurrence_start
next_phase_time = recurrence.next_phase_time
Farm = agri.Farm
Plot = agri.Plot
CropCycle = agri.CropCycle
AgriOperation = agri.AgriOperation
TraceabilityRecordSet = agri.TraceabilityRecordSet


def test_split_service():
    assert split_service("light.turn_on") == ("light", "turn_on")


def test_service_pattern_matching_exact_and_wildcard():
    patterns = ["light.turn_on", "script.*", "backup.*"]
    assert is_service_allowed("light.turn_on", patterns)
    assert is_service_allowed("script.turn_on", patterns)
    assert is_service_allowed("backup.create_automatic", patterns)
    assert not is_service_allowed("homeassistant.restart", patterns)


def test_high_risk_denylist_patterns():
    blocked = ["homeassistant.restart", "update.install", "recorder.purge"]
    assert is_service_allowed("homeassistant.restart", blocked)
    assert is_service_allowed("update.install", blocked)
    assert not is_service_allowed("backup.create_automatic", blocked)


def test_normalize_allowed_services_from_text():
    assert normalize_allowed_services("light.turn_on\n script.* , scene.turn_on") == [
        "light.turn_on",
        "script.*",
        "scene.turn_on",
    ]


def test_calendar_description_contains_marker():
    action = ScheduledAction.create(
        calendar_entity="calendar.local",
        summary="Test",
        start="2026-07-05T19:00:00+08:00",
        end=None,
        service="script.turn_on",
        target={"entity_id": "script.demo"},
    )
    description = action.calendar_description()
    assert ACTION_MARKER in description
    assert action.action_id in description


def test_start_and_end_service_actions_roundtrip():
    action = ScheduledAction.create(
        calendar_entity="calendar.local",
        summary="Test",
        start="2026-07-05T19:00:00+08:00",
        end="2026-07-05T20:00:00+08:00",
        service="light.turn_on",
        target={"entity_id": "light.demo"},
        data={"brightness_pct": 80},
        end_service="light.turn_off",
        end_target={"entity_id": "light.demo"},
        end_data={},
    )
    loaded = ScheduledAction.from_dict(action.as_dict())
    assert loaded.service == "light.turn_on"
    assert loaded.end_service == "light.turn_off"
    assert loaded.target == {"entity_id": "light.demo"}
    assert loaded.end_target == {"entity_id": "light.demo"}



def test_scheduled_action_roundtrip_links_agri_operation_and_profile():
    action = ScheduledAction.create(
        calendar_entity="calendar.farm",
        summary="Irrigation",
        start="2026-07-12T08:00:00+08:00",
        end="2026-07-12T08:30:00+08:00",
        service="script.turn_on",
        operation_id="op_1",
        profile_id="sensor_profile_1",
    )

    loaded = ScheduledAction.from_dict(action.as_dict())
    legacy = ScheduledAction.from_dict(
        {
            "action_id": "legacy",
            "calendar_entity": "calendar.farm",
            "start": "2026-07-12T08:00:00+08:00",
        }
    )

    assert loaded.operation_id == "op_1"
    assert loaded.profile_id == "sensor_profile_1"
    assert legacy.operation_id == ""
    assert legacy.profile_id == ""


def test_linked_agri_action_has_end_phase_without_end_service():
    action = ScheduledAction.create(
        calendar_entity="calendar.farm",
        summary="Evidence-only irrigation",
        start="2026-07-12T08:00:00+08:00",
        end="2026-07-12T08:30:00+08:00",
        operation_id="op_1",
        profile_id="profile_1",
    )

    result = next_phase_time(
        action,
        "end",
        datetime.fromisoformat("2026-07-12T07:59:00+08:00"),
    )

    assert result == datetime.fromisoformat("2026-07-12T08:30:00+08:00")


def test_next_occurrence_daily_rrule():
    action = ScheduledAction.create(
        calendar_entity="calendar.local",
        summary="Daily",
        start="2026-07-01T08:00:00+08:00",
        end="2026-07-01T09:00:00+08:00",
        service="light.turn_on",
        end_service="light.turn_off",
        rrule="FREQ=DAILY;UNTIL=20260730T235959Z",
    )
    occurrence = next_occurrence_start(action, models.datetime.fromisoformat("2026-07-14T12:00:00+08:00"))
    assert occurrence.isoformat().startswith("2026-07-15T08:00:00")
    end_occurrence = next_phase_time(action, "end", models.datetime.fromisoformat("2026-07-14T12:00:00+08:00"))
    assert end_occurrence.isoformat().startswith("2026-07-15T09:00:00")


def test_next_occurrence_stops_after_until():
    action = ScheduledAction.create(
        calendar_entity="calendar.local",
        summary="Daily",
        start="2026-07-01T08:00:00+08:00",
        end="2026-07-01T09:00:00+08:00",
        service="light.turn_on",
        rrule="FREQ=DAILY;UNTIL=20260714T235959Z",
    )
    assert next_occurrence_start(action, models.datetime.fromisoformat("2026-07-15T00:00:00+08:00")) is None



def test_recurring_end_after_start_uses_current_occurrence():
    action = ScheduledAction.create(
        calendar_entity="calendar.local",
        summary="Daily",
        start="2026-07-01T08:00:00+08:00",
        end="2026-07-01T09:00:00+08:00",
        service="light.turn_on",
        end_service="light.turn_off",
        rrule="FREQ=DAILY;UNTIL=20260730T235959Z",
    )
    end_occurrence = next_phase_time(action, "end", models.datetime.fromisoformat("2026-07-15T08:01:00+08:00"))
    assert end_occurrence.isoformat().startswith("2026-07-15T09:00:00")
