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



def test_traceability_management_ui_exposes_edit_archive_controls():
    source = PANEL_JS.read_text(encoding="utf-8")

    assert "既有農場 / 場區 / 生產週期" in source
    assert 'id="trace-farm-save"' in source
    assert 'id="trace-plot-save"' in source
    assert 'id="trace-cycle-save"' in source
    assert 'id="trace-farm-archive"' in source
    assert 'id="trace-plot-archive"' in source
    assert 'id="trace-cycle-archive"' in source
    assert 'service: "update_farm"' in source
    assert 'service: "update_plot"' in source
    assert 'service: "update_crop_cycle"' in source



def test_panel_export_includes_csv_package_and_evidence_markers():
    source = PANEL_JS.read_text(encoding="utf-8")

    assert "export_csv" in source
    assert "evidence_count" in source
    assert "traceability_export_package" in source
    assert "create_evidence" in source



def test_panel_exposes_evidence_dialog_and_csv_download_controls():
    source = PANEL_JS.read_text(encoding="utf-8")

    assert 'id="agri-open-evidence"' in source
    assert "新增佐證資料" in source
    assert 'id="trace-evidence-create"' in source
    assert 'service: "create_evidence"' in source
    assert 'id="agri-download-csv"' in source
    assert "_downloadTraceabilityCsv" in source
    assert "traceability-export.csv" in source



def test_panel_exposes_cycle_filtered_export_controls():
    source = PANEL_JS.read_text(encoding="utf-8")

    assert 'id="trace_export_cycle"' in source
    assert 'id="agri-export-cycle"' in source
    assert 'id="agri-download-cycle-csv"' in source
    assert "匯出此週期" in source
    assert "下載此週期 CSV" in source
    assert "_selectedExportCycleId" in source
    assert "_downloadTraceabilityCycleCsv" in source
