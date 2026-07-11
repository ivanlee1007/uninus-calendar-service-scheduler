from pathlib import Path

PANEL_JS = Path(
    "custom_components/uninus_calendar_service_scheduler/www/"
    "uninus-calendar-service-scheduler-panel.js"
)
INIT_PY = Path("custom_components/uninus_calendar_service_scheduler/__init__.py")


def test_cycle_create_update_apply_identity_generation_and_duplicate_guard():
    source = PANEL_JS.read_text(encoding="utf-8")

    assert "_prepareTraceCycleIdentity" in source
    assert "_findDuplicateTraceCycle" in source
    assert "LOT-" in source
    assert "TRACE-" in source
    assert "相同場區、產品、品種與開始日期" in source
    assert "trace_code: cycleIdentity.traceCode" in source
    assert "lot_number: cycleIdentity.lotNumber" in source
    assert "prepare_cycle_identity" in INIT_PY.read_text(encoding="utf-8")


def test_agri_calendar_event_edit_syncs_back_to_stored_operation():
    source = PANEL_JS.read_text(encoding="utf-8")

    assert "_syncAgriOperationForCurrentEvent" in source
    assert 'service: "update_agri_operation"' in source
    assert "AGRI_OPERATION_ID" in source
    assert "agriInfo.operationId" in source
    assert "await this._syncAgriOperationForCurrentEvent" in source


def test_agri_calendar_rows_reconcile_stale_stored_operations_from_event_payload():
    source = PANEL_JS.read_text(encoding="utf-8")

    assert "_reconcileStoredAgriOperationsFromCalendarRows" in source
    assert "calendarRow.cycle_id !== storedOperation.cycle_id" in source
    assert "event payload" in source
    assert "await this._reconcileStoredAgriOperationsFromCalendarRows" in source
    assert 'service: "update_agri_operation"' in source


def test_edit_dialog_can_clone_existing_event_into_new_event():
    source = PANEL_JS.read_text(encoding="utf-8")

    assert 'id="clone-event"' in source
    assert "複製行程" in source
    assert "_cloneCurrentEventForCreate" in source
    assert "this._editingEvent = undefined" in source
    assert "uid: \"\"" in source
    assert "actionId: \"\"" in source
    assert "operationId: \"\"" in source
    assert "calendarEventUid: \"\"" in source
    assert "已複製行程內容" in source
    assert "this._create()" in source


def test_agri_calendar_dialog_create_persists_new_operation_for_clones():
    source = PANEL_JS.read_text(encoding="utf-8")

    assert "_createAgriEventFromDialog" in source
    assert 'service: "create_agri_operation"' in source
    assert "operationId" in source
    assert "payload.description = await this._composeAgriDescription" in source
    assert "await this._createAgriEventFromDialog(payload)" in source


def test_workbench_exposes_operation_management_tab_for_mvp_traceability_governance():
    source = PANEL_JS.read_text(encoding="utf-8")

    assert 'workbench-tab-operations' in source
    assert "作業管理" in source
    assert "_operationsContentTemplate" in source
    assert "_filteredOperationRecords" in source
    assert 'id="trace-operation-search"' in source
    assert 'id="trace-operation-cycle-filter"' in source
    assert 'id="trace-operation-status-filter"' in source
    assert 'class="trace-select-operation"' in source
    assert "佐證" in source
    assert "Calendar" in source
    assert 'id="trace-operation-save"' in source
    assert 'id="trace-operation-archive"' in source
    assert 'service: "update_agri_operation"' in source



def test_evidence_tab_manages_existing_evidence_records_for_mvp_traceability_governance():
    source = PANEL_JS.read_text(encoding="utf-8")
    services_source = Path("custom_components/uninus_calendar_service_scheduler/services.yaml").read_text(encoding="utf-8")
    init_source = INIT_PY.read_text(encoding="utf-8")

    assert "_filteredEvidenceRecords" in source
    assert 'id="trace-evidence-search"' in source
    assert 'id="trace-evidence-operation-filter"' in source
    assert 'class="trace-select-evidence"' in source
    assert 'id="trace-evidence-save"' in source
    assert 'id="trace-evidence-delete"' in source
    assert "佐證預覽" in source
    assert 'service: "update_evidence"' in source
    assert 'service: "delete_evidence"' in source
    assert "update_evidence:" in services_source
    assert "delete_evidence:" in services_source
    assert "_update_evidence" in init_source
    assert "_delete_evidence" in init_source



def test_delete_agri_calendar_event_requires_explicit_operation_linkage_strategy():
    source = PANEL_JS.read_text(encoding="utf-8")

    assert "_currentAgriOperationId" in source
    assert "delete-this-event-keep-operation" in source
    assert "delete-this-event-archive-operation" in source
    assert "只刪除 Calendar 行程，保留農務作業" in source
    assert "封存農務作業並刪除行程" in source
    assert "_archiveAgriOperationForDeletedEvent" in source
    assert "deleteAgriStrategy" in source
    assert 'service: "update_agri_operation"' in source
    assert 'status: "skipped"' in source



def test_workbench_exposes_consistency_scan_and_repair_tools_for_traceability_mvp():
    source = PANEL_JS.read_text(encoding="utf-8")

    assert 'workbench-tab-consistency' in source
    assert "一致性掃描" in source
    assert "_traceabilityConsistencyReport" in source
    assert "orphanOperations" in source
    assert "calendarEventsWithoutStoredOperation" in source
    assert "duplicateOperationIds" in source
    assert "staleCycleOperations" in source
    assert "orphanEvidence" in source
    assert 'id="trace-repair-missing-calendar-linkage"' in source
    assert 'id="trace-delete-orphan-evidence"' in source
    assert "_repairMissingCalendarLinkage" in source
    assert "_deleteOrphanEvidence" in source



def test_readme_documents_traceability_governance_mvp_workflow():
    readme = Path("README.md").read_text(encoding="utf-8")

    assert "產銷履歷資料治理 MVP" in readme
    assert "農務作業管理" in readme
    assert "佐證資料管理" in readme
    assert "AGRI Calendar event 刪除策略" in readme
    assert "一致性掃描" in readme
    assert "安全刪除與封存" in readme



def test_traceability_workbench_uses_professional_cycle_centered_workspace_layout():
    source = PANEL_JS.read_text(encoding="utf-8")

    assert 'class="workbench-context-bar"' in source
    assert 'class="workbench-shell"' in source
    assert 'class="workbench-sidebar"' in source
    assert "生產紀錄" in source
    assert "基礎資料" in source
    assert "資料治理" in source
    assert 'class="trace-status-chip' in source
    assert 'class="trace-operations-master-detail"' in source
    assert "trace-operation-table" in source
    assert "trace-detail-panel" in source
    assert "trace-sticky-actions" in source
    assert "trace-master-hierarchy" in source
    assert 'id="trace-evidence-view-list"' in source
    assert 'id="trace-evidence-view-gallery"' in source
    assert 'class="trace-issue-inbox"' in source
    assert ".trace-issue-card.warning { color: var(--primary-text-color);" in source
    assert 'class="trace-export-stepper"' in source
    assert "技術資訊" in source


def test_master_data_forms_use_visible_sticky_action_bars():
    source = PANEL_JS.read_text(encoding="utf-8")

    for action_id in ("trace-farm-create", "trace-plot-create", "trace-cycle-create"):
        marker = f'id="{action_id}"'
        position = source.index(marker)
        opening = source.rfind('<div class="', 0, position)
        assert 'row-actions trace-sticky-actions' in source[opening:position]


def test_master_data_search_does_not_require_ancestor_name_to_match_child_query():
    source = PANEL_JS.read_text(encoding="utf-8")
    start = source.index("\n  _filteredManagementRecords()")
    end = source.index("\n  _managementTableRows", start)
    method = source[start:end]

    assert "statusFarms" in method
    assert "statusPlots" in method
    assert "plotSearchValues" in method
    assert "cycleSearchValues" in method
    assert "farmIds = new Set(farms.map" not in method
    assert "plotIds = new Set(plots.map" not in method


def test_sidebar_traceability_snapshot_is_compact_and_has_no_duplicate_quick_add():
    source = PANEL_JS.read_text(encoding="utf-8")
    start = source.index("\n  _traceabilityTemplate()")
    end = source.index("\n  _handleDelegatedClick", start)
    template = source[start:end]

    assert 'class="traceability-card traceability-snapshot"' in template
    assert 'class="traceability-scope"' in template
    assert 'class="traceability-snapshot-metrics"' in template
    assert 'data-workbench-tab="management"' in template
    assert 'data-workbench-tab="operations"' in template
    assert 'data-workbench-tab="evidence"' in template
    assert 'data-workbench-tab="consistency"' in template
    assert 'class="traceability-issue-preview' in template
    assert 'data-workbench-tab="consistency"><span><b>' in template
    assert 'class="traceability-recent-operation"' in template
    assert "開啟工作台" in template
    assert "新增農務作業" not in template
    assert "＋農務作業" not in template
    assert "@container traceability-sidebar (max-width: 220px)" in source


def test_all_agri_operation_type_selects_share_one_canonical_source():
    source = PANEL_JS.read_text(encoding="utf-8")
    canonical = '["播種/定植", "灌溉", "施肥", "病蟲害防治", "除草", "採收", "分級包裝", "清潔消毒", "自我查核", "異常事件"]'

    assert "_agriOperationTypes()" in source
    assert "_agriOperationTypeOptions(selected)" in source
    assert source.count(canonical) == 1
    assert source.count("this._agriOperationTypeOptions(") == 3
    assert 'const typeOptions = ["灌溉", "施肥"' not in source


def test_operation_quantity_and_unit_are_container_responsive():
    source = PANEL_JS.read_text(encoding="utf-8")

    assert 'class="inline-field operation-quantity-unit"' in source
    assert ".trace-operation-detail { container-type: inline-size;" in source
    assert ".operation-quantity-unit { grid-template-columns: repeat(2, minmax(0, 1fr));" in source
    assert "@container (max-width: 390px)" in source
    assert ".operation-quantity-unit { grid-template-columns: 1fr;" in source
    assert ".operation-quantity-unit label { min-width: 0; white-space: nowrap;" in source


def test_evidence_and_master_data_share_compact_master_detail_table_design():
    source = PANEL_JS.read_text(encoding="utf-8")

    assert 'class="trace-evidence-master-detail"' in source
    assert 'class="trace-data-table evidence-data-table"' in source
    assert "trace-evidence-detail trace-detail-panel" in source
    assert 'id="trace-evidence-new"' in source
    assert "佐證預覽" in source
    assert "trace-evidence-tech-details" in source

    assert 'id="trace-master-kind-farm"' in source
    assert 'id="trace-master-kind-plot"' in source
    assert 'id="trace-master-kind-cycle"' in source
    assert 'class="trace-master-breadcrumb"' in source
    assert 'class="trace-data-table master-data-table"' in source
    assert 'class="trace-master-detail trace-detail-panel"' in source
    assert "_managementTableRows" in source
    assert "managementKind" in source
    assert 'id="trace-management-page-size"' in source
    assert "_captureManagementPageSize" in source


def test_large_traceability_lists_are_paginated_and_capped_for_mvp_scale():
    source = PANEL_JS.read_text(encoding="utf-8")

    assert "_operationEvidenceCountMap" in source
    assert "_operationDateInRange" in source
    assert "operationDateRange" in source
    assert 'id="trace-operation-date-range"' in source
    assert 'id="trace-operation-page-size"' in source
    assert 'id="trace-operation-prev-page"' in source
    assert 'id="trace-operation-next-page"' in source
    assert "_pagedOperationRecords" in source
    assert "visibleOperations" in source
    assert "找到" in source and "顯示第" in source
    assert "請縮小搜尋" in source

    assert "_pagedEvidenceRecords" in source
    assert "evidencePageSize" in source
    assert 'id="trace-evidence-page-size"' in source
    assert 'id="trace-evidence-prev-page"' in source
    assert 'id="trace-evidence-next-page"' in source
    assert "visibleEvidence" in source

    assert "farmLimit" in source
    assert "plotLimit" in source
    assert "visibleFarms" in source
    assert "visiblePlots" in source
    assert 'id="trace-farm-page-size"' in source
    assert 'id="trace-plot-page-size"' in source



def test_safe_delete_surfaces_specific_traceability_blockers():
    source = PANEL_JS.read_text(encoding="utf-8")
    init_source = INIT_PY.read_text(encoding="utf-8")

    assert "_formatTraceDeleteError" in source
    assert "農務作業" in source
    assert "佐證資料" in source
    assert "無法刪除" in source
    assert "deletion_blockers(kind, record_id)" in init_source
    assert '"、".join(blockers)' in init_source


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


def test_workbench_open_button_has_direct_binding_and_delegated_fallback():
    source = PANEL_JS.read_text(encoding="utf-8")

    assert "_handleDelegatedClick" in source
    assert "_delegatedClickBound" in source
    assert 'querySelectorAll("#agri-open-workbench, [data-workbench-tab]")' in source
    assert 'control.addEventListener("click"' in source
    assert 'control.dataset.workbenchTab || "overview"' in source


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


def test_master_data_management_removes_duplicate_heading_and_uses_explicit_search():
    source = PANEL_JS.read_text(encoding="utf-8")
    template_start = source.index("\n  _managementContentTemplate()")
    template_end = source.index("_captureManagementForm()", template_start)
    template = source[template_start:template_end]
    bind_start = source.index('const managementSearch = this.shadowRoot.getElementById("trace-management-search")')
    bind_end = source.index('this.shadowRoot.querySelectorAll(".trace-select-farm")', bind_start)
    bind_block = source[bind_start:bind_end]

    assert "資料管理：農場 / 場區 / 生產週期管理" not in template
    assert "避免一次列出大量生產週期" not in template
    assert 'id="trace-management-apply-search"' in template
    assert 'managementSearchApplied' in source
    assert 'const query = String(f.managementSearchApplied || "").trim().toLowerCase();' in source
    assert 'managementSearch?.addEventListener("input"' in bind_block
    assert 'managementSearch?.addEventListener("input", () => this._captureManagementForm())' in bind_block
    assert 'managementSearch?.addEventListener("input", () => { this._captureManagementForm(); this._render(); })' not in bind_block
    assert 'getElementById("trace-management-apply-search")?.addEventListener("click", () => this._applyManagementSearch())' in bind_block


def test_master_data_delete_guidance_only_appears_under_safe_delete_actions():
    source = PANEL_JS.read_text(encoding="utf-8")
    template_start = source.index("\n  _managementContentTemplate()")
    template_end = source.index("_captureManagementForm()", template_start)
    template = source[template_start:template_end]

    delete_note = "只有無關聯資料才能刪除"
    search_section_end = template.index('<div class="fields">')
    assert delete_note not in template[:search_section_end]
    assert template.count(delete_note) == 3
    assert template.count('class="safe-delete-note system-note"') == 3
    for delete_id in ["trace-farm-delete", "trace-plot-delete", "trace-cycle-delete"]:
        delete_pos = template.index(delete_id)
        note_pos = template.index(delete_note, delete_pos)
        next_section = template.find('<section class="management-section fullrow">', delete_pos + 1)
        assert next_section == -1 or note_pos < next_section


def test_management_search_button_uses_compact_action_style():
    source = PANEL_JS.read_text(encoding="utf-8")
    template_start = source.index("\n  _managementContentTemplate()")
    template_end = source.index("_captureManagementForm()", template_start)
    template = source[template_start:template_end]

    assert 'class="management-search-action"' in template
    assert '<button id="trace-management-apply-search">搜尋</button>' in template
    assert '<button class="primary" id="trace-management-apply-search">搜尋</button>' not in template
    assert '.management-search-action { display: flex; align-items: flex-end; margin-bottom: 14px; }' in source
    assert '.management-search-action button { height: 40px; min-width: 64px; padding: 10px 16px; }' in source


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
    template_start = source.index("\n  _managementContentTemplate()")
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


def test_evidence_tab_starts_with_master_detail_without_recent_summary():
    source = PANEL_JS.read_text(encoding="utf-8")
    template_start = source.index("\n  _evidenceContentTemplate()")
    template_end = source.index("_captureEvidenceForm()", template_start)
    template = source[template_start:template_end]

    assert '<h3>佐證資料</h3>' not in template
    assert "_evidenceListTemplate" not in template
    assert "最近佐證資料" not in template
    assert 'class="trace-evidence-master-detail"' in template
    assert "新增佐證資料" in template
    assert 'id="trace-evidence-new"' in template


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
    assert 'class="traceability-scope"' in sidebar_template
    assert 'class="traceability-issue-preview' in sidebar_template
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
