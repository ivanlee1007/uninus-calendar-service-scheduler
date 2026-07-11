class UninusCalendarServiceSchedulerPanel extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._hass = undefined;
    this._events = [];
    this._calendarTraceabilityRows = [];
    this._message = "";
    this._dialogOpen = false;
    this._agriDialogOpen = false;
    this._traceabilityWorkbenchOpen = false;
    this._traceabilityWorkbenchTab = "overview";
    this._lastExportPayload = undefined;
    this._lastCycleExportPayload = undefined;
    this._selectedExportCycleId = "";
    this._deleteConfirmOpen = false;
    this._editConfirmOpen = false;
    this._pendingUpdatePayload = undefined;
    this._calendarCreateDialogOpen = false;
    this._calendarCreateForm = { name: "", importMode: "create_empty", icsFileName: "" };
    this._selectedCalendar = "";
    this._selectedCalendars = [];
    this._loading = false;
    this._visibleMonth = new Date();
    this._viewMode = this._loadViewMode();
    this._form = this._defaultForm();
    this._editingEvent = undefined;
    this._helpersPromise = undefined;
    this._haPickersReady = false;
    this._haEntityPickerReady = false;
    this._actionOverrides = new Map();
    this._calendarListScrollTop = 0;
    this._agriForm = this._defaultAgriForm();
    this._managementForm = this._defaultManagementForm();
    this._operationForm = this._defaultOperationForm();
    this._evidenceForm = this._defaultEvidenceForm();
  }

  set hass(hass) {
    const oldHass = this._hass;
    this._hass = hass;
    const calendarIds = this._calendarIds();
    if (!this._selectedCalendars.length) {
      const savedCalendars = this._loadSelectedCalendars().filter((id) => calendarIds.includes(id));
      this._selectedCalendars = savedCalendars.length ? savedCalendars : calendarIds.slice(0, 1);
    }
    if (!this._selectedCalendar) {
      this._selectedCalendar = this._selectedCalendars[0] || calendarIds[0] || "";
      this._form.calendar = this._selectedCalendar;
    }
    this._ensureHaPickers();
    if (!this._dialogOpen && !this._agriDialogOpen && !this._traceabilityWorkbenchOpen && !this._calendarCreateDialogOpen) this._render();
    if (!oldHass && this._selectedCalendars.length) this._loadEvents();
  }

  set panel(panel) {
    this._panel = panel;
  }

  _defaultForm() {
    const now = new Date();
    const start = new Date(now.getTime() + 60 * 60 * 1000);
    const end = new Date(now.getTime() + 2 * 60 * 60 * 1000);
    return {
      calendar: this._selectedCalendar || "",
      summary: "",
      location: "",
      allDay: false,
      start: this._localInputValue(start),
      end: this._localInputValue(end),
      rrule: "",
      service: "",
      target: {},
      serviceAction: { action: "", target: {}, data: {} },
      endService: "",
      endTarget: {},
      endData: "",
      endServiceAction: { action: "", target: {}, data: {} },
      actionId: "",
      uid: "",
      recurrenceId: null,
      data: "",
      description: "",
      eventType: "normal",
      agri: this._defaultAgriFields(),
      agriHashValid: true,
      agriHashChecked: false,
    };
  }

  _defaultAgriFields() {
    return {
      cycleId: "",
      operationType: "灌溉",
      actualStart: this._localInputValue(new Date()),
      operator: "",
      materialName: "",
      quantity: "",
      unit: "",
      sensorEntities: "",
    };
  }

  _defaultAgriForm() {
    return {
      cycleId: "",
      operationType: "灌溉",
      actualStart: this._localInputValue(new Date()),
      operator: "",
      materialName: "",
      quantity: "",
      unit: "",
      sensorEntities: "",
      notes: "",
      calendar: this._selectedCalendar || "",
      operationId: "",
      calendarEventUid: "",
    };
  }

  _defaultManagementForm() {
    return {
      selectedFarmId: "",
      selectedPlotId: "",
      selectedCycleId: "",
      managementSearch: "",
      managementSearchApplied: "",
      managementStatusFilter: "active",
      managementKind: "cycle",
      farmLimit: "25",
      plotLimit: "25",
      cycleLimit: "25",
      farmStatus: "active",
      farmName: "",
      farmOperator: "",
      farmAddress: "",
      farmPhone: "",
      plotFarmId: "",
      plotName: "",
      plotProduct: "",
      plotTgapCategory: "水果類",
      plotArea: "",
      plotLocation: "",
      plotStatus: "active",
      cyclePlotId: "",
      cycleProduct: "",
      cycleVariety: "",
      cycleLotNumber: "",
      cycleTraceCode: "",
      cycleStartDate: this._dateInputValue(new Date()),
      cycleExpectedHarvestDate: "",
      cycleActualHarvestDate: "",
      cycleStatus: "active",
    };
  }


  _defaultEvidenceForm() {
    return {
      selectedEvidenceId: "",
      evidenceSearch: "",
      evidenceSearchApplied: "",
      evidenceOperationFilter: "",
      evidencePage: 0,
      evidencePageSize: "50",
      evidenceView: "list",
      operationId: "",
      evidenceType: "sensor_snapshot",
      title: "",
      sourceEntity: "",
      uri: "",
      content: "{}",
    };
  }

  _defaultOperationForm() {
    return {
      selectedOperationId: "",
      operationSearch: "",
      operationSearchApplied: "",
      operationCycleFilter: "",
      operationStatusFilter: "all",
      operationDateRange: "recent30",
      operationPage: 0,
      operationPageSize: "50",
      cycleId: "",
      operationType: "灌溉",
      actualStart: "",
      operator: "",
      materialName: "",
      quantity: "",
      unit: "",
      sensorEntities: "",
      notes: "",
      calendarEntity: "",
      calendarEventUid: "",
      status: "planned",
    };
  }

  async _ensureHaPickers() {
    if (this._helpersPromise) return this._helpersPromise;
    this._helpersPromise = (async () => {
      try {
        if (window.loadCardHelpers) await window.loadCardHelpers();
        await Promise.race([
          Promise.all([
            customElements.whenDefined("ha-service-picker"),
            customElements.whenDefined("ha-entity-picker"),
          ]),
          new Promise((resolve) => setTimeout(resolve, 2500)),
        ]);
      } catch (_err) {
        // Keep the plain input fallback if HA's picker elements are not available.
      }
      this._haPickersReady = Boolean(
        customElements.get("ha-service-picker")
      );
      this._haEntityPickerReady = Boolean(customElements.get("ha-entity-picker"));
      if (!this._dialogOpen && !this._agriDialogOpen && !this._traceabilityWorkbenchOpen && !this._calendarCreateDialogOpen) this._render();
    })();
    return this._helpersPromise;
  }

  _calendarIds() {

    return Object.keys(this._hass?.states || {})
      .filter((id) => id.startsWith("calendar."))
      .sort();
  }

  _selectedCalendarsStorageKey() {
    return "uninus-calendar-service-scheduler:selectedCalendars";
  }

  _viewModeStorageKey() {
    return "uninus-calendar-service-scheduler:viewMode";
  }

  _loadViewMode() {
    try {
      const value = localStorage.getItem(this._viewModeStorageKey());
      return ["month", "week", "day"].includes(value) ? value : "month";
    } catch (_err) {
      return "month";
    }
  }

  _saveViewMode() {
    try {
      localStorage.setItem(this._viewModeStorageKey(), this._viewMode);
    } catch (_err) {
      // Ignore storage failures; the current in-memory view mode still works.
    }
  }

  _loadSelectedCalendars() {
    try {
      const raw = localStorage.getItem(this._selectedCalendarsStorageKey());
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed.filter((id) => typeof id === "string") : [];
    } catch (_err) {
      return [];
    }
  }

  _saveSelectedCalendars() {
    try {
      localStorage.setItem(this._selectedCalendarsStorageKey(), JSON.stringify(this._selectedCalendars));
    } catch (_err) {
      // Ignore storage failures; selection still works for the current session.
    }
  }

  _calendarOptions(selected = this._selectedCalendar) {
    return this._calendarIds()
      .map((id) => `<option value="${this._escape(id)}" ${id === selected ? "selected" : ""}>${this._escape(this._stateName(id))}</option>`)
      .join("");
  }

  _calendarChecklist() {
    const selected = new Set(this._selectedCalendars.length ? this._selectedCalendars : [this._selectedCalendar].filter(Boolean));
    return this._calendarIds()
      .map((id) => `<label class="calendar-check"><input type="checkbox" class="calendar-choice" value="${this._escape(id)}" ${selected.has(id) ? "checked" : ""} /> <span>${this._escape(this._stateName(id))}</span><code>${this._escape(id)}</code></label>`)
      .join("");
  }

  _selectedCalendarLabel() {
    const count = this._selectedCalendars.length;
    if (!count) return "未選擇 Calendar";
    if (count === 1) return this._stateName(this._selectedCalendars[0]);
    return `已選擇 ${count} 個 Calendar`;
  }

  _stateName(entityId) {
    return this._hass?.states?.[entityId]?.attributes?.friendly_name || entityId;
  }

  _serviceOptions(selected = "") {
    const services = [];
    Object.entries(this._hass?.services || {}).forEach(([domain, domainServices]) => {
      Object.keys(domainServices || {}).forEach((service) => services.push(`${domain}.${service}`));
    });
    return [`<option value="">選擇 service</option>`]
      .concat(services.sort().map((id) => `<option value="${this._escape(id)}" ${id === selected ? "selected" : ""}>${this._escape(id)}</option>`))
      .join("");
  }

  _actionSection(prefix, title, service, target, dataText, note) {
    const serviceId = `${prefix}_service`;
    const pickerId = `${prefix}-service-picker`;
    const entityId = `${prefix}-entity-picker`;
    const fallbackEntityId = `${prefix}_entity`;
    const dataId = `${prefix}_data`;
    return `<fieldset class="action-section fullrow">
      <legend>${this._escape(title)}</legend>
      ${this._haPickersReady
        ? `<div class="native-control"><div class="native-label">Service / Action</div><ha-service-picker id="${pickerId}" show-service-id></ha-service-picker></div>`
        : `<label>Service<select id="${serviceId}">${this._serviceOptions(service)}</select></label>`}
      <div class="native-control">
        ${this._haEntityPickerReady
          ? `<ha-entity-picker id="${entityId}" label="Target entity_id" show-entity-id allow-custom-entity></ha-entity-picker>`
          : `<label>Target entity_id<select id="${fallbackEntityId}">${this._entityOptions(target?.entity_id || "")}</select></label>`}
        <div class="field-note">${this._escape(note)}</div>
      </div>
      <label>Service data JSON
        <textarea id="${dataId}" placeholder='{"brightness_pct": 80}'>${this._escape(dataText || "")}</textarea>
      </label>
    </fieldset>`;
  }

  _recurrenceOptions(selectedRrule = "") {
    const selected = this._recurrencePresetFromRrule(selectedRrule);
    const options = [
      ["", "不重複"],
      ["yearly", "每年"],
      ["monthly", "每月"],
      ["weekly", "每週"],
      ["daily", "每天"],
    ];
    if (selected === "custom") options.push(["custom", "自訂 RRULE"]);
    return options
      .map(([value, label]) => `<option value="${value}" ${value === selected ? "selected" : ""}>${label}</option>`)
      .join("");
  }

  _parseRrule(rrule = "") {
    const parsed = {};
    String(rrule || "").split(";").forEach((part) => {
      const [key, ...rest] = part.split("=");
      if (key) parsed[key.trim().toUpperCase()] = rest.join("=").trim().toUpperCase();
    });
    return parsed;
  }

  _recurrencePresetFromRrule(rrule = "") {
    const parsed = this._parseRrule(rrule);
    if (!parsed.FREQ) return "";
    if (parsed.FREQ === "DAILY") return "daily";
    if (parsed.FREQ === "WEEKLY") return "weekly";
    if (parsed.FREQ === "MONTHLY") return "monthly";
    if (parsed.FREQ === "YEARLY") return "yearly";
    return "custom";
  }

  _recurrenceConfigFromRrule(rrule = "", startValue = this._form?.start) {
    const parsed = this._parseRrule(rrule);
    const start = new Date(startValue || this._localInputValue());
    const safeStart = Number.isNaN(start.getTime()) ? new Date() : start;
    const byday = parsed.BYDAY || "";
    const config = {
      preset: this._recurrencePresetFromRrule(rrule),
      interval: Math.max(parseInt(parsed.INTERVAL || "1", 10) || 1, 1),
      weekdays: byday ? byday.split(",").filter(Boolean) : [this._weekdayCode(safeStart.getDay())],
      monthlyMode: parsed.BYDAY ? "weekday" : "monthday",
      end: parsed.COUNT ? "count" : (parsed.UNTIL ? "until" : "never"),
      count: Math.max(parseInt(parsed.COUNT || "10", 10) || 10, 1),
      until: parsed.UNTIL ? this._dateFromUntil(parsed.UNTIL) : this._dateInputValue(safeStart),
      custom: String(rrule || ""),
    };
    return config;
  }

  _dateFromUntil(value = "") {
    const raw = String(value || "");
    if (/^\d{8}/.test(raw)) return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
    return this._dateInputValue(new Date());
  }

  _untilFromDate(value = "") {
    const compact = String(value || "").replace(/-/g, "");
    return /^\d{8}$/.test(compact) ? `${compact}T235959Z` : "";
  }

  _weekdayCode(dayIndex) {
    return ["SU", "MO", "TU", "WE", "TH", "FR", "SA"][dayIndex] || "MO";
  }

  _weekdayLabel(code) {
    return { SU: "日", MO: "一", TU: "二", WE: "三", TH: "四", FR: "五", SA: "六" }[code] || code;
  }

  _weekdayLongLabel(code) {
    return { SU: "週日", MO: "週一", TU: "週二", WE: "週三", TH: "週四", FR: "週五", SA: "週六" }[code] || code;
  }

  _nthWeekdayOfMonth(date) {
    return Math.floor((date.getDate() - 1) / 7) + 1;
  }

  _nthLabel(n) {
    return ["", "第一個", "第二個", "第三個", "第四個", "第五個"][n] || `第 ${n} 個`;
  }

  _monthlyOptions(startValue = this._form?.start, selected = "monthday") {
    const date = new Date(startValue || this._localInputValue());
    const safeDate = Number.isNaN(date.getTime()) ? new Date() : date;
    const day = safeDate.getDate();
    const nth = this._nthWeekdayOfMonth(safeDate);
    const weekday = this._weekdayLongLabel(this._weekdayCode(safeDate.getDay()));
    return [
      ["monthday", `每月 在 ${day}`],
      ["weekday", `每月 在${this._nthLabel(nth)}${weekday}`],
    ].map(([value, label]) => `<option value="${value}" ${value === selected ? "selected" : ""}>${this._escape(label)}</option>`).join("");
  }

  _yearlyRuleLabel(startValue = this._form?.start) {
    const date = new Date(startValue || this._localInputValue());
    const safeDate = Number.isNaN(date.getTime()) ? new Date() : date;
    return `每年 在 ${safeDate.getMonth() + 1} 月 ${safeDate.getDate()} 日`;
  }

  _recurrenceTemplate() {
    const f = this._form;
    const config = this._recurrenceConfigFromRrule(f.rrule, f.start);
    const preset = config.preset;
    const unit = { daily: "日", weekly: "週", monthly: "月", yearly: "年" }[preset] || "";
    const weekdayOrder = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];
    return `
      <label class="fullrow">重複
        <select id="recurrence">${this._recurrenceOptions(f.rrule)}</select>
      </label>
      ${preset && preset !== "custom" ? `<label class="fullrow">重複頻率
        <div class="inline-field"><input id="recurrence_interval" type="number" min="1" step="1" value="${this._escape(config.interval)}" /><span>${unit}</span></div>
      </label>` : ""}
      ${preset === "weekly" ? `<div class="fullrow recurrence-weekdays" aria-label="每週重複日">
        ${weekdayOrder.map((code) => `<label class="weekday-chip"><input class="recurrence-weekday" type="checkbox" value="${code}" ${config.weekdays.includes(code) ? "checked" : ""}/><span>${this._weekdayLabel(code)}</span></label>`).join("")}
      </div>` : ""}
      ${preset === "monthly" ? `<label class="fullrow">每月重複
        <select id="recurrence_monthly_mode">${this._monthlyOptions(f.start, config.monthlyMode)}</select>
      </label>` : ""}
      ${preset === "yearly" ? `<div class="fullrow field-note recurrence-summary">${this._escape(this._yearlyRuleLabel(f.start))}</div>` : ""}
      ${preset && preset !== "custom" ? `<label class="fullrow">結束
        <select id="recurrence_end">
          <option value="never" ${config.end === "never" ? "selected" : ""}>持續不停</option>
          <option value="until" ${config.end === "until" ? "selected" : ""}>直到日期</option>
          <option value="count" ${config.end === "count" ? "selected" : ""}>重複次數</option>
        </select>
      </label>
      ${config.end === "until" ? `<label class="fullrow">直到
        <input id="recurrence_until" type="date" value="${this._escape(config.until)}" />
      </label>` : ""}
      ${config.end === "count" ? `<label class="fullrow">重複次數
        <input id="recurrence_count" type="number" min="1" step="1" value="${this._escape(config.count)}" />
      </label>` : ""}` : ""}
      ${preset === "custom" ? `<label class="fullrow">自訂 RRULE
        <input id="rrule_custom" value="${this._escape(f.rrule)}" placeholder="FREQ=WEEKLY;COUNT=4" />
      </label>` : ""}
    `;
  }

  _rruleFromRecurrenceControls() {
    const preset = this.shadowRoot.getElementById("recurrence")?.value || "";
    if (!preset) return "";
    if (preset === "custom") return this.shadowRoot.getElementById("rrule_custom")?.value || this._form.rrule || "";
    const parts = [`FREQ=${{ daily: "DAILY", weekly: "WEEKLY", monthly: "MONTHLY", yearly: "YEARLY" }[preset]}`];
    const interval = Math.max(parseInt(this.shadowRoot.getElementById("recurrence_interval")?.value || "1", 10) || 1, 1);
    if (interval > 1) parts.push(`INTERVAL=${interval}`);
    const start = new Date(this.shadowRoot.getElementById("start")?.value || this._form.start || this._localInputValue());
    const safeStart = Number.isNaN(start.getTime()) ? new Date() : start;
    if (preset === "weekly") {
      const days = Array.from(this.shadowRoot.querySelectorAll(".recurrence-weekday:checked")).map((el) => el.value);
      parts.push(`BYDAY=${(days.length ? days : [this._weekdayCode(safeStart.getDay())]).join(",")}`);
    }
    if (preset === "monthly") {
      if (this.shadowRoot.getElementById("recurrence_monthly_mode")?.value === "weekday") {
        parts.push(`BYDAY=${this._nthWeekdayOfMonth(safeStart)}${this._weekdayCode(safeStart.getDay())}`);
      } else {
        parts.push(`BYMONTHDAY=${safeStart.getDate()}`);
      }
    }
    if (preset === "yearly") {
      parts.push(`BYMONTH=${safeStart.getMonth() + 1}`);
      parts.push(`BYMONTHDAY=${safeStart.getDate()}`);
    }
    const endMode = this.shadowRoot.getElementById("recurrence_end")?.value || "never";
    if (endMode === "until") {
      const untilDate = this.shadowRoot.getElementById("recurrence_until")?.value || this._dateInputValue(safeStart);
      const until = this._untilFromDate(untilDate);
      if (until) parts.push(`UNTIL=${until}`);
    } else if (endMode === "count") {
      const count = Math.max(parseInt(this.shadowRoot.getElementById("recurrence_count")?.value || "1", 10) || 1, 1);
      parts.push(`COUNT=${count}`);
    }
    return parts.join(";");
  }

  _entityOptions(selected = "") {
    return [`<option value="">不指定 entity</option>`]
      .concat(Object.keys(this._hass?.states || {})
      .sort()
      .map((id) => `<option value="${this._escape(id)}" ${id === selected ? "selected" : ""}>${this._escape(this._stateName(id))} (${this._escape(id)})</option>`))
      .join("");
  }

  _escape(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  _pad(value) {
    return String(value).padStart(2, "0");
  }

  _localInputValue(date = new Date()) {
    return `${date.getFullYear()}-${this._pad(date.getMonth() + 1)}-${this._pad(date.getDate())}T${this._pad(date.getHours())}:${this._pad(date.getMinutes())}`;
  }

  _durationMs(startValue, endValue) {
    const start = new Date(startValue);
    const end = new Date(endValue);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 5 * 60 * 1000;
    return Math.max(end.getTime() - start.getTime(), 60 * 1000);
  }

  _dateInputValue(date = new Date()) {
    return `${date.getFullYear()}-${this._pad(date.getMonth() + 1)}-${this._pad(date.getDate())}`;
  }

  _dateOnly(value) {
    if (!value) return "";
    const raw = String(value).trim();
    const isoDate = raw.match(/^(\d{4}-\d{2}-\d{2})/);
    if (isoDate) return isoDate[1];
    const date = value instanceof Date ? value : new Date(raw);
    if (Number.isNaN(date.getTime())) return "";
    return this._dateInputValue(date);
  }

  _addDateDays(dateValue, days = 1) {
    const normalized = this._dateOnly(dateValue);
    const [year, month, day] = normalized.split("-").map((part) => parseInt(part, 10));
    if (!year || !month || !day) return normalized;
    const date = new Date(year, month - 1, day);
    date.setDate(date.getDate() + days);
    return this._dateInputValue(date);
  }

  _exclusiveAllDayEndDate(startValue, endValue) {
    const start = this._dateOnly(startValue);
    const end = this._dateOnly(endValue) || start;
    if (!start) return end;
    return !end || end <= start ? this._addDateDays(start, 1) : end;
  }

  _toIsoWithOffset(localValue) {
    if (!localValue) return "";
    const date = new Date(localValue);
    if (Number.isNaN(date.getTime())) return localValue;
    const offset = -date.getTimezoneOffset();
    const sign = offset >= 0 ? "+" : "-";
    const hh = this._pad(Math.floor(Math.abs(offset) / 60));
    const mm = this._pad(Math.abs(offset) % 60);
    return `${localValue}:00${sign}${hh}:${mm}`;
  }

  _styles() {
    return `
      :host { display: block; min-height: 100vh; background: var(--primary-background-color); color: var(--primary-text-color); }
      .appbar { height: 64px; display: flex; align-items: center; gap: 12px; padding: 0 20px; background: var(--app-header-background-color, var(--primary-color)); color: var(--app-header-text-color, white); box-shadow: var(--app-header-shadow, 0 2px 4px rgba(0,0,0,.2)); position: sticky; top: 0; z-index: 3; }
      .appbar h1 { margin: 0; font-size: 20px; font-weight: 500; flex: 1; }
      .appbar a, .appbar button { color: inherit; }
      .layout { display: grid; grid-template-columns: 280px minmax(0, 1fr); min-height: calc(100vh - 64px); }
      .side { border-inline-end: 1px solid var(--divider-color); background: var(--card-background-color); padding: 16px; }
      .calendar-menu { border: 1px solid var(--divider-color); border-radius: 12px; margin-bottom: 14px; overflow: hidden; }
      .calendar-menu summary { cursor: pointer; padding: 10px 12px; font-weight: 600; list-style: none; background: var(--secondary-background-color); }
      .calendar-menu summary::-webkit-details-marker { display: none; }
      .calendar-list { display: flex; flex-direction: column; gap: 4px; max-height: 260px; overflow: auto; padding: 8px; }
      .calendar-check { display: grid; grid-template-columns: auto minmax(0, 1fr); column-gap: 8px; row-gap: 2px; align-items: center; margin: 0; padding: 8px; border-radius: 8px; font-weight: 500; }
      .calendar-check:hover { background: var(--secondary-background-color); }
      .calendar-check input { width: auto; grid-row: 1 / span 2; }
      .calendar-check span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .calendar-check code { grid-column: 2; color: var(--secondary-text-color); font-size: 11px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .main { min-width: 0; padding: 16px; }
      label { display: flex; flex-direction: column; gap: 6px; font-weight: 500; margin-bottom: 14px; }
      input, select, textarea { box-sizing: border-box; width: 100%; padding: 10px 12px; border: 1px solid var(--divider-color); border-radius: 10px; background: var(--card-background-color); color: var(--primary-text-color); font: inherit; }
      ha-service-picker, ha-target-picker, ha-entity-picker { width: 100%; }
      ha-service-picker { display: block; width: 100%; }
      .native-control { display: flex; flex-direction: column; gap: 6px; margin-bottom: 10px; }
      .native-label { font-weight: 500; }
      .action-section { border: 1px solid var(--divider-color); border-radius: 16px; padding: 14px; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
      .action-section legend { padding: 0 8px; font-weight: 700; }
      .action-section textarea, .action-section label, .action-section .native-control { margin-bottom: 0; }
      .field-note { color: var(--secondary-text-color); font-size: 12px; line-height: 1.35; }
      .inline-field { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 10px; align-items: center; }
      .inline-field span { color: var(--secondary-text-color); padding-inline-end: 12px; }
      .recurrence-weekdays { display: flex; gap: 8px; flex-wrap: wrap; margin: -4px 0 10px; }
      .weekday-chip { margin: 0; display: inline-flex; align-items: center; cursor: pointer; }
      .weekday-chip input { position: absolute; opacity: 0; pointer-events: none; }
      .weekday-chip span { min-width: 32px; padding: 8px 12px; border: 1px solid var(--divider-color); border-radius: 14px; text-align: center; background: var(--card-background-color); }
      .weekday-chip input:checked + span { background: var(--primary-color); color: var(--text-primary-color); border-color: var(--primary-color); }
      .recurrence-summary { margin-top: -8px; }
      textarea { min-height: 86px; font-family: var(--code-font-family, monospace); }
      button { border: 0; border-radius: 20px; padding: 10px 16px; cursor: pointer; font-weight: 600; background: var(--secondary-background-color); color: var(--primary-text-color); }
      button.primary { background: var(--primary-color); color: var(--text-primary-color); }
      button.full { width: 100%; margin-top: 6px; }
      .fab-group { position: fixed; right: 24px; bottom: 24px; z-index: 4; display: flex; gap: 10px; align-items: center; justify-content: flex-end; }
      .fab-button { min-width: 132px; min-height: 44px; border-radius: 24px; padding: 12px 18px; box-shadow: 0 6px 16px rgba(0,0,0,.22); font-size: 14px; }
      .monthbar { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 12px; }
      .monthbar h2 { margin: 0; font-weight: 500; font-size: 22px; text-align: center; flex: 1; }
      .nav { display: flex; gap: 8px; align-items: center; }
      .view-switch { display: inline-flex; overflow: hidden; border-radius: 20px; background: var(--secondary-background-color); }
      .view-switch button { border-radius: 0; min-width: 48px; padding: 8px 12px; background: transparent; }
      .view-switch button.active { background: var(--primary-color); color: var(--text-primary-color); }
      .calendar-card { border: 1px solid var(--divider-color); border-radius: 14px; overflow: hidden; background: var(--card-background-color); }
      .weekdays, .monthgrid, .weekgrid { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); }
      .weekday { padding: 10px; color: var(--secondary-text-color); font-weight: 600; font-size: 13px; border-inline-end: 1px solid var(--divider-color); background: var(--secondary-background-color); text-align: center; }
      .weekday:last-child { border-inline-end: 0; }
      .day { min-height: 128px; padding: 8px; border-block-start: 1px solid var(--divider-color); border-inline-end: 1px solid var(--divider-color); position: relative; overflow: hidden; }
      .weekgrid .day { min-height: calc(100vh - 238px); }
      .day:nth-child(7n) { border-inline-end: 0; }
      .day.out { background: color-mix(in srgb, var(--secondary-background-color) 55%, transparent); color: var(--secondary-text-color); }
      .day.today .num, .day-panel.today .num { background: var(--primary-color); color: var(--text-primary-color); }
      .num { display: inline-flex; align-items: center; justify-content: center; min-width: 26px; height: 26px; border-radius: 50%; font-size: 13px; margin-bottom: 4px; }
      .day-panel { min-height: calc(100vh - 238px); padding: 14px; border-block-start: 1px solid var(--divider-color); }
      .day-heading { margin: 0 0 12px; color: var(--secondary-text-color); font-size: 14px; font-weight: 600; }
      .day-list { display: flex; flex-direction: column; gap: 8px; }
      .day-event { border-inline-start: 4px solid var(--primary-color); border-radius: 10px; padding: 10px 12px; background: var(--secondary-background-color); text-align: start; }
      .day-event.service { border-inline-start-color: var(--success-color, #43a047); }
      .day-event.agri { border-inline-start-color: var(--warning-color, #fb8c00); }
      .day-event .event-title { font-weight: 700; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .day-event .event-time { color: var(--secondary-text-color); font-size: 12px; margin-bottom: 3px; }
      .pill { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; border-radius: 6px; padding: 3px 6px; margin: 3px 0; font-size: 12px; background: var(--primary-color); color: var(--text-primary-color); text-align: start; }
      .pill.service { background: var(--success-color, #43a047); color: white; }
      .pill.agri { background: var(--warning-color, #fb8c00); color: white; }
      .agri-fields { border: 1px solid var(--divider-color); border-radius: 14px; padding: 12px; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
      .warning { color: var(--error-color, #dc3545); font-weight: 700; }
      .system-note { color: var(--secondary-text-color); font-size: 12px; }
      .pill .time { opacity: .88; margin-inline-end: 4px; }
      .empty { padding: 24px; text-align: center; color: var(--secondary-text-color); }
      .message { color: var(--secondary-text-color); white-space: pre-wrap; }
      .traceability-card { container-type: inline-size; container-name: traceability-sidebar; border: 1px solid var(--divider-color); border-radius: 14px; padding: 12px; margin-top: 14px; background: var(--card-background-color); }
      .traceability-card h2 { font-size: 15px; margin: 0 0 5px; }
      .traceability-snapshot-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 6px; }
      .traceability-snapshot-head > div { min-width: 0; }
      .traceability-snapshot-head small, .traceability-recent-operation small, .traceability-recent-operation em { display: block; color: var(--secondary-text-color); font-size: 10px; font-style: normal; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .traceability-scope { display: block; font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .traceability-snapshot-metrics { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px; margin: 10px 0 8px; }
      .traceability-snapshot-metrics button { display: flex; align-items: baseline; justify-content: space-between; gap: 4px; min-width: 0; padding: 7px 8px; border-radius: 9px; background: var(--secondary-background-color); color: var(--primary-text-color); }
      .traceability-snapshot-metrics button.warning { color: #8a5700; background: rgba(251,140,0,.14); }
      .traceability-snapshot-metrics b { font-size: 17px; font-variant-numeric: tabular-nums; }
      .traceability-snapshot-metrics span { font-size: 10px; }
      .traceability-issue-preview, .traceability-recent-operation { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 6px; width: 100%; padding: 8px 9px; margin: 0 0 7px; border-radius: 9px; text-align: start; background: var(--secondary-background-color); color: var(--primary-text-color); }
      .traceability-issue-preview.warning { color: #8a5700; background: rgba(251,140,0,.14); }
      .traceability-issue-preview.resolved { color: var(--success-color, #2e7d32); background: color-mix(in srgb, var(--success-color, #2e7d32) 10%, transparent); }
      .traceability-issue-preview b, .traceability-recent-operation b { display: block; font-size: 11px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .traceability-issue-preview small { display: block; margin-top: 2px; font-size: 10px; color: inherit; opacity: .8; }
      .traceability-recent-operation > span:first-child { min-width: 0; }
      .traceability-workbench-cta { width: 100%; margin-top: 1px; padding: 8px 10px; }
      @container traceability-sidebar (max-width: 220px) { .traceability-snapshot-head { display: grid; } .traceability-snapshot-head .trace-status-chip { justify-self: start; } .traceability-snapshot-metrics button { display: grid; justify-content: start; } }
      .error { color: var(--error-color); }

      .scrim { position: fixed; inset: 0; background: rgba(0,0,0,.45); z-index: 9; display: ${this._dialogOpen || this._agriDialogOpen || this._traceabilityWorkbenchOpen || this._calendarCreateDialogOpen ? "block" : "none"}; }
      .dialog, .agri-dialog, .traceability-workbench, .calendar-create-dialog { position: fixed; left: 50%; top: 50%; transform: translate(-50%, -50%); width: min(860px, calc(100vw - 32px)); max-height: min(860px, calc(100vh - 32px)); overflow: auto; z-index: 10; border-radius: 28px; background: var(--card-background-color); color: var(--primary-text-color); box-shadow: 0 24px 38px rgba(0,0,0,.14), 0 9px 46px rgba(0,0,0,.12), 0 11px 15px rgba(0,0,0,.2); }
      .dialog { display: ${this._dialogOpen ? "block" : "none"}; }
      .calendar-create-dialog { display: ${this._calendarCreateDialogOpen ? "block" : "none"}; width: min(580px, calc(100vw - 32px)); }
      .agri-dialog { display: ${this._agriDialogOpen ? "block" : "none"}; width: min(980px, calc(100vw - 32px)); }
      .dialog header, .calendar-create-dialog header, .agri-dialog header { padding: 24px 24px 8px; font-size: 22px; font-weight: 500; }
      .dialog .content, .calendar-create-dialog .content, .agri-dialog .content { padding: 0 24px 16px; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
      .agri-dialog .content { grid-template-columns: repeat(3, minmax(0, 1fr)); }
      .delete-confirm, .edit-confirm { position: fixed; left: 50%; top: 50%; transform: translate(-50%, -50%); width: min(360px, calc(100vw - 48px)); z-index: 12; border-radius: 20px; background: var(--card-background-color); color: var(--primary-text-color); box-shadow: 0 18px 34px rgba(0,0,0,.28); padding: 20px 16px 16px; }
      .delete-confirm { display: ${this._deleteConfirmOpen ? "block" : "none"}; }
      .edit-confirm { display: ${this._editConfirmOpen ? "block" : "none"}; }
      .delete-confirm header, .edit-confirm header { display: flex; align-items: center; gap: 12px; padding: 0 4px 10px; font-size: 22px; font-weight: 500; }
      .delete-confirm .close, .edit-confirm .close { background: transparent; border-radius: 50%; padding: 8px; font-size: 24px; line-height: 1; }
      .delete-confirm p, .edit-confirm p { margin: 0 8px 24px; line-height: 1.45; color: var(--primary-text-color); }
      .delete-actions { display: flex; align-items: center; justify-content: flex-end; gap: 12px; flex-wrap: wrap; }
      .delete-actions button { border-radius: 22px; }
      .delete-actions .text { background: transparent; color: var(--primary-color); padding-inline: 8px; }
      .delete-actions .danger { background: var(--error-color, #dc3545); color: var(--text-primary-color, #fff); }
      .traceability-workbench { display: ${this._traceabilityWorkbenchOpen ? "grid" : "none"}; grid-template-rows: auto auto minmax(0, 1fr) auto; inset: 16px; left: 16px; top: 16px; transform: none; width: auto; max-height: none; overflow: hidden; border-radius: 16px; --trace-primary: var(--primary-color, #2e6b4f); --trace-surface: var(--card-background-color, #fff); --trace-subtle: var(--secondary-background-color, #f6f8f7); --trace-border: var(--divider-color, #dfe5e1); }
      .workbench-header { padding: 18px 22px; display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid var(--trace-border); }
      .workbench-header h2 { margin: 2px 0 0; font-size: 22px; font-weight: 650; letter-spacing: -.02em; }
      .context-eyebrow { display: block; color: var(--secondary-text-color); font-size: 10px; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; }
      .icon-action { width: 38px; height: 38px; padding: 0; border-radius: 9px; font-size: 24px; background: transparent; }
      .workbench-context-bar { display: grid; grid-template-columns: minmax(0, 1fr) auto minmax(220px, 300px); gap: 18px; align-items: center; padding: 12px 22px; border-bottom: 1px solid var(--trace-border); background: color-mix(in srgb, var(--trace-primary) 5%, var(--trace-surface)); }
      .workbench-context-main { min-width: 0; }
      .workbench-context-main b { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 15px; }
      .context-meta { display: block; margin-top: 3px; color: var(--secondary-text-color); font: 12px var(--code-font-family, monospace); }
      .workbench-context-status { display: flex; gap: 6px; align-items: center; }
      .context-cycle-picker { margin: 0; }
      .workbench-shell { min-height: 0; display: grid; grid-template-columns: 210px minmax(0, 1fr); }
      .workbench-sidebar { min-height: 0; overflow: auto; padding: 14px 10px; border-inline-end: 1px solid var(--trace-border); background: var(--trace-subtle); }
      .workbench-nav-group { display: grid; gap: 3px; margin-bottom: 16px; }
      .workbench-nav-group > span { padding: 3px 10px; color: var(--secondary-text-color); font-size: 10px; font-weight: 700; letter-spacing: .08em; }
      .workbench-nav-group button { width: 100%; padding: 9px 10px; border-radius: 8px; text-align: start; background: transparent; }
      .workbench-nav-group button.active { background: color-mix(in srgb, var(--trace-primary) 14%, transparent); color: var(--trace-primary); box-shadow: inset 3px 0 0 var(--trace-primary); }
      .workbench-main { min-width: 0; min-height: 0; overflow: auto; background: var(--trace-surface); }
      .workbench-main > .content { padding: 20px 22px 28px; display: block; }
      .workbench-footer { padding: 8px 18px; border-top: 1px solid var(--trace-border); color: var(--secondary-text-color); font-size: 11px; justify-content: space-between; }
      .trace-status-chip { display: inline-flex; align-items: center; min-height: 22px; padding: 2px 8px; border-radius: 999px; background: var(--trace-subtle); color: var(--secondary-text-color); font-size: 11px; font-weight: 650; white-space: nowrap; }
      .trace-status-chip.active { color: #246044; background: rgba(46,107,79,.12); }
      .trace-status-chip.success { color: var(--success-color, #2e7d32); background: color-mix(in srgb, var(--success-color, #2e7d32) 12%, transparent); }
      .trace-status-chip.warning { color: #8a5700; background: rgba(251,140,0,.14); }
      .trace-status-chip.danger { color: var(--error-color, #c62828); background: color-mix(in srgb, var(--error-color, #c62828) 12%, transparent); }
      .management-section { border: 1px solid var(--trace-border); border-radius: 12px; padding: 16px; background: var(--trace-surface); box-shadow: 0 1px 2px rgba(15, 48, 32, .04); }
      .management-section h3 { margin: 0 0 12px; font-size: 16px; }
      .management-section .fields { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
      .management-section .row-actions { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 12px; }
      .management-search-action { display: flex; align-items: flex-end; margin-bottom: 14px; }
      .management-search-action button { height: 40px; min-width: 64px; padding: 10px 16px; }
      .safe-delete-note { margin-top: 6px; }
      .management-section .archive { background: transparent; border: 1px solid var(--warning-color, #fb8c00); color: var(--warning-color, #a65d00); }
      .management-list { max-height: 240px; overflow: auto; border: 1px solid var(--trace-border); border-radius: 10px; padding: 6px; background: var(--trace-subtle); }
      .management-list button { display: block; width: 100%; text-align: start; margin: 2px 0; border-radius: 7px; }
      .trace-sticky-actions { position: sticky; bottom: 0; z-index: 2; display: flex; justify-content: flex-end; gap: 8px; padding: 12px 0 2px; background: linear-gradient(transparent, var(--trace-surface) 25%); }
      .trace-tech-details { margin-top: 12px; border-top: 1px solid var(--trace-border); padding-top: 10px; }
      .trace-tech-details summary { cursor: pointer; color: var(--secondary-text-color); font-size: 12px; font-weight: 650; }
      .fullrow { grid-column: 1 / -1; }
      .checkbox { flex-direction: row; align-items: center; gap: 10px; }
      .checkbox input { width: auto; }
      .workbench-section { display: grid; gap: 14px; }
      .workbench-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
      .workbench-overview-grid { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.6fr) minmax(0, 1.6fr); gap: 14px; align-items: start; }
      .workbench-overview-grid > div { min-width: 0; }
      .workbench-overview-left, .workbench-overview-middle, .workbench-overview-right { border: 1px solid var(--trace-border); border-radius: 10px; padding: 12px; }
      .workbench-overview-middle { min-height: 248px; margin-top: 0; }
      .traceability-card .scope-row { margin: 10px 0; }
      .traceability-status { padding: 8px 10px; border-radius: 10px; background: var(--secondary-background-color); margin: 8px 0; }
      .traceability-status.compact { width: 100%; text-align: start; border-radius: 10px; padding: 9px 10px; margin: 8px 0 10px; background: var(--secondary-background-color); color: var(--primary-text-color); }
      .overview-summary { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 10px; }
      .overview-summary .stat { border-radius: 10px; background: var(--trace-subtle); padding: 11px; font-size: 12px; border: 1px solid var(--trace-border); }
      .overview-summary .stat b { display: block; font-size: 20px; font-variant-numeric: tabular-nums; }
      .actions { display: flex; justify-content: flex-end; gap: 8px; padding: 8px 24px 24px; }
      .workbench-page-heading { display: flex; justify-content: space-between; align-items: end; }
      .workbench-page-heading h3 { margin: 2px 0 3px; font-size: 20px; }
      .workbench-page-heading p { margin: 0; color: var(--secondary-text-color); font-size: 13px; }
      .trace-operations-master-detail { display: grid; grid-template-columns: minmax(520px, 1.35fr) minmax(360px, .85fr); gap: 14px; align-items: start; }
      .trace-master-panel, .trace-detail-panel { min-width: 0; }
      .trace-operation-detail { container-type: inline-size; container-name: operation-detail; }
      .operation-quantity-unit { grid-template-columns: repeat(2, minmax(0, 1fr)); align-items: end; }
      .operation-quantity-unit label { min-width: 0; white-space: nowrap; }
      .operation-quantity-unit input { width: 100%; min-width: 0; box-sizing: border-box; }
      @container (max-width: 390px) { .operation-quantity-unit { grid-template-columns: 1fr; } }
      .trace-detail-panel { position: sticky; top: 0; }
      .detail-heading { display: flex; align-items: start; justify-content: space-between; gap: 12px; margin-bottom: 12px; }
      .detail-heading h3 { margin: 2px 0 0; }
      .trace-operation-table { border: 1px solid var(--trace-border); border-radius: 10px; overflow: hidden; margin-top: 12px; }
      .trace-table-head, .trace-select-operation { display: grid; grid-template-columns: minmax(150px, 1.1fr) minmax(140px, 1fr) 100px minmax(160px, 1fr); gap: 10px; align-items: center; }
      .trace-table-head { padding: 8px 11px; background: var(--trace-subtle); color: var(--secondary-text-color); font-size: 11px; font-weight: 700; }
      .trace-select-operation { width: 100%; padding: 10px 11px; border-radius: 0; border-top: 1px solid var(--trace-border); background: var(--trace-surface); text-align: start; font-weight: 400; }
      .trace-select-operation:hover { background: color-mix(in srgb, var(--trace-primary) 5%, var(--trace-surface)); }
      .trace-select-operation small { display: block; margin-top: 2px; color: var(--secondary-text-color); font-size: 11px; font-weight: 400; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .trace-row-signals { display: flex; flex-wrap: wrap; gap: 4px; }
      .view-toggle { display: inline-flex; padding: 3px; border-radius: 9px; background: var(--trace-subtle); }
      .view-toggle button { padding: 7px 11px; border-radius: 7px; background: transparent; }
      .view-toggle button.active { background: var(--trace-surface); color: var(--trace-primary); box-shadow: 0 1px 3px rgba(0,0,0,.1); }
      .evidence-list button small { display: block; margin: 3px 0 7px; color: var(--secondary-text-color); font-weight: 400; }
      .evidence-gallery { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 10px; max-height: 520px; padding: 10px; }
      .evidence-gallery button { display: grid; grid-template-rows: 120px auto; gap: 8px; margin: 0; padding: 8px; background: var(--trace-surface); border: 1px solid var(--trace-border); }
      .evidence-thumb { display: grid; place-items: center; overflow: hidden; border-radius: 7px; background: var(--trace-subtle); color: var(--secondary-text-color); }
      .evidence-thumb img { width: 100%; height: 100%; object-fit: cover; }
      .page-heading-actions, .master-kind-tabs { display: flex; align-items: center; gap: 8px; }
      .master-kind-tabs { padding: 3px; border-radius: 9px; background: var(--trace-subtle); }
      .master-kind-tabs button { padding: 7px 11px; background: transparent; border-radius: 7px; }
      .master-kind-tabs button.active { background: var(--trace-surface); color: var(--trace-primary); box-shadow: 0 1px 3px rgba(0,0,0,.1); }
      .trace-evidence-master-detail, .trace-master-data-master-detail { display: grid; grid-template-columns: minmax(560px, 1.35fr) minmax(360px, .85fr); gap: 14px; align-items: start; }
      .trace-master-breadcrumb { padding: 9px 12px; border: 1px solid var(--trace-border); border-radius: 9px; background: var(--trace-subtle); color: var(--secondary-text-color); font-size: 12px; }
      .trace-data-table { border: 1px solid var(--trace-border); border-radius: 10px; overflow: hidden; margin-top: 12px; }
      .trace-evidence-table-head, .trace-master-table-head, .trace-data-table > button { display: grid; grid-template-columns: minmax(150px, 1.2fr) minmax(130px, 1fr) minmax(110px, .8fr) minmax(90px, .65fr); gap: 10px; align-items: center; }
      .trace-evidence-table-head, .trace-master-table-head { padding: 8px 11px; background: var(--trace-subtle); color: var(--secondary-text-color); font-size: 11px; font-weight: 700; }
      .trace-data-table > button { width: 100%; padding: 10px 11px; border-radius: 0; border-top: 1px solid var(--trace-border); background: var(--trace-surface); text-align: start; font-weight: 400; }
      .trace-data-table > button:hover { background: color-mix(in srgb, var(--trace-primary) 5%, var(--trace-surface)); }
      .trace-data-table > button small { display: block; margin-top: 3px; color: var(--secondary-text-color); font-size: 11px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .evidence-preview { display: grid; gap: 8px; margin: 0 0 12px; padding: 10px; border-radius: 9px; background: var(--trace-subtle); }
      .evidence-preview pre { margin: 0; max-height: 180px; overflow: auto; white-space: pre-wrap; }
      .evidence-preview img { width: 100%; max-height: 260px; object-fit: contain; border-radius: 7px; background: var(--trace-surface); }
      .trace-master-detail > .management-section { margin: 0; border: 0; padding: 0; box-shadow: none; }
      .trace-master-hierarchy { position: relative; margin-top: 12px; }
      .hierarchy-level { position: relative; padding: 10px 10px 10px 36px; border: 1px solid var(--trace-border); border-radius: 10px; background: var(--trace-subtle); }
      .hierarchy-step { position: absolute; left: 10px; top: 10px; color: var(--trace-primary); font: 700 11px var(--code-font-family, monospace); }
      .hierarchy-level > b { display: block; margin-bottom: 7px; }
      .trace-issue-inbox { display: grid; gap: 10px; margin-top: 14px; }
      .trace-issue-card { border: 1px solid var(--trace-border); border-inline-start: 4px solid var(--trace-border); border-radius: 9px; padding: 12px; }
      .trace-issue-card.warning { color: var(--primary-text-color); border-inline-start-color: var(--warning-color, #fb8c00); }
      .trace-issue-card.warning li, .trace-issue-card.warning code { color: var(--primary-text-color); }
      .trace-issue-card.danger { border-inline-start-color: var(--error-color, #c62828); }
      .trace-issue-card.resolved { opacity: .78; border-inline-start-color: var(--success-color, #2e7d32); }
      .issue-heading { display: flex; align-items: center; gap: 8px; }
      .trace-issue-card ul { margin: 8px 0; padding-inline-start: 20px; }
      .trace-export-stepper { display: grid; gap: 0; max-width: 760px; }
      .export-step { display: grid; grid-template-columns: 42px minmax(0, 1fr); gap: 12px; position: relative; padding: 0 0 22px; }
      .export-step::before { content: ""; position: absolute; left: 18px; top: 34px; bottom: 0; width: 1px; background: var(--trace-border); }
      .export-step:last-child::before { display: none; }
      .export-step > span { display: grid; place-items: center; width: 36px; height: 36px; border-radius: 50%; background: color-mix(in srgb, var(--trace-primary) 14%, var(--trace-surface)); color: var(--trace-primary); font: 700 11px var(--code-font-family, monospace); }
      .export-step > div { border: 1px solid var(--trace-border); border-radius: 10px; padding: 14px; }
      .export-step label { margin-top: 10px; }
      @media (max-width: 1040px) { .trace-operations-master-detail, .trace-evidence-master-detail, .trace-master-data-master-detail { grid-template-columns: 1fr; } .trace-detail-panel { position: static; } .workbench-context-bar { grid-template-columns: minmax(0, 1fr) auto; } .context-cycle-picker { grid-column: 1 / -1; } }
      @media (max-width: 860px) { .layout { grid-template-columns: 1fr; } .side { border-inline-end: 0; border-block-end: 1px solid var(--divider-color); } .day { min-height: 88px; } .agri-dialog .content { grid-template-columns: repeat(2, minmax(0, 1fr)); } .management-section .fields { grid-template-columns: 1fr; } .workbench-shell { grid-template-columns: 150px minmax(0, 1fr); } .trace-table-head { display: none; } .trace-select-operation { grid-template-columns: 1fr 1fr; } }
      @media (max-width: 640px) { .traceability-workbench { inset: 0; left: 0; top: 0; border-radius: 0; } .workbench-header { padding: 12px 14px; } .workbench-context-bar { padding: 10px 14px; grid-template-columns: 1fr; } .workbench-context-status { grid-row: 2; } .context-cycle-picker { grid-column: auto; } .workbench-shell { grid-template-columns: 1fr; grid-template-rows: auto minmax(0, 1fr); } .workbench-sidebar { display: flex; gap: 4px; overflow-x: auto; border-inline-end: 0; border-bottom: 1px solid var(--trace-border); padding: 6px; } .workbench-nav-group { display: contents; } .workbench-nav-group > span { display: none; } .workbench-nav-group button { width: auto; white-space: nowrap; } .workbench-main > .content { padding: 14px; } .dialog .content, .agri-dialog .content, .workbench-grid, .workbench-overview-grid { grid-template-columns: 1fr; } .weekday { font-size: 11px; padding: 8px 4px; text-align: center; } .day { min-height: 74px; padding: 4px; } .pill { font-size: 10px; padding: 2px 4px; } .trace-select-operation { grid-template-columns: 1fr; } .workbench-footer { display: none; } }
    `;
  }

  _traceabilityRecords() {
    return this._hass?.states?.["sensor.uninus_calendar_service_scheduler_status"]?.attributes?.traceability_records || { farms: {}, plots: {}, cycles: {}, operations: {} };
  }

  _traceabilitySummary() {
    const legacy = this._hass?.states?.["sensor.uninus_calendar_service_scheduler_status"]?.attributes?.traceability || { farm_count: 0, plot_count: 0, cycle_count: 0, operation_count: 0, missing_link_count: 0, recent_operations: [] };
    const calendarRows = this._calendarTraceabilityRows || [];
    if (!calendarRows.length) return legacy;
    return {
      ...legacy,
      operation_count: calendarRows.length,
      calendar_operation_count: calendarRows.length,
      calendar_hash_mismatch_count: calendarRows.filter((row) => !row.hash_valid).length,
      recent_operations: calendarRows.slice().sort((a, b) => String(b.actual_start || "").localeCompare(String(a.actual_start || ""))).slice(0, 10),
    };
  }

  _legacyOperationsNeedingMigration() {
    const operations = Object.values(this._traceabilityRecords().operations || {});
    const existingOperationIds = new Set((this._calendarTraceabilityRows || []).map((row) => row.operation_id).filter(Boolean));
    return operations.filter((op) => op?.operation_id && !op.calendar_event_uid && !existingOperationIds.has(op.operation_id));
  }

  _evidenceRows(cycleId = "") {
    const records = this._traceabilityRecords();
    const evidence = Object.values(records.evidence || {});
    if (!cycleId) return evidence;
    const operations = records.operations || {};
    const operationIds = new Set(Object.values(operations).filter((op) => op.cycle_id === cycleId).map((op) => op.operation_id));
    return evidence.filter((item) => operationIds.has(item.operation_id));
  }

  _traceabilityIntegrity(cycleId = "") {
    const records = this._traceabilityRecords();
    const cycles = records.cycles || {};
    const plots = records.plots || {};
    const farms = records.farms || {};
    const operations = Object.values(records.operations || {}).filter((op) => !cycleId || op.cycle_id === cycleId);
    const evidence = this._evidenceRows(cycleId);
    const cycle = cycleId ? cycles[cycleId] : undefined;
    const plot = cycle ? plots[cycle.plot_id] : undefined;
    const farm = plot ? farms[plot.farm_id] : undefined;
    const calendarRows = (this._calendarTraceabilityRows || []).filter((row) => !cycleId || row.cycle_id === cycleId);
    const checks = [
      { id: "has_farm", label: "農場資料", ok: cycleId ? Boolean(farm) : Boolean(Object.keys(farms).length) },
      { id: "has_plot", label: "場區資料", ok: cycleId ? Boolean(plot) : Boolean(Object.keys(plots).length) },
      { id: "has_cycle", label: "生產週期資料", ok: cycleId ? Boolean(cycle) : Boolean(Object.keys(cycles).length) },
      { id: "has_operations", label: "農務作業", ok: operations.length > 0 || calendarRows.length > 0 },
      { id: "has_evidence", label: "佐證資料", ok: evidence.length > 0 },
      { id: "hash_valid", label: "Calendar hash 驗證", ok: calendarRows.every((row) => row.hash_valid !== false) },
      { id: "rows_match_cycle", label: "rows 屬於指定生產週期", ok: !cycleId || calendarRows.every((row) => row.cycle_id === cycleId) },
    ].map((item) => ({ ...item, status: item.ok ? "ok" : "warning", message: item.ok ? "OK" : `缺少或不完整：${item.label}` }));
    return { ok: checks.every((item) => item.ok), warning_count: checks.filter((item) => !item.ok).length, checks };
  }

  _integrityTemplate(integrity) {
    return `<div class="traceability-integrity"><b>匯出前檢查</b>${integrity.checks.map((item) => `<p class="${item.ok ? "message" : "warning"}">${item.ok ? "✅" : "⚠️"} ${this._escape(item.label)}</p>`).join("")}</div>`;
  }

  _evidenceListTemplate(cycleId = "") {
    const evidence = this._evidenceRows(cycleId).slice().sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || ""))).slice(0, 5);
    return `<div class="traceability-evidence-list"><b>最近佐證資料</b>${evidence.length ? evidence.map((item) => `<p><code>${this._escape(item.evidence_type || "evidence")}</code> ${this._escape(item.title || item.evidence_id || "")}${item.source_entity ? ` <span class="system-note">${this._escape(item.source_entity)}</span>` : ""}${item.content_hash ? ` <span class="system-note">hash ${this._escape(String(item.content_hash).slice(0, 12))}</span>` : ""}</p>`).join("") : `<p class="warning">尚無佐證資料</p>`}</div>`;
  }

  _traceabilityTemplate() {
    const summary = this._traceabilitySummary();
    const cycleId = this._selectedExportCycleId || "";
    const records = this._traceabilityRecords();
    const cycle = records.cycles?.[cycleId] || {};
    const plot = records.plots?.[cycle.plot_id] || {};
    const farm = records.farms?.[plot.farm_id] || {};
    const integrity = this._traceabilityIntegrity(cycleId);
    const evidenceCount = this._evidenceRows(cycleId).length;
    const recent = (summary.recent_operations || [])[0] || {};
    const scope = cycleId ? `${cycle.product || "週期"}${cycle.variety ? `・${cycle.variety}` : ""}` : "全部週期";
    const scopeMeta = cycleId ? `${farm.name || "農場"} 〉 ${plot.name || "場區"} · ${cycle.lot_number || cycle.trace_code || "未設批號"}` : `${summary.cycle_count || 0} 週期 · 跨週期`;
    const firstIssue = integrity.checks.find((item) => !item.ok);
    const recentLabel = recent.operation_type ? `${recent.operation_type} · ${recent.product || "農務"}` : "尚無最近作業";
    const recentMeta = recent.lot_number || recent.actual_start || recent.scheduled_start || "";
    return `<section class="traceability-card traceability-snapshot">
      <div class="traceability-snapshot-head"><div><h2>產銷履歷</h2><b class="traceability-scope">${this._escape(scope)}</b><small>${this._escape(scopeMeta)}</small></div>${this._traceStatusChip(integrity.ok ? "可匯出" : `${integrity.warning_count} 待辦`, integrity.ok ? "success" : "warning")}</div>
      <div class="traceability-snapshot-metrics">
        <button data-workbench-tab="management"><b>${summary.cycle_count || 0}</b><span>週期</span></button>
        <button data-workbench-tab="operations"><b>${summary.operation_count || 0}</b><span>作業</span></button>
        <button data-workbench-tab="evidence"><b>${evidenceCount}</b><span>佐證</span></button>
        <button data-workbench-tab="consistency" class="${integrity.ok ? "" : "warning"}"><b>${integrity.warning_count}</b><span>待辦</span></button>
      </div>
      <button class="traceability-issue-preview ${integrity.ok ? "resolved" : "warning"}" data-workbench-tab="consistency"><span><b>${integrity.ok ? "✓ 資料正常" : `⚠ ${integrity.warning_count} 項待辦`}</b><small>${this._escape(firstIssue?.label || "可建立履歷包")}</small></span><span>›</span></button>
      <button class="traceability-recent-operation" data-workbench-tab="operations"><span><small>最近作業</small><b>${this._escape(recentLabel)}</b><em>${this._escape(recentMeta)}</em></span><span>›</span></button>
      <button class="primary traceability-workbench-cta" id="agri-open-workbench">開啟工作台</button>
    </section>`;
  }

  _handleDelegatedClick(ev) {
    const target = ev.target;
    if (!(target instanceof Element)) return;
    const deepLink = target.closest("[data-workbench-tab]");
    if (deepLink) {
      ev.preventDefault();
      ev.stopPropagation();
      this._openTraceabilityWorkbench(deepLink.dataset.workbenchTab || "overview");
      return;
    }
    if (target.closest("#agri-open-workbench") || target.closest("#traceability-status-open")) {
      ev.preventDefault();
      ev.stopPropagation();
      this._openTraceabilityWorkbench("overview");
    }
  }

  _openTraceabilityWorkbench(tab = "overview") {
    this._traceabilityWorkbenchTab = tab;
    this._traceabilityWorkbenchOpen = true;
    this._message = "";
    this._render();
  }

  _closeTraceabilityWorkbench() {
    this._traceabilityWorkbenchOpen = false;
    this._render();
  }

  _setTraceabilityWorkbenchTab(tab) {
    this._traceabilityWorkbenchTab = tab;
    this._render();
  }

  _traceStatusChip(label, tone = "neutral", title = "") {
    return `<span class="trace-status-chip ${this._escape(tone)}" ${title ? `title="${this._escape(title)}"` : ""}>${this._escape(label)}</span>`;
  }

  _workbenchContextTemplate() {
    const records = this._traceabilityRecords();
    const cycleId = this._selectedExportCycleId || "";
    const cycle = records.cycles?.[cycleId] || {};
    const plot = records.plots?.[cycle.plot_id] || {};
    const farm = records.farms?.[plot.farm_id] || {};
    const integrity = this._traceabilityIntegrity(cycleId);
    const scope = cycleId
      ? `${farm.name || "未指定農場"} 〉 ${plot.name || "未指定場區"} 〉 ${cycle.product || "生產週期"}${cycle.variety ? `・${cycle.variety}` : ""}`
      : "全部農場與生產週期";
    return `<div class="workbench-context-bar">
      <div class="workbench-context-main"><span class="context-eyebrow">目前履歷範圍</span><b>${this._escape(scope)}</b><span class="context-meta">${this._escape(cycle.lot_number || "全部批號")} · ${this._escape(cycle.trace_code || "跨週期檢視")}</span></div>
      <div class="workbench-context-status">${this._traceStatusChip(cycle.status || (cycleId ? "active" : "全部"), cycle.status === "archived" ? "neutral" : "active")}${this._traceStatusChip(integrity.ok ? "可匯出" : `${integrity.warning_count} 項待處理`, integrity.ok ? "success" : "warning")}</div>
      <label class="context-cycle-picker">切換生產週期<select id="trace-workbench-cycle-context">${this._workbenchCycleOptions(cycleId)}</select></label>
    </div>`;
  }

  _workbenchCycleOptions(selectedCycleId = "") {
    const cycles = Object.values(this._traceabilityRecords().cycles || {});
    return [`<option value="">全部生產週期</option>`].concat(cycles.map((cycle) => `<option value="${this._escape(cycle.cycle_id)}" ${cycle.cycle_id === selectedCycleId ? "selected" : ""}>${this._escape(cycle.product || "週期")} · ${this._escape(cycle.lot_number || cycle.trace_code || cycle.cycle_id)}</option>`)).join("");
  }

  _traceabilityWorkbenchTemplate() {
    const tab = this._traceabilityWorkbenchTab || "overview";
    const tabButton = (id, label) => `<button id="workbench-tab-${id}" class="${tab === id ? "active" : ""}">${label}</button>`;
    return `
      <section class="traceability-workbench" role="dialog" aria-modal="true" aria-label="產銷履歷工作台">
        <header class="workbench-header"><div><span class="context-eyebrow">UNINUS TRACEABILITY</span><h2>產銷履歷工作台</h2></div><button id="traceability-workbench-close-top" class="icon-action" aria-label="關閉工作台">×</button></header>
        ${this._workbenchContextTemplate()}
        <div class="workbench-shell">
          <nav class="workbench-sidebar" aria-label="工作台導覽">
            <div class="workbench-nav-group"><span>履歷總覽</span>${tabButton("overview", "總覽")}</div>
            <div class="workbench-nav-group"><span>生產紀錄</span>${tabButton("operations", "農務作業")}${tabButton("evidence", "佐證資料")}</div>
            <div class="workbench-nav-group"><span>基礎資料</span>${tabButton("master-data", "農場、場區與週期")}</div>
            <div class="workbench-nav-group"><span>資料治理</span>${tabButton("consistency", "一致性檢查")}${tabButton("export", "匯出與封存")}</div>
          </nav>
          <main class="workbench-main"><div class="content">${this._traceabilityWorkbenchContent(tab)}</div></main>
        </div>
        <div class="actions workbench-footer"><span>產銷履歷資料治理</span><button id="traceability-workbench-close">關閉</button></div>
      </section>
    `;
  }

  _traceabilityWorkbenchContent(tab) {
    if (tab === "master-data") {
      return this._managementContentTemplate();
    }
    if (tab === "operations") {
      return this._operationsContentTemplate();
    }
    if (tab === "evidence") {
      return this._evidenceContentTemplate();
    }
    if (tab === "consistency") {
      return this._consistencyContentTemplate();
    }
    if (tab === "export") {
      const cycles = Object.values(this._traceabilityRecords().cycles || {});
      const selectedCycleId = this._selectedExportCycleId || "";
      const cycleOptions = [`<option value="">全部生產週期</option>`].concat(cycles.map((cycle) => `<option value="${this._escape(cycle.cycle_id)}" ${cycle.cycle_id === selectedCycleId ? "selected" : ""}>${this._escape(cycle.product || "週期")} ${this._escape(cycle.lot_number || cycle.trace_code || cycle.cycle_id)}</option>`)).join("");
      return `<section class="workbench-section"><div class="workbench-page-heading"><div><span class="context-eyebrow">DELIVERY</span><h3>匯出與封存</h3><p>建立可稽核、可交付的產銷履歷 Package。</p></div></div><div class="trace-export-stepper"><section class="export-step"><span>01</span><div><b>選擇履歷範圍</b><label>生產週期<select id="trace_export_cycle_workbench">${cycleOptions}</select></label></div></section><section class="export-step"><span>02</span><div><b>資料完整性檢查</b>${this._integrityTemplate(this._traceabilityIntegrity(selectedCycleId))}</div></section><section class="export-step"><span>03</span><div><b>建立履歷 Package</b><p class="system-note">Package 包含 traceability JSON、農務作業 CSV 與佐證 manifest。</p><div class="mini-actions"><button class="primary" id="agri-download-json">下載履歷 Package</button><button id="agri-download-csv">下載 CSV</button><button id="agri-export">預覽 JSON</button></div></div></section></div></section>`;
    }
    const operations = this._traceabilitySummary().recent_operations || [];
    const summary = this._traceabilitySummary();
    const cycles = Object.values(this._traceabilityRecords().cycles || {});
    const selectedCycleId = this._selectedExportCycleId || "";
    const cycleOptions = [`<option value="">全部生產週期</option>`].concat(cycles.map((cycle) => `<option value="${this._escape(cycle.cycle_id)}" ${cycle.cycle_id === selectedCycleId ? "selected" : ""}>${this._escape(cycle.product || "週期")} ${this._escape(cycle.lot_number || cycle.trace_code || cycle.cycle_id)}</option>`)).join("");
    const integrity = this._traceabilityIntegrity(selectedCycleId);
    const migrationCount = this._legacyOperationsNeedingMigration().length;
    return `<section class="workbench-section"><label class="fullrow">目前檢視範圍<select id="trace_overview_cycle">${cycleOptions}</select></label><div class="overview-summary fullrow" aria-label="履歷摘要"><div class="stat"><b>${summary.farm_count || 0}</b>農場</div><div class="stat"><b>${summary.plot_count || 0}</b>場區</div><div class="stat"><b>${summary.cycle_count || 0}</b>週期</div><div class="stat"><b>${summary.operation_count || 0}</b>作業</div><div class="stat"><b>${summary.evidence_count || this._evidenceRows(selectedCycleId).length || 0}</b>佐證</div></div><div class="workbench-overview-grid fullrow"><div class="workbench-overview-left" aria-label="匯出前檢查">${this._integrityTemplate(integrity)}</div><div class="workbench-overview-middle traceability-recent"><b>最近作業</b>${operations.slice(0, 5).map((op) => `<p><code>${this._escape(op.operation_type)} ${this._escape(op.actual_start || op.scheduled_start || "")}</code></p>`).join("") || `<p class="message">尚無農務作業</p>`}</div><div class="workbench-overview-right">${this._evidenceListTemplate(selectedCycleId)}</div></div>${migrationCount ? `<div class="mini-actions"><button id="agri-migrate-legacy">移轉舊作業 ${migrationCount}</button></div>` : ""}</section>`;
  }

  _operationEvidenceCountMap() {
    const counts = new Map();
    Object.values(this._traceabilityRecords().evidence || {}).forEach((item) => {
      if (!item.operation_id) return;
      counts.set(item.operation_id, (counts.get(item.operation_id) || 0) + 1);
    });
    return counts;
  }

  _operationEvidenceCount(operationId, countMap = this._operationEvidenceCountMap()) {
    return countMap.get(operationId) || 0;
  }

  _operationDateInRange(operation, range) {
    if (!range || range === "all") return true;
    const value = String(operation.actual_start || operation.scheduled_start || operation.created_at || "").slice(0, 10);
    if (!value) return false;
    const date = new Date(`${value}T00:00:00`);
    if (Number.isNaN(date.getTime())) return false;
    const today = new Date();
    const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const daysAgo = (days) => new Date(todayStart.getTime() - days * 24 * 60 * 60 * 1000);
    if (range === "recent7") return date >= daysAgo(7);
    if (range === "recent30") return date >= daysAgo(30);
    if (range === "thisMonth") return date >= new Date(todayStart.getFullYear(), todayStart.getMonth(), 1);
    return true;
  }

  _pageMeta(total, page, pageSize) {
    const size = Math.min(Math.max(Number(pageSize || 50) || 50, 1), 100);
    const maxPage = Math.max(Math.ceil(total / size) - 1, 0);
    const safePage = Math.min(Math.max(Number(page || 0) || 0, 0), maxPage);
    const start = safePage * size;
    const end = Math.min(start + size, total);
    return { page: safePage, pageSize: size, start, end, maxPage };
  }

  _pagedOperationRecords(records) {
    const f = this._operationForm || this._defaultOperationForm();
    const meta = this._pageMeta(records.length, f.operationPage, f.operationPageSize);
    return { ...meta, total: records.length, visibleOperations: records.slice(meta.start, meta.end) };
  }

  _pagedEvidenceRecords(records) {
    const f = this._evidenceForm || this._defaultEvidenceForm();
    const meta = this._pageMeta(records.length, f.evidencePage, f.evidencePageSize);
    return { ...meta, total: records.length, visibleEvidence: records.slice(meta.start, meta.end) };
  }

  _pageSizeOptions(selected = "50") {
    return ["25", "50", "100"].map((item) => `<option value="${item}" ${item === String(selected || "50") ? "selected" : ""}>每頁 ${item} 筆</option>`).join("");
  }

  _limitOptions(selected = "25", noun = "筆") {
    return ["25", "50", "100"].map((item) => `<option value="${item}" ${item === String(selected || "25") ? "selected" : ""}>只顯示前 ${item} ${noun}</option>`).join("");
  }

  _operationDateRangeOptions(selected = "recent30") {
    return [["recent7", "最近 7 天"], ["recent30", "最近 30 天"], ["thisMonth", "本月"], ["all", "全部日期"]].map(([value, label]) => `<option value="${value}" ${value === selected ? "selected" : ""}>${label}</option>`).join("");
  }

  _filteredOperationRecords() {
    const records = this._traceabilityRecords();
    const f = this._operationForm || this._defaultOperationForm();
    const query = String(f.operationSearchApplied || "").trim().toLowerCase();
    const cycleFilter = f.operationCycleFilter || "";
    const statusFilter = f.operationStatusFilter || "all";
    const dateRange = f.operationDateRange || "recent30";
    return Object.values(records.operations || {}).filter((operation) => {
      const cycle = records.cycles?.[operation.cycle_id] || {};
      const queryFields = [operation.operation_id, operation.operation_type, operation.operator, operation.material_name, operation.notes, operation.calendar_entity, operation.calendar_event_uid, cycle.product, cycle.lot_number, cycle.trace_code];
      const queryMatches = !query || queryFields.some((field) => String(field || "").toLowerCase().includes(query));
      const cycleMatches = !cycleFilter || operation.cycle_id === cycleFilter;
      const statusMatches = statusFilter === "all" || (operation.status || "planned") === statusFilter;
      const dateMatches = this._operationDateInRange(operation, dateRange);
      return queryMatches && cycleMatches && statusMatches && dateMatches;
    }).sort((a, b) => String(b.actual_start || b.scheduled_start || b.created_at || "").localeCompare(String(a.actual_start || a.scheduled_start || a.created_at || "")));
  }

  _agriOperationTypes() {
    return ["播種/定植", "灌溉", "施肥", "病蟲害防治", "除草", "採收", "分級包裝", "清潔消毒", "自我查核", "異常事件"];
  }

  _agriOperationTypeOptions(selected) {
    return this._agriOperationTypes().map((item) => `<option value="${this._escape(item)}" ${item === selected ? "selected" : ""}>${this._escape(item)}</option>`).join("");
  }

  _operationStatusOptions(selected = "all", includeAll = false) {
    const options = includeAll ? [["all", "全部狀態"]] : [];
    options.push(["planned", "計畫中"], ["completed", "已完成"], ["skipped", "封存/略過"], ["verified", "已驗證"], ["exported", "已匯出"]);
    return options.map(([value, label]) => `<option value="${this._escape(value)}" ${value === selected ? "selected" : ""}>${this._escape(label)}</option>`).join("");
  }

  _operationsContentTemplate() {
    const records = this._traceabilityRecords();
    const f = this._operationForm || this._defaultOperationForm();
    const operations = this._filteredOperationRecords();
    const paged = this._pagedOperationRecords(operations);
    const visibleOperations = paged.visibleOperations;
    const evidenceCounts = this._operationEvidenceCountMap();
    const cycles = Object.values(records.cycles || {});
    const cycleOptions = [`<option value="">全部生產週期</option>`].concat(cycles.map((cycle) => `<option value="${this._escape(cycle.cycle_id)}" ${cycle.cycle_id === f.operationCycleFilter ? "selected" : ""}>${this._escape(cycle.product || "週期")} ${this._escape(cycle.lot_number || cycle.trace_code || cycle.cycle_id)}</option>`)).join("");
    const editCycleOptions = [`<option value="">選擇生產週期</option>`].concat(cycles.map((cycle) => `<option value="${this._escape(cycle.cycle_id)}" ${cycle.cycle_id === f.cycleId ? "selected" : ""}>${this._escape(cycle.product || "週期")} ${this._escape(cycle.lot_number || cycle.trace_code || cycle.cycle_id)}</option>`)).join("");
    const typeOptions = this._agriOperationTypeOptions(f.operationType);
    return `
      <section class="workbench-section trace-operations-inline" aria-label="農務作業管理">
        <div class="workbench-page-heading"><div><span class="context-eyebrow">PRODUCTION RECORDS</span><h3>農務作業</h3><p>依生產週期管理作業、佐證與 Calendar 關聯。</p></div></div>
        <div class="trace-operations-master-detail">
        <section class="management-section trace-master-panel">
          <div class="message fullrow ${this._message.includes("作業") && this._message.includes("失敗") ? "error" : ""}">${this._escape(this._message)}</div>
          <div class="fields">
            <label>搜尋<input id="trace-operation-search" value="${this._escape(f.operationSearch || "")}" placeholder="作業、操作者、資材、批號、Calendar UID" /></label><div class="management-search-action"><button id="trace-operation-apply-search">搜尋</button></div>
            <label>生產週期<select id="trace-operation-cycle-filter">${cycleOptions}</select></label>
            <label>日期範圍<select id="trace-operation-date-range">${this._operationDateRangeOptions(f.operationDateRange || "recent30")}</select></label>
            <label>狀態<select id="trace-operation-status-filter">${this._operationStatusOptions(f.operationStatusFilter || "all", true)}</select></label>
            <label>每頁筆數<select id="trace-operation-page-size">${this._pageSizeOptions(f.operationPageSize || "50")}</select></label>
            <div class="fullrow system-note">找到 ${operations.length} 筆農務作業，顯示第 ${operations.length ? paged.start + 1 : 0}–${paged.end} 筆。${operations.length > paged.pageSize ? "結果較多，請縮小搜尋、日期範圍或生產週期。" : ""}</div>
            <div class="fullrow mini-actions"><button id="trace-operation-prev-page" ${paged.page <= 0 ? "disabled" : ""}>上一頁</button><button id="trace-operation-next-page" ${paged.page >= paged.maxPage ? "disabled" : ""}>下一頁</button></div>
          </div>
          <div class="trace-operation-table fullrow" role="table" aria-label="農務作業清單"><div class="trace-table-head" role="row"><span>日期 / 類型</span><span>週期 / 批號</span><span>狀態</span><span>資料完整性</span></div>${visibleOperations.length ? visibleOperations.map((operation) => {
            const cycle = records.cycles?.[operation.cycle_id] || {};
            const evidenceCount = this._operationEvidenceCount(operation.operation_id, evidenceCounts);
            const calendarLinked = operation.calendar_entity && operation.calendar_event_uid;
            const statusTone = ["completed", "verified", "exported"].includes(operation.status) ? "success" : operation.status === "skipped" ? "neutral" : "active";
            return `<button class="trace-select-operation" data-id="${this._escape(operation.operation_id)}" role="row"><span><b>${this._escape(operation.operation_type || "農務作業")}</b><small>${this._escape(operation.actual_start || operation.scheduled_start || "未指定時間")}</small></span><span>${this._escape(cycle.product || "未指定產品")}<small>${this._escape(cycle.lot_number || cycle.trace_code || "未指定批號")}</small></span><span>${this._traceStatusChip(operation.status || "planned", statusTone)}</span><span class="trace-row-signals">${this._traceStatusChip(`佐證 ${evidenceCount}`, evidenceCount ? "success" : "warning")}${this._traceStatusChip(calendarLinked ? "Calendar ✓" : "未連結", calendarLinked ? "active" : "warning")}</span></button>`;
          }).join("") : `<p class="message">尚無符合條件的農務作業</p>`}</div>
        </section>
        <section class="management-section trace-detail-panel trace-operation-detail">
          <div class="detail-heading"><div><span class="context-eyebrow">OPERATION DETAIL</span><h3>${f.selectedOperationId ? "作業詳細資料" : "選擇一筆農務作業"}</h3></div>${f.selectedOperationId ? this._traceStatusChip(f.status || "planned", ["completed", "verified", "exported"].includes(f.status) ? "success" : "active") : ""}</div>
          <div class="fields">
            <label>生產週期<select id="trace_operation_cycle">${editCycleOptions}</select></label>
            <label>作業類型<select id="trace_operation_type">${typeOptions}</select></label>
            <label>實際時間<input id="trace_operation_actual_start" value="${this._escape(f.actualStart)}" /></label>
            <label>操作者<input id="trace_operation_operator" value="${this._escape(f.operator)}" /></label>
            <label>資材/水源<input id="trace_operation_material" value="${this._escape(f.materialName)}" /></label>
            <div class="inline-field operation-quantity-unit"><label>數量<input id="trace_operation_quantity" value="${this._escape(f.quantity)}" /></label><label>單位<input id="trace_operation_unit" value="${this._escape(f.unit)}" /></label></div>
            <label>狀態<select id="trace_operation_status">${this._operationStatusOptions(f.status || "planned")}</select></label>
            <label class="fullrow">備註<textarea id="trace_operation_notes">${this._escape(f.notes)}</textarea></label>
            <details class="trace-tech-details fullrow"><summary>技術資訊</summary><div class="fields"><label>Calendar entity<input id="trace_operation_calendar_entity" value="${this._escape(f.calendarEntity)}" /></label><label>Calendar event UID<input id="trace_operation_calendar_uid" value="${this._escape(f.calendarEventUid)}" /></label><label class="fullrow">感測器 entity_id（逗號分隔）<textarea id="trace_operation_sensor_entities">${this._escape(f.sensorEntities)}</textarea></label><p class="system-note fullrow">Operation ID：<code>${this._escape(f.selectedOperationId || "尚未選擇")}</code></p></div></details>
          </div>
          <div class="trace-sticky-actions"><button class="archive" id="trace-operation-archive" ${f.selectedOperationId ? "" : "disabled"}>封存作業</button><button class="primary" id="trace-operation-save" ${f.selectedOperationId ? "" : "disabled"}>儲存作業</button></div>
        </section>
        </div>
      </section>
    `;
  }

  _captureOperationForm() {
    const get = (id) => this.shadowRoot.getElementById(id)?.value || "";
    this._operationForm = {
      ...this._operationForm,
      operationSearch: get("trace-operation-search"),
      operationCycleFilter: get("trace-operation-cycle-filter"),
      operationStatusFilter: get("trace-operation-status-filter") || "all",
      operationDateRange: get("trace-operation-date-range") || "recent30",
      operationPageSize: get("trace-operation-page-size") || "50",
      cycleId: get("trace_operation_cycle"),
      operationType: get("trace_operation_type") || "灌溉",
      actualStart: get("trace_operation_actual_start"),
      operator: get("trace_operation_operator"),
      materialName: get("trace_operation_material"),
      quantity: get("trace_operation_quantity"),
      unit: get("trace_operation_unit"),
      status: get("trace_operation_status") || "planned",
      calendarEntity: get("trace_operation_calendar_entity"),
      calendarEventUid: get("trace_operation_calendar_uid"),
      sensorEntities: get("trace_operation_sensor_entities"),
      notes: get("trace_operation_notes"),
    };
  }

  _applyOperationSearch() {
    this._captureOperationForm();
    this._operationForm = { ...this._operationForm, operationSearchApplied: this._operationForm.operationSearch || "", operationPage: 0 };
    this._render();
  }

  _selectTraceOperation(operationId) {
    const operation = this._traceabilityRecords().operations?.[operationId];
    if (!operation) return;
    this._operationForm = {
      ...(this._operationForm || this._defaultOperationForm()),
      selectedOperationId: operation.operation_id,
      cycleId: operation.cycle_id || "",
      operationType: operation.operation_type || "灌溉",
      actualStart: operation.actual_start || operation.scheduled_start || "",
      operator: operation.operator || "",
      materialName: operation.material_name || "",
      quantity: operation.quantity ?? "",
      unit: operation.unit || "",
      sensorEntities: Object.keys(operation.sensor_snapshot || {}).join(", "),
      notes: operation.notes || "",
      calendarEntity: operation.calendar_entity || "",
      calendarEventUid: operation.calendar_event_uid || "",
      status: operation.status || "planned",
    };
    this._message = `已載入農務作業：${operation.operation_id}`;
    this._render();
  }

  async _updateTraceOperation(statusOverride = "") {
    this._captureOperationForm();
    const f = this._operationForm || this._defaultOperationForm();
    if (!f.selectedOperationId) { this._message = "儲存農務作業失敗：請先點選既有作業。"; this._render(); return; }
    if (!f.cycleId) { this._message = "儲存農務作業失敗：請選擇生產週期。"; this._render(); return; }
    const status = statusOverride || f.status || "planned";
    try {
      await this._hass.callWS({ type: "call_service", domain: "uninus_calendar_service_scheduler", service: "update_agri_operation", service_data: { operation_id: f.selectedOperationId, cycle_id: f.cycleId, operation_type: f.operationType || "灌溉", actual_start: f.actualStart, operator: f.operator, material_name: f.materialName, quantity: f.quantity, unit: f.unit, sensor_entities: String(f.sensorEntities || "").split(",").map((item) => item.trim()).filter(Boolean), notes: f.notes, calendar_entity: f.calendarEntity, calendar_event_uid: f.calendarEventUid, status }, return_response: true });
      this._operationForm.status = status;
      this._message = status === "skipped" ? "已封存/略過農務作業。" : "已儲存農務作業。";
      this._render();
    } catch (err) { this._message = `儲存農務作業失敗: ${err?.message || err}`; this._render(); }
  }

  _traceabilityConsistencyReport() {
    const records = this._traceabilityRecords();
    const operations = Object.values(records.operations || {});
    const evidence = Object.values(records.evidence || {});
    const cycles = records.cycles || {};
    const eventUids = new Set((this._events || []).map((event) => event.uid || event.id).filter(Boolean));
    const calendarRows = this._calendarTraceabilityRows || [];
    const rowOperationIds = calendarRows.map((row) => row.operation_id).filter(Boolean);
    const seen = new Set();
    const duplicateOperationIds = [...new Set(rowOperationIds.filter((id) => seen.has(id) || !seen.add(id)))];
    const orphanOperations = operations.filter((operation) => operation.calendar_event_uid && !eventUids.has(operation.calendar_event_uid));
    const calendarEventsWithoutStoredOperation = calendarRows.filter((row) => row.operation_id && !records.operations?.[row.operation_id]);
    const staleCycleOperations = operations.filter((operation) => operation.cycle_id && !cycles[operation.cycle_id]);
    const orphanEvidence = evidence.filter((item) => item.operation_id && !records.operations?.[item.operation_id]);
    return { orphanOperations, calendarEventsWithoutStoredOperation, duplicateOperationIds, staleCycleOperations, orphanEvidence };
  }

  _consistencyContentTemplate() {
    const report = this._traceabilityConsistencyReport();
    const totalIssues = report.orphanOperations.length + report.calendarEventsWithoutStoredOperation.length + report.duplicateOperationIds.length + report.staleCycleOperations.length + report.orphanEvidence.length;
    const list = (items, formatter) => items.length ? `<ul>${items.slice(0, 20).map((item) => `<li>${formatter(item)}</li>`).join("")}</ul>` : `<p class="message">目前沒有發現</p>`;
    return `
      <section class="workbench-section trace-consistency-inline" aria-label="一致性掃描">
        <section class="management-section fullrow">
          <h3>一致性掃描</h3>
          <p class="system-note">掃描 Calendar event、stored AgriOperation、生產週期與佐證之間的關聯。發現問題時先列出可修復項目，避免黑盒 blocker。</p>
          <div class="overview-summary fullrow" aria-label="一致性摘要"><div class="stat"><b>${totalIssues}</b>問題</div><div class="stat"><b>${report.orphanOperations.length}</b>missing Calendar linkage</div><div class="stat"><b>${report.orphanEvidence.length}</b>orphan 佐證</div><div class="stat"><b>${report.staleCycleOperations.length}</b>stale cycle</div></div>
          <div class="trace-issue-inbox">
            <div class="trace-issue-card ${report.orphanOperations.length ? "warning" : "resolved"}"><div class="issue-heading">${this._traceStatusChip(report.orphanOperations.length ? "警告" : "正常", report.orphanOperations.length ? "warning" : "success")}<b>Calendar 關聯失效</b></div>${list(report.orphanOperations, (op) => `<code>${this._escape(op.operation_id)}</code> ${this._escape(op.operation_type || "")} / ${this._escape(op.calendar_event_uid || "")}`)}<button id="trace-repair-missing-calendar-linkage" ${report.orphanOperations.length ? "" : "disabled"}>保留作業並解除失效連結</button></div>
            <div class="trace-issue-card ${report.calendarEventsWithoutStoredOperation.length ? "danger" : "resolved"}"><div class="issue-heading">${this._traceStatusChip(report.calendarEventsWithoutStoredOperation.length ? "嚴重" : "正常", report.calendarEventsWithoutStoredOperation.length ? "danger" : "success")}<b>Calendar event 缺少履歷作業</b></div>${list(report.calendarEventsWithoutStoredOperation, (row) => `<code>${this._escape(row.operation_id || "")}</code> ${this._escape(row.summary || row.uid || "")}`)}</div>
            <div class="trace-issue-card ${report.duplicateOperationIds.length ? "danger" : "resolved"}"><div class="issue-heading">${this._traceStatusChip(report.duplicateOperationIds.length ? "嚴重" : "正常", report.duplicateOperationIds.length ? "danger" : "success")}<b>重複 operation_id</b></div>${list(report.duplicateOperationIds, (id) => `<code>${this._escape(id)}</code>`)}</div>
            <div class="trace-issue-card ${report.staleCycleOperations.length ? "danger" : "resolved"}"><div class="issue-heading">${this._traceStatusChip(report.staleCycleOperations.length ? "嚴重" : "正常", report.staleCycleOperations.length ? "danger" : "success")}<b>作業指向不存在的生產週期</b></div>${list(report.staleCycleOperations, (op) => `<code>${this._escape(op.operation_id)}</code> cycle=${this._escape(op.cycle_id || "")}`)}</div>
            <div class="trace-issue-card ${report.orphanEvidence.length ? "warning" : "resolved"}"><div class="issue-heading">${this._traceStatusChip(report.orphanEvidence.length ? "警告" : "正常", report.orphanEvidence.length ? "warning" : "success")}<b>孤立佐證</b></div>${list(report.orphanEvidence, (item) => `<code>${this._escape(item.evidence_id)}</code> operation=${this._escape(item.operation_id || "")}`)}<button id="trace-delete-orphan-evidence" ${report.orphanEvidence.length ? "" : "disabled"}>刪除孤立佐證</button></div>
            <div class="message ${this._message.includes("一致性") && this._message.includes("失敗") ? "error" : ""}">${this._escape(this._message)}</div>
          </div>
        </section>
      </section>
    `;
  }

  async _repairMissingCalendarLinkage() {
    const report = this._traceabilityConsistencyReport();
    try {
      for (const operation of report.orphanOperations) {
        await this._hass.callWS({ type: "call_service", domain: "uninus_calendar_service_scheduler", service: "update_agri_operation", service_data: { operation_id: operation.operation_id, cycle_id: operation.cycle_id || "", operation_type: operation.operation_type || "灌溉", actual_start: operation.actual_start || operation.scheduled_start || "", operator: operation.operator || "", material_name: operation.material_name || "", quantity: operation.quantity ?? "", unit: operation.unit || "", sensor_entities: Object.keys(operation.sensor_snapshot || {}), notes: operation.notes || "", calendar_entity: "", calendar_event_uid: "", status: operation.status || "planned" }, return_response: true });
      }
      this._message = `一致性修復完成：已清除 ${report.orphanOperations.length} 筆 missing Calendar linkage。`;
      this._render();
    } catch (err) { this._message = `一致性修復失敗: ${err?.message || err}`; this._render(); }
  }

  async _deleteOrphanEvidence() {
    const report = this._traceabilityConsistencyReport();
    try {
      for (const item of report.orphanEvidence) {
        await this._hass.callWS({ type: "call_service", domain: "uninus_calendar_service_scheduler", service: "delete_evidence", service_data: { evidence_id: item.evidence_id }, return_response: true });
      }
      this._message = `一致性修復完成：已刪除 ${report.orphanEvidence.length} 筆 orphan 佐證。`;
      this._render();
    } catch (err) { this._message = `一致性修復失敗: ${err?.message || err}`; this._render(); }
  }

  _filteredEvidenceRecords() {
    const records = this._traceabilityRecords();
    const f = this._evidenceForm || this._defaultEvidenceForm();
    const query = String(f.evidenceSearchApplied || "").trim().toLowerCase();
    const operationFilter = f.evidenceOperationFilter || "";
    return Object.values(records.evidence || {}).filter((evidence) => {
      const op = records.operations?.[evidence.operation_id] || {};
      const cycle = records.cycles?.[op.cycle_id] || {};
      const fields = [evidence.evidence_id, evidence.evidence_type, evidence.title, evidence.source_entity, evidence.uri, evidence.content_hash, evidence.operation_id, op.operation_type, cycle.product, cycle.lot_number];
      return (!operationFilter || evidence.operation_id === operationFilter) && (!query || fields.some((field) => String(field || "").toLowerCase().includes(query)));
    }).sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")));
  }

  _evidenceContentTemplate() {
    const records = this._traceabilityRecords();
    const operations = Object.values(records.operations || {});
    const f = this._evidenceForm || this._defaultEvidenceForm();
    const evidenceRows = this._filteredEvidenceRecords();
    const pagedEvidence = this._pagedEvidenceRecords(evidenceRows);
    const visibleEvidence = pagedEvidence.visibleEvidence;
    const operationOptions = [`<option value="">選擇農務作業</option>`].concat(operations.map((operation) => `<option value="${this._escape(operation.operation_id)}" ${operation.operation_id === f.operationId ? "selected" : ""}>${this._escape(operation.operation_type || "農務作業")} ${this._escape(operation.actual_start || operation.operation_id)}</option>`)).join("");
    const operationFilterOptions = [`<option value="">全部農務作業</option>`].concat(operations.map((operation) => `<option value="${this._escape(operation.operation_id)}" ${operation.operation_id === f.evidenceOperationFilter ? "selected" : ""}>${this._escape(operation.operation_type || "農務作業")} ${this._escape(operation.actual_start || operation.operation_id)}</option>`)).join("");
    const typeOptions = ["sensor_snapshot", "photo", "document", "note", "external_uri"].map((item) => `<option value="${item}" ${item === f.evidenceType ? "selected" : ""}>${this._escape(item)}</option>`).join("");
    const preview = f.content ? this._escape(String(f.content).slice(0, 2000)) : "";
    return `
      <section class="workbench-section trace-evidence-inline" aria-label="佐證資料">
        <div class="workbench-page-heading"><div><span class="context-eyebrow">EVIDENCE</span><h3>佐證中心</h3><p>管理照片、感測器快照、文件與外部佐證。</p></div><div class="page-heading-actions"><div class="view-toggle"><button id="trace-evidence-view-list" class="${f.evidenceView !== "gallery" ? "active" : ""}">列表</button><button id="trace-evidence-view-gallery" class="${f.evidenceView === "gallery" ? "active" : ""}">圖庫</button></div><button class="primary" id="trace-evidence-new">＋ 新增佐證</button></div></div>
        <div class="trace-evidence-master-detail">
          <section class="management-section trace-master-panel">
            <div class="fields">
              <label>搜尋<input id="trace-evidence-search" value="${this._escape(f.evidenceSearch || "")}" placeholder="標題、類型、來源、URI、hash" /></label><div class="management-search-action"><button id="trace-evidence-apply-search">搜尋</button></div>
              <label>農務作業<select id="trace-evidence-operation-filter">${operationFilterOptions}</select></label>
              <label>每頁筆數<select id="trace-evidence-page-size">${this._pageSizeOptions(f.evidencePageSize || "50")}</select></label>
              <div class="fullrow system-note">找到 ${evidenceRows.length} 筆佐證，顯示第 ${evidenceRows.length ? pagedEvidence.start + 1 : 0}–${pagedEvidence.end} 筆。</div>
              <div class="fullrow mini-actions"><button id="trace-evidence-prev-page" ${pagedEvidence.page <= 0 ? "disabled" : ""}>上一頁</button><button id="trace-evidence-next-page" ${pagedEvidence.page >= pagedEvidence.maxPage ? "disabled" : ""}>下一頁</button></div>
            </div>
            ${f.evidenceView === "gallery" ? `<div class="management-list evidence-gallery">${visibleEvidence.length ? visibleEvidence.map((evidence) => `<button class="trace-select-evidence" data-id="${this._escape(evidence.evidence_id)}"><span class="evidence-thumb">${evidence.evidence_type === "photo" && evidence.uri ? `<img src="${this._escape(evidence.uri)}" alt="" loading="lazy" />` : `<b>${this._escape(evidence.evidence_type || "evidence")}</b>`}</span><span><b>${this._escape(evidence.title || evidence.evidence_id)}</b><small>${this._escape(evidence.source_entity || evidence.uri || "無來源")}</small><span class="trace-row-signals">${this._traceStatusChip(evidence.content_hash ? "Hash ✓" : "未驗證", evidence.content_hash ? "success" : "warning")}</span></span></button>`).join("") : `<p class="message">尚無符合條件的佐證資料</p>`}</div>` : `<div class="trace-data-table evidence-data-table" role="table"><div class="trace-evidence-table-head"><span>日期／標題</span><span>類型／來源</span><span>關聯作業</span><span>完整性</span></div>${visibleEvidence.length ? visibleEvidence.map((evidence) => { const op = records.operations?.[evidence.operation_id] || {}; return `<button class="trace-select-evidence" data-id="${this._escape(evidence.evidence_id)}" role="row"><span><b>${this._escape(evidence.title || evidence.evidence_id)}</b><small>${this._escape(evidence.created_at || "未指定時間")}</small></span><span>${this._traceStatusChip(evidence.evidence_type || "evidence", "active")}<small>${this._escape(evidence.source_entity || evidence.uri || "無來源")}</small></span><span>${this._escape(op.operation_type || "未連結作業")}<small>${this._escape(op.actual_start || evidence.operation_id || "")}</small></span><span>${this._traceStatusChip(evidence.content_hash ? "Hash ✓" : "未驗證", evidence.content_hash ? "success" : "warning")}</span></button>`; }).join("") : `<p class="message">尚無符合條件的佐證資料</p>`}</div>`}
          </section>
          <section class="management-section trace-evidence-detail trace-detail-panel">
            <div class="detail-heading"><div><span class="context-eyebrow">EVIDENCE DETAIL</span><h3>${f.selectedEvidenceId ? "佐證詳細資料" : "新增佐證資料"}</h3></div>${f.selectedEvidenceId ? this._traceStatusChip(f.contentHash ? "Hash ✓" : "已載入", "success") : ""}</div>
            <div class="evidence-preview"><b>佐證預覽</b>${f.evidenceType === "photo" && f.uri ? `<img src="${this._escape(f.uri)}" alt="${this._escape(f.title || "佐證照片")}" />` : `<pre>${preview || "選擇佐證後顯示內容，或填寫資料建立新佐證。"}</pre>`}</div>
            <div class="fields">
              <label>綁定農務作業<select id="trace_evidence_operation">${operationOptions}</select></label>
              <label>佐證類型<select id="trace_evidence_type">${typeOptions}</select></label>
              <label class="fullrow">標題<input id="trace_evidence_title" value="${this._escape(f.title)}" /></label>
              <details class="trace-tech-details trace-evidence-tech-details fullrow"><summary>技術資訊</summary><div class="fields"><label>來源 entity_id<input id="trace_evidence_source_entity" value="${this._escape(f.sourceEntity)}" placeholder="sensor.soil_moisture" /></label><label>URI / 檔案參照<input id="trace_evidence_uri" value="${this._escape(f.uri)}" placeholder="/local/... 或外部連結" /></label><label class="fullrow">佐證 JSON 內容<textarea id="trace_evidence_content" rows="8">${this._escape(f.content)}</textarea></label><p class="system-note fullrow">Evidence ID：<code>${this._escape(f.selectedEvidenceId || "尚未建立")}</code></p></div></details>
              <div class="message fullrow ${this._message.includes("佐證") && this._message.includes("失敗") ? "error" : ""}">${this._escape(this._message)}</div>
            </div>
            <div class="trace-sticky-actions"><button class="archive" id="trace-evidence-delete" ${f.selectedEvidenceId ? "" : "disabled"}>刪除佐證</button>${f.selectedEvidenceId ? `<button class="primary" id="trace-evidence-save">儲存佐證</button>` : `<button class="primary" id="trace-evidence-create">建立佐證資料</button>`}</div>
          </section>
        </div>
      </section>
    `;
  }

  _captureEvidenceForm() {
    const get = (id) => this.shadowRoot.getElementById(id)?.value || "";
    this._evidenceForm = {
      ...this._evidenceForm,
      evidenceSearch: get("trace-evidence-search"),
      evidenceOperationFilter: get("trace-evidence-operation-filter"),
      evidencePageSize: get("trace-evidence-page-size") || "50",
      operationId: get("trace_evidence_operation"),
      evidenceType: get("trace_evidence_type") || "sensor_snapshot",
      title: get("trace_evidence_title"),
      sourceEntity: get("trace_evidence_source_entity"),
      uri: get("trace_evidence_uri"),
      content: get("trace_evidence_content") || "{}",
    };
  }

  async _createEvidenceRecord() {
    this._captureEvidenceForm();
    let content = {};
    try {
      content = this._evidenceForm.content.trim() ? JSON.parse(this._evidenceForm.content) : {};
    } catch (err) {
      this._message = `建立佐證資料失敗：JSON 格式錯誤 (${err?.message || err})`;
      this._render();
      return;
    }
    try {
      const response = await this._hass.callWS({ type: "call_service", domain: "uninus_calendar_service_scheduler", service: "create_evidence", service_data: { operation_id: this._evidenceForm.operationId, evidence_type: this._evidenceForm.evidenceType, title: this._evidenceForm.title, content, source_entity: this._evidenceForm.sourceEntity, uri: this._evidenceForm.uri }, return_response: true });
      const payload = this._serviceResponsePayload(response);
      const evidenceId = payload.evidence_id || payload.evidence?.evidence_id || "";
      this._message = `已建立佐證資料${evidenceId ? `：${evidenceId}` : ""}`;
      this._evidenceForm = this._defaultEvidenceForm();
      this._traceabilityWorkbenchTab = "evidence";
      this._render();
    } catch (err) { this._message = `建立佐證資料失敗: ${err?.message || err}`; this._render(); }
  }

  _applyEvidenceSearch() {
    this._captureEvidenceForm();
    this._evidenceForm = { ...this._evidenceForm, evidenceSearchApplied: this._evidenceForm.evidenceSearch || "", evidencePage: 0 };
    this._render();
  }

  _selectEvidenceRecord(evidenceId) {
    const evidence = this._traceabilityRecords().evidence?.[evidenceId];
    if (!evidence) return;
    this._evidenceForm = {
      ...(this._evidenceForm || this._defaultEvidenceForm()),
      selectedEvidenceId: evidence.evidence_id,
      operationId: evidence.operation_id || "",
      evidenceType: evidence.evidence_type || "sensor_snapshot",
      title: evidence.title || "",
      sourceEntity: evidence.source_entity || "",
      uri: evidence.uri || "",
      content: JSON.stringify(evidence.content || {}, null, 2),
    };
    this._message = `已載入佐證資料：${evidence.evidence_id}`;
    this._render();
  }

  _evidenceServiceData() {
    this._captureEvidenceForm();
    return {
      operation_id: this._evidenceForm.operationId,
      evidence_type: this._evidenceForm.evidenceType,
      title: this._evidenceForm.title,
      content: this._evidenceForm.content.trim() ? JSON.parse(this._evidenceForm.content) : {},
      source_entity: this._evidenceForm.sourceEntity,
      uri: this._evidenceForm.uri,
    };
  }

  async _updateEvidenceRecord() {
    try {
      const serviceData = this._evidenceServiceData();
      if (!this._evidenceForm.selectedEvidenceId) { this._message = "儲存佐證資料失敗：請先點選既有佐證。"; this._render(); return; }
      await this._hass.callWS({ type: "call_service", domain: "uninus_calendar_service_scheduler", service: "update_evidence", service_data: { ...serviceData, evidence_id: this._evidenceForm.selectedEvidenceId }, return_response: true });
      this._message = "已儲存佐證資料。";
      this._render();
    } catch (err) { this._message = `儲存佐證資料失敗: ${err?.message || err}`; this._render(); }
  }

  async _deleteEvidenceRecord() {
    this._captureEvidenceForm();
    if (!this._evidenceForm.selectedEvidenceId) { this._message = "刪除佐證資料失敗：請先點選既有佐證。"; this._render(); return; }
    try {
      await this._hass.callWS({ type: "call_service", domain: "uninus_calendar_service_scheduler", service: "delete_evidence", service_data: { evidence_id: this._evidenceForm.selectedEvidenceId }, return_response: true });
      this._message = "已刪除佐證資料。";
      this._evidenceForm = this._defaultEvidenceForm();
      this._render();
    } catch (err) { this._message = `刪除佐證資料失敗: ${err?.message || err}`; this._render(); }
  }

  _filteredManagementRecords() {
    const records = this._traceabilityRecords();
    const f = this._managementForm || this._defaultManagementForm();
    const query = String(f.managementSearchApplied || "").trim().toLowerCase();
    const status = f.managementStatusFilter || "active";
    const matches = (item, fields) => !query || fields.some((field) => String(item[field] || "").toLowerCase().includes(query));
    const statusMatches = (item) => status === "all" || (item.status || "active") === status;
    const farms = Object.values(records.farms || {}).filter((farm) => statusMatches(farm) && matches(farm, ["name", "operator", "address", "farm_id"]));
    const farmIds = new Set(farms.map((farm) => farm.farm_id));
    const selectedFarmId = f.selectedFarmId || f.plotFarmId || "";
    const plots = Object.values(records.plots || {}).filter((plot) => statusMatches(plot) && (!selectedFarmId ? farmIds.has(plot.farm_id) : plot.farm_id === selectedFarmId) && matches(plot, ["name", "product", "location", "plot_id"]));
    const plotIds = new Set(plots.map((plot) => plot.plot_id));
    const selectedPlotId = f.selectedPlotId || f.cyclePlotId || "";
    const cycles = Object.values(records.cycles || {}).filter((cycle) => statusMatches(cycle) && (!selectedPlotId ? plotIds.has(cycle.plot_id) : cycle.plot_id === selectedPlotId) && matches(cycle, ["product", "variety", "lot_number", "trace_code", "cycle_id"]));
    return { farms, plots, cycles, totalCycles: Object.values(records.cycles || {}).length };
  }

  _managementTableRows(kind, rows, records) {
    if (kind === "farm") return rows.map((farm) => {
      const plotCount = Object.values(records.plots || {}).filter((plot) => plot.farm_id === farm.farm_id).length;
      return `<button class="trace-select-farm" data-id="${this._escape(farm.farm_id)}"><span><b>${this._escape(farm.name || farm.farm_id)}</b><small>${this._escape(farm.operator || "未指定經營者")}</small></span><span>${this._escape(farm.address || "未指定地址")}</span><span>${plotCount} 個場區</span><span>${this._traceStatusChip(farm.status || "active", farm.status === "archived" ? "neutral" : "success")}</span></button>`;
    }).join("");
    if (kind === "plot") return rows.map((plot) => {
      const farm = records.farms?.[plot.farm_id] || {};
      const cycleCount = Object.values(records.cycles || {}).filter((cycle) => cycle.plot_id === plot.plot_id).length;
      return `<button class="trace-select-plot" data-id="${this._escape(plot.plot_id)}"><span><b>${this._escape(plot.name || plot.plot_id)}</b><small>${this._escape(farm.name || plot.farm_id || "未指定農場")}</small></span><span>${this._escape(plot.product || plot.tgap_category || "未指定產品")}</span><span>${cycleCount} 個週期</span><span>${this._traceStatusChip(plot.status || "active", plot.status === "archived" ? "neutral" : "success")}</span></button>`;
    }).join("");
    return rows.map((cycle) => {
      const plot = records.plots?.[cycle.plot_id] || {};
      const farm = records.farms?.[plot.farm_id] || {};
      const operationCount = Object.values(records.operations || {}).filter((op) => op.cycle_id === cycle.cycle_id).length;
      return `<button class="trace-select-cycle" data-id="${this._escape(cycle.cycle_id)}"><span><b>${this._escape(cycle.product || cycle.cycle_id)}${cycle.variety ? `・${this._escape(cycle.variety)}` : ""}</b><small>${this._escape(farm.name || "")} 〉 ${this._escape(plot.name || cycle.plot_id || "")}</small></span><span>${this._escape(cycle.lot_number || cycle.trace_code || "未指定批號")}</span><span>${operationCount} 筆作業</span><span>${this._traceStatusChip(cycle.status || "active", cycle.status === "archived" ? "neutral" : "success")}</span></button>`;
    }).join("");
  }

  _managementContentTemplate() {
    const records = this._traceabilityRecords();
    const filtered = this._filteredManagementRecords();
    const farms = filtered.farms;
    const plots = filtered.plots;
    const cycles = filtered.cycles;
    const f = this._managementForm || this._defaultManagementForm();
    const farmLimit = Number(f.farmLimit || 25) || 25;
    const plotLimit = Number(f.plotLimit || 25) || 25;
    const cycleLimit = Number(f.cycleLimit || 25) || 25;
    const visibleFarms = farms.slice(0, farmLimit);
    const visiblePlots = plots.slice(0, plotLimit);
    const visibleCycles = filtered.cycles.slice(0, cycleLimit);
    const managementKind = f.managementKind || "cycle";
    const visibleRows = managementKind === "farm" ? visibleFarms : managementKind === "plot" ? visiblePlots : visibleCycles;
    const selectedPlot = records.plots?.[f.selectedPlotId || f.cyclePlotId] || {};
    const selectedFarm = records.farms?.[f.selectedFarmId || f.plotFarmId || selectedPlot.farm_id] || {};
    const breadcrumb = [selectedFarm.name, selectedPlot.name, f.selectedCycleId ? (records.cycles?.[f.selectedCycleId]?.product || "生產週期") : ""].filter(Boolean).join(" 〉 ") || "全部農場與生產週期";
    const tableHead = managementKind === "farm" ? ["農場／經營者", "地址", "場區", "狀態"] : managementKind === "plot" ? ["場區／農場", "產品／類別", "週期", "狀態"] : ["產品／場區", "批號／追溯碼", "作業", "狀態"];
    const statusOptions = (selected) => ["active", "inactive", "archived"].map((item) => `<option value="${item}" ${item === selected ? "selected" : ""}>${item === "active" ? "啟用" : item === "inactive" ? "停用" : "封存"}</option>`).join("");
    const filterStatusOptions = ["active", "inactive", "archived", "all"].map((item) => `<option value="${item}" ${item === (f.managementStatusFilter || "active") ? "selected" : ""}>${item === "all" ? "全部狀態" : item === "active" ? "只看啟用" : item === "inactive" ? "只看停用" : "只看封存"}</option>`).join("");
    const farmLimitOptions = this._limitOptions(f.farmLimit || "25", "個農場");
    const plotLimitOptions = this._limitOptions(f.plotLimit || "25", "個場區");
    const limitOptions = this._limitOptions(f.cycleLimit || "25", "個週期");
    const farmNameOptions = Object.values(records.farms || {}).map((farm) => `<option value="${this._escape(farm.name || farm.farm_id)}" label="${this._escape(farm.farm_id)}"></option>`).join("");
    const plotNameOptions = Object.values(records.plots || {}).filter((plot) => !f.plotFarmId || plot.farm_id === f.plotFarmId).map((plot) => `<option value="${this._escape(plot.name || plot.plot_id)}" label="${this._escape(plot.product || plot.plot_id)}"></option>`).join("");
    const cycleIdentifierOptions = Object.values(records.cycles || {}).filter((cycle) => !f.cyclePlotId || cycle.plot_id === f.cyclePlotId).map((cycle) => `<option value="${this._escape(cycle.trace_code || cycle.lot_number || cycle.cycle_id)}" label="${this._escape(`${cycle.product || "生產週期"} ${cycle.lot_number || cycle.cycle_id}`)}"></option>`).join("");
    const farmOptions = [`<option value="">選擇農場</option>`].concat(Object.values(records.farms || {}).map((farm) => `<option value="${this._escape(farm.farm_id)}" ${farm.farm_id === f.plotFarmId ? "selected" : ""}>${this._escape(farm.name || farm.farm_id)} ${farm.status === "archived" ? "(封存)" : farm.status === "inactive" ? "(停用)" : ""}</option>`)).join("");
    const plotOptions = [`<option value="">選擇場區</option>`].concat(Object.values(records.plots || {}).filter((plot) => !f.plotFarmId || plot.farm_id === f.plotFarmId).map((plot) => `<option value="${this._escape(plot.plot_id)}" ${plot.plot_id === f.cyclePlotId ? "selected" : ""}>${this._escape(plot.name || plot.plot_id)} ${this._escape(plot.product || "")} ${plot.status === "archived" ? "(封存)" : plot.status === "inactive" ? "(停用)" : ""}</option>`)).join("");
    const categoryOptions = ["農糧", "水果類", "蔬菜類", "水稻", "雜糧類", "畜禽", "水產", "分裝流通", "林產品"].map((item) => `<option value="${this._escape(item)}" ${item === f.plotTgapCategory ? "selected" : ""}>${this._escape(item)}</option>`).join("");
    return `
      <section class="workbench-section trace-management-inline" aria-label="農場 / 場區 / 生產週期管理">
        <div class="workbench-page-heading"><div><span class="context-eyebrow">MASTER DATA</span><h3>農場、場區與生產週期</h3><p>依自然層級管理履歷主檔。</p></div><div class="master-kind-tabs"><button id="trace-master-kind-farm" class="${managementKind === "farm" ? "active" : ""}">農場</button><button id="trace-master-kind-plot" class="${managementKind === "plot" ? "active" : ""}">場區</button><button id="trace-master-kind-cycle" class="${managementKind === "cycle" ? "active" : ""}">生產週期</button></div></div>
        <div class="trace-master-breadcrumb">${this._escape(breadcrumb)}</div>
        <div class="trace-master-data-master-detail">
        <section class="management-section trace-master-panel">
          <div class="message ${this._message.includes("失敗") ? "error" : ""}">${this._escape(this._message)}</div>
          <div class="fields">
            <label>搜尋<input id="trace-management-search" value="${this._escape(f.managementSearch || "")}" placeholder="農場、場區、批號、追溯碼" /></label><div class="management-search-action"><button id="trace-management-apply-search">搜尋</button></div>
            <label>狀態<select id="trace-management-status-filter">${filterStatusOptions}</select></label>
            <label>顯示上限<select id="trace-management-page-size">${managementKind === "farm" ? farmLimitOptions : managementKind === "plot" ? plotLimitOptions : limitOptions}</select></label>
            <select id="trace-farm-page-size" hidden>${farmLimitOptions}</select><select id="trace-plot-page-size" hidden>${plotLimitOptions}</select><select id="trace-cycle-page-size" hidden>${limitOptions}</select>
            <div class="fullrow system-note">找到 ${visibleRows.length} 筆${managementKind === "farm" ? "農場" : managementKind === "plot" ? "場區" : "生產週期"}。</div>
          </div>
          <div class="trace-data-table master-data-table"><div class="trace-master-table-head">${tableHead.map((label) => `<span>${label}</span>`).join("")}</div>${visibleRows.length ? this._managementTableRows(managementKind, visibleRows, records) : `<p class="message">尚無符合條件的資料</p>`}</div>
        </section>
        <div class="trace-master-detail trace-detail-panel">
        <section class="management-section master-kind-panel" style="display:${managementKind === "farm" ? "block" : "none"}">
          <h3>${f.selectedFarmId ? "編輯農場" : "新增農場"}</h3>
          <div class="fields">
            <label>農場名稱<input id="trace_farm_name" list="trace-farm-name-options" autocomplete="off" value="${this._escape(f.farmName)}" /></label><datalist id="trace-farm-name-options">${farmNameOptions}</datalist>
            <label>經營者<input id="trace_farm_operator" value="${this._escape(f.farmOperator)}" /></label>
            <label>地址<input id="trace_farm_address" value="${this._escape(f.farmAddress)}" /></label>
            <label>電話<input id="trace_farm_phone" value="${this._escape(f.farmPhone)}" /></label>
            <label>狀態<select id="trace_farm_status">${statusOptions(f.farmStatus || "active")}</select></label>
          </div>
          <div class="row-actions"><button class="primary" id="trace-farm-create">建立農場</button><button id="trace-farm-save" ${f.selectedFarmId ? "" : "disabled"}>儲存農場</button><button class="archive" id="trace-farm-archive" ${f.selectedFarmId ? "" : "disabled"}>封存農場</button><button class="archive" id="trace-farm-delete" ${f.selectedFarmId ? "" : "disabled"}>安全刪除</button></div>
          <div class="safe-delete-note system-note">只有無關聯資料才能刪除：農場不可有場區、場區不可有生產週期、生產週期不可有農務作業或佐證資料；有關聯時請改用封存。</div>
        </section>
        <section class="management-section master-kind-panel" style="display:${managementKind === "plot" ? "block" : "none"}">
          <h3>${f.selectedPlotId ? "編輯場區" : "新增場區"}</h3>
          <div class="fields">
            <label>農場<select id="trace_plot_farm">${farmOptions}</select></label>
            <label>場區名稱<input id="trace_plot_name" list="trace-plot-name-options" autocomplete="off" value="${this._escape(f.plotName)}" /></label><datalist id="trace-plot-name-options">${plotNameOptions}</datalist>
            <label>產品<input id="trace_plot_product" value="${this._escape(f.plotProduct)}" /></label>
            <label>TGAP 類別<select id="trace_plot_tgap_category">${categoryOptions}</select></label>
            <label>面積<input id="trace_plot_area" value="${this._escape(f.plotArea)}" /></label>
            <label>位置<input id="trace_plot_location" value="${this._escape(f.plotLocation)}" /></label>
            <label>狀態<select id="trace_plot_status">${statusOptions(f.plotStatus || "active")}</select></label>
          </div>
          <div class="row-actions"><button class="primary" id="trace-plot-create">建立場區</button><button id="trace-plot-save" ${f.selectedPlotId ? "" : "disabled"}>儲存場區</button><button class="archive" id="trace-plot-archive" ${f.selectedPlotId ? "" : "disabled"}>封存場區</button><button class="archive" id="trace-plot-delete" ${f.selectedPlotId ? "" : "disabled"}>安全刪除</button></div>
          <div class="safe-delete-note system-note">只有無關聯資料才能刪除：農場不可有場區、場區不可有生產週期、生產週期不可有農務作業或佐證資料；有關聯時請改用封存。</div>
        </section>
        <section class="management-section master-kind-panel" style="display:${managementKind === "cycle" ? "block" : "none"}">
          <h3>${f.selectedCycleId ? "編輯生產週期" : "新增生產週期"}</h3>
          <div class="fields">
            <label>場區<select id="trace_cycle_plot">${plotOptions}</select></label>
            <label>產品<input id="trace_cycle_product" value="${this._escape(f.cycleProduct)}" /></label>
            <label>品種<input id="trace_cycle_variety" value="${this._escape(f.cycleVariety)}" /></label>
            <label>批號<input id="trace_cycle_lot" value="${this._escape(f.cycleLotNumber)}" /></label>
            <label>追溯碼<input id="trace_cycle_trace_code" list="trace-cycle-identifier-options" autocomplete="off" value="${this._escape(f.cycleTraceCode)}" /></label><datalist id="trace-cycle-identifier-options">${cycleIdentifierOptions}</datalist>
            <label>開始日期<input id="trace_cycle_start" type="date" value="${this._escape(f.cycleStartDate)}" /></label>
            <label>預計採收日<input id="trace_cycle_expected_harvest" type="date" value="${this._escape(f.cycleExpectedHarvestDate)}" /></label>
            <label>實際採收日<input id="trace_cycle_actual_harvest" type="date" value="${this._escape(f.cycleActualHarvestDate)}" /></label>
            <label>狀態<select id="trace_cycle_status">${statusOptions(f.cycleStatus || "active")}</select></label>
          </div>
          <div class="row-actions"><button class="primary" id="trace-cycle-create">建立生產週期</button><button id="trace-cycle-save" ${f.selectedCycleId ? "" : "disabled"}>儲存生產週期</button><button class="archive" id="trace-cycle-archive" ${f.selectedCycleId ? "" : "disabled"}>封存生產週期</button><button class="archive" id="trace-cycle-delete" ${f.selectedCycleId ? "" : "disabled"}>安全刪除</button></div>
          <div class="safe-delete-note system-note">只有無關聯資料才能刪除：農場不可有場區、場區不可有生產週期、生產週期不可有農務作業或佐證資料；有關聯時請改用封存。</div>
        </section>
        </div>
        </div>
      </section>
    `;
  }

  _captureManagementForm() {
    const get = (id) => this.shadowRoot.getElementById(id)?.value || "";
    this._managementForm = {
      ...this._managementForm,
      managementSearch: get("trace-management-search"),
      managementStatusFilter: get("trace-management-status-filter") || "active",
      farmLimit: get("trace-farm-page-size") || "25",
      plotLimit: get("trace-plot-page-size") || "25",
      cycleLimit: get("trace-cycle-page-size") || "25",
      farmStatus: get("trace_farm_status") || "active",
      farmName: get("trace_farm_name"),
      farmOperator: get("trace_farm_operator"),
      farmAddress: get("trace_farm_address"),
      farmPhone: get("trace_farm_phone"),
      plotFarmId: get("trace_plot_farm"),
      plotName: get("trace_plot_name"),
      plotProduct: get("trace_plot_product"),
      plotTgapCategory: get("trace_plot_tgap_category") || "水果類",
      plotArea: get("trace_plot_area"),
      plotLocation: get("trace_plot_location"),
      plotStatus: get("trace_plot_status") || "active",
      cyclePlotId: get("trace_cycle_plot"),
      cycleProduct: get("trace_cycle_product"),
      cycleVariety: get("trace_cycle_variety"),
      cycleLotNumber: get("trace_cycle_lot"),
      cycleTraceCode: get("trace_cycle_trace_code"),
      cycleStartDate: get("trace_cycle_start"),
      cycleExpectedHarvestDate: get("trace_cycle_expected_harvest"),
      cycleActualHarvestDate: get("trace_cycle_actual_harvest"),
      cycleStatus: get("trace_cycle_status") || "active",
    };
  }


  _captureManagementPageSize() {
    const value = this.shadowRoot.getElementById("trace-management-page-size")?.value || "25";
    this._captureManagementForm();
    const key = this._managementForm.managementKind === "farm" ? "farmLimit" : this._managementForm.managementKind === "plot" ? "plotLimit" : "cycleLimit";
    this._managementForm[key] = value;
  }

  _applyManagementSearch() {
    this._captureManagementForm();
    this._managementForm = { ...this._managementForm, managementSearchApplied: this._managementForm.managementSearch || "" };
    this._render();
  }


  _findTraceFarmByName(name) {
    const needle = String(name || "").trim().toLowerCase();
    if (!needle) return null;
    return Object.values(this._traceabilityRecords().farms || {}).find((farm) => [farm.name, farm.farm_id].some((value) => String(value || "").trim().toLowerCase() === needle)) || null;
  }

  _applyFarmNameComboboxSelection() {
    this._captureManagementForm();
    const typedName = String(this._managementForm.farmName || "").trim();
    const matchedFarm = this._findTraceFarmByName(typedName);
    if (matchedFarm) {
      this._selectTraceFarm(matchedFarm.farm_id);
      return;
    }
    if (this._managementForm.selectedFarmId) {
      this._managementForm = { ...this._managementForm, selectedFarmId: "" };
      this._message = typedName ? `將建立新農場：${typedName}` : "";
      this._render();
    }
  }

  _findTracePlotByName(name) {
    const needle = String(name || "").trim().toLowerCase();
    if (!needle) return null;
    const selectedFarmId = this._managementForm?.plotFarmId || this._managementForm?.selectedFarmId || "";
    const matches = Object.values(this._traceabilityRecords().plots || {}).filter((plot) => (!selectedFarmId || plot.farm_id === selectedFarmId) && [plot.name, plot.plot_id].some((value) => String(value || "").trim().toLowerCase() === needle));
    return matches.length === 1 ? matches[0] : null;
  }

  _applyPlotNameComboboxSelection() {
    this._captureManagementForm();
    const typedName = String(this._managementForm.plotName || "").trim();
    const matchedPlot = this._findTracePlotByName(typedName);
    if (matchedPlot) {
      this._selectTracePlot(matchedPlot.plot_id);
      return;
    }
    if (this._managementForm.selectedPlotId) {
      this._managementForm = { ...this._managementForm, selectedPlotId: "" };
      this._message = typedName ? `將建立新場區：${typedName}` : "";
      this._render();
    }
  }

  _findTraceCycleByIdentifier(identifier) {
    const needle = String(identifier || "").trim().toLowerCase();
    if (!needle) return null;
    const selectedPlotId = this._managementForm?.cyclePlotId || this._managementForm?.selectedPlotId || "";
    const matches = Object.values(this._traceabilityRecords().cycles || {}).filter((cycle) => (!selectedPlotId || cycle.plot_id === selectedPlotId) && [cycle.trace_code, cycle.lot_number, cycle.cycle_id].some((value) => String(value || "").trim().toLowerCase() === needle));
    return matches.length === 1 ? matches[0] : null;
  }

  _applyCycleIdentifierComboboxSelection() {
    this._captureManagementForm();
    const typedIdentifier = String(this._managementForm.cycleTraceCode || this._managementForm.cycleLotNumber || "").trim();
    const matchedCycle = this._findTraceCycleByIdentifier(typedIdentifier);
    if (matchedCycle) {
      this._selectTraceCycle(matchedCycle.cycle_id);
      return;
    }
    if (this._managementForm.selectedCycleId) {
      this._managementForm = { ...this._managementForm, selectedCycleId: "" };
      this._message = typedIdentifier ? `將建立新生產週期：${typedIdentifier}` : "";
      this._render();
    }
  }


  _selectTraceFarm(farmId) {
    const farm = this._traceabilityRecords().farms?.[farmId];
    if (!farm) return;
    this._managementForm = { ...this._managementForm, selectedFarmId: farm.farm_id, selectedPlotId: "", selectedCycleId: "", farmName: farm.name || "", farmOperator: farm.operator || "", farmAddress: farm.address || "", farmPhone: farm.phone || "", farmStatus: farm.status || "active", plotFarmId: farm.farm_id, cyclePlotId: "" };
    this._message = `已載入農場：${farm.name || farm.farm_id}`;
    this._render();
  }

  _selectTracePlot(plotId) {
    const plot = this._traceabilityRecords().plots?.[plotId];
    if (!plot) return;
    this._managementForm = { ...this._managementForm, selectedPlotId: plot.plot_id, selectedCycleId: "", plotFarmId: plot.farm_id || "", plotName: plot.name || "", plotProduct: plot.product || "", plotTgapCategory: plot.tgap_category || "水果類", plotArea: plot.area || "", plotLocation: plot.location || "", plotStatus: plot.status || "active", cyclePlotId: plot.plot_id, cycleProduct: this._managementForm.cycleProduct || plot.product || "" };
    this._message = `已載入場區：${plot.name || plot.plot_id}`;
    this._render();
  }

  _selectTraceCycle(cycleId) {
    const cycle = this._traceabilityRecords().cycles?.[cycleId];
    if (!cycle) return;
    this._managementForm = { ...this._managementForm, selectedCycleId: cycle.cycle_id, cyclePlotId: cycle.plot_id || "", cycleProduct: cycle.product || "", cycleVariety: cycle.variety || "", cycleLotNumber: cycle.lot_number || "", cycleTraceCode: cycle.trace_code || "", cycleStartDate: cycle.start_date || "", cycleExpectedHarvestDate: cycle.expected_harvest_date || "", cycleActualHarvestDate: cycle.actual_harvest_date || "", cycleStatus: cycle.status || "active" };
    this._message = `已載入生產週期：${cycle.product || cycle.cycle_id}`;
    this._render();
  }

  _formatTraceDeleteError(label, err) {
    const raw = String(err?.message || err || "").trim();
    const detail = raw.replace(/^Cannot delete \w+:\s*/i, "").trim();
    const localized = detail
      .replace(/operations?/gi, "農務作業")
      .replace(/evidence/gi, "佐證資料")
      .replace(/record is linked or no longer exists/gi, "資料仍有關聯或已不存在");
    return `無法刪除${label}：${localized || "資料仍有關聯"}。有關聯資料時請改用封存，或先重新綁定/清理農務作業與佐證資料。`;
  }

  async _deleteTraceMaster(kind, recordId, service, label) {
    if (!recordId) { this._message = `安全刪除${label}失敗：請先選擇資料。`; this._render(); return; }
    try {
      await this._hass.callWS({ type: "call_service", domain: "uninus_calendar_service_scheduler", service, service_data: { [`${kind}_id`]: recordId }, return_response: true });
      if (kind === "farm") this._managementForm = { ...this._managementForm, selectedFarmId: "", selectedPlotId: "", selectedCycleId: "", farmName: "", farmOperator: "", farmAddress: "", farmPhone: "", plotFarmId: "", cyclePlotId: "" };
      if (kind === "plot") this._managementForm = { ...this._managementForm, selectedPlotId: "", selectedCycleId: "", plotName: "", plotProduct: "", plotArea: "", plotLocation: "", cyclePlotId: "" };
      if (kind === "cycle") this._managementForm = { ...this._managementForm, selectedCycleId: "", cycleProduct: "", cycleVariety: "", cycleLotNumber: "", cycleTraceCode: "" };
      this._message = `已安全刪除${label}。`;
      this._render();
    } catch (err) {
      this._message = this._formatTraceDeleteError(label, err);
      this._render();
    }
  }

  async _deleteTraceFarm() { await this._deleteTraceMaster("farm", this._managementForm.selectedFarmId, "delete_farm", "農場"); }
  async _deleteTracePlot() { await this._deleteTraceMaster("plot", this._managementForm.selectedPlotId, "delete_plot", "場區"); }
  async _deleteTraceCycle() { await this._deleteTraceMaster("cycle", this._managementForm.selectedCycleId, "delete_crop_cycle", "生產週期"); }

  _archiveTimestamp() { return new Date().toISOString(); }

  _serviceResponsePayload(response) {
    return response?.response || response || {};
  }


  async _updateTraceFarm(statusOverride = "") {
    this._captureManagementForm();
    if (!this._managementForm.selectedFarmId) { this._message = "儲存農場失敗：請先點選既有農場。"; this._render(); return; }
    if (!this._managementForm.farmName.trim()) { this._message = "儲存農場失敗：請輸入農場名稱。"; this._render(); return; }
    const status = statusOverride || this._managementForm.farmStatus || "active";
    try {
      await this._hass.callWS({ type: "call_service", domain: "uninus_calendar_service_scheduler", service: "update_farm", service_data: { farm_id: this._managementForm.selectedFarmId, name: this._managementForm.farmName, operator: this._managementForm.farmOperator, address: this._managementForm.farmAddress, phone: this._managementForm.farmPhone, status, archived_at: status === "archived" ? this._archiveTimestamp() : "" }, return_response: true });
      this._managementForm.farmStatus = status;
      this._message = status === "archived" ? "已封存農場。" : "已儲存農場。";
      this._render();
    } catch (err) { this._message = `儲存農場失敗: ${err?.message || err}`; this._render(); }
  }

  async _updateTracePlot(statusOverride = "") {
    this._captureManagementForm();
    if (!this._managementForm.selectedPlotId) { this._message = "儲存場區失敗：請先點選既有場區。"; this._render(); return; }
    if (!this._managementForm.plotFarmId) { this._message = "儲存場區失敗：請先選擇農場。"; this._render(); return; }
    if (!this._managementForm.plotName.trim()) { this._message = "儲存場區失敗：請輸入場區名稱。"; this._render(); return; }
    const status = statusOverride || this._managementForm.plotStatus || "active";
    try {
      await this._hass.callWS({ type: "call_service", domain: "uninus_calendar_service_scheduler", service: "update_plot", service_data: { plot_id: this._managementForm.selectedPlotId, farm_id: this._managementForm.plotFarmId, name: this._managementForm.plotName, product: this._managementForm.plotProduct, tgap_category: this._managementForm.plotTgapCategory, area: this._managementForm.plotArea, location: this._managementForm.plotLocation, status, archived_at: status === "archived" ? this._archiveTimestamp() : "" }, return_response: true });
      this._managementForm.plotStatus = status;
      this._message = status === "archived" ? "已封存場區。" : "已儲存場區。";
      this._render();
    } catch (err) { this._message = `儲存場區失敗: ${err?.message || err}`; this._render(); }
  }

  _traceCycleDateToken(startDate = "") {
    const digits = String(startDate || new Date().toISOString()).replace(/\D/g, "").slice(0, 8);
    return digits || new Date().toISOString().slice(0, 10).replace(/\D/g, "");
  }

  _findDuplicateTraceCycle({ plotId, product, variety = "", startDate = "", lotNumber = "", traceCode = "", excludeCycleId = "" }) {
    const productKey = String(product || "").trim().toLowerCase();
    const varietyKey = String(variety || "").trim().toLowerCase();
    const startKey = String(startDate || "").trim();
    const lotKey = String(lotNumber || "").trim().toLowerCase();
    const traceKey = String(traceCode || "").trim().toLowerCase();
    return Object.values(this._traceabilityRecords().cycles || {}).find((cycle) => {
      if (cycle.cycle_id === excludeCycleId) return false;
      if (traceKey && String(cycle.trace_code || "").trim().toLowerCase() === traceKey) return true;
      if (lotKey && cycle.plot_id === plotId && String(cycle.lot_number || "").trim().toLowerCase() === lotKey) return true;
      return cycle.plot_id === plotId
        && String(cycle.product || "").trim().toLowerCase() === productKey
        && String(cycle.variety || "").trim().toLowerCase() === varietyKey
        && String(cycle.start_date || "").trim() === startKey;
    }) || null;
  }

  _prepareTraceCycleIdentity(excludeCycleId = "") {
    const plotId = this._managementForm.cyclePlotId;
    const product = this._managementForm.cycleProduct;
    const variety = this._managementForm.cycleVariety;
    const startDate = this._managementForm.cycleStartDate;
    let lotNumber = String(this._managementForm.cycleLotNumber || "").trim();
    let traceCode = String(this._managementForm.cycleTraceCode || "").trim();
    const duplicate = this._findDuplicateTraceCycle({ plotId, product, variety, startDate, lotNumber, traceCode, excludeCycleId });
    if (duplicate) {
      const duplicateTrace = traceCode && String(duplicate.trace_code || "").trim().toLowerCase() === traceCode.toLowerCase();
      const duplicateLot = lotNumber && duplicate.plot_id === plotId && String(duplicate.lot_number || "").trim().toLowerCase() === lotNumber.toLowerCase();
      const reason = duplicateTrace ? "追溯碼已存在" : duplicateLot ? "同一場區的批號已存在" : "相同場區、產品、品種與開始日期的生產週期已存在";
      return { ok: false, message: `${reason}，請改用既有週期或調整批次資訊。` };
    }
    const dateToken = this._traceCycleDateToken(startDate);
    const existingLots = new Set(Object.values(this._traceabilityRecords().cycles || {}).filter((cycle) => cycle.cycle_id !== excludeCycleId && cycle.plot_id === plotId).map((cycle) => String(cycle.lot_number || "").trim().toLowerCase()));
    const existingTraces = new Set(Object.values(this._traceabilityRecords().cycles || {}).filter((cycle) => cycle.cycle_id !== excludeCycleId).map((cycle) => String(cycle.trace_code || "").trim().toLowerCase()));
    for (let seq = 1; seq < 1000 && (!lotNumber || !traceCode); seq += 1) {
      const candidateLot = lotNumber || `LOT-${dateToken}-${String(seq).padStart(3, "0")}`;
      const candidateTrace = traceCode || `TRACE-${dateToken}-${String(seq).padStart(3, "0")}`;
      if (!existingLots.has(candidateLot.toLowerCase()) && !existingTraces.has(candidateTrace.toLowerCase())) {
        lotNumber = candidateLot;
        traceCode = candidateTrace;
        break;
      }
    }
    this._managementForm.cycleLotNumber = lotNumber;
    this._managementForm.cycleTraceCode = traceCode;
    return { ok: true, lotNumber, traceCode };
  }

  async _updateTraceCycle(statusOverride = "") {
    this._captureManagementForm();
    if (!this._managementForm.selectedCycleId) { this._message = "儲存生產週期失敗：請先點選既有生產週期。"; this._render(); return; }
    if (!this._managementForm.cyclePlotId) { this._message = "儲存生產週期失敗：請先選擇場區。"; this._render(); return; }
    if (!this._managementForm.cycleProduct.trim()) { this._message = "儲存生產週期失敗：請輸入產品。"; this._render(); return; }
    const status = statusOverride || this._managementForm.cycleStatus || "active";
    const cycleIdentity = this._prepareTraceCycleIdentity(this._managementForm.selectedCycleId);
    if (!cycleIdentity.ok) { this._message = `儲存生產週期失敗：${cycleIdentity.message}`; this._render(); return; }
    try {
      await this._hass.callWS({ type: "call_service", domain: "uninus_calendar_service_scheduler", service: "update_crop_cycle", service_data: { cycle_id: this._managementForm.selectedCycleId, plot_id: this._managementForm.cyclePlotId, product: this._managementForm.cycleProduct, variety: this._managementForm.cycleVariety, lot_number: cycleIdentity.lotNumber, trace_code: cycleIdentity.traceCode, start_date: this._managementForm.cycleStartDate, expected_harvest_date: this._managementForm.cycleExpectedHarvestDate, actual_harvest_date: this._managementForm.cycleActualHarvestDate, status, archived_at: status === "archived" ? this._archiveTimestamp() : "" }, return_response: true });
      this._managementForm.cycleStatus = status;
      this._message = status === "archived" ? "已封存生產週期。" : "已儲存生產週期。";
      this._render();
    } catch (err) { this._message = `儲存生產週期失敗: ${err?.message || err}`; this._render(); }
  }

  async _createTraceFarm() {
    this._captureManagementForm();
    if (!this._managementForm.farmName.trim()) { this._message = "建立農場失敗：請輸入農場名稱。"; this._render(); return; }
    try {
      const response = await this._hass.callWS({ type: "call_service", domain: "uninus_calendar_service_scheduler", service: "create_farm", service_data: { name: this._managementForm.farmName, operator: this._managementForm.farmOperator, address: this._managementForm.farmAddress, phone: this._managementForm.farmPhone }, return_response: true });
      const payload = this._serviceResponsePayload(response);
      const farmId = payload.farm_id || payload.farm?.farm_id || "";
      this._managementForm.plotFarmId = farmId || this._managementForm.plotFarmId;
      this._managementForm.farmName = "";
      this._message = `已建立農場${farmId ? `：${farmId}` : ""}`;
      this._render();
    } catch (err) { this._message = `建立農場失敗: ${err?.message || err}`; this._render(); }
  }

  async _createTracePlot() {
    this._captureManagementForm();
    if (!this._managementForm.plotFarmId) { this._message = "建立場區失敗：請先選擇農場。"; this._render(); return; }
    if (!this._managementForm.plotName.trim()) { this._message = "建立場區失敗：請輸入場區名稱。"; this._render(); return; }
    try {
      const response = await this._hass.callWS({ type: "call_service", domain: "uninus_calendar_service_scheduler", service: "create_plot", service_data: { farm_id: this._managementForm.plotFarmId, name: this._managementForm.plotName, product: this._managementForm.plotProduct, tgap_category: this._managementForm.plotTgapCategory, area: this._managementForm.plotArea, location: this._managementForm.plotLocation }, return_response: true });
      const payload = this._serviceResponsePayload(response);
      const plotId = payload.plot_id || payload.plot?.plot_id || "";
      this._managementForm.cyclePlotId = plotId || this._managementForm.cyclePlotId;
      this._managementForm.cycleProduct = this._managementForm.cycleProduct || this._managementForm.plotProduct;
      this._managementForm.plotName = "";
      this._message = `已建立場區${plotId ? `：${plotId}` : ""}`;
      this._render();
    } catch (err) { this._message = `建立場區失敗: ${err?.message || err}`; this._render(); }
  }

  async _createTraceCycle() {
    this._captureManagementForm();
    if (!this._managementForm.cyclePlotId) { this._message = "建立生產週期失敗：請先選擇場區。"; this._render(); return; }
    if (!this._managementForm.cycleProduct.trim()) { this._message = "建立生產週期失敗：請輸入產品。"; this._render(); return; }
    const cycleIdentity = this._prepareTraceCycleIdentity();
    if (!cycleIdentity.ok) { this._message = `建立生產週期失敗：${cycleIdentity.message}`; this._render(); return; }
    try {
      const response = await this._hass.callWS({ type: "call_service", domain: "uninus_calendar_service_scheduler", service: "create_crop_cycle", service_data: { plot_id: this._managementForm.cyclePlotId, product: this._managementForm.cycleProduct, variety: this._managementForm.cycleVariety, lot_number: cycleIdentity.lotNumber, trace_code: cycleIdentity.traceCode, start_date: this._managementForm.cycleStartDate, expected_harvest_date: this._managementForm.cycleExpectedHarvestDate }, return_response: true });
      const payload = this._serviceResponsePayload(response);
      const cycleId = payload.cycle_id || payload.cycle?.cycle_id || "";
      this._agriForm.cycleId = cycleId || this._agriForm.cycleId;
      this._managementForm.cycleLotNumber = "";
      this._message = `已建立生產週期${cycleId ? `：${cycleId}` : ""}`;
      this._render();
    } catch (err) { this._message = `建立生產週期失敗: ${err?.message || err}`; this._render(); }
  }

  _agriDialogTemplate() {
    const records = this._traceabilityRecords();
    const cycles = Object.values(records.cycles || {});
    const f = this._agriForm || this._defaultAgriForm();
    const cycleOptions = [`<option value="">選擇生產週期</option>`].concat(cycles.map((cycle) => `<option value="${this._escape(cycle.cycle_id)}" ${cycle.cycle_id === f.cycleId ? "selected" : ""}>${this._escape(cycle.product || cycle.cycle_id)} ${this._escape(cycle.lot_number || "")}</option>`)).join("");
    const typeOptions = this._agriOperationTypeOptions(f.operationType);
    return `
      <section class="agri-dialog" role="dialog" aria-modal="true" aria-label="新增農務作業">
        <header>新增農務作業</header>
        <div class="content">
          <label>顯示日曆<select id="agri_calendar">${this._calendarIds().map((id) => `<option value="${this._escape(id)}" ${id === (f.calendar || this._selectedCalendar) ? "selected" : ""}>${this._escape(this._stateName(id))}</option>`).join("")}</select></label>
          <label>生產週期<select id="agri_cycle">${cycleOptions}</select></label>
          <label>作業類型<select id="agri_operation_type">${typeOptions}</select></label>
          <label>實際時間<input id="agri_actual_start" type="datetime-local" value="${this._escape(f.actualStart)}" /></label>
          <label>操作者<input id="agri_operator" value="${this._escape(f.operator)}" /></label>
          <label>資材/水源<input id="agri_material" value="${this._escape(f.materialName)}" /></label>
          <div class="inline-field"><label>數量<input id="agri_quantity" value="${this._escape(f.quantity)}" /></label><label>單位<input id="agri_unit" value="${this._escape(f.unit)}" /></label></div>
          <label class="fullrow">感測器 entity_id（逗號分隔）<textarea id="agri_sensor_entities">${this._escape(f.sensorEntities)}</textarea></label>
          <label class="fullrow">備註<textarea id="agri_notes">${this._escape(f.notes)}</textarea></label>
          <div class="message fullrow ${this._message.startsWith("產銷履歷記錄失敗") || this._message.startsWith("請先") ? "error" : ""}">${this._escape(this._message)}</div>
        </div>
        <div class="actions">
          <button id="agri-cancel">取消</button>
          <button class="primary" id="agri-create-operation">記錄作業</button>
        </div>
      </section>
    `;
  }

  _openAgriDialog() {
    this._message = "";
    this._agriDialogOpen = true;
    this._render();
  }

  _closeAgriDialog() {
    this._captureAgriForm();
    this._agriDialogOpen = false;
    this._render();
  }

  _captureAgriForm() {
    const get = (id) => this.shadowRoot.getElementById(id)?.value || "";
    this._agriForm = { ...this._agriForm, calendar: get("agri_calendar") || this._selectedCalendar, cycleId: get("agri_cycle"), operationType: get("agri_operation_type") || "灌溉", actualStart: get("agri_actual_start"), operator: get("agri_operator"), materialName: get("agri_material"), quantity: get("agri_quantity"), unit: get("agri_unit"), sensorEntities: get("agri_sensor_entities"), notes: get("agri_notes") };
  }

  _agriOperationIdFromDescription(description = "") {
    const match = String(description || "").match(/AGRI_OPERATION_ID:\s*(op_[a-f0-9]+)/i);
    return match?.[1] || "";
  }

  _agriOperationById(operationId) {
    const operations = this._traceabilityRecords().operations || {};
    return operations[operationId];
  }

  _currentAgriOperationId() {
    const fromForm = this._form?.agri?.operationId || "";
    if (fromForm) return fromForm;
    const description = this._editingEvent?.description || "";
    const fromMarker = this._agriOperationIdFromDescription(description);
    if (fromMarker) return fromMarker;
    const match = this._agriJsonBlock(description).match(/"operation_id"\s*:\s*"([^"]+)"/);
    return match?.[1] || "";
  }

  _agriEventSummary(form) {
    return `農務：${form.operationType || "作業"}`;
  }

  _agriCalendarDescription(form, operationId) {
    const parts = [];
    if (form.notes) parts.push(String(form.notes).trim());
    parts.push(`AGRI_OPERATION_ID: ${operationId}`);
    parts.push("Created by Uninus Agricultural Traceability Assistant");
    return parts.join("\n\n");
  }


  _legacyOperationCalendarDescription(op) {
    const payload = {
      version: 1,
      type: "agri_operation",
      operation_id: op.operation_id || "",
      cycle_id: op.cycle_id || "",
      operation_type: op.operation_type || "灌溉",
      actual_start: op.actual_start || op.scheduled_start || op.created_at || this._toIsoWithOffset(this._localInputValue(new Date())),
      operator: op.operator || "",
      material_name: op.material_name || "",
      quantity: op.quantity ?? "",
      unit: op.unit || "",
      sensor_entities: Object.keys(op.sensor_snapshot || {}),
      legacy_record_hash: op.record_hash || "",
      created_at: op.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    const parts = [];
    if (op.notes) parts.push(String(op.notes).trim());
    // Hash is generated in the async migration method after canonicalization.
    return { parts, payload };
  }

  async _legacyOperationCalendarEvent(op, calendarEntity) {
    const { parts, payload } = this._legacyOperationCalendarDescription(op);
    payload.record_hash = await this._hashAgriPayload(payload);
    parts.push(`<!-- UNINUS_AGRI_OPERATION_JSON\n${JSON.stringify(payload)}\nUNINUS_AGRI_OPERATION_JSON -->`);
    const start = payload.actual_start;
    return {
      summary: `農務：${op.operation_type || "作業"}`,
      dtstart: start,
      dtend: this._oneHourLaterIso(start),
      description: parts.join("\n\n"),
    };
  }

  async _migrateLegacyAgriOperations() {
    const pending = this._legacyOperationsNeedingMigration();
    if (!pending.length) { this._message = "沒有需要移轉的舊農務作業。"; this._render(); return; }
    const fallbackCalendar = this._selectedCalendar || this._selectedCalendars[0] || this._calendarIds()[0];
    if (!fallbackCalendar) { this._message = "沒有可用的 Calendar，無法移轉。"; this._render(); return; }
    let migrated = 0;
    try {
      for (const op of pending) {
        const calendarEntity = op.calendar_entity || fallbackCalendar;
        const event = await this._legacyOperationCalendarEvent(op, calendarEntity);
        await this._hass.callWS({ type: "calendar/event/create", entity_id: calendarEntity, event });
        if (!this._selectedCalendars.includes(calendarEntity)) this._selectedCalendars.push(calendarEntity);
        migrated += 1;
      }
      this._saveSelectedCalendars();
      this._message = `已移轉 ${migrated} 筆舊農務作業到 Calendar events。`;
      await this._loadEvents();
    } catch (err) {
      this._message = `移轉舊農務作業失敗: ${err?.message || err}`;
      this._render();
    }
  }

  _oneHourLaterIso(iso) {
    const value = String(iso || "");
    const match = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?([+-]\d{2}:\d{2}|Z)?$/);
    if (!match) return iso;
    if (match[7] === "Z") {
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return iso;
      return new Date(date.getTime() + 60 * 60 * 1000).toISOString();
    }
    const offset = match[7] || "";
    const local = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), Number(match[4]), Number(match[5]), Number(match[6] || 0));
    if (Number.isNaN(local.getTime())) return iso;
    local.setHours(local.getHours() + 1);
    return `${local.getFullYear()}-${this._pad(local.getMonth() + 1)}-${this._pad(local.getDate())}T${this._pad(local.getHours())}:${this._pad(local.getMinutes())}:${this._pad(local.getSeconds())}${offset}`;
  }

  _agriServiceData() {
    const sensorEntities = this._agriForm.sensorEntities.split(",").map((item) => item.trim()).filter(Boolean);
    return {
      cycle_id: this._agriForm.cycleId,
      operation_type: this._agriForm.operationType,
      actual_start: this._agriForm.actualStart ? this._toIsoWithOffset(this._agriForm.actualStart) : "",
      operator: this._agriForm.operator,
      material_name: this._agriForm.materialName,
      quantity: this._agriForm.quantity,
      unit: this._agriForm.unit,
      sensor_entities: sensorEntities,
      notes: this._agriForm.notes,
      calendar_entity: this._agriForm.calendar || this._selectedCalendar,
      calendar_event_uid: this._agriForm.calendarEventUid || "",
    };
  }

  async _createAgriCalendarEvent(operationId, serviceData) {
    if (!serviceData.calendar_entity || !serviceData.actual_start) return;
    await this._hass.callWS({
      type: "calendar/event/create",
      entity_id: serviceData.calendar_entity,
      event: {
        summary: this._agriEventSummary(this._agriForm),
        dtstart: serviceData.actual_start,
        dtend: this._oneHourLaterIso(serviceData.actual_start),
        description: this._agriCalendarDescription(this._agriForm, operationId),
      },
    });
  }

  async _updateAgriCalendarEvent(operationId, serviceData) {
    if (!this._agriForm.calendarEventUid || !serviceData.calendar_entity || !serviceData.actual_start) return;
    await this._hass.callWS({
      type: "calendar/event/update",
      entity_id: serviceData.calendar_entity,
      uid: this._agriForm.calendarEventUid,
      event: {
        summary: this._agriEventSummary(this._agriForm),
        dtstart: serviceData.actual_start,
        dtend: this._oneHourLaterIso(serviceData.actual_start),
        description: this._agriCalendarDescription(this._agriForm, operationId),
      },
    });
  }

  async _createAgriOperation() {
    this._captureAgriForm();
    if (!this._agriForm.cycleId) { this._message = "請先選擇生產週期。可透過 HA 服務 create_farm/create_plot/create_crop_cycle 建立。"; this._render(); return; }
    const service_data = this._agriServiceData();
    try {
      if (this._agriForm.operationId) {
        await this._hass.callWS({ type: "call_service", domain: "uninus_calendar_service_scheduler", service: "update_agri_operation", service_data: { ...service_data, operation_id: this._agriForm.operationId }, return_response: true });
        await this._updateAgriCalendarEvent(this._agriForm.operationId, service_data);
        this._message = "已更新農務作業。";
      } else {
        const response = await this._hass.callWS({ type: "call_service", domain: "uninus_calendar_service_scheduler", service: "create_agri_operation", service_data, return_response: true });
        const operationId = response?.response?.operation_id || response?.operation_id || response?.response?.operation?.operation_id;
        if (operationId) await this._createAgriCalendarEvent(operationId, service_data);
        this._message = "已記錄產銷履歷作業，並建立 calendar 事件。";
      }
      this._agriDialogOpen = false;
      if (this._agriForm.calendar && !this._selectedCalendars.includes(this._agriForm.calendar)) {
        this._selectedCalendars = [...this._selectedCalendars, this._agriForm.calendar];
        this._saveSelectedCalendars();
      }
      this._agriForm = { ...this._defaultAgriForm(), calendar: this._agriForm.calendar, cycleId: this._agriForm.cycleId };
      await this._loadEvents();
    } catch (err) { this._message = `產銷履歷記錄失敗: ${err?.message || err}`; this._render(); }
  }


  async _calendarEventTraceabilityRows(events = this._events) {
    const rows = [];
    for (const event of events || []) {
      const parsed = await this._extractAgriDescription(event.description || "");
      if (!parsed.hasAgri || !parsed.payload || !Object.keys(parsed.payload).length) continue;
      const payload = parsed.payload;
      rows.push({
        source: "calendar_event",
        calendar_entity: event.__calendarEntity || "",
        calendar_event_uid: event.uid || "",
        summary: event.summary || "",
        notes: parsed.humanNotes || "",
        hash_valid: parsed.hashValid,
        version: payload.version,
        cycle_id: payload.cycle_id || "",
        operation_id: payload.operation_id || "",
        operation_type: payload.operation_type || "",
        actual_start: payload.actual_start || this._eventStart(event) || "",
        operator: payload.operator || "",
        material_name: payload.material_name || "",
        quantity: payload.quantity ?? "",
        unit: payload.unit || "",
        sensor_entities: Array.isArray(payload.sensor_entities) ? payload.sensor_entities : [],
        created_at: payload.created_at || "",
        updated_at: payload.updated_at || "",
        record_hash: payload.record_hash || "",
      });
    }
    return rows.sort((a, b) => String(a.actual_start || "").localeCompare(String(b.actual_start || "")));
  }

  async _reconcileStoredAgriOperationsFromCalendarRows(rows = this._calendarTraceabilityRows || []) {
    const operations = this._traceabilityRecords().operations || {};
    const cycles = this._traceabilityRecords().cycles || {};
    let reconciled = 0;
    for (const calendarRow of rows || []) {
      const storedOperation = operations[calendarRow.operation_id];
      if (!storedOperation || !calendarRow.cycle_id || !cycles[calendarRow.cycle_id]) continue;
      if (calendarRow.cycle_id !== storedOperation.cycle_id) {
        await this._hass.callWS({
          type: "call_service",
          domain: "uninus_calendar_service_scheduler",
          service: "update_agri_operation",
          service_data: {
            operation_id: calendarRow.operation_id,
            cycle_id: calendarRow.cycle_id,
            operation_type: calendarRow.operation_type || storedOperation.operation_type || "灌溉",
            actual_start: calendarRow.actual_start || storedOperation.actual_start || storedOperation.scheduled_start || "",
            operator: calendarRow.operator || storedOperation.operator || "",
            material_name: calendarRow.material_name || storedOperation.material_name || "",
            quantity: calendarRow.quantity ?? storedOperation.quantity ?? "",
            unit: calendarRow.unit || storedOperation.unit || "",
            sensor_entities: calendarRow.sensor_entities?.length ? calendarRow.sensor_entities : Object.keys(storedOperation.sensor_snapshot || {}),
            notes: calendarRow.notes || storedOperation.notes || "",
            calendar_entity: calendarRow.calendar_entity || storedOperation.calendar_entity || "",
            calendar_event_uid: calendarRow.calendar_event_uid || storedOperation.calendar_event_uid || "",
            status: storedOperation.status || "completed",
          },
          return_response: true,
        });
        reconciled += 1;
      }
    }
    if (reconciled) this._message = `已依 Calendar event payload 同步 ${reconciled} 筆農務作業關聯。`;
    return reconciled;
  }


  _traceabilityCsv(rows) {
    const headers = ["operation_id", "cycle_id", "farm_name", "plot_name", "product", "lot_number", "operation_type", "actual_start", "operator", "material_name", "quantity", "unit", "status", "record_hash"];
    const escapeCell = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
    return [headers.join(",")].concat((rows || []).map((row) => headers.map((key) => escapeCell(row[key])).join(","))).join("\n");
  }


  async _traceabilityExportPayload(cycleId = "") {
    const response = await this._hass.callWS({ type: "call_service", domain: "uninus_calendar_service_scheduler", service: "export_traceability_records", service_data: {}, return_response: true });
    const serviceData = cycleId ? { cycle_id: cycleId } : {};
    const packageResponse = await this._hass.callWS({ type: "call_service", domain: "uninus_calendar_service_scheduler", service: "export_traceability_package", service_data: serviceData, return_response: true });
    const legacy = response?.response || response || {};
    const traceability_export_package = packageResponse?.response || packageResponse || {};
    let calendarRows = await this._calendarEventTraceabilityRows();
    if (cycleId) calendarRows = calendarRows.filter((row) => row.cycle_id === cycleId);
    const legacyRows = Array.isArray(traceability_export_package.rows) && cycleId ? traceability_export_package.rows : (legacy.rows || []);
    const rows = calendarRows.length ? calendarRows : legacyRows;
    const evidence = traceability_export_package.evidence || legacy.evidence || [];
    const csvFilename = traceability_export_package.csv_filename || (cycleId ? `traceability-export-${cycleId}.csv` : "traceability-export.csv");
    return {
      ...legacy,
      traceability_export_package,
      calendar_rows: calendarRows,
      rows,
      export_csv: this._traceabilityCsv(rows),
      csv_filename: csvFilename,
      evidence,
      filter: { cycle_id: cycleId },
      integrity: traceability_export_package.integrity || this._traceabilityIntegrity(cycleId),
      summary: {
        ...(legacy.summary || {}),
        ...(traceability_export_package.summary || {}),
        evidence_count: evidence.length,
        calendar_operation_count: calendarRows.length,
        calendar_hash_mismatch_count: calendarRows.filter((row) => !row.hash_valid).length,
      },
      export_source: calendarRows.length ? "calendar_events" : "legacy_storage",
    };
  }

  async _downloadTraceabilityJson(cycleId = "") {
    try {
      const exportPayload = cycleId ? (this._lastCycleExportPayload || await this._traceabilityExportPayload(cycleId)) : (this._lastExportPayload || await this._traceabilityExportPayload());
      if (cycleId) this._lastCycleExportPayload = exportPayload;
      else this._lastExportPayload = exportPayload;
      const blob = new Blob([JSON.stringify(exportPayload, null, 2)], { type: "application/json;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      const lot = this._traceabilityRecords().cycles?.[cycleId]?.lot_number || cycleId || "all";
      link.download = exportPayload.traceability_export_package?.json_filename || `traceability-package-${lot}.json`;
      link.click();
      URL.revokeObjectURL(url);
      this._message = `已下載 JSON：${link.download}`;
    } catch (err) { this._message = `下載 JSON 失敗: ${err?.message || err}`; }
    this._render();
  }

  async _downloadTraceabilityCycleJson() {
    await this._downloadTraceabilityJson(this._selectedExportCycleId || "");
  }

  async _downloadTraceabilityCsv(cycleId = "") {
    try {
      const exportPayload = cycleId ? (this._lastCycleExportPayload || await this._traceabilityExportPayload(cycleId)) : (this._lastExportPayload || await this._traceabilityExportPayload());
      if (cycleId) this._lastCycleExportPayload = exportPayload;
      else this._lastExportPayload = exportPayload;
      const blob = new Blob([exportPayload.export_csv || ""], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = exportPayload.csv_filename || "traceability-export.csv";
      link.click();
      URL.revokeObjectURL(url);
      this._message = `已下載 CSV：${link.download}`;
    } catch (err) { this._message = `下載 CSV 失敗: ${err?.message || err}`; }
    this._render();
  }

  async _downloadTraceabilityCycleCsv() {
    await this._downloadTraceabilityCsv(this._selectedExportCycleId || "");
  }

  async _exportTraceabilityRecords(cycleId = "") {
    try {
      const exportPayload = await this._traceabilityExportPayload(cycleId);
      if (cycleId) this._lastCycleExportPayload = exportPayload;
      else this._lastExportPayload = exportPayload;
      this._message = JSON.stringify(exportPayload, null, 2);
    } catch (err) { this._message = `匯出失敗: ${err?.message || err}`; }
    this._render();
  }

  _calendarCreateDialogTemplate() {
    const form = this._calendarCreateForm || { name: "", importMode: "create_empty", icsFileName: "" };
    const isImport = form.importMode === "import_ics_file";
    return `
      <section class="calendar-create-dialog" role="dialog" aria-modal="true" aria-label="新增行事曆">
        <header>本地端行事曆</header>
        <div class="content">
          <p class="message fullrow">為行事曆選擇一個名稱</p>
          <label class="fullrow">行事曆名稱*<input id="calendar-create-name" value="${this._escape(form.name || "")}" /></label>
          <div class="fullrow native-label">開始資料</div>
          <label class="checkbox fullrow"><input type="radio" name="calendar-create-import" value="create_empty" ${!isImport ? "checked" : ""} />新增空白行事曆</label>
          <label class="checkbox fullrow"><input type="radio" name="calendar-create-import" value="import_ics_file" ${isImport ? "checked" : ""} />上傳 iCalendar 檔案 (.ics)</label>
          ${isImport ? `<label class="fullrow">iCalendar 檔案 (.ics)<input id="calendar-create-ics" type="file" accept=".ics,text/calendar" /></label><p class="field-note fullrow">此選項會使用 HA local_calendar 的 import_ics_file flow；若瀏覽器無法交付檔案，請回到原生日曆執行 .ics 匯入。</p>` : ""}
          <div class="message fullrow ${this._message.includes("行事曆") && this._message.includes("失敗") ? "error" : ""}">${this._escape(this._message)}</div>
        </div>
        <div class="actions"><button id="calendar-create-cancel">取消</button><button class="primary" id="calendar-create-submit">傳送</button></div>
      </section>
    `;
  }

  _openCalendarCreateDialog() {
    this._calendarCreateForm = { name: "", importMode: "create_empty", icsFileName: "" };
    this._message = "";
    this._calendarCreateDialogOpen = true;
    this._render();
  }

  _closeCalendarCreateDialog() {
    this._calendarCreateDialogOpen = false;
    this._render();
  }

  _captureCalendarCreateForm() {
    const name = this.shadowRoot.getElementById("calendar-create-name")?.value || "";
    const selectedImport = this.shadowRoot.querySelector('input[name="calendar-create-import"]:checked')?.value || "create_empty";
    const fileInput = this.shadowRoot.getElementById("calendar-create-ics");
    this._calendarCreateForm = { name, importMode: selectedImport, icsFileName: fileInput?.files?.[0]?.name || "" };
  }

  async _createLocalCalendar() {
    this._captureCalendarCreateForm();
    const name = String(this._calendarCreateForm.name || "").trim();
    if (!name) {
      this._message = "新增行事曆失敗：請輸入行事曆名稱。";
      this._render();
      return;
    }
    try {
      const flow = await this._hass.callApi("POST", "config/config_entries/flow", { handler: "local_calendar" });
      const submit = await this._hass.callApi("POST", `config/config_entries/flow/${flow.flow_id}`, { calendar_name: name, import: this._calendarCreateForm.importMode || "create_empty" });
      if (submit.type === "form" && submit.step_id === "import_ics_file") {
        this._message = "已進入 .ics 匯入步驟；目前請使用 HA 原生日曆完成檔案匯入。";
        this._render();
        return;
      }
      if (submit.type !== "create_entry") {
        throw new Error(submit.errors ? JSON.stringify(submit.errors) : `未預期的流程結果：${submit.type || "unknown"}`);
      }
      this._message = `已新增行事曆：${name}`;
      this._calendarCreateDialogOpen = false;
      window.setTimeout(() => {
        this._selectedCalendars = [];
        this._selectedCalendar = "";
        this._render();
        this._loadEvents();
      }, 1200);
      this._render();
    } catch (err) {
      this._message = `新增行事曆失敗: ${err?.message || err}`;
      this._render();
    }
  }

  _render() {
    if (!this.shadowRoot) return;
    const previousCalendarList = this.shadowRoot.querySelector(".calendar-list");
    if (previousCalendarList) this._calendarListScrollTop = previousCalendarList.scrollTop;
    this.shadowRoot.innerHTML = `
      <style>${this._styles()}</style>
      <div class="appbar">
        <h1>Uninus Calendar</h1>
        <a href="/calendar">原生日曆</a>
      </div>
      <div class="layout">
        <aside class="side">
          <div class="native-label">Calendar</div>
          <details class="calendar-menu" open>
            <summary>${this._escape(this._selectedCalendarLabel())}</summary>
            <div class="calendar-list">${this._calendarChecklist()}</div>
          </details>
          <button class="full" id="add-calendar">＋ 新增行事曆</button>
          <button class="full" id="refresh">重新整理</button>
          ${this._traceabilityTemplate()}
        </aside>
        <main class="main">
          <div class="monthbar">
            <div class="nav">
              <button id="today">今天</button>
              <button id="prev-month" aria-label="上一步">‹</button>
              <button id="next-month" aria-label="下一步">›</button>
            </div>
            <h2>${this._periodTitle()}</h2>
            <div class="view-switch" role="group" aria-label="顯示方式">${this._viewModeButtons()}</div>
          </div>
          ${this._calendarContent()}
          <p class="message">${this._loading ? "載入中…" : `${this._events.length} 個事件`}</p>
        </main>
      </div>
      <div class="fab-group" aria-label="快速新增">
        <button class="primary fab-button" id="agri-open-dialog">＋ 農務作業</button>
        <button class="primary fab-button" id="new-event-fab">＋ 增加行程</button>
      </div>
      ${this._dialogTemplate()}
      ${this._calendarCreateDialogTemplate()}
      ${this._agriDialogTemplate()}
      ${this._traceabilityWorkbenchTemplate()}
    `;
    this._bind();
    const nextCalendarList = this.shadowRoot.querySelector(".calendar-list");
    if (nextCalendarList) nextCalendarList.scrollTop = this._calendarListScrollTop || 0;
  }

  _monthTitle() {
    return `${this._visibleMonth.getFullYear()} 年 ${this._visibleMonth.getMonth() + 1} 月`;
  }

  _periodTitle() {
    if (this._viewMode === "day") return this._formatDateLong(this._visibleMonth);
    if (this._viewMode === "week") {
      const start = this._startOfWeek(this._visibleMonth);
      const end = this._addDays(start, 6);
      const sameMonth = start.getFullYear() === end.getFullYear() && start.getMonth() === end.getMonth();
      if (sameMonth) return `${start.getFullYear()} 年 ${start.getMonth() + 1} 月 ${start.getDate()} 日 – ${end.getDate()} 日`;
      return `${this._formatDateLong(start)} – ${this._formatDateLong(end)}`;
    }
    return this._monthTitle();
  }

  _viewModeButtons() {
    return [
      ["month", "月", "月"],
      ["week", "週", "週"],
      ["day", "日", "日"],
    ].map(([mode, label, title]) => `<button class="view-mode ${this._viewMode === mode ? "active" : ""}" data-view="${mode}" title="${title}" aria-pressed="${this._viewMode === mode}">${label}</button>`).join("");
  }

  _calendarContent() {
    if (this._viewMode === "day") return `<div class="calendar-card">${this._dayPanel()}</div>`;
    const labels = this._weekdayLabels(this._viewMode === "week");
    return `<div class="calendar-card"><div class="weekdays">${labels.map((d) => `<div class="weekday">${d}</div>`).join("")}</div><div class="${this._viewMode === "week" ? "weekgrid" : "monthgrid"}">${this._viewMode === "week" ? this._weekCells() : this._monthCells()}</div></div>`;
  }


  _eventStart(ev) {
    return ev.start?.dateTime || ev.start?.date || ev.start;
  }

  _eventEnd(ev) {
    return ev.end?.dateTime || ev.end?.date || ev.end;
  }

  _startOfWeek(date) {
    const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    start.setDate(start.getDate() - start.getDay());
    return start;
  }

  _addDays(date, days) {
    const next = new Date(date);
    next.setDate(next.getDate() + days);
    return next;
  }

  _formatDateLong(date) {
    return `${date.getFullYear()} 年 ${date.getMonth() + 1} 月 ${date.getDate()} 日`;
  }

  _formatDateShort(date) {
    return `${date.getMonth() + 1}/${date.getDate()}`;
  }

  _weekdayLabels(withDates = false) {
    const names = ["週日", "週一", "週二", "週三", "週四", "週五", "週六"];
    if (!withDates) return ["日", "一", "二", "三", "四", "五", "六"];
    const start = this._startOfWeek(this._visibleMonth);
    return names.map((name, index) => `${this._formatDateShort(this._addDays(start, index))}（${name}）`);
  }

  _visibleRange() {
    if (this._viewMode === "day") {
      const start = new Date(this._visibleMonth.getFullYear(), this._visibleMonth.getMonth(), this._visibleMonth.getDate());
      const end = this._addDays(start, 1);
      return { start, end };
    }
    if (this._viewMode === "week") {
      const start = this._startOfWeek(this._visibleMonth);
      const end = this._addDays(start, 7);
      return { start, end };
    }
    const year = this._visibleMonth.getFullYear();
    const month = this._visibleMonth.getMonth();
    const first = new Date(year, month, 1);
    const start = this._startOfWeek(first);
    const end = this._addDays(start, 42);
    return { start, end };
  }

  _eventsByDate() {
    const byDate = new Map();
    for (const ev of this._events) {
      const raw = this._eventStart(ev);
      if (!raw) continue;
      const key = raw.slice(0, 10);
      if (!byDate.has(key)) byDate.set(key, []);
      byDate.get(key).push(ev);
    }
    return byDate;
  }

  _monthCells() {
    const month = this._visibleMonth.getMonth();
    const { start: gridStart } = this._visibleRange();
    return this._dateCells(gridStart, 42, (day) => day.getMonth() !== month, 4);
  }

  _weekCells() {
    const { start } = this._visibleRange();
    return this._dateCells(start, 7, () => false, 12);
  }

  _dateCells(start, count, isOut = () => false, maxEvents = 4) {
    const todayKey = this._dateInputValue(new Date());
    const byDate = this._eventsByDate();
    const cells = [];
    for (let i = 0; i < count; i += 1) {
      const day = this._addDays(start, i);
      const key = this._dateInputValue(day);
      const events = byDate.get(key) || [];
      cells.push(`<div class="day date-cell ${isOut(day) ? "out" : ""} ${key === todayKey ? "today" : ""}" data-date="${key}">
        <span class="num">${day.getDate()}</span>
        ${events.slice(0, maxEvents).map((ev) => this._eventPill(ev)).join("")}
        ${events.length > maxEvents ? `<span class="pill">+${events.length - maxEvents} more</span>` : ""}
      </div>`);
    }
    return cells.join("");
  }

  _dayPanel() {
    const key = this._dateInputValue(this._visibleMonth);
    const events = this._eventsByDate().get(key) || [];
    const today = key === this._dateInputValue(new Date());
    return `<div class="day-panel date-cell ${today ? "today" : ""}" data-date="${key}">
      <h3 class="day-heading"><span class="num">${this._visibleMonth.getDate()}</span> ${["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"][this._visibleMonth.getDay()]}</h3>
      <div class="day-list">${events.length ? events.map((ev) => this._dayEvent(ev)).join("") : `<p class="empty">這一天沒有行程</p>`}</div>
    </div>`;
  }

  _actionIdFromDescription(description = "") {
    const match = String(description || "").match(/HA_SERVICE_ACTION_ID:\s*([a-f0-9]+)/i);
    return match?.[1] || "";
  }

  _formatEventTime(ev, includeEnd = false) {
    const start = this._eventStart(ev) || "";
    const end = this._eventEnd(ev) || "";
    if (!start.includes("T")) return "";
    const startTime = start.slice(11, 16);
    if (!includeEnd || !end.includes("T")) return startTime;
    return `${startTime} - ${end.slice(11, 16)}`;
  }


  _agriJsonBlock(description = "") {
    const match = String(description || "").match(/\n*<!--\s*UNINUS_AGRI_OPERATION_JSON\s*([\s\S]*?)\s*UNINUS_AGRI_OPERATION_JSON\s*-->/);
    return match ? match[1].trim() : "";
  }

  _hasAgriJson(description = "") {
    return Boolean(this._agriJsonBlock(description));
  }

  _humanDescription(description = "") {
    return String(description || "").replace(/\n*<!--\s*UNINUS_AGRI_OPERATION_JSON\s*[\s\S]*?\s*UNINUS_AGRI_OPERATION_JSON\s*-->/, "").trim();
  }

  _stableJson(value) {
    if (Array.isArray(value)) return `[${value.map((item) => this._stableJson(item)).join(",")}]`;
    if (value && typeof value === "object") {
      return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${this._stableJson(value[key])}`).join(",")}}`;
    }
    return JSON.stringify(value);
  }

  async _sha256(text) {
    if (crypto?.subtle?.digest) {
      const bytes = new TextEncoder().encode(text);
      const digest = await crypto.subtle.digest("SHA-256", bytes);
      return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
    }
    return this._sha256Fallback(text);
  }

  _sha256Fallback(text) {
    const rightRotate = (value, amount) => (value >>> amount) | (value << (32 - amount));
    const maxWord = 2 ** 32;
    const ascii = unescape(encodeURIComponent(text));
    const words = [];
    const hash = [];
    const k = [];
    let primeCounter = 0;
    const isPrime = (n) => {
      for (let factor = 2; factor * factor <= n; factor += 1) if (n % factor === 0) return false;
      return n > 1;
    };
    for (let candidate = 2; primeCounter < 64; candidate += 1) {
      if (!isPrime(candidate)) continue;
      if (primeCounter < 8) hash[primeCounter] = ((candidate ** 0.5) * maxWord) | 0;
      k[primeCounter] = ((candidate ** (1 / 3)) * maxWord) | 0;
      primeCounter += 1;
    }
    const bitLength = ascii.length * 8;
    let padded = `${ascii}\x80`;
    while ((padded.length % 64) !== 56) padded += "\x00";
    for (let i = 0; i < padded.length; i += 1) {
      words[i >> 2] |= padded.charCodeAt(i) << ((3 - i) % 4) * 8;
    }
    words.push((bitLength / maxWord) | 0);
    words.push(bitLength | 0);
    for (let j = 0; j < words.length; j += 16) {
      const w = words.slice(j, j + 16);
      const oldHash = hash.slice(0);
      for (let i = 0; i < 64; i += 1) {
        const w15 = w[i - 15] || 0;
        const w2 = w[i - 2] || 0;
        const a = hash[0];
        const e = hash[4];
        if (i >= 16) {
          w[i] = (w[i - 16] + (rightRotate(w15, 7) ^ rightRotate(w15, 18) ^ (w15 >>> 3)) + w[i - 7] + (rightRotate(w2, 17) ^ rightRotate(w2, 19) ^ (w2 >>> 10))) | 0;
        }
        const temp1 = (hash[7]
          + (rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25))
          + ((e & hash[5]) ^ ((~e) & hash[6]))
          + k[i]
          + (w[i] || 0)) | 0;
        const temp2 = ((rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22)) + ((a & hash[1]) ^ (a & hash[2]) ^ (hash[1] & hash[2]))) | 0;
        hash.pop();
        hash.unshift((temp1 + temp2) | 0);
        hash[4] = (hash[4] + temp1) | 0;
      }
      for (let i = 0; i < 8; i += 1) hash[i] = (hash[i] + oldHash[i]) | 0;
    }
    return hash.map((value) => (value >>> 0).toString(16).padStart(8, "0")).join("");
  }

  async _hashAgriPayload(payload) {
    const clone = { ...(payload || {}) };
    delete clone.record_hash;
    return this._sha256(this._stableJson(clone));
  }

  async _extractAgriDescription(description = "") {
    const raw = this._agriJsonBlock(description);
    if (!raw) return { humanNotes: String(description || "").trim(), payload: {}, hashValid: false, hasAgri: false };
    try {
      const payload = JSON.parse(raw);
      const operationId = payload.operation_id || this._agriOperationIdFromDescription(description);
      if (operationId && !payload.operation_id) payload.operation_id = operationId;
      const expected = await this._hashAgriPayload(payload);
      return { humanNotes: this._humanDescription(description), payload, operationId, hashValid: Boolean(payload.record_hash) && payload.record_hash === expected, hasAgri: true };
    } catch (_err) {
      return { humanNotes: this._humanDescription(description), payload: {}, hashValid: false, hasAgri: true };
    }
  }

  _agriPayloadFromForm(form = this._form) {
    const agri = form.agri || {};
    return {
      version: 1,
      type: "agri_operation",
      operation_id: agri.operationId || "",
      cycle_id: agri.cycleId || "",
      operation_type: agri.operationType || "灌溉",
      actual_start: form.allDay ? this._dateOnly(form.start) : this._toIsoWithOffset(form.start),
      operator: agri.operator || "",
      material_name: agri.materialName || "",
      quantity: agri.quantity || "",
      unit: agri.unit || "",
      sensor_entities: String(agri.sensorEntities || "").split(",").map((item) => item.trim()).filter(Boolean),
    };
  }

  async _composeAgriDescription(form = this._form, existingPayload = {}) {
    const now = new Date().toISOString();
    const payload = {
      ...this._agriPayloadFromForm(form),
      created_at: existingPayload.created_at || now,
      updated_at: now,
    };
    payload.record_hash = await this._hashAgriPayload(payload);
    const parts = [];
    if (form.description?.trim()) parts.push(form.description.trim());
    parts.push(`<!-- UNINUS_AGRI_OPERATION_JSON\n${JSON.stringify(payload)}\nUNINUS_AGRI_OPERATION_JSON -->`);
    return parts.join("\n\n");
  }

  _eventKind(ev) {
    const desc = ev.description || "";
    if (this._hasAgriJson(desc) || this._agriOperationIdFromDescription(desc)) return "agri";
    if (this._actionIdFromDescription(desc)) return "service";
    return "normal";
  }

  _eventPill(ev) {
    const desc = ev.description || "";
    const kind = this._eventKind(ev);
    const time = this._formatEventTime(ev);
    return `<button class="pill ${kind}" data-uid="${this._escape(ev.uid || "")}" data-recurrence-id="${this._escape(ev.recurrence_id || "")}" data-calendar="${this._escape(ev.__calendarEntity || this._selectedCalendar || "")}" title="${this._escape(ev.summary || "")}">${time ? `<span class="time">${time}</span>` : ""}${this._escape(ev.summary || "(No title)")}</button>`;
  }

  _dayEvent(ev) {
    const desc = ev.description || "";
    const kind = this._eventKind(ev);
    const time = this._formatEventTime(ev, true) || "全天";
    return `<button class="day-event ${kind}" data-uid="${this._escape(ev.uid || "")}" data-recurrence-id="${this._escape(ev.recurrence_id || "")}" data-calendar="${this._escape(ev.__calendarEntity || this._selectedCalendar || "")}" title="${this._escape(ev.summary || "")}"><div class="event-time">${this._escape(time)}</div><div class="event-title">${this._escape(ev.summary || "(No title)")}</div></button>`;
  }

  _isRecurringCurrentEvent() {
    return Boolean(this._form?.rrule || this._form?.recurrenceId || this._editingEvent?.rrule || this._editingEvent?.recurrence_id);
  }

  _deleteConfirmTemplate() {
    if (!this._editingEvent) return "";
    const recurring = this._isRecurringCurrentEvent();
    const agriOperationId = this._currentAgriOperationId();
    const agriOptions = agriOperationId ? `<p class="warning">這是農務作業行程。請選擇 Calendar event 刪除後，產銷履歷作業要如何處理。</p>` : "";
    return `<section class="delete-confirm" role="alertdialog" aria-modal="true" aria-label="刪除行程">
      <header><button class="close" id="delete-cancel-x" aria-label="取消">×</button><span>刪除行程</span></header>
      <p>${recurring ? "僅刪除此行程、或所有未來的行程？" : "要刪除此行程嗎？"}</p>
      ${agriOptions}
      <div class="delete-actions">
        <button class="text" id="delete-cancel">取消</button>
        ${agriOperationId
          ? `<button class="danger" id="delete-this-event-keep-operation">只刪除 Calendar 行程，保留農務作業</button><button class="danger" id="delete-this-event-archive-operation">封存農務作業並刪除行程</button>`
          : (recurring
            ? `<button class="danger" id="delete-this-event">僅刪除此<br/>行程</button><button class="danger" id="delete-future-events">刪除所有未來<br/>行程</button>`
            : `<button class="danger" id="delete-this-event">刪除行程</button>`)}
      </div>
    </section>`;
  }


  _editConfirmTemplate() {
    if (!this._editingEvent || !this._isRecurringCurrentEvent()) return "";
    return `<section class="edit-confirm" role="alertdialog" aria-modal="true" aria-label="修改重複行程">
      <header><button class="close" id="edit-cancel-x" aria-label="取消">×</button><span>修改重複行程</span></header>
      <p>要僅修改這個行程，還是修改這個時間點之後的所有行程？</p>
      <div class="delete-actions">
        <button class="text" id="edit-cancel">取消</button>
        <button class="primary" id="edit-this-event">僅修改此<br/>行程</button>
        <button class="primary" id="edit-future-events">修改所有未來<br/>行程</button>
      </div>
    </section>`;
  }

  _eventTypeOptions(selected = "normal") {
    return [["normal", "一般行程"], ["service", "服務排程"], ["agri", "農務作業"]]
      .map(([value, label]) => `<option value="${value}" ${value === selected ? "selected" : ""}>${label}</option>`)
      .join("");
  }

  _agriFieldsTemplate() {
    const records = this._traceabilityRecords();
    const cycles = Object.values(records.cycles || {});
    const agri = this._form.agri || this._defaultAgriFields();
    const cycleOptions = [`<option value="">選擇生產週期</option>`].concat(cycles.map((cycle) => `<option value="${this._escape(cycle.cycle_id)}" ${cycle.cycle_id === agri.cycleId ? "selected" : ""}>${this._escape(cycle.product || cycle.cycle_id)} ${this._escape(cycle.lot_number || "")}</option>`)).join("");
    const typeOptions = this._agriOperationTypeOptions(agri.operationType);
    return `<fieldset class="agri-fields fullrow">
      <legend>農務作業欄位</legend>
      <label>生產週期<select id="agri_cycle">${cycleOptions}</select></label>
      <label>作業類型<select id="agri_operation_type">${typeOptions}</select></label>
      <label>操作者<input id="agri_operator" value="${this._escape(agri.operator)}" /></label>
      <label>資材/水源<input id="agri_material" value="${this._escape(agri.materialName)}" /></label>
      <div class="inline-field"><label>數量<input id="agri_quantity" value="${this._escape(agri.quantity)}" /></label><label>單位<input id="agri_unit" value="${this._escape(agri.unit)}" /></label></div>
      <label class="fullrow">感測器 entity_id（逗號分隔；必要 snapshot/evidence 之後另存）<textarea id="agri_sensor_entities">${this._escape(agri.sensorEntities)}</textarea></label>
      <div class="system-note fullrow">UNINUS_AGRI_OPERATION_JSON 會由系統寫入 description，不會直接顯示或讓使用者手動編輯。</div>
      ${this._form.agriHashChecked && !this._form.agriHashValid ? `<div class="warning fullrow">⚠️ 農務 JSON record_hash 驗證失敗，這筆事件可能曾被外部修改。</div>` : ""}
    </fieldset>`;
  }

  _dialogTemplate() {
    const f = this._form;
    const isService = f.eventType === "service";
    const isAgri = f.eventType === "agri";
    const title = this._editingEvent ? "編輯 Calendar 事件" : "新增 Calendar 事件";
    return `
      <div class="scrim"></div>
      <section class="dialog" role="dialog" aria-modal="true" aria-label="${title}">
        <header>${title}</header>
        <div class="content">
          <div class="native-control">
            ${this._haEntityPickerReady
              ? `<ha-entity-picker id="calendar" label="Calendar" show-entity-id></ha-entity-picker>`
              : `<label>Calendar<select id="calendar">${this._calendarOptions(f.calendar)}</select></label>`}
          </div>
          <label>事件類型<select id="event_type">${this._eventTypeOptions(f.eventType || "normal")}</select></label>
          <label>Summary
            <input id="summary" value="${this._escape(f.summary)}" placeholder="例如：農務：灌溉" />
          </label>
          <label class="fullrow">Location
            <input id="location" value="${this._escape(f.location)}" placeholder="選填，與原生 Calendar location 對應" />
          </label>
          <label class="checkbox fullrow"><input id="all_day" type="checkbox" ${f.allDay ? "checked" : ""} /> 全天事件</label>
          <label>Start
            <input id="start" type="${f.allDay ? "date" : "datetime-local"}" value="${this._escape(f.start)}" />
          </label>
          <label>End
            <input id="end" type="${f.allDay ? "date" : "datetime-local"}" value="${this._escape(f.end)}" />
          </label>
          ${this._recurrenceTemplate()}
          ${isAgri ? this._agriFieldsTemplate() : ""}
          ${isService ? this._actionSection("start", "行程開始 Service Action", f.service, f.target, f.data, "行程開始時間觸發；留空表示開始時不執行 service action。") : ""}
          ${isService ? this._actionSection("end", "行程結束 Service Action", f.endService, f.endTarget, f.endData, "行程結束時間觸發；留空表示結束時不執行 service action。") : ""}
          <label class="fullrow">${isAgri ? "人類備註（可編輯）" : "Description"}
            <textarea id="description" placeholder="${isAgri ? "這裡只顯示人類備註；系統 JSON 會隱藏產生" : "會顯示在 Local Calendar 事件描述中"}">${this._escape(f.description)}</textarea>
          </label>
          <div class="message fullrow ${this._message.startsWith("Error:") ? "error" : ""}">${this._escape(this._message)}</div>
        </div>
        <div class="actions">
          ${this._editingEvent ? `<button id="delete-event">刪除行程</button><button id="clone-event">複製行程</button>` : ""}
          <button id="cancel">取消</button>
          <button class="primary" id="create">${this._editingEvent ? "儲存修改" : "建立行程"}</button>
        </div>
      </section>
      ${this._deleteConfirmTemplate()}
      ${this._editConfirmTemplate()}
    `;
  }

  _bind() {
    if (!this._delegatedClickBound) {
      this.shadowRoot.addEventListener("click", (ev) => this._handleDelegatedClick(ev));
      this._delegatedClickBound = true;
    }
    this.shadowRoot.querySelectorAll("#agri-open-workbench, [data-workbench-tab]").forEach((control) => {
      control.addEventListener("click", (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        this._openTraceabilityWorkbench(control.dataset.workbenchTab || "overview");
      });
    });
    this.shadowRoot.querySelectorAll(".calendar-choice").forEach((checkbox) => {
      checkbox.addEventListener("change", () => {
        this._selectedCalendars = Array.from(this.shadowRoot.querySelectorAll(".calendar-choice:checked")).map((el) => el.value);
        this._selectedCalendar = this._selectedCalendars[0] || "";
        this._form.calendar = this._selectedCalendar;
        this._calendarListScrollTop = this.shadowRoot.querySelector(".calendar-list")?.scrollTop || 0;
        this._saveSelectedCalendars();
        this._loadEvents();
      });
    });
    const calendarPicker = this.shadowRoot.getElementById("calendar");
    if (calendarPicker?.tagName?.toLowerCase() === "ha-entity-picker") {
      calendarPicker.hass = this._hass;
      calendarPicker.includeDomains = ["calendar"];
      calendarPicker.value = this._form.calendar;
      calendarPicker.addEventListener("value-changed", (ev) => {
        this._form.calendar = ev.detail?.value || "";
      });
    }
    this.shadowRoot.getElementById("refresh")?.addEventListener("click", () => this._loadEvents());
    this.shadowRoot.getElementById("add-calendar")?.addEventListener("click", () => this._openCalendarCreateDialog());
    this.shadowRoot.getElementById("new-event-fab")?.addEventListener("click", () => this._openDialog());
    this.shadowRoot.getElementById("prev-month")?.addEventListener("click", () => this._movePeriod(-1));
    this.shadowRoot.getElementById("next-month")?.addEventListener("click", () => this._movePeriod(1));
    this.shadowRoot.getElementById("today")?.addEventListener("click", () => {
      this._visibleMonth = new Date();
      this._loadEvents();
    });
    this.shadowRoot.querySelectorAll(".view-mode").forEach((el) => el.addEventListener("click", () => this._setViewMode(el.dataset.view)));
    this.shadowRoot.querySelectorAll(".date-cell").forEach((el) => el.addEventListener("dblclick", () => this._openDialog(el.dataset.date)));
    this.shadowRoot.querySelectorAll(".pill[data-uid], .day-event[data-uid]").forEach((el) => el.addEventListener("click", (ev) => {
      ev.stopPropagation();
      this._openEventByUid(el.dataset.uid, el.dataset.calendar, el.dataset.recurrenceId || "");
    }));
    this.shadowRoot.querySelector(".scrim")?.addEventListener("click", () => this._deleteConfirmOpen ? this._closeDeleteConfirm() : (this._editConfirmOpen ? this._closeEditConfirm() : (this._traceabilityWorkbenchOpen ? this._closeTraceabilityWorkbench() : (this._calendarCreateDialogOpen ? this._closeCalendarCreateDialog() : (this._agriDialogOpen ? this._closeAgriDialog() : this._closeDialog())))));
    this.shadowRoot.getElementById("cancel")?.addEventListener("click", () => this._closeDialog());
    this.shadowRoot.getElementById("calendar-create-cancel")?.addEventListener("click", () => this._closeCalendarCreateDialog());
    this.shadowRoot.getElementById("calendar-create-submit")?.addEventListener("click", () => this._createLocalCalendar());
    this.shadowRoot.getElementById("calendar-create-name")?.addEventListener("input", (ev) => { this._calendarCreateForm.name = ev.target.value; });
    this.shadowRoot.querySelectorAll('input[name="calendar-create-import"]').forEach((el) => el.addEventListener("change", () => { this._captureCalendarCreateForm(); this._render(); }));
    this.shadowRoot.getElementById("delete-event")?.addEventListener("click", () => this._openDeleteConfirm());
    this.shadowRoot.getElementById("clone-event")?.addEventListener("click", () => this._cloneCurrentEventForCreate());
    this.shadowRoot.getElementById("delete-cancel")?.addEventListener("click", () => this._closeDeleteConfirm());
    this.shadowRoot.getElementById("delete-cancel-x")?.addEventListener("click", () => this._closeDeleteConfirm());
    this.shadowRoot.getElementById("delete-this-event")?.addEventListener("click", () => this._deleteCurrentEvent(""));
    this.shadowRoot.getElementById("delete-future-events")?.addEventListener("click", () => this._deleteCurrentEvent("THISANDFUTURE"));
    this.shadowRoot.getElementById("delete-this-event-keep-operation")?.addEventListener("click", () => this._deleteCurrentEvent("", "keep"));
    this.shadowRoot.getElementById("delete-this-event-archive-operation")?.addEventListener("click", () => this._deleteCurrentEvent("", "archive"));
    this.shadowRoot.getElementById("edit-cancel")?.addEventListener("click", () => this._closeEditConfirm());
    this.shadowRoot.getElementById("edit-cancel-x")?.addEventListener("click", () => this._closeEditConfirm());
    this.shadowRoot.getElementById("edit-this-event")?.addEventListener("click", () => this._confirmUpdateCurrentEvent("this"));
    this.shadowRoot.getElementById("edit-future-events")?.addEventListener("click", () => this._confirmUpdateCurrentEvent("future"));
    this.shadowRoot.getElementById("create")?.addEventListener("click", () => this._create());
    this.shadowRoot.getElementById("agri-open-dialog")?.addEventListener("click", () => this._openDialog(undefined, "agri"));
    this.shadowRoot.getElementById("agri-open-workbench")?.addEventListener("click", () => this._openTraceabilityWorkbench("overview"));
    this.shadowRoot.getElementById("traceability-workbench-close")?.addEventListener("click", () => this._closeTraceabilityWorkbench());
    this.shadowRoot.getElementById("traceability-workbench-close-top")?.addEventListener("click", () => this._closeTraceabilityWorkbench());
    this.shadowRoot.getElementById("trace-workbench-cycle-context")?.addEventListener("change", (ev) => { this._selectedExportCycleId = ev.target.value || ""; this._operationForm.operationCycleFilter = this._selectedExportCycleId; this._evidenceForm.evidenceOperationFilter = ""; this._lastCycleExportPayload = undefined; this._render(); });
    this.shadowRoot.getElementById("workbench-tab-overview")?.addEventListener("click", () => this._setTraceabilityWorkbenchTab("overview"));
    this.shadowRoot.getElementById("workbench-tab-master-data")?.addEventListener("click", () => this._setTraceabilityWorkbenchTab("master-data"));
    this.shadowRoot.getElementById("workbench-tab-operations")?.addEventListener("click", () => this._setTraceabilityWorkbenchTab("operations"));
    this.shadowRoot.getElementById("workbench-tab-evidence")?.addEventListener("click", () => this._setTraceabilityWorkbenchTab("evidence"));
    this.shadowRoot.getElementById("workbench-tab-consistency")?.addEventListener("click", () => this._setTraceabilityWorkbenchTab("consistency"));
    this.shadowRoot.getElementById("workbench-tab-export")?.addEventListener("click", () => this._setTraceabilityWorkbenchTab("export"));
    this.shadowRoot.getElementById("agri-cancel")?.addEventListener("click", () => this._closeAgriDialog());
    this.shadowRoot.getElementById("agri-create-operation")?.addEventListener("click", () => this._createAgriOperation());
    this.shadowRoot.getElementById("agri-export")?.addEventListener("click", () => this._exportTraceabilityRecords());
    this.shadowRoot.getElementById("agri-download-json")?.addEventListener("click", () => this._downloadTraceabilityJson());
    this.shadowRoot.getElementById("agri-download-csv")?.addEventListener("click", () => this._downloadTraceabilityCsv());
    this.shadowRoot.getElementById("agri-export-cycle")?.addEventListener("click", () => this._exportTraceabilityRecords(this._selectedExportCycleId || ""));
    this.shadowRoot.getElementById("agri-download-cycle-json")?.addEventListener("click", () => this._downloadTraceabilityCycleJson());
    this.shadowRoot.getElementById("agri-download-cycle-csv")?.addEventListener("click", () => this._downloadTraceabilityCycleCsv());
    this.shadowRoot.getElementById("agri-migrate-legacy")?.addEventListener("click", () => this._migrateLegacyAgriOperations());
    this.shadowRoot.getElementById("trace_overview_cycle")?.addEventListener("change", (ev) => { this._selectedExportCycleId = ev.target.value || ""; this._lastCycleExportPayload = undefined; this._render(); });
    this.shadowRoot.getElementById("trace_export_cycle_workbench")?.addEventListener("change", (ev) => { this._selectedExportCycleId = ev.target.value || ""; this._lastCycleExportPayload = undefined; this._render(); });
    this.shadowRoot.getElementById("trace-repair-missing-calendar-linkage")?.addEventListener("click", () => this._repairMissingCalendarLinkage());
    this.shadowRoot.getElementById("trace-delete-orphan-evidence")?.addEventListener("click", () => this._deleteOrphanEvidence());
    this.shadowRoot.getElementById("trace-evidence-create")?.addEventListener("click", () => this._createEvidenceRecord());
    const evidenceSearch = this.shadowRoot.getElementById("trace-evidence-search");
    evidenceSearch?.addEventListener("input", () => this._captureEvidenceForm());
    evidenceSearch?.addEventListener("keydown", (ev) => { if (ev.key === "Enter") { ev.preventDefault(); this._applyEvidenceSearch(); } });
    this.shadowRoot.getElementById("trace-evidence-apply-search")?.addEventListener("click", () => this._applyEvidenceSearch());
    this.shadowRoot.getElementById("trace-evidence-view-list")?.addEventListener("click", () => { this._captureEvidenceForm(); this._evidenceForm.evidenceView = "list"; this._render(); });
    this.shadowRoot.getElementById("trace-evidence-view-gallery")?.addEventListener("click", () => { this._captureEvidenceForm(); this._evidenceForm.evidenceView = "gallery"; this._render(); });
    this.shadowRoot.getElementById("trace-evidence-new")?.addEventListener("click", () => { const current = this._evidenceForm || this._defaultEvidenceForm(); this._evidenceForm = { ...this._defaultEvidenceForm(), evidenceSearch: current.evidenceSearch, evidenceSearchApplied: current.evidenceSearchApplied, evidenceOperationFilter: current.evidenceOperationFilter, evidencePageSize: current.evidencePageSize, evidenceView: current.evidenceView }; this._message = "建立新的佐證資料。"; this._render(); });
    this.shadowRoot.getElementById("trace-evidence-operation-filter")?.addEventListener("change", () => { this._captureEvidenceForm(); this._evidenceForm.evidencePage = 0; this._render(); });
    this.shadowRoot.getElementById("trace-evidence-page-size")?.addEventListener("change", () => { this._captureEvidenceForm(); this._evidenceForm.evidencePage = 0; this._render(); });
    this.shadowRoot.getElementById("trace-evidence-prev-page")?.addEventListener("click", () => { this._captureEvidenceForm(); this._evidenceForm.evidencePage = Math.max((Number(this._evidenceForm.evidencePage) || 0) - 1, 0); this._render(); });
    this.shadowRoot.getElementById("trace-evidence-next-page")?.addEventListener("click", () => { this._captureEvidenceForm(); this._evidenceForm.evidencePage = (Number(this._evidenceForm.evidencePage) || 0) + 1; this._render(); });
    this.shadowRoot.querySelectorAll(".trace-select-evidence").forEach((button) => button.addEventListener("click", () => this._selectEvidenceRecord(button.dataset.id)));
    ["trace_evidence_operation", "trace_evidence_type", "trace_evidence_title", "trace_evidence_source_entity", "trace_evidence_uri", "trace_evidence_content"].forEach((id) => {
      this.shadowRoot.getElementById(id)?.addEventListener("input", () => this._captureEvidenceForm());
      this.shadowRoot.getElementById(id)?.addEventListener("change", () => this._captureEvidenceForm());
    });
    this.shadowRoot.getElementById("trace-evidence-save")?.addEventListener("click", () => this._updateEvidenceRecord());
    this.shadowRoot.getElementById("trace-evidence-delete")?.addEventListener("click", () => this._deleteEvidenceRecord());
    const operationSearch = this.shadowRoot.getElementById("trace-operation-search");
    operationSearch?.addEventListener("input", () => this._captureOperationForm());
    operationSearch?.addEventListener("keydown", (ev) => { if (ev.key === "Enter") { ev.preventDefault(); this._applyOperationSearch(); } });
    this.shadowRoot.getElementById("trace-operation-apply-search")?.addEventListener("click", () => this._applyOperationSearch());
    ["trace-operation-cycle-filter", "trace-operation-status-filter", "trace-operation-date-range", "trace-operation-page-size"].forEach((id) => {
      this.shadowRoot.getElementById(id)?.addEventListener("change", () => { this._captureOperationForm(); this._operationForm.operationPage = 0; this._render(); });
    });
    this.shadowRoot.getElementById("trace-operation-prev-page")?.addEventListener("click", () => { this._captureOperationForm(); this._operationForm.operationPage = Math.max((Number(this._operationForm.operationPage) || 0) - 1, 0); this._render(); });
    this.shadowRoot.getElementById("trace-operation-next-page")?.addEventListener("click", () => { this._captureOperationForm(); this._operationForm.operationPage = (Number(this._operationForm.operationPage) || 0) + 1; this._render(); });
    this.shadowRoot.querySelectorAll(".trace-select-operation").forEach((button) => button.addEventListener("click", () => this._selectTraceOperation(button.dataset.id)));
    ["trace_operation_cycle", "trace_operation_type", "trace_operation_actual_start", "trace_operation_operator", "trace_operation_material", "trace_operation_quantity", "trace_operation_unit", "trace_operation_status", "trace_operation_calendar_entity", "trace_operation_calendar_uid", "trace_operation_sensor_entities", "trace_operation_notes"].forEach((id) => {
      this.shadowRoot.getElementById(id)?.addEventListener("input", () => this._captureOperationForm());
      this.shadowRoot.getElementById(id)?.addEventListener("change", () => this._captureOperationForm());
    });
    this.shadowRoot.getElementById("trace-operation-save")?.addEventListener("click", () => this._updateTraceOperation());
    this.shadowRoot.getElementById("trace-operation-archive")?.addEventListener("click", () => this._updateTraceOperation("skipped"));
    const managementSearch = this.shadowRoot.getElementById("trace-management-search");
    managementSearch?.addEventListener("input", () => this._captureManagementForm());
    managementSearch?.addEventListener("keydown", (ev) => { if (ev.key === "Enter") { ev.preventDefault(); this._applyManagementSearch(); } });
    this.shadowRoot.getElementById("trace-management-apply-search")?.addEventListener("click", () => this._applyManagementSearch());
    [["trace-master-kind-farm", "farm"], ["trace-master-kind-plot", "plot"], ["trace-master-kind-cycle", "cycle"]].forEach(([id, kind]) => this.shadowRoot.getElementById(id)?.addEventListener("click", () => { this._captureManagementForm(); this._managementForm.managementKind = kind; this._render(); }));
    this.shadowRoot.getElementById("trace_farm_name")?.addEventListener("input", () => this._captureManagementForm());
    this.shadowRoot.getElementById("trace_farm_name")?.addEventListener("change", () => this._applyFarmNameComboboxSelection());
    this.shadowRoot.getElementById("trace_plot_name")?.addEventListener("input", () => this._captureManagementForm());
    this.shadowRoot.getElementById("trace_plot_name")?.addEventListener("change", () => this._applyPlotNameComboboxSelection());
    this.shadowRoot.getElementById("trace_cycle_trace_code")?.addEventListener("input", () => this._captureManagementForm());
    this.shadowRoot.getElementById("trace_cycle_trace_code")?.addEventListener("change", () => this._applyCycleIdentifierComboboxSelection());
    this.shadowRoot.getElementById("trace-management-page-size")?.addEventListener("change", () => { this._captureManagementPageSize(); this._render(); });
    ["trace-management-status-filter", "trace-farm-page-size", "trace-plot-page-size", "trace-cycle-page-size"].forEach((id) => {
      this.shadowRoot.getElementById(id)?.addEventListener("change", () => { this._captureManagementForm(); this._render(); });
    });
    this.shadowRoot.querySelectorAll(".trace-select-farm").forEach((button) => button.addEventListener("click", () => this._selectTraceFarm(button.dataset.id)));
    this.shadowRoot.querySelectorAll(".trace-select-plot").forEach((button) => button.addEventListener("click", () => this._selectTracePlot(button.dataset.id)));
    this.shadowRoot.querySelectorAll(".trace-select-cycle").forEach((button) => button.addEventListener("click", () => this._selectTraceCycle(button.dataset.id)));
    this.shadowRoot.getElementById("trace-farm-create")?.addEventListener("click", () => this._createTraceFarm());
    this.shadowRoot.getElementById("trace-plot-create")?.addEventListener("click", () => this._createTracePlot());
    this.shadowRoot.getElementById("trace-cycle-create")?.addEventListener("click", () => this._createTraceCycle());
    this.shadowRoot.getElementById("trace-farm-save")?.addEventListener("click", () => this._updateTraceFarm());
    this.shadowRoot.getElementById("trace-plot-save")?.addEventListener("click", () => this._updateTracePlot());
    this.shadowRoot.getElementById("trace-cycle-save")?.addEventListener("click", () => this._updateTraceCycle());
    this.shadowRoot.getElementById("trace-farm-archive")?.addEventListener("click", () => this._updateTraceFarm("archived"));
    this.shadowRoot.getElementById("trace-plot-archive")?.addEventListener("click", () => this._updateTracePlot("archived"));
    this.shadowRoot.getElementById("trace-cycle-archive")?.addEventListener("click", () => this._updateTraceCycle("archived"));
    this.shadowRoot.getElementById("trace-farm-delete")?.addEventListener("click", () => this._deleteTraceFarm());
    this.shadowRoot.getElementById("trace-plot-delete")?.addEventListener("click", () => this._deleteTracePlot());
    this.shadowRoot.getElementById("trace-cycle-delete")?.addEventListener("click", () => this._deleteTraceCycle());
    ["trace_evidence_operation", "trace_evidence_type", "trace_evidence_title", "trace_evidence_source_entity", "trace_evidence_uri", "trace_evidence_content"].forEach((id) => {
      this.shadowRoot.getElementById(id)?.addEventListener("input", () => this._captureEvidenceForm());
      this.shadowRoot.getElementById(id)?.addEventListener("change", () => this._captureEvidenceForm());
    });
    ["agri_calendar", "agri_cycle", "agri_operation_type", "agri_actual_start", "agri_operator", "agri_material", "agri_quantity", "agri_unit", "agri_sensor_entities", "agri_notes"].forEach((id) => {
      this.shadowRoot.getElementById(id)?.addEventListener("input", () => this._captureAgriForm());
      this.shadowRoot.getElementById(id)?.addEventListener("change", () => this._captureAgriForm());
    });
    ["calendar", "event_type", "summary", "location", "start", "end", "recurrence", "recurrence_interval", "recurrence_monthly_mode", "recurrence_end", "recurrence_until", "recurrence_count", "rrule_custom", "start_service", "start_entity", "start_data", "end_service", "end_entity", "end_data", "description", "agri_cycle", "agri_operation_type", "agri_operator", "agri_material", "agri_quantity", "agri_unit", "agri_sensor_entities"].forEach((id) => {
      this.shadowRoot.getElementById(id)?.addEventListener("input", () => this._captureForm());
      this.shadowRoot.getElementById(id)?.addEventListener("change", () => this._captureForm());
    });
    ["event_type", "recurrence", "recurrence_end", "start"].forEach((id) => {
      this.shadowRoot.getElementById(id)?.addEventListener("change", () => {
        this._captureForm();
        this._render();
      });
    });
    this.shadowRoot.querySelectorAll(".recurrence-weekday").forEach((el) => el.addEventListener("change", () => this._captureForm()));
    this._bindActionControls("start", "service", "target", "data");
    this._bindActionControls("end", "endService", "endTarget", "endData");
    this.shadowRoot.getElementById("all_day")?.addEventListener("change", (ev) => this._toggleAllDay(ev.target.checked));
  }

  _bindActionControls(prefix, serviceKey, targetKey, dataKey) {
    const servicePicker = this.shadowRoot.getElementById(`${prefix}-service-picker`);
    if (servicePicker) {
      servicePicker.hass = this._hass;
      servicePicker.value = this._form[serviceKey] || "";
      servicePicker.addEventListener("value-changed", (ev) => {
        this._form[serviceKey] = ev.detail?.value || "";
        this._captureForm();
      });
    }
    const entityPicker = this.shadowRoot.getElementById(`${prefix}-entity-picker`);
    if (entityPicker) {
      entityPicker.hass = this._hass;
      entityPicker.value = this._form[targetKey]?.entity_id || "";
      entityPicker.addEventListener("value-changed", (ev) => {
        const entityId = ev.detail?.value || "";
        const target = { ...(this._form[targetKey] || {}) };
        if (entityId) target.entity_id = entityId;
        else delete target.entity_id;
        this._form[targetKey] = target;
        this._captureForm();
      });
    }
  }

  _setViewMode(mode) {
    if (!["month", "week", "day"].includes(mode) || this._viewMode === mode) return;
    this._viewMode = mode;
    this._saveViewMode();
    this._loadEvents();
  }

  _movePeriod(delta) {
    if (this._viewMode === "day") this._visibleMonth = this._addDays(this._visibleMonth, delta);
    else if (this._viewMode === "week") this._visibleMonth = this._addDays(this._visibleMonth, delta * 7);
    else this._visibleMonth = new Date(this._visibleMonth.getFullYear(), this._visibleMonth.getMonth() + delta, 1);
    this._loadEvents();
  }

  _moveMonth(delta) {
    this._movePeriod(delta);
  }

  _captureForm() {
    const get = (id) => this.shadowRoot.getElementById(id)?.value ?? this._form[id] ?? "";
    const previousDuration = this._durationMs(this._form.start, this._form.end);
    const readService = (prefix, fallbackKey) => {
      const picker = this.shadowRoot.getElementById(`${prefix}-service-picker`);
      return picker ? (picker.value || "") : (get(`${prefix}_service`) || this._form[fallbackKey] || "");
    };
    const readTarget = (prefix, fallbackId, current = {}) => {
      const picker = this.shadowRoot.getElementById(`${prefix}-entity-picker`);
      const explicitEntityId = picker ? (picker.value || "") : get(fallbackId);
      const target = { ...(current || {}) };
      if (picker || this.shadowRoot.getElementById(fallbackId)) {
        if (explicitEntityId) target.entity_id = explicitEntityId;
        else delete target.entity_id;
      }
      return target;
    };
    const service = readService("start", "service");
    const endService = readService("end", "endService");
    const target = readTarget("start", "start_entity", this._form.target);
    const endTarget = readTarget("end", "end_entity", this._form.endTarget);
    const dataText = get("start_data");
    const endDataText = get("end_data");
    const nextRrule = this._rruleFromRecurrenceControls();
    const allDay = this.shadowRoot.getElementById("all_day")?.checked ?? this._form.allDay;
    const startValue = get("start");
    let endValue = get("end");
    if (!allDay) {
      const startDate = new Date(startValue);
      const endDate = new Date(endValue);
      if (!Number.isNaN(startDate.getTime()) && !Number.isNaN(endDate.getTime()) && endDate.getTime() <= startDate.getTime()) {
        endValue = this._localInputValue(new Date(startDate.getTime() + previousDuration));
        const endInput = this.shadowRoot.getElementById("end");
        if (endInput) endInput.value = endValue;
      }
    }
    const agri = {
      cycleId: get("agri_cycle") || this._form.agri?.cycleId || "",
      operationType: get("agri_operation_type") || this._form.agri?.operationType || "灌溉",
      actualStart: startValue,
      operator: get("agri_operator") || this._form.agri?.operator || "",
      materialName: get("agri_material") || this._form.agri?.materialName || "",
      quantity: get("agri_quantity") || this._form.agri?.quantity || "",
      unit: get("agri_unit") || this._form.agri?.unit || "",
      sensorEntities: get("agri_sensor_entities") || this._form.agri?.sensorEntities || "",
      operationId: this._form.agri?.operationId || "",
      calendarEventUid: this._form.agri?.calendarEventUid || "",
    };
    this._form = {
      calendar: get("calendar"),
      eventType: get("event_type") || this._form.eventType || "normal",
      summary: get("summary"),
      location: get("location"),
      allDay,
      start: allDay ? this._dateOnly(startValue) : startValue,
      end: allDay ? this._exclusiveAllDayEndDate(startValue, endValue) : endValue,
      rrule: nextRrule,
      service,
      target,
      serviceAction: { action: service, target, data: this._parseServiceData(dataText) },
      endService,
      endTarget,
      endData: endDataText,
      endServiceAction: { action: endService, target: endTarget, data: this._parseServiceData(endDataText) },
      actionId: this._form.actionId || "",
      uid: this._form.uid || "",
      recurrenceId: this._form.recurrenceId || null,
      data: dataText,
      description: get("description"),
      agri,
      agriHashValid: this._form.agriHashValid ?? true,
      agriHashChecked: this._form.agriHashChecked ?? false,
    };
  }

  _parseServiceData(dataText) {
    try {
      return dataText ? JSON.parse(dataText) : {};
    } catch (_err) {
      return {};
    }
  }

  _toggleAllDay(allDay) {
    this._captureForm();
    this._form.allDay = allDay;
    if (allDay) {
      this._form.start = this._dateOnly(this._form.start) || this._dateInputValue();
      this._form.end = this._exclusiveAllDayEndDate(this._form.start, this._form.end || this._dateInputValue(new Date(Date.now() + 86400000)));
    } else {
      this._form.start = this._localInputValue(new Date(`${this._form.start}T00:00:00`));
      this._form.end = this._localInputValue(new Date(`${this._form.end}T00:00:00`));
    }
    this._render();
  }

  _cloneCurrentEventForCreate() {
    this._captureForm();
    this._editingEvent = undefined;
    this._deleteConfirmOpen = false;
    this._editConfirmOpen = false;
    this._form = {
      ...this._form,
      uid: "",
      recurrenceId: null,
      actionId: "",
      agri: {
        ...(this._form.agri || {}),
        operationId: "",
        calendarEventUid: "",
      },
    };
    this._message = "已複製行程內容；請修改後按「建立行程」存成新的行程。";
    this._render();
  }

  async _openEventByUid(uid, calendarEntity = "", recurrenceId = "") {
    const event = this._events.find((ev) => ev.uid === uid && (!calendarEntity || ev.__calendarEntity === calendarEntity) && (!recurrenceId || ev.recurrence_id === recurrenceId));
    if (!event) return;
    const agriInfo = await this._extractAgriDescription(event.description || "");
    const actionId = this._actionIdFromDescription(event.description || "");
    const storedAction = this._storedAction(actionId);
    this._editingEvent = event;
    const start = this._eventStart(event) || "";
    const end = this._eventEnd(event) || start;
    const isAllDay = Boolean(event.start?.date);
    const agriPayload = agriInfo.payload || {};
    this._form = {
      ...this._defaultForm(),
      calendar: event.__calendarEntity || storedAction?.calendar_entity || this._selectedCalendar,
      eventType: agriInfo.hasAgri ? "agri" : (actionId ? "service" : "normal"),
      summary: event.summary || "",
      location: event.location || "",
      allDay: isAllDay,
      start: isAllDay ? start.slice(0, 10) : start.slice(0, 16),
      end: isAllDay ? end.slice(0, 10) : end.slice(0, 16),
      rrule: event.rrule || "",
      description: agriInfo.hasAgri ? agriInfo.humanNotes : this._cleanDescription(event.description || ""),
      actionId,
      uid: event.uid || "",
      recurrenceId: event.recurrence_id || null,
      service: storedAction?.service || "",
      target: storedAction?.target || {},
      data: JSON.stringify(storedAction?.data || {}, null, 2),
      serviceAction: { action: storedAction?.service || "", target: storedAction?.target || {}, data: storedAction?.data || {} },
      endService: storedAction?.end_service || "",
      endTarget: storedAction?.end_target || {},
      endData: JSON.stringify(storedAction?.end_data || {}, null, 2),
      endServiceAction: { action: storedAction?.end_service || "", target: storedAction?.end_target || {}, data: storedAction?.end_data || {} },
      agri: agriInfo.hasAgri ? {
        operationId: agriInfo.operationId || agriPayload.operation_id || this._agriOperationIdFromDescription(event.description || ""),
        cycleId: agriPayload.cycle_id || "",
        operationType: agriPayload.operation_type || "灌溉",
        actualStart: (agriPayload.actual_start || start).slice(0, 16),
        operator: agriPayload.operator || "",
        materialName: agriPayload.material_name || "",
        quantity: agriPayload.quantity ?? "",
        unit: agriPayload.unit || "",
        sensorEntities: Array.isArray(agriPayload.sensor_entities) ? agriPayload.sensor_entities.join(", ") : "",
      } : this._defaultAgriFields(),
      agriHashValid: agriInfo.hasAgri ? agriInfo.hashValid : true,
      agriHashChecked: Boolean(agriInfo.hasAgri),
    };
    this._dialogOpen = true;
    this._message = (!agriInfo.hasAgri && !actionId && this._editingEvent) ? "此事件沒有綁定 Uninus service action；可修改日曆事件，但不能更新 service action。" : "";
    this._render();
  }

  _openAgriOperationById(operationId, event) {
    const operation = this._agriOperationById(operationId);
    if (!operation) {
      this._message = "找不到這筆農務作業；可能是舊 calendar 事件或儲存資料已被移除。";
      this._render();
      return;
    }
    this._agriForm = {
      ...this._defaultAgriForm(),
      operationId,
      calendar: event.__calendarEntity || operation.calendar_entity || this._selectedCalendar,
      calendarEventUid: event.uid || operation.calendar_event_uid || "",
      cycleId: operation.cycle_id || "",
      operationType: operation.operation_type || "灌溉",
      actualStart: (operation.actual_start || operation.scheduled_start || "").slice(0, 16),
      operator: operation.operator || "",
      materialName: operation.material_name || "",
      quantity: operation.quantity ?? "",
      unit: operation.unit || "",
      sensorEntities: Object.keys(operation.sensor_snapshot || {}).join(", "),
      notes: operation.notes || "",
    };
    this._message = "";
    this._agriDialogOpen = true;
    this._render();
  }

  _storedAction(actionId) {
    if (this._actionOverrides?.has(actionId)) return this._actionOverrides.get(actionId);
    const actions = this._hass?.states?.["sensor.uninus_calendar_service_scheduler_status"]?.attributes?.actions || [];
    return actions.find((action) => action.action_id === actionId);
  }

  _rememberActionOverride(actionId, payload, eventUid) {
    if (!actionId) return;
    const existing = this._storedAction(actionId) || {};
    this._actionOverrides.set(actionId, {
      ...existing,
      action_id: actionId,
      calendar_entity: payload.calendar_entity,
      summary: payload.summary,
      start: payload.start,
      end: payload.end,
      service: payload.service,
      target: payload.target || {},
      data: payload.data || {},
      end_service: payload.end_service || "",
      end_target: payload.end_target || {},
      end_data: payload.end_data || {},
      description: payload.description || "",
      location: payload.location || "",
      rrule: payload.rrule || "",
      all_day: Boolean(payload.all_day),
      calendar_event_uid: eventUid,
    });
  }

  _cleanDescription(description) {
    return String(description || "")
      .replace(/\n*HA_SERVICE_ACTION_ID:\s*[a-f0-9]+/i, "")
      .replace(/\n*Created by Uninus Calendar Service Scheduler/i, "")
      .trim();
  }

  _eventByActionId(actionId) {
    if (!actionId) return undefined;
    return this._events.find((ev) => this._actionIdFromDescription(ev.description || "") === actionId);
  }

  _currentEventUid() {
    const actionEvent = this._eventByActionId(this._form.actionId);
    return this._form.uid || this._editingEvent?.uid || actionEvent?.uid || "";
  }

  _currentEventRecurrenceId() {
    const actionEvent = this._eventByActionId(this._form.actionId);
    return this._form.recurrenceId ?? this._editingEvent?.recurrence_id ?? actionEvent?.recurrence_id;
  }

  _originalEventCalendarEntity() {
    return this._editingEvent?.__calendarEntity || this._storedAction(this._form.actionId)?.calendar_entity || this._form.calendar || this._selectedCalendar || "";
  }

  _eventCalendarChanged(payload) {
    const originalCalendar = this._originalEventCalendarEntity();
    return Boolean(originalCalendar && payload?.calendar_entity && originalCalendar !== payload.calendar_entity);
  }

  _openDialog(dateKey, eventType = "normal") {
    this._editingEvent = undefined;
    this._form = this._defaultForm();
    this._form.eventType = eventType;
    this._form.calendar = this._selectedCalendar;
    if (dateKey) {
      this._form.start = `${dateKey}T09:00`;
      this._form.end = `${dateKey}T10:00`;
    }
    this._dialogOpen = true;
    this._message = "";
    this._render();
  }

  _closeDialog() {
    this._dialogOpen = false;
    this._deleteConfirmOpen = false;
    this._editingEvent = undefined;
    this._message = "";
    this._render();
  }

  _openDeleteConfirm() {
    this._deleteConfirmOpen = true;
    this._render();
  }

  _closeDeleteConfirm() {
    this._deleteConfirmOpen = false;
    this._render();
  }

  async _loadEvents() {
    const calendars = this._selectedCalendars.length ? this._selectedCalendars : [this._selectedCalendar].filter(Boolean);
    if (!this._hass || !calendars.length) return;
    this._loading = true;
    if (!this._dialogOpen) this._render();
    try {
      const { start, end } = this._visibleRange();
      const qs = `start=${encodeURIComponent(start.toISOString())}&end=${encodeURIComponent(end.toISOString())}`;
      const results = await Promise.all(calendars.map(async (calendarEntity) => {
        const entityPath = encodeURIComponent(calendarEntity);
        const events = await this._hass.callApi("GET", `calendars/${entityPath}?${qs}`);
        return (events || []).map((event) => ({ ...event, __calendarEntity: calendarEntity }));
      }));
      this._events = results.flat().sort((a, b) => String(this._eventStart(a) || "").localeCompare(String(this._eventStart(b) || "")));
      this._calendarTraceabilityRows = await this._calendarEventTraceabilityRows(this._events);
      await this._reconcileStoredAgriOperationsFromCalendarRows(this._calendarTraceabilityRows);
    } catch (err) {
      this._message = `Error: ${err?.message || err}`;
      this._events = [];
      this._calendarTraceabilityRows = [];
    } finally {
      this._loading = false;
      if (!this._dialogOpen) this._render();
    }
  }

  _calendarEventPayload(payload) {
    return {
      summary: payload.summary,
      dtstart: payload.all_day ? this._dateOnly(payload.start) : payload.start,
      dtend: payload.all_day ? this._exclusiveAllDayEndDate(payload.start, payload.end) : payload.end || payload.start,
      description: this._calendarDescription(payload.description, payload.action_id || this._form.actionId),
      ...(payload.location ? { location: payload.location } : {}),
      ...(payload.rrule ? { rrule: payload.rrule } : {}),
    };
  }

  _calendarDescription(description, actionId) {
    const parts = [];
    if (description) parts.push(String(description).trim());
    if (actionId) parts.push(`HA_SERVICE_ACTION_ID: ${actionId}`);
    if (actionId) parts.push("Created by Uninus Calendar Service Scheduler");
    return parts.join("\n\n");
  }

  _newActionId() {
    if (crypto?.randomUUID) return crypto.randomUUID().replace(/-/g, "");
    return Array.from(crypto.getRandomValues(new Uint8Array(16)))
      .map((value) => value.toString(16).padStart(2, "0"))
      .join("");
  }

  async _createCalendarOnlyEvent(payload) {
    await this._hass.callWS({
      type: "calendar/event/create",
      entity_id: payload.calendar_entity,
      event: this._calendarEventPayload({ ...payload, action_id: "" }),
    });
  }

  async _createServiceEventViaCalendarApi(payload) {
    const actionId = this._newActionId();
    await this._hass.callWS({
      type: "call_service",
      domain: "uninus_calendar_service_scheduler",
      service: "update_event_action",
      service_data: { ...payload, action_id: actionId },
      return_response: true,
    });
    try {
      await this._hass.callWS({
        type: "calendar/event/create",
        entity_id: payload.calendar_entity,
        event: this._calendarEventPayload({ ...payload, action_id: actionId }),
      });
    } catch (err) {
      await this._hass.callWS({
        type: "call_service",
        domain: "uninus_calendar_service_scheduler",
        service: "delete_event_action",
        service_data: { action_id: actionId },
        return_response: true,
      });
      throw err;
    }
    this._rememberActionOverride(actionId, payload, "");
    return actionId;
  }


  _rruleUntilBefore(rrule, startIso) {
    if (!rrule) return "";
    const start = new Date(startIso);
    if (Number.isNaN(start.getTime())) return rrule;
    const untilDate = new Date(start.getTime() - 24 * 60 * 60 * 1000);
    const until = `${untilDate.getUTCFullYear()}${this._pad(untilDate.getUTCMonth() + 1)}${this._pad(untilDate.getUTCDate())}T235959Z`;
    const parts = String(rrule).split(";").filter((part) => part && !part.toUpperCase().startsWith("UNTIL=") && !part.toUpperCase().startsWith("COUNT="));
    parts.push(`UNTIL=${until}`);
    return parts.join(";");
  }

  _payloadFromStoredAction(action, fallbackPayload, rruleOverride) {
    return {
      calendar_entity: action?.calendar_entity || fallbackPayload.calendar_entity,
      summary: action?.summary || fallbackPayload.summary,
      start: action?.start || fallbackPayload.start,
      end: action?.end || fallbackPayload.end,
      all_day: Boolean(action?.all_day ?? fallbackPayload.all_day),
      location: action?.location || "",
      rrule: rruleOverride ?? action?.rrule ?? "",
      service: action?.service || "",
      target: action?.target || {},
      data: action?.data || {},
      end_service: action?.end_service || "",
      end_target: action?.end_target || {},
      end_data: action?.end_data || {},
      description: action?.description || "",
    };
  }

  async _updateFutureEvents(payload) {
    const eventUid = this._currentEventUid();
    const recurrenceId = this._currentEventRecurrenceId();
    if (!eventUid || !recurrenceId) throw new Error("此重複行程缺少 uid 或 recurrence_id，無法套用到未來行程");
    const originalActionId = this._form.actionId;
    const originalAction = this._storedAction(originalActionId);
    if (originalActionId && originalAction) {
      const truncatedRrule = this._rruleUntilBefore(originalAction.rrule || this._editingEvent?.rrule || payload.rrule, payload.start);
      await this._hass.callWS({
        type: "call_service",
        domain: "uninus_calendar_service_scheduler",
        service: "update_event_action",
        service_data: { ...this._payloadFromStoredAction(originalAction, payload, truncatedRrule), action_id: originalActionId, calendar_event_uid: eventUid },
        return_response: true,
      });
    }
    await this._hass.callWS({
      type: "calendar/event/delete",
      entity_id: this._form.calendar,
      uid: eventUid,
      recurrence_id: recurrenceId,
      recurrence_range: "THISANDFUTURE",
    });
    if (!payload.service && !payload.end_service) {
      await this._createCalendarOnlyEvent(payload);
    } else {
      await this._createServiceEventViaCalendarApi(payload);
    }
  }

  _openEditConfirm(payload) {
    this._pendingUpdatePayload = payload;
    this._editConfirmOpen = true;
    this._render();
  }

  _closeEditConfirm() {
    this._editConfirmOpen = false;
    this._pendingUpdatePayload = undefined;
    this._render();
  }

  async _confirmUpdateCurrentEvent(scope) {
    const payload = this._pendingUpdatePayload;
    if (!payload) return;
    this._editConfirmOpen = false;
    this._pendingUpdatePayload = undefined;
    try {
      await this._updateCurrentEvent(payload, scope);
      this._dialogOpen = false;
      this._editingEvent = undefined;
      this._message = "已更新行程。";
      await this._loadEvents();
    } catch (err) {
      this._message = `Error: ${err?.message || err}`;
      this._render();
    }
  }

  async _updateSingleOccurrenceEvent(payload) {
    const eventUid = this._currentEventUid();
    const recurrenceId = this._currentEventRecurrenceId();
    if (!eventUid) throw new Error("此行程缺少 uid，無法更新");
    const singlePayload = { ...payload, rrule: "" };
    let actionId = "";
    if (singlePayload.service || singlePayload.end_service) {
      actionId = this._newActionId();
      await this._hass.callWS({
        type: "call_service",
        domain: "uninus_calendar_service_scheduler",
        service: "update_event_action",
        service_data: { ...singlePayload, action_id: actionId, calendar_event_uid: eventUid },
        return_response: true,
      });
      this._rememberActionOverride(actionId, singlePayload, eventUid);
    }
    try {
      if (this._eventCalendarChanged(singlePayload)) {
        await this._moveCurrentEventToCalendar(singlePayload, actionId);
        return;
      }
      await this._hass.callWS({
        type: "calendar/event/update",
        entity_id: this._form.calendar,
        uid: eventUid,
        recurrence_id: recurrenceId || undefined,
        event: this._calendarEventPayload({ ...singlePayload, action_id: actionId }),
      });
    } catch (err) {
      if (actionId) {
        await this._hass.callWS({
          type: "call_service",
          domain: "uninus_calendar_service_scheduler",
          service: "delete_event_action",
          service_data: { action_id: actionId },
          return_response: true,
        });
        this._actionOverrides?.delete(actionId);
      }
      throw err;
    }
  }

  async _moveCurrentEventToCalendar(payload, actionId = "") {
    const eventUid = this._currentEventUid();
    const recurrenceId = this._currentEventRecurrenceId();
    const originalCalendar = this._originalEventCalendarEntity();
    if (!eventUid) throw new Error("此行程缺少 uid，無法移動");
    if (!originalCalendar) throw new Error("此行程缺少原始行事曆，無法移動");
    await this._hass.callWS({
      type: "calendar/event/create",
      entity_id: payload.calendar_entity,
      event: this._calendarEventPayload({ ...payload, action_id: actionId }),
    });
    await this._hass.callWS({
      type: "calendar/event/delete",
      entity_id: originalCalendar,
      uid: eventUid,
      recurrence_id: recurrenceId || undefined,
    });
    if (actionId) this._rememberActionOverride(actionId, payload, "");
  }

  _agriOperationServiceDataFromEventPayload(payload) {
    const agri = this._form?.agri || {};
    return {
      cycle_id: agri.cycleId || "",
      operation_type: agri.operationType || "灌溉",
      actual_start: payload.start || (agri.actualStart ? this._toIsoWithOffset(agri.actualStart) : ""),
      operator: agri.operator || "",
      material_name: agri.materialName || "",
      quantity: agri.quantity || "",
      unit: agri.unit || "",
      sensor_entities: String(agri.sensorEntities || "").split(",").map((item) => item.trim()).filter(Boolean),
      notes: this._form?.description || "",
      calendar_entity: payload.calendar_entity || this._form?.calendar || this._selectedCalendar || "",
      calendar_event_uid: this._currentEventUid() || "",
    };
  }

  async _createAgriEventFromDialog(payload) {
    const serviceData = this._agriOperationServiceDataFromEventPayload(payload);
    if (!serviceData.cycle_id) throw new Error("農務作業需要選擇生產週期");
    const response = await this._hass.callWS({
      type: "call_service",
      domain: "uninus_calendar_service_scheduler",
      service: "create_agri_operation",
      service_data: serviceData,
      return_response: true,
    });
    const operationId = response?.response?.operation_id || response?.operation_id || response?.response?.operation?.operation_id || "";
    if (!operationId) throw new Error("建立農務作業失敗：服務未回傳 operation_id");
    this._form.agri = { ...(this._form.agri || {}), operationId, calendarEventUid: "" };
    payload.description = await this._composeAgriDescription(this._form, { operation_id: operationId });
    await this._createCalendarOnlyEvent(payload);
    return operationId;
  }

  async _syncAgriOperationForCurrentEvent(payload) {
    if (this._form?.eventType !== "agri") return false;
    const operationId = this._form?.agri?.operationId || "";
    if (!operationId) return false;
    const service_data = this._agriOperationServiceDataFromEventPayload(payload);
    if (!service_data.cycle_id) throw new Error("農務作業需要選擇生產週期");
    await this._hass.callWS({
      type: "call_service",
      domain: "uninus_calendar_service_scheduler",
      service: "update_agri_operation",
      service_data: { ...service_data, operation_id: operationId },
      return_response: true,
    });
    return true;
  }

  async _updateCurrentEvent(payload, scope = "this") {
    const eventUid = this._currentEventUid();
    const recurrenceId = this._currentEventRecurrenceId();
    if (!eventUid) throw new Error("此行程缺少 uid，無法更新");
    if (this._isRecurringCurrentEvent() && scope === "future") {
      await this._updateFutureEvents(payload);
      return;
    }
    if (this._isRecurringCurrentEvent() && recurrenceId && scope === "this") {
      await this._updateSingleOccurrenceEvent(payload);
      return;
    }
    let actionId = this._form.actionId;
    const hasAnyService = Boolean(payload.service || payload.end_service);
    if (hasAnyService && !actionId) {
      actionId = this._newActionId();
      this._form.actionId = actionId;
    }
    if (hasAnyService && actionId) {
      await this._hass.callWS({
        type: "call_service",
        domain: "uninus_calendar_service_scheduler",
        service: "update_event_action",
        service_data: { ...payload, action_id: actionId, calendar_event_uid: eventUid },
        return_response: true,
      });
      this._rememberActionOverride(actionId, payload, eventUid);
    } else if (!hasAnyService && actionId) {
      await this._hass.callWS({
        type: "call_service",
        domain: "uninus_calendar_service_scheduler",
        service: "delete_event_action",
        service_data: { action_id: actionId },
        return_response: true,
      });
      this._actionOverrides?.delete(actionId);
      this._form.actionId = "";
      actionId = "";
    }
    await this._syncAgriOperationForCurrentEvent(payload);
    if (this._eventCalendarChanged(payload)) {
      await this._moveCurrentEventToCalendar(payload, actionId);
      return;
    }
    await this._hass.callWS({
      type: "calendar/event/update",
      entity_id: this._form.calendar,
      uid: eventUid,
      recurrence_id: recurrenceId || undefined,
      event: this._calendarEventPayload({ ...payload, action_id: actionId }),
    });
  }

  async _archiveAgriOperationForDeletedEvent(operationId) {
    const operation = this._agriOperationById(operationId);
    if (!operation) return;
    await this._hass.callWS({
      type: "call_service",
      domain: "uninus_calendar_service_scheduler",
      service: "update_agri_operation",
      service_data: {
        operation_id: operationId,
        cycle_id: operation.cycle_id || "",
        operation_type: operation.operation_type || "灌溉",
        actual_start: operation.actual_start || operation.scheduled_start || "",
        operator: operation.operator || "",
        material_name: operation.material_name || "",
        quantity: operation.quantity ?? "",
        unit: operation.unit || "",
        sensor_entities: Object.keys(operation.sensor_snapshot || {}),
        notes: operation.notes || "",
        calendar_entity: "",
        calendar_event_uid: "",
        status: "skipped",
      },
      return_response: true,
    });
  }

  async _deleteCurrentEvent(recurrenceRange = "", deleteAgriStrategy = "") {
    try {
      const eventUid = this._currentEventUid();
      const recurrenceId = this._currentEventRecurrenceId();
      const originalCalendar = this._originalEventCalendarEntity();
      if (!eventUid) throw new Error("此行程缺少 uid，無法刪除");
      if (!originalCalendar) throw new Error("此行程缺少原始行事曆，無法刪除");
      const isRecurring = this._isRecurringCurrentEvent();
      const deleteAllFuture = isRecurring && recurrenceRange === "THISANDFUTURE";
      const deleteStoredAction = Boolean(this._form.actionId) && (!isRecurring || deleteAllFuture);
      if (deleteStoredAction) {
        await this._hass.callWS({
          type: "call_service",
          domain: "uninus_calendar_service_scheduler",
          service: "delete_event_action",
          service_data: { action_id: this._form.actionId },
          return_response: true,
        });
        this._actionOverrides?.delete(this._form.actionId);
      }
      const agriOperationId = this._currentAgriOperationId();
      if (agriOperationId && deleteAgriStrategy === "archive") {
        await this._archiveAgriOperationForDeletedEvent(agriOperationId);
      }
      const deleteMessage = {
        type: "calendar/event/delete",
        entity_id: originalCalendar,
        uid: eventUid,
        recurrence_id: recurrenceId || undefined,
        recurrence_range: isRecurring ? recurrenceRange : undefined,
      };
      await this._hass.callWS(deleteMessage);
      this._deleteConfirmOpen = false;
      this._dialogOpen = false;
      this._editingEvent = undefined;
      this._message = isRecurring && !deleteAllFuture
        ? "已刪除此筆重複行程。"
        : "已刪除行程。";
      await this._loadEvents();
    } catch (err) {
      this._deleteConfirmOpen = false;
      this._message = `Error: ${err?.message || err}`;
      this._render();
    }
  }

  async _create() {
    try {
      this._captureForm();
      const f = this._form;
      const isService = f.eventType === "service";
      const isAgri = f.eventType === "agri";
      const serviceData = isService && f.service && f.data ? JSON.parse(f.data) : {};
      const endServiceData = isService && f.endService && f.endData ? JSON.parse(f.endData) : {};
      const existingAgri = isAgri && this._editingEvent ? (await this._extractAgriDescription(this._editingEvent.description || "")).payload : {};
      const payload = {
        calendar_entity: f.calendar,
        summary: f.summary || (isAgri ? `農務：${f.agri?.operationType || "作業"}` : ""),
        start: f.allDay ? `${this._dateOnly(f.start)}T00:00:00` : this._toIsoWithOffset(f.start),
        end: f.allDay ? `${this._exclusiveAllDayEndDate(f.start, f.end)}T00:00:00` : this._toIsoWithOffset(f.end),
        all_day: f.allDay,
        location: f.location,
        rrule: f.rrule,
        service: isService ? f.service : "",
        target: isService ? (f.target || {}) : {},
        data: serviceData,
        end_service: isService ? f.endService : "",
        end_target: isService ? (f.endTarget || {}) : {},
        end_data: endServiceData,
        description: isAgri ? await this._composeAgriDescription(f, existingAgri) : f.description,
      };
      if (isAgri && !f.agri?.cycleId) throw new Error("農務作業需要選擇生產週期");
      for (const field of ["calendar_entity", "summary", "start"]) {
        if (!payload[field]) throw new Error(`${field} is required`);
      }
      const wasEditing = Boolean(this._editingEvent);
      if (wasEditing && this._isRecurringCurrentEvent()) {
        this._openEditConfirm(payload);
        return;
      }
      if (wasEditing) {
        await this._updateCurrentEvent(payload, "this");
      } else if (isAgri) {
        await this._createAgriEventFromDialog(payload);
      } else if (!payload.service && !payload.end_service) {
        await this._createCalendarOnlyEvent(payload);
      } else {
        await this._createServiceEventViaCalendarApi(payload);
      }
      this._dialogOpen = false;
      this._editingEvent = undefined;
      this._message = wasEditing ? "已更新行程。" : (isAgri ? "已建立農務作業 Calendar 事件。" : ((payload.service || payload.end_service) ? "已建立行程與開始/結束服務排程。" : "已建立行程。此行程不會執行 service action。"));
      await this._loadEvents();
    } catch (err) {
      this._message = `Error: ${err?.message || err}`;
      this._render();
    }
  }
}

customElements.define("uninus-calendar-service-scheduler-panel", UninusCalendarServiceSchedulerPanel);
