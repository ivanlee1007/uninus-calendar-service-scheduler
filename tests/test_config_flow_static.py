from pathlib import Path

CONFIG_FLOW = Path("custom_components/uninus_calendar_service_scheduler/config_flow.py")
ZH_HANT = Path("custom_components/uninus_calendar_service_scheduler/translations/zh-Hant.json")


def test_options_flow_exposes_clear_traceability_with_explicit_confirmation():
    source = CONFIG_FLOW.read_text(encoding="utf-8")
    translation = ZH_HANT.read_text(encoding="utf-8")

    assert "async_show_menu" not in source
    assert "CONF_CLEAR_TRACEABILITY_TEXT" in source
    assert "CONF_CONFIRM_CLEAR_TRACEABILITY_DATA" in source
    assert "CLEAR_TRACEABILITY_CONFIRM_TEXT" in source
    assert "async_step_clear_traceability_data" not in source
    assert "clear_traceability_text" in translation
    assert "confirm_clear_traceability_data" in translation


def test_clear_service_is_scoped_to_traceability_calendar_markers():
    source = Path("custom_components/uninus_calendar_service_scheduler/__init__.py").read_text(encoding="utf-8")

    assert "clear_traceability_data" in source
    assert "UNINUS_AGRI_OPERATION_JSON" in source
    assert "AGRI_OPERATION_ID:" in source
    assert "async_clear" in source
    assert "36525" not in source
    assert "asyncio.wait_for" in source



def test_clear_service_registration_does_not_corrupt_agri_operation_registration():
    source = Path("custom_components/uninus_calendar_service_scheduler/__init__.py").read_text(encoding="utf-8")

    assert "SERVICE_CLEAR_TRACEABILITY_DATA,\n    SERVICE_CREATE_AGRI_OPERATION,\n        _create_agri_operation" not in source
    assert "SERVICE_CREATE_AGRI_OPERATION,\n        _create_agri_operation," in source
    assert "SERVICE_CLEAR_TRACEABILITY_DATA,\n        _clear_traceability_data," in source



def test_custom_panel_does_not_hijack_integration_options_flow():
    source = Path("custom_components/uninus_calendar_service_scheduler/__init__.py").read_text(encoding="utf-8")

    assert "config_panel_domain" not in source
    assert "async_get_options_flow" in Path("custom_components/uninus_calendar_service_scheduler/config_flow.py").read_text(encoding="utf-8")
