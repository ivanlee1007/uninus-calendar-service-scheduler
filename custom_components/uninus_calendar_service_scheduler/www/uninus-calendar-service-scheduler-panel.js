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
    this._managementDialogOpen = false;
    this._evidenceDialogOpen = false;
    this._lastExportPayload = undefined;
    this._deleteConfirmOpen = false;
    this._editConfirmOpen = false;
    this._pendingUpdatePayload = undefined;
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
    if (!this._dialogOpen && !this._agriDialogOpen && !this._managementDialogOpen && !this._evidenceDialogOpen) this._render();
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
      operationId: "",
      evidenceType: "sensor_snapshot",
      title: "",
      sourceEntity: "",
      uri: "",
      content: "{}",
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
      this._render();
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
      .fab { position: fixed; right: 24px; bottom: 24px; z-index: 4; box-shadow: 0 6px 16px rgba(0,0,0,.22); }
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
      .traceability-card { border: 1px solid var(--divider-color); border-radius: 14px; padding: 12px; margin-top: 14px; background: var(--card-background-color); }
      .traceability-card h2 { font-size: 16px; margin: 0 0 8px; }
      .traceability-card .stats { display: grid; grid-template-columns: repeat(2, 1fr); gap: 6px; margin-bottom: 10px; }
      .traceability-card .stat { border-radius: 10px; background: var(--secondary-background-color); padding: 8px; font-size: 12px; }
      .traceability-card .stat b { display: block; font-size: 18px; }
      .traceability-card textarea { min-height: 54px; }
      .traceability-card .mini-actions { display: flex; gap: 8px; flex-wrap: wrap; }
      .traceability-card code { font-size: 11px; word-break: break-all; }
      .traceability-recent { margin-top: 10px; }
      .traceability-recent p { margin: 6px 0 0; }
      .error { color: var(--error-color); }

      .scrim { position: fixed; inset: 0; background: rgba(0,0,0,.45); z-index: 9; display: ${this._dialogOpen || this._agriDialogOpen || this._managementDialogOpen || this._evidenceDialogOpen ? "block" : "none"}; }
      .dialog, .agri-dialog, .management-dialog, .evidence-dialog { position: fixed; left: 50%; top: 50%; transform: translate(-50%, -50%); width: min(860px, calc(100vw - 32px)); max-height: min(860px, calc(100vh - 32px)); overflow: auto; z-index: 10; border-radius: 28px; background: var(--card-background-color); color: var(--primary-text-color); box-shadow: 0 24px 38px rgba(0,0,0,.14), 0 9px 46px rgba(0,0,0,.12), 0 11px 15px rgba(0,0,0,.2); }
      .dialog { display: ${this._dialogOpen ? "block" : "none"}; }
      .agri-dialog { display: ${this._agriDialogOpen ? "block" : "none"}; width: min(980px, calc(100vw - 32px)); }
      .management-dialog { display: ${this._managementDialogOpen ? "block" : "none"}; width: min(1060px, calc(100vw - 32px)); }
      .evidence-dialog { display: ${this._evidenceDialogOpen ? "block" : "none"}; width: min(900px, calc(100vw - 32px)); }
      .dialog header, .agri-dialog header, .management-dialog header, .evidence-dialog header { padding: 24px 24px 8px; font-size: 22px; font-weight: 500; }
      .dialog .content, .agri-dialog .content, .management-dialog .content, .evidence-dialog .content { padding: 0 24px 16px; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
      .agri-dialog .content { grid-template-columns: repeat(3, minmax(0, 1fr)); }
      .management-section { border: 1px solid var(--divider-color); border-radius: 16px; padding: 14px; background: var(--card-background-color); }
      .management-section h3 { margin: 0 0 10px; font-size: 16px; }
      .management-section .fields { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
      .management-section .row-actions { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 10px; }
      .management-section .archive { background: var(--warning-color, #fb8c00); color: white; }
      .management-list { max-height: 150px; overflow: auto; border: 1px solid var(--divider-color); border-radius: 12px; padding: 8px; background: var(--secondary-background-color); }
      .management-list button { display: block; width: 100%; text-align: start; margin: 4px 0; border-radius: 10px; }
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
      .fullrow { grid-column: 1 / -1; }
      .checkbox { flex-direction: row; align-items: center; gap: 10px; }
      .checkbox input { width: auto; }
      .actions { display: flex; justify-content: flex-end; gap: 8px; padding: 8px 24px 24px; }
      @media (max-width: 860px) { .layout { grid-template-columns: 1fr; } .side { border-inline-end: 0; border-block-end: 1px solid var(--divider-color); } .day { min-height: 88px; } .agri-dialog .content { grid-template-columns: repeat(2, minmax(0, 1fr)); } .management-section .fields { grid-template-columns: 1fr; } }
      @media (max-width: 640px) { .dialog .content, .agri-dialog .content, .management-dialog .content, .evidence-dialog .content { grid-template-columns: 1fr; } .weekday { font-size: 11px; padding: 8px 4px; text-align: center; } .day { min-height: 74px; padding: 4px; } .pill { font-size: 10px; padding: 2px 4px; } }
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

  _traceabilityTemplate() {
    const summary = this._traceabilitySummary();
    const operations = summary.recent_operations || [];
    const migrationCount = this._legacyOperationsNeedingMigration().length;
    const sourceLabel = (this._calendarTraceabilityRows || []).length ? "Calendar" : "Legacy";
    return `<section class="traceability-card"><h2>產銷履歷輔助</h2><div class="stats"><div class="stat"><b>${summary.farm_count || 0}</b>農場</div><div class="stat"><b>${summary.plot_count || 0}</b>場區</div><div class="stat"><b>${summary.cycle_count || 0}</b>週期</div><div class="stat"><b>${summary.operation_count || 0}</b>作業 <span class="system-note">${sourceLabel}</span></div></div><div class="mini-actions"><button class="primary" id="agri-open-dialog">新增農務作業</button><button id="agri-manage-master-data">農場 / 場區 / 生產週期管理</button><button id="agri-open-evidence">新增佐證資料</button><button id="agri-export">匯出 JSON</button><button id="agri-download-csv">下載 CSV</button>${migrationCount ? `<button id="agri-migrate-legacy">移轉舊作業 ${migrationCount}</button>` : ""}</div><p class="message">農務作業以 Calendar Event 裡的 UNINUS_AGRI_OPERATION_JSON 為主；舊 storage 作業可移轉成 Calendar 事件。</p>${summary.calendar_hash_mismatch_count ? `<p class="warning">⚠️ ${summary.calendar_hash_mismatch_count} 筆 Calendar 農務作業 hash 驗證失敗</p>` : ""}<div class="traceability-recent"><p class="message">最近 ${operations.length} 筆</p>${operations.slice(0, 3).map((op) => `<p><code>${this._escape(op.operation_type)} ${this._escape(op.actual_start || op.scheduled_start || "")}</code></p>`).join("")}</div></section>`;
  }



  _evidenceDialogTemplate() {
    const records = this._traceabilityRecords();
    const operations = Object.values(records.operations || {});
    const f = this._evidenceForm || this._defaultEvidenceForm();
    const operationOptions = [`<option value="">不綁定特定作業</option>`].concat(operations.map((op) => `<option value="${this._escape(op.operation_id)}" ${op.operation_id === f.operationId ? "selected" : ""}>${this._escape(op.operation_type || "作業")} ${this._escape(op.actual_start || op.scheduled_start || op.operation_id)}</option>`)).join("");
    const typeOptions = ["sensor_snapshot", "photo", "document", "note", "external_uri"].map((item) => `<option value="${item}" ${item === f.evidenceType ? "selected" : ""}>${this._escape(item)}</option>`).join("");
    return `
      <section class="evidence-dialog" role="dialog" aria-modal="true" aria-label="新增佐證資料">
        <header>新增佐證資料</header>
        <div class="content">
          <label>綁定農務作業<select id="trace_evidence_operation">${operationOptions}</select></label>
          <label>佐證類型<select id="trace_evidence_type">${typeOptions}</select></label>
          <label>標題<input id="trace_evidence_title" value="${this._escape(f.title)}" /></label>
          <label>來源 entity_id<input id="trace_evidence_source_entity" value="${this._escape(f.sourceEntity)}" placeholder="sensor.soil_moisture" /></label>
          <label class="fullrow">URI / 檔案參照<input id="trace_evidence_uri" value="${this._escape(f.uri)}" placeholder="/local/... 或外部連結" /></label>
          <label class="fullrow">佐證 JSON 內容<textarea id="trace_evidence_content" rows="8">${this._escape(f.content)}</textarea></label>
          <div class="message fullrow ${this._message.includes("佐證") && this._message.includes("失敗") ? "error" : ""}">${this._escape(this._message)}</div>
        </div>
        <div class="actions"><button id="trace-evidence-cancel">取消</button><button class="primary" id="trace-evidence-create">建立佐證資料</button></div>
      </section>
    `;
  }

  _openEvidenceDialog() {
    this._message = "";
    this._evidenceDialogOpen = true;
    this._render();
  }

  _closeEvidenceDialog() {
    this._captureEvidenceForm();
    this._evidenceDialogOpen = false;
    this._render();
  }

  _captureEvidenceForm() {
    const get = (id) => this.shadowRoot.getElementById(id)?.value || "";
    this._evidenceForm = {
      ...this._evidenceForm,
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
      this._evidenceDialogOpen = false;
      this._render();
    } catch (err) { this._message = `建立佐證資料失敗: ${err?.message || err}`; this._render(); }
  }

  _managementDialogTemplate() {
    const records = this._traceabilityRecords();
    const farms = Object.values(records.farms || {});
    const plots = Object.values(records.plots || {});
    const cycles = Object.values(records.cycles || {});
    const f = this._managementForm || this._defaultManagementForm();
    const statusOptions = (selected) => ["active", "inactive", "archived"].map((item) => `<option value="${item}" ${item === selected ? "selected" : ""}>${item === "active" ? "啟用" : item === "inactive" ? "停用" : "封存"}</option>`).join("");
    const farmOptions = [`<option value="">選擇農場</option>`].concat(farms.map((farm) => `<option value="${this._escape(farm.farm_id)}" ${farm.farm_id === f.plotFarmId ? "selected" : ""}>${this._escape(farm.name || farm.farm_id)} ${farm.status === "archived" ? "(封存)" : farm.status === "inactive" ? "(停用)" : ""}</option>`)).join("");
    const plotOptions = [`<option value="">選擇場區</option>`].concat(plots.map((plot) => `<option value="${this._escape(plot.plot_id)}" ${plot.plot_id === f.cyclePlotId ? "selected" : ""}>${this._escape(plot.name || plot.plot_id)} ${this._escape(plot.product || "")} ${plot.status === "archived" ? "(封存)" : plot.status === "inactive" ? "(停用)" : ""}</option>`)).join("");
    const categoryOptions = ["農糧", "水果類", "蔬菜類", "水稻", "雜糧類", "畜禽", "水產", "分裝流通", "林產品"].map((item) => `<option value="${this._escape(item)}" ${item === f.plotTgapCategory ? "selected" : ""}>${this._escape(item)}</option>`).join("");
    return `
      <section class="management-dialog" role="dialog" aria-modal="true" aria-label="農場 / 場區 / 生產週期管理">
        <header>農場 / 場區 / 生產週期管理</header>
        <div class="content">
          <section class="management-section fullrow">
            <h3>既有農場 / 場區 / 生產週期</h3>
            <div class="fields">
              <div><b>農場</b><div class="management-list">${farms.length ? farms.map((farm) => `<button class="trace-select-farm" data-id="${this._escape(farm.farm_id)}">${this._escape(farm.name || farm.farm_id)} <span class="system-note">${this._escape(farm.status || "active")}</span></button>`).join("") : `<p class="message">尚無農場</p>`}</div></div>
              <div><b>場區</b><div class="management-list">${plots.length ? plots.map((plot) => `<button class="trace-select-plot" data-id="${this._escape(plot.plot_id)}">${this._escape(plot.name || plot.plot_id)} <span class="system-note">${this._escape(plot.status || "active")}</span></button>`).join("") : `<p class="message">尚無場區</p>`}</div></div>
              <div class="fullrow"><b>生產週期</b><div class="management-list">${cycles.length ? cycles.map((cycle) => `<button class="trace-select-cycle" data-id="${this._escape(cycle.cycle_id)}">${this._escape(cycle.product || cycle.cycle_id)} ${this._escape(cycle.lot_number || "")} <span class="system-note">${this._escape(cycle.status || "active")}</span></button>`).join("") : `<p class="message">尚無生產週期</p>`}</div></div>
            </div>
          </section>
          <section class="management-section fullrow">
            <h3>${f.selectedFarmId ? "編輯農場" : "新增農場"}</h3>
            <div class="fields">
              <label>農場名稱<input id="trace_farm_name" value="${this._escape(f.farmName)}" /></label>
              <label>經營者<input id="trace_farm_operator" value="${this._escape(f.farmOperator)}" /></label>
              <label>地址<input id="trace_farm_address" value="${this._escape(f.farmAddress)}" /></label>
              <label>電話<input id="trace_farm_phone" value="${this._escape(f.farmPhone)}" /></label>
              <label>狀態<select id="trace_farm_status">${statusOptions(f.farmStatus || "active")}</select></label>
            </div>
            <div class="row-actions"><button class="primary" id="trace-farm-create">建立農場</button><button id="trace-farm-save" ${f.selectedFarmId ? "" : "disabled"}>儲存農場</button><button class="archive" id="trace-farm-archive" ${f.selectedFarmId ? "" : "disabled"}>封存農場</button></div>
          </section>
          <section class="management-section fullrow">
            <h3>${f.selectedPlotId ? "編輯場區" : "新增場區"}</h3>
            <div class="fields">
              <label>農場<select id="trace_plot_farm">${farmOptions}</select></label>
              <label>場區名稱<input id="trace_plot_name" value="${this._escape(f.plotName)}" /></label>
              <label>產品<input id="trace_plot_product" value="${this._escape(f.plotProduct)}" /></label>
              <label>TGAP 類別<select id="trace_plot_tgap_category">${categoryOptions}</select></label>
              <label>面積<input id="trace_plot_area" value="${this._escape(f.plotArea)}" /></label>
              <label>位置<input id="trace_plot_location" value="${this._escape(f.plotLocation)}" /></label>
              <label>狀態<select id="trace_plot_status">${statusOptions(f.plotStatus || "active")}</select></label>
            </div>
            <div class="row-actions"><button class="primary" id="trace-plot-create">建立場區</button><button id="trace-plot-save" ${f.selectedPlotId ? "" : "disabled"}>儲存場區</button><button class="archive" id="trace-plot-archive" ${f.selectedPlotId ? "" : "disabled"}>封存場區</button></div>
          </section>
          <section class="management-section fullrow">
            <h3>${f.selectedCycleId ? "編輯生產週期" : "新增生產週期"}</h3>
            <div class="fields">
              <label>場區<select id="trace_cycle_plot">${plotOptions}</select></label>
              <label>產品<input id="trace_cycle_product" value="${this._escape(f.cycleProduct)}" /></label>
              <label>品種<input id="trace_cycle_variety" value="${this._escape(f.cycleVariety)}" /></label>
              <label>批號<input id="trace_cycle_lot" value="${this._escape(f.cycleLotNumber)}" /></label>
              <label>追溯碼<input id="trace_cycle_trace_code" value="${this._escape(f.cycleTraceCode)}" /></label>
              <label>開始日期<input id="trace_cycle_start" type="date" value="${this._escape(f.cycleStartDate)}" /></label>
              <label>預計採收日<input id="trace_cycle_expected_harvest" type="date" value="${this._escape(f.cycleExpectedHarvestDate)}" /></label>
              <label>實際採收日<input id="trace_cycle_actual_harvest" type="date" value="${this._escape(f.cycleActualHarvestDate)}" /></label>
              <label>狀態<select id="trace_cycle_status">${statusOptions(f.cycleStatus || "active")}</select></label>
            </div>
            <div class="row-actions"><button class="primary" id="trace-cycle-create">建立生產週期</button><button id="trace-cycle-save" ${f.selectedCycleId ? "" : "disabled"}>儲存生產週期</button><button class="archive" id="trace-cycle-archive" ${f.selectedCycleId ? "" : "disabled"}>封存生產週期</button></div>
          </section>
          <div class="message fullrow ${this._message.includes("失敗") ? "error" : ""}">${this._escape(this._message)}</div>
          <div class="fullrow system-note">現有：${farms.length} 個農場、${plots.length} 個場區、${cycles.length} 個生產週期。可點既有項目載入編輯，也可改狀態為停用或封存。</div>
        </div>
        <div class="actions"><button id="trace-management-close">關閉</button></div>
      </section>
    `;
  }

  _openManagementDialog() {
    this._message = "";
    this._managementDialogOpen = true;
    this._render();
  }

  _closeManagementDialog() {
    this._captureManagementForm();
    this._managementDialogOpen = false;
    this._render();
  }

  _captureManagementForm() {
    const get = (id) => this.shadowRoot.getElementById(id)?.value || "";
    this._managementForm = {
      ...this._managementForm,
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


  _selectTraceFarm(farmId) {
    const farm = this._traceabilityRecords().farms?.[farmId];
    if (!farm) return;
    this._managementForm = { ...this._managementForm, selectedFarmId: farm.farm_id, farmName: farm.name || "", farmOperator: farm.operator || "", farmAddress: farm.address || "", farmPhone: farm.phone || "", farmStatus: farm.status || "active", plotFarmId: farm.farm_id };
    this._message = `已載入農場：${farm.name || farm.farm_id}`;
    this._render();
  }

  _selectTracePlot(plotId) {
    const plot = this._traceabilityRecords().plots?.[plotId];
    if (!plot) return;
    this._managementForm = { ...this._managementForm, selectedPlotId: plot.plot_id, plotFarmId: plot.farm_id || "", plotName: plot.name || "", plotProduct: plot.product || "", plotTgapCategory: plot.tgap_category || "水果類", plotArea: plot.area || "", plotLocation: plot.location || "", plotStatus: plot.status || "active", cyclePlotId: plot.plot_id, cycleProduct: this._managementForm.cycleProduct || plot.product || "" };
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

  async _updateTraceCycle(statusOverride = "") {
    this._captureManagementForm();
    if (!this._managementForm.selectedCycleId) { this._message = "儲存生產週期失敗：請先點選既有生產週期。"; this._render(); return; }
    if (!this._managementForm.cyclePlotId) { this._message = "儲存生產週期失敗：請先選擇場區。"; this._render(); return; }
    if (!this._managementForm.cycleProduct.trim()) { this._message = "儲存生產週期失敗：請輸入產品。"; this._render(); return; }
    const status = statusOverride || this._managementForm.cycleStatus || "active";
    try {
      await this._hass.callWS({ type: "call_service", domain: "uninus_calendar_service_scheduler", service: "update_crop_cycle", service_data: { cycle_id: this._managementForm.selectedCycleId, plot_id: this._managementForm.cyclePlotId, product: this._managementForm.cycleProduct, variety: this._managementForm.cycleVariety, lot_number: this._managementForm.cycleLotNumber, trace_code: this._managementForm.cycleTraceCode, start_date: this._managementForm.cycleStartDate, expected_harvest_date: this._managementForm.cycleExpectedHarvestDate, actual_harvest_date: this._managementForm.cycleActualHarvestDate, status, archived_at: status === "archived" ? this._archiveTimestamp() : "" }, return_response: true });
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
    try {
      const response = await this._hass.callWS({ type: "call_service", domain: "uninus_calendar_service_scheduler", service: "create_crop_cycle", service_data: { plot_id: this._managementForm.cyclePlotId, product: this._managementForm.cycleProduct, variety: this._managementForm.cycleVariety, lot_number: this._managementForm.cycleLotNumber, trace_code: this._managementForm.cycleTraceCode, start_date: this._managementForm.cycleStartDate, expected_harvest_date: this._managementForm.cycleExpectedHarvestDate }, return_response: true });
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
    const typeOptions = ["灌溉", "施肥", "病蟲害防治", "採收", "分級包裝", "自我查核", "異常事件"].map((item) => `<option value="${this._escape(item)}" ${item === f.operationType ? "selected" : ""}>${this._escape(item)}</option>`).join("");
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


  _traceabilityCsv(rows) {
    const headers = ["operation_id", "farm_name", "plot_name", "product", "lot_number", "operation_type", "actual_start", "operator", "material_name", "quantity", "unit", "status", "record_hash"];
    const escapeCell = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
    return [headers.join(",")].concat((rows || []).map((row) => headers.map((key) => escapeCell(row[key])).join(","))).join("\n");
  }


  async _traceabilityExportPayload() {
    const response = await this._hass.callWS({ type: "call_service", domain: "uninus_calendar_service_scheduler", service: "export_traceability_records", service_data: {}, return_response: true });
    const packageResponse = await this._hass.callWS({ type: "call_service", domain: "uninus_calendar_service_scheduler", service: "export_traceability_package", service_data: {}, return_response: true });
    const legacy = response?.response || response || {};
    const traceability_export_package = packageResponse?.response || packageResponse || {};
    const calendarRows = await this._calendarEventTraceabilityRows();
    const rows = calendarRows.length ? calendarRows : (legacy.rows || []);
    return {
      ...legacy,
      traceability_export_package,
      calendar_rows: calendarRows,
      rows,
      export_csv: this._traceabilityCsv(rows),
      csv_filename: traceability_export_package.csv_filename || "traceability-export.csv",
      evidence: traceability_export_package.evidence || legacy.evidence || [],
      summary: {
        ...(legacy.summary || {}),
        ...(traceability_export_package.summary || {}),
        evidence_count: (traceability_export_package.evidence || legacy.evidence || []).length,
        calendar_operation_count: calendarRows.length,
        calendar_hash_mismatch_count: calendarRows.filter((row) => !row.hash_valid).length,
      },
      export_source: calendarRows.length ? "calendar_events" : "legacy_storage",
    };
  }

  async _downloadTraceabilityCsv() {
    try {
      const exportPayload = this._lastExportPayload || await this._traceabilityExportPayload();
      this._lastExportPayload = exportPayload;
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

  async _exportTraceabilityRecords() {
    try {
      const response = await this._hass.callWS({ type: "call_service", domain: "uninus_calendar_service_scheduler", service: "export_traceability_records", service_data: {}, return_response: true });
      const packageResponse = await this._hass.callWS({ type: "call_service", domain: "uninus_calendar_service_scheduler", service: "export_traceability_package" /* create_evidence */, service_data: {}, return_response: true });
      const legacy = response?.response || response || {};
      const traceability_export_package = packageResponse?.response || packageResponse || {};
      const calendarRows = await this._calendarEventTraceabilityRows();
      const rows = calendarRows.length ? calendarRows : (legacy.rows || []);
      const exportPayload = {
        ...legacy,
        traceability_export_package,
        calendar_rows: calendarRows,
        rows,
        export_csv: this._traceabilityCsv(rows),
        csv_filename: traceability_export_package.csv_filename || "traceability-export.csv",
        evidence: traceability_export_package.evidence || legacy.evidence || [],
        summary: {
          ...(legacy.summary || {}),
          ...(traceability_export_package.summary || {}),
          evidence_count: (traceability_export_package.evidence || legacy.evidence || []).length,
          calendar_operation_count: calendarRows.length,
          calendar_hash_mismatch_count: calendarRows.filter((row) => !row.hash_valid).length,
        },
        export_source: calendarRows.length ? "calendar_events" : "legacy_storage",
      };
      this._message = JSON.stringify(exportPayload, null, 2);
    } catch (err) { this._message = `匯出失敗: ${err?.message || err}`; }
    this._render();
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
          <button class="primary full" id="new-event-side">新增 Calendar 事件</button>
          <button class="full" id="refresh">重新整理</button>
          <p class="message">獨立 panel：不修改 Home Assistant 原生 /calendar。</p>
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
      <button class="primary fab" id="new-event-fab">＋ 增加行程</button>
      ${this._dialogTemplate()}
      ${this._agriDialogTemplate()}
      ${this._managementDialogTemplate()}
      ${this._evidenceDialogTemplate()}
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
      const expected = await this._hashAgriPayload(payload);
      return { humanNotes: this._humanDescription(description), payload, hashValid: Boolean(payload.record_hash) && payload.record_hash === expected, hasAgri: true };
    } catch (_err) {
      return { humanNotes: this._humanDescription(description), payload: {}, hashValid: false, hasAgri: true };
    }
  }

  _agriPayloadFromForm(form = this._form) {
    const agri = form.agri || {};
    return {
      version: 1,
      type: "agri_operation",
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
    return `<section class="delete-confirm" role="alertdialog" aria-modal="true" aria-label="刪除行程">
      <header><button class="close" id="delete-cancel-x" aria-label="取消">×</button><span>刪除行程</span></header>
      <p>${recurring ? "僅刪除此行程、或所有未來的行程？" : "要刪除此行程嗎？"}</p>
      <div class="delete-actions">
        <button class="text" id="delete-cancel">取消</button>
        ${recurring
          ? `<button class="danger" id="delete-this-event">僅刪除此<br/>行程</button><button class="danger" id="delete-future-events">刪除所有未來<br/>行程</button>`
          : `<button class="danger" id="delete-this-event">刪除行程</button>`}
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
    const typeOptions = ["灌溉", "施肥", "病蟲害防治", "採收", "分級包裝", "自我查核", "異常事件"].map((item) => `<option value="${this._escape(item)}" ${item === agri.operationType ? "selected" : ""}>${this._escape(item)}</option>`).join("");
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
          ${this._editingEvent ? `<button id="delete-event">刪除行程</button>` : ""}
          <button id="cancel">取消</button>
          <button class="primary" id="create">${this._editingEvent ? "儲存修改" : "建立行程"}</button>
        </div>
      </section>
      ${this._deleteConfirmTemplate()}
      ${this._editConfirmTemplate()}
    `;
  }

  _bind() {
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
    this.shadowRoot.getElementById("new-event-side")?.addEventListener("click", () => this._openDialog());
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
    this.shadowRoot.querySelector(".scrim")?.addEventListener("click", () => this._deleteConfirmOpen ? this._closeDeleteConfirm() : (this._editConfirmOpen ? this._closeEditConfirm() : (this._evidenceDialogOpen ? this._closeEvidenceDialog() : (this._agriDialogOpen ? this._closeAgriDialog() : this._closeDialog()))));
    this.shadowRoot.getElementById("cancel")?.addEventListener("click", () => this._closeDialog());
    this.shadowRoot.getElementById("delete-event")?.addEventListener("click", () => this._openDeleteConfirm());
    this.shadowRoot.getElementById("delete-cancel")?.addEventListener("click", () => this._closeDeleteConfirm());
    this.shadowRoot.getElementById("delete-cancel-x")?.addEventListener("click", () => this._closeDeleteConfirm());
    this.shadowRoot.getElementById("delete-this-event")?.addEventListener("click", () => this._deleteCurrentEvent(""));
    this.shadowRoot.getElementById("delete-future-events")?.addEventListener("click", () => this._deleteCurrentEvent("THISANDFUTURE"));
    this.shadowRoot.getElementById("edit-cancel")?.addEventListener("click", () => this._closeEditConfirm());
    this.shadowRoot.getElementById("edit-cancel-x")?.addEventListener("click", () => this._closeEditConfirm());
    this.shadowRoot.getElementById("edit-this-event")?.addEventListener("click", () => this._confirmUpdateCurrentEvent("this"));
    this.shadowRoot.getElementById("edit-future-events")?.addEventListener("click", () => this._confirmUpdateCurrentEvent("future"));
    this.shadowRoot.getElementById("create")?.addEventListener("click", () => this._create());
    this.shadowRoot.getElementById("agri-open-dialog")?.addEventListener("click", () => this._openDialog(undefined, "agri"));
    this.shadowRoot.getElementById("agri-cancel")?.addEventListener("click", () => this._closeAgriDialog());
    this.shadowRoot.getElementById("agri-create-operation")?.addEventListener("click", () => this._createAgriOperation());
    this.shadowRoot.getElementById("agri-export")?.addEventListener("click", () => this._exportTraceabilityRecords());
    this.shadowRoot.getElementById("agri-download-csv")?.addEventListener("click", () => this._downloadTraceabilityCsv());
    this.shadowRoot.getElementById("agri-open-evidence")?.addEventListener("click", () => this._openEvidenceDialog());
    this.shadowRoot.getElementById("agri-manage-master-data")?.addEventListener("click", () => this._openManagementDialog());
    this.shadowRoot.getElementById("agri-migrate-legacy")?.addEventListener("click", () => this._migrateLegacyAgriOperations());
    this.shadowRoot.getElementById("trace-management-close")?.addEventListener("click", () => this._closeManagementDialog());
    this.shadowRoot.getElementById("trace-evidence-cancel")?.addEventListener("click", () => this._closeEvidenceDialog());
    this.shadowRoot.getElementById("trace-evidence-create")?.addEventListener("click", () => this._createEvidenceRecord());
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
    await this._hass.callWS({
      type: "calendar/event/update",
      entity_id: this._form.calendar,
      uid: eventUid,
      recurrence_id: recurrenceId || undefined,
      event: this._calendarEventPayload({ ...payload, action_id: actionId }),
    });
  }

  async _deleteCurrentEvent(recurrenceRange = "") {
    try {
      const eventUid = this._currentEventUid();
      const recurrenceId = this._currentEventRecurrenceId();
      if (!eventUid) throw new Error("此行程缺少 uid，無法刪除");
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
      const deleteMessage = {
        type: "calendar/event/delete",
        entity_id: this._form.calendar,
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
