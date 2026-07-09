from pathlib import Path

PANEL_JS = Path(
    "custom_components/uninus_calendar_service_scheduler/www/"
    "uninus-calendar-service-scheduler-panel.js"
)


def test_traceability_management_ui_exposes_farm_plot_cycle_creation():
    source = PANEL_JS.read_text(encoding="utf-8")

    assert "農場 / 場區 / 生產週期管理" in source
    assert 'id="agri-manage-master-data"' in source
    assert 'id="trace-farm-create"' in source
    assert 'id="trace-plot-create"' in source
    assert 'id="trace-cycle-create"' in source
    assert 'service: "create_farm"' in source
    assert 'service: "create_plot"' in source
    assert 'service: "create_crop_cycle"' in source
