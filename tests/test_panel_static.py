from pathlib import Path

PANEL_JS = Path(
    "custom_components/uninus_calendar_service_scheduler/www/"
    "uninus-calendar-service-scheduler-panel.js"
)


def test_traceability_management_ui_exposes_farm_plot_cycle_creation():
    source = PANEL_JS.read_text(encoding="utf-8")

    assert "農場 / 場區 / 生產週期管理" in source
    assert 'id="agri-manage-master-data"' not in source
    assert "_managementContentTemplate" in source
    assert 'id="trace-farm-create"' in source
    assert 'id="trace-plot-create"' in source
    assert 'id="trace-cycle-create"' in source
    assert 'service: "create_farm"' in source
    assert 'service: "create_plot"' in source
    assert 'service: "create_crop_cycle"' in source



def test_traceability_management_ui_exposes_edit_archive_controls():
    source = PANEL_JS.read_text(encoding="utf-8")

    assert "資料管理：農場 / 場區 / 生產週期管理" in source
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
    assert "_downloadTraceabilityCsv" in source
    assert "traceability-export.csv" in source



def test_panel_exposes_cycle_filtered_export_controls():
    source = PANEL_JS.read_text(encoding="utf-8")

    assert 'id="trace_export_cycle"' in source
    assert "_selectedExportCycleId" in source
    assert "_downloadTraceabilityCycleCsv" in source



def test_panel_exposes_mvp_evidence_list_json_download_and_integrity_controls():
    source = PANEL_JS.read_text(encoding="utf-8")

    assert "最近佐證資料" in source
    assert "traceability-evidence-list" in source
    assert "content_hash" in source
    assert "下載 JSON" in source
    assert "_downloadTraceabilityJson" in source
    assert "_downloadTraceabilityJson" in source
    assert "_downloadTraceabilityCycleJson" in source
    assert "匯出前檢查" in source
    assert "traceability-integrity" in source
    assert "_traceabilityIntegrity" in source



def test_traceability_sidebar_uses_compact_workbench_entry():
    source = PANEL_JS.read_text(encoding="utf-8")

    assert "產銷履歷工作台" in source
    assert 'id="agri-open-workbench"' in source
    assert "traceability-workbench" in source
    assert "workbench-tab-overview" in source
    assert "workbench-tab-master-data" in source
    assert "workbench-tab-evidence" in source
    assert "workbench-tab-export" in source
    assert "_traceabilityWorkbenchOpen" in source
    assert "_traceabilityWorkbenchTab" in source


def test_traceability_sidebar_no_longer_exposes_export_button_stack():
    source = PANEL_JS.read_text(encoding="utf-8")
    template_start = source.index("_traceabilityTemplate()")
    template_end = source.index("_traceabilityWorkbenchTemplate()")
    sidebar_template = source[template_start:template_end]

    assert 'id="agri-open-dialog"' in sidebar_template
    assert 'id="agri-open-workbench"' in sidebar_template
    assert 'id="agri-download-json"' not in sidebar_template
    assert 'id="agri-download-csv"' not in sidebar_template
    assert 'id="agri-download-cycle-json"' not in sidebar_template
    assert 'id="agri-download-cycle-csv"' not in sidebar_template
    assert 'id="agri-manage-master-data"' not in sidebar_template
    assert 'id="agri-open-evidence"' not in sidebar_template
    assert 'id="agri-migrate-legacy"' not in sidebar_template
    assert "獨立 panel：不修改 Home Assistant 原生 /calendar" not in source



def test_calendar_sidebar_does_not_duplicate_fab_create_action():
    source = PANEL_JS.read_text(encoding="utf-8")

    assert 'id="new-event-fab"' in source
    assert 'id="new-event-side"' not in source



def test_master_data_management_is_inline_in_workbench_not_second_dialog():
    source = PANEL_JS.read_text(encoding="utf-8")
    master_start = source.index('if (tab === "master-data")')
    master_end = source.index('if (tab === "evidence")', master_start)
    master_tab = source[master_start:master_end]

    assert "_managementContentTemplate" in master_tab
    assert 'id="agri-manage-master-data"' not in source
    assert "_managementDialogOpen" not in source
    assert "management-dialog" not in source
    assert "trace-management-close" not in source


def test_master_data_management_uses_scalable_hierarchy_filters_not_flat_all_cycles():
    source = PANEL_JS.read_text(encoding="utf-8")

    assert 'id="trace-management-search"' in source
    assert 'id="trace-management-status-filter"' in source
    assert 'id="trace-cycle-page-size"' in source
    assert "_filteredManagementRecords" in source
    assert "visibleCycles" in source
    assert "cycleLimit" in source
    assert "farm → plot → cycle" in source
    assert "只顯示前" in source
    assert "filtered.cycles.slice(0, cycleLimit)" in source
