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

    assert "農場 / 場區 / 生產週期管理" in source
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



def test_panel_exposes_inline_evidence_form_and_csv_download_controls():
    source = PANEL_JS.read_text(encoding="utf-8")

    assert "_evidenceContentTemplate" in source
    assert 'id="trace_evidence_operation"' in source
    assert 'id="trace-evidence-create"' in source
    assert 'service: "create_evidence"' in source
    assert "_downloadTraceabilityCsv" in source
    assert "traceability-export.csv" in source



def test_panel_exposes_cycle_filtered_export_controls():
    source = PANEL_JS.read_text(encoding="utf-8")

    assert 'id="trace_overview_cycle"' in source
    assert "_selectedExportCycleId" in source
    assert "_downloadTraceabilityCycleCsv" in source


def test_workbench_overview_uses_three_columns_without_duplicate_title():
    source = PANEL_JS.read_text(encoding="utf-8")
    overview_start = source.index('const migrationCount = this._legacyOperationsNeedingMigration().length;')
    overview_end = source.index('_evidenceContentTemplate()', overview_start)
    overview = source[overview_start:overview_end]

    assert '<h3>總覽</h3>' not in overview
    assert 'workbench-overview-grid' in overview
    assert 'workbench-overview-left' in overview
    assert 'workbench-overview-middle' in overview
    assert 'workbench-overview-right' in overview
    assert overview.index('workbench-overview-middle') < overview.index('最近作業') < overview.index('workbench-overview-right')
    assert '.workbench-overview-grid { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.6fr) minmax(0, 1.6fr);' in source
    assert '.workbench-overview-middle { min-height: 248px; margin-top: 0; }' in source



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


def test_workbench_open_button_has_delegated_click_fallback():
    source = PANEL_JS.read_text(encoding="utf-8")

    assert "_handleDelegatedClick" in source
    assert "_delegatedClickBound" in source
    assert 'this.shadowRoot.addEventListener("click", (ev) => this._handleDelegatedClick(ev))' in source
    assert 'target.closest("#agri-open-workbench")' in source
    assert 'target.closest("#traceability-status-open")' in source
    assert '_openTraceabilityWorkbench("overview")' in source


def test_traceability_sidebar_no_longer_exposes_export_button_stack():
    source = PANEL_JS.read_text(encoding="utf-8")
    template_start = source.index("_traceabilityTemplate()")
    template_end = source.index("_traceabilityWorkbenchTemplate()")
    sidebar_template = source[template_start:template_end]

    assert 'id="agri-open-workbench"' in sidebar_template
    assert 'id="agri-open-dialog"' not in sidebar_template
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


def test_sidebar_add_calendar_button_uses_local_calendar_config_flow():
    source = PANEL_JS.read_text(encoding="utf-8")
    render_start = source.index("\n  _render()")
    render_end = source.index("_monthTitle()", render_start)
    render_template = source[render_start:render_end]

    assert render_template.index('id="add-calendar"') < render_template.index('id="refresh"')
    assert "_calendarCreateDialogOpen" in source
    assert "_calendarCreateDialogTemplate" in source
    assert "新增行事曆" in source
    assert "本地端行事曆" in source
    assert "calendar_name" in source
    assert "local_calendar" in source
    assert "config/config_entries/flow" in source
    assert "create_empty" in source
    assert "import_ics_file" in source


def test_calendar_create_dialog_preserves_name_while_typing():
    source = PANEL_JS.read_text(encoding="utf-8")

    assert "!this._calendarCreateDialogOpen" in source
    assert 'getElementById("calendar-create-name")?.addEventListener("input"' in source
    assert "this._calendarCreateForm.name = ev.target.value" in source


def test_editing_event_can_move_between_calendars_with_create_then_delete():
    source = PANEL_JS.read_text(encoding="utf-8")

    assert "_originalEventCalendarEntity" in source
    assert "_eventCalendarChanged" in source
    assert "_moveCurrentEventToCalendar" in source
    assert "calendar/event/create" in source
    assert "calendar/event/delete" in source
    assert "entity_id: originalCalendar" in source
    assert "if (this._eventCalendarChanged(payload))" in source



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


def test_master_data_management_removes_duplicate_heading_and_keeps_search_focus():
    source = PANEL_JS.read_text(encoding="utf-8")
    template_start = source.index("_managementContentTemplate()")
    template_end = source.index("_captureManagementForm()", template_start)
    template = source[template_start:template_end]
    bind_start = source.index('const managementSearch = this.shadowRoot.getElementById("trace-management-search")')
    bind_end = source.index('this.shadowRoot.querySelectorAll(".trace-select-farm")', bind_start)
    bind_block = source[bind_start:bind_end]

    assert "資料管理：農場 / 場區 / 生產週期管理" not in template
    assert "避免一次列出大量生產週期" not in template
    assert 'managementSearch?.addEventListener("input"' in bind_block
    assert 'managementSearch?.addEventListener("input", () => this._captureManagementForm())' in bind_block
    assert 'managementSearch?.addEventListener("input", () => { this._captureManagementForm(); this._render(); })' not in bind_block


def test_master_data_management_uses_scalable_hierarchy_filters_not_flat_all_cycles():
    source = PANEL_JS.read_text(encoding="utf-8")

    assert 'id="trace-management-search"' in source
    assert 'id="trace-management-status-filter"' in source
    assert 'id="trace-cycle-page-size"' in source
    assert "_filteredManagementRecords" in source
    assert "visibleCycles" in source
    assert "cycleLimit" in source
    assert "只顯示前" in source
    assert "filtered.cycles.slice(0, cycleLimit)" in source


def test_identity_fields_are_editable_comboboxes_for_create_or_edit():
    source = PANEL_JS.read_text(encoding="utf-8")
    template_start = source.index("_managementContentTemplate()")
    template_end = source.index("_captureManagementForm()", template_start)
    template = source[template_start:template_end]

    assert 'list="trace-farm-name-options"' in template
    assert 'datalist id="trace-farm-name-options"' in template
    assert "farmNameOptions" in template
    assert "_findTraceFarmByName" in source
    assert "_applyFarmNameComboboxSelection" in source
    assert 'getElementById("trace_farm_name")?.addEventListener("input", () => this._captureManagementForm())' in source
    assert 'getElementById("trace_farm_name")?.addEventListener("change", () => this._applyFarmNameComboboxSelection())' in source

    assert 'list="trace-plot-name-options"' in template
    assert 'datalist id="trace-plot-name-options"' in template
    assert "plotNameOptions" in template
    assert "_findTracePlotByName" in source
    assert "_applyPlotNameComboboxSelection" in source
    assert 'getElementById("trace_plot_name")?.addEventListener("input", () => this._captureManagementForm())' in source
    assert 'getElementById("trace_plot_name")?.addEventListener("change", () => this._applyPlotNameComboboxSelection())' in source

    assert 'list="trace-cycle-identifier-options"' in template
    assert 'datalist id="trace-cycle-identifier-options"' in template
    assert "cycleIdentifierOptions" in template
    assert "_findTraceCycleByIdentifier" in source
    assert "_applyCycleIdentifierComboboxSelection" in source
    assert 'getElementById("trace_cycle_trace_code")?.addEventListener("input", () => this._captureManagementForm())' in source
    assert 'getElementById("trace_cycle_trace_code")?.addEventListener("change", () => this._applyCycleIdentifierComboboxSelection())' in source



def test_evidence_management_is_inline_in_workbench_not_second_dialog():
    source = PANEL_JS.read_text(encoding="utf-8")
    evidence_start = source.index('if (tab === "evidence")')
    evidence_end = source.index('if (tab === "export")', evidence_start)
    evidence_tab = source[evidence_start:evidence_end]

    assert "_evidenceContentTemplate" in evidence_tab
    assert 'id="agri-open-evidence"' not in source
    assert "_evidenceDialogOpen" not in source
    assert "evidence-dialog" not in source
    assert "_openEvidenceDialog" not in source
    assert "_closeEvidenceDialog" not in source


def test_workbench_tabs_do_not_open_secondary_management_or_evidence_dialogs():
    source = PANEL_JS.read_text(encoding="utf-8")

    assert 'id="agri-manage-master-data"' not in source
    assert 'id="agri-open-evidence"' not in source
    assert "management-dialog" not in source
    assert "evidence-dialog" not in source
    assert "_managementDialogOpen" not in source
    assert "_evidenceDialogOpen" not in source



def test_inline_master_data_ui_exposes_safe_delete_controls():
    source = PANEL_JS.read_text(encoding="utf-8")

    assert 'id="trace-farm-delete"' in source
    assert 'id="trace-plot-delete"' in source
    assert 'id="trace-cycle-delete"' in source
    assert "_deleteTraceFarm" in source
    assert "_deleteTracePlot" in source
    assert "_deleteTraceCycle" in source
    assert '"delete_farm"' in source
    assert '"delete_plot"' in source
    assert '"delete_crop_cycle"' in source
    assert "只有無關聯資料才能刪除" in source


def test_traceability_scope_and_integrity_move_from_sidebar_to_overview():
    source = PANEL_JS.read_text(encoding="utf-8")
    template_start = source.index("_traceabilityTemplate()")
    template_end = source.index("_handleDelegatedClick", template_start)
    sidebar_template = source[template_start:template_end]
    overview_start = source.index('const operations = this._traceabilitySummary().recent_operations')
    overview_end = source.index("_evidenceContentTemplate()", overview_start)
    overview_template = source[overview_start:overview_end]

    assert "目前週期<select" not in sidebar_template
    assert 'id="trace_export_cycle"' not in sidebar_template
    assert 'class="traceability-status compact"' in sidebar_template
    assert 'id="trace_overview_cycle"' in overview_template
    assert "目前檢視範圍" in overview_template
    assert "履歷摘要" in overview_template
    assert "匯出前檢查" in overview_template


def test_agri_and_calendar_create_buttons_share_bottom_right_fab_group():
    source = PANEL_JS.read_text(encoding="utf-8")
    render_start = source.index("\n  _render()")
    render_end = source.index("_monthTitle()", render_start)
    render_template = source[render_start:render_end]
    sidebar_start = source.index("_traceabilityTemplate()")
    sidebar_end = source.index("_handleDelegatedClick", sidebar_start)
    sidebar_template = source[sidebar_start:sidebar_end]

    assert 'class="fab-group"' in render_template
    assert render_template.index('id="agri-open-dialog"') < render_template.index('id="new-event-fab"')
    assert 'class="primary fab-button" id="agri-open-dialog"' in render_template
    assert 'class="primary fab-button" id="new-event-fab"' in render_template
    assert 'id="agri-open-dialog"' not in sidebar_template
