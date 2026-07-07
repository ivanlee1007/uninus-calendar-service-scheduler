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


const = _load_module("const")
models = _load_module("models")

ACTION_MARKER = const.ACTION_MARKER
ScheduledAction = models.ScheduledAction
is_service_allowed = models.is_service_allowed
normalize_allowed_services = models.normalize_allowed_services
split_service = models.split_service


def test_split_service():
    assert split_service("light.turn_on") == ("light", "turn_on")


def test_allowed_services_exact_and_wildcard():
    allowed = ["light.turn_on", "script.*", "backup.*"]
    assert is_service_allowed("light.turn_on", allowed)
    assert is_service_allowed("script.turn_on", allowed)
    assert is_service_allowed("backup.create_automatic", allowed)
    assert not is_service_allowed("homeassistant.restart", allowed)


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
