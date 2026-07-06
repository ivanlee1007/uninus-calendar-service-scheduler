class UninusCalendarServiceSchedulerPanel extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._hass = undefined;
    this._events = [];
    this._message = "";
    this._dialogOpen = false;
    this._selectedCalendar = "";
    this._loading = false;
    this._visibleMonth = new Date();
    this._form = this._defaultForm();
    this._editingEvent = undefined;
    this._helpersPromise = undefined;
    this._haPickersReady = false;
    this._haEntityPickerReady = false;
  }

  set hass(hass) {
    const oldHass = this._hass;
    this._hass = hass;
    if (!this._selectedCalendar) {
      this._selectedCalendar = this._calendarIds()[0] || "";
      this._form.calendar = this._selectedCalendar;
    }
    this._ensureHaPickers();
    if (!this._dialogOpen) this._render();
    if (!oldHass && this._selectedCalendar) this._loadEvents();
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
      actionId: "",
      uid: "",
      recurrenceId: null,
      data: "",
      description: "",
    };
  }

  async _ensureHaPickers() {
    if (this._helpersPromise) return this._helpersPromise;
    this._helpersPromise = (async () => {
      try {
        if (window.loadCardHelpers) await window.loadCardHelpers();
        await Promise.race([
          Promise.all([
            customElements.whenDefined("ha-service-control"),
            customElements.whenDefined("ha-entity-picker"),
          ]),
          new Promise((resolve) => setTimeout(resolve, 2500)),
        ]);
      } catch (_err) {
        // Keep the plain input fallback if HA's picker elements are not available.
      }
      this._haPickersReady = Boolean(
        customElements.get("ha-service-control")
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

  _calendarOptions(selected = this._selectedCalendar) {
    return this._calendarIds()
      .map((id) => `<option value="${this._escape(id)}" ${id === selected ? "selected" : ""}>${this._escape(this._stateName(id))}</option>`)
      .join("");
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

  _dateInputValue(date = new Date()) {
    return `${date.getFullYear()}-${this._pad(date.getMonth() + 1)}-${this._pad(date.getDate())}`;
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
      .main { min-width: 0; padding: 16px; }
      label { display: flex; flex-direction: column; gap: 6px; font-weight: 500; margin-bottom: 14px; }
      input, select, textarea { box-sizing: border-box; width: 100%; padding: 10px 12px; border: 1px solid var(--divider-color); border-radius: 10px; background: var(--card-background-color); color: var(--primary-text-color); font: inherit; }
      ha-service-picker, ha-target-picker, ha-entity-picker { width: 100%; }
      ha-service-control { display: block; width: 100%; }
      .native-control { display: flex; flex-direction: column; gap: 6px; margin-bottom: 10px; }
      .native-label { font-weight: 500; }
      .field-note { color: var(--secondary-text-color); font-size: 12px; line-height: 1.35; }
      textarea { min-height: 86px; font-family: var(--code-font-family, monospace); }
      button { border: 0; border-radius: 20px; padding: 10px 16px; cursor: pointer; font-weight: 600; background: var(--secondary-background-color); color: var(--primary-text-color); }
      button.primary { background: var(--primary-color); color: var(--text-primary-color); }
      button.full { width: 100%; margin-top: 6px; }
      .monthbar { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 12px; }
      .monthbar h2 { margin: 0; font-weight: 500; font-size: 22px; }
      .nav { display: flex; gap: 8px; align-items: center; }
      .calendar-card { border: 1px solid var(--divider-color); border-radius: 14px; overflow: hidden; background: var(--card-background-color); }
      .weekdays, .monthgrid { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); }
      .weekday { padding: 10px; color: var(--secondary-text-color); font-weight: 600; font-size: 13px; border-inline-end: 1px solid var(--divider-color); background: var(--secondary-background-color); }
      .weekday:last-child { border-inline-end: 0; }
      .day { min-height: 128px; padding: 8px; border-block-start: 1px solid var(--divider-color); border-inline-end: 1px solid var(--divider-color); position: relative; overflow: hidden; }
      .day:nth-child(7n) { border-inline-end: 0; }
      .day.out { background: color-mix(in srgb, var(--secondary-background-color) 55%, transparent); color: var(--secondary-text-color); }
      .day.today .num { background: var(--primary-color); color: var(--text-primary-color); }
      .num { display: inline-flex; align-items: center; justify-content: center; min-width: 26px; height: 26px; border-radius: 50%; font-size: 13px; margin-bottom: 4px; }
      .pill { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; border-radius: 6px; padding: 3px 6px; margin: 3px 0; font-size: 12px; background: var(--primary-color); color: var(--text-primary-color); }
      .pill.service { background: var(--success-color, #43a047); color: white; }
      .pill .time { opacity: .88; margin-inline-end: 4px; }
      .empty { padding: 24px; text-align: center; color: var(--secondary-text-color); }
      .message { color: var(--secondary-text-color); white-space: pre-wrap; }
      .error { color: var(--error-color); }
      .fab { position: fixed; right: 24px; bottom: 24px; z-index: 4; border-radius: 28px; min-width: 136px; box-shadow: 0 6px 16px rgba(0,0,0,.28); }
      .scrim { position: fixed; inset: 0; background: rgba(0,0,0,.45); z-index: 9; display: ${this._dialogOpen ? "block" : "none"}; }
      .dialog { position: fixed; left: 50%; top: 50%; transform: translate(-50%, -50%); width: min(860px, calc(100vw - 32px)); max-height: min(860px, calc(100vh - 32px)); overflow: auto; z-index: 10; border-radius: 28px; background: var(--card-background-color); color: var(--primary-text-color); display: ${this._dialogOpen ? "block" : "none"}; box-shadow: 0 24px 38px rgba(0,0,0,.14), 0 9px 46px rgba(0,0,0,.12), 0 11px 15px rgba(0,0,0,.2); }
      .dialog header { padding: 24px 24px 8px; font-size: 22px; font-weight: 500; }
      .dialog .content { padding: 0 24px 16px; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
      .fullrow { grid-column: 1 / -1; }
      .checkbox { flex-direction: row; align-items: center; gap: 10px; }
      .checkbox input { width: auto; }
      .actions { display: flex; justify-content: flex-end; gap: 8px; padding: 8px 24px 24px; }
      @media (max-width: 860px) { .layout { grid-template-columns: 1fr; } .side { border-inline-end: 0; border-block-end: 1px solid var(--divider-color); } .day { min-height: 88px; } }
      @media (max-width: 640px) { .dialog .content { grid-template-columns: 1fr; } .weekday { font-size: 11px; padding: 8px 4px; text-align: center; } .day { min-height: 74px; padding: 4px; } .pill { font-size: 10px; padding: 2px 4px; } }
    `;
  }

  _render() {
    if (!this.shadowRoot) return;
    this.shadowRoot.innerHTML = `
      <style>${this._styles()}</style>
      <div class="appbar">
        <h1>Uninus Calendar</h1>
        <a href="/calendar">原生日曆</a>
      </div>
      <div class="layout">
        <aside class="side">
          <label>Calendar
            <select id="calendar-select">${this._calendarOptions()}</select>
          </label>
          <button class="primary full" id="new-event-side">新增服務排程行程</button>
          <button class="full" id="refresh">重新整理</button>
          <p class="message">獨立 panel：不修改 Home Assistant 原生 /calendar。</p>
        </aside>
        <main class="main">
          <div class="monthbar">
            <h2>${this._monthTitle()}</h2>
            <div class="nav">
              <button id="prev-month">‹</button>
              <button id="today">今天</button>
              <button id="next-month">›</button>
            </div>
          </div>
          <div class="calendar-card">
            <div class="weekdays">${["日", "一", "二", "三", "四", "五", "六"].map((d) => `<div class="weekday">${d}</div>`).join("")}</div>
            <div class="monthgrid">${this._monthCells()}</div>
          </div>
          <p class="message">${this._loading ? "載入中…" : `${this._events.length} 個事件`}</p>
        </main>
      </div>
      <button class="primary fab" id="new-event-fab">＋ 增加行程</button>
      ${this._dialogTemplate()}
    `;
    this._bind();
  }

  _monthTitle() {
    return `${this._visibleMonth.getFullYear()} 年 ${this._visibleMonth.getMonth() + 1} 月`;
  }

  _eventStart(ev) {
    return ev.start?.dateTime || ev.start?.date || ev.start;
  }

  _eventEnd(ev) {
    return ev.end?.dateTime || ev.end?.date || ev.end;
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
    const year = this._visibleMonth.getFullYear();
    const month = this._visibleMonth.getMonth();
    const first = new Date(year, month, 1);
    const gridStart = new Date(first);
    gridStart.setDate(first.getDate() - first.getDay());
    const todayKey = this._dateInputValue(new Date());
    const byDate = this._eventsByDate();
    const cells = [];
    for (let i = 0; i < 42; i += 1) {
      const day = new Date(gridStart);
      day.setDate(gridStart.getDate() + i);
      const key = this._dateInputValue(day);
      const events = byDate.get(key) || [];
      cells.push(`<div class="day ${day.getMonth() !== month ? "out" : ""} ${key === todayKey ? "today" : ""}" data-date="${key}">
        <span class="num">${day.getDate()}</span>
        ${events.slice(0, 4).map((ev) => this._eventPill(ev)).join("")}
        ${events.length > 4 ? `<span class="pill">+${events.length - 4} more</span>` : ""}
      </div>`);
    }
    return cells.join("");
  }

  _actionIdFromDescription(description = "") {
    const match = String(description || "").match(/HA_SERVICE_ACTION_ID:\s*([a-f0-9]+)/i);
    return match?.[1] || "";
  }

  _eventPill(ev) {
    const start = this._eventStart(ev) || "";
    const desc = ev.description || "";
    const actionId = this._actionIdFromDescription(desc);
    const isService = Boolean(actionId);
    const time = start.includes("T") ? start.slice(11, 16) : "";
    return `<button class="pill ${isService ? "service" : ""}" data-uid="${this._escape(ev.uid || "")}" title="${this._escape(ev.summary || "")}">${time ? `<span class="time">${time}</span>` : ""}${this._escape(ev.summary || "(No title)")}</button>`;
  }

  _dialogTemplate() {
    const f = this._form;
    return `
      <div class="scrim"></div>
      <section class="dialog" role="dialog" aria-modal="true" aria-label="新增服務排程行程">
        <header>${this._editingEvent ? "編輯服務排程行程" : "新增服務排程行程"}</header>
        <div class="content">
          <div class="native-control">
            ${this._haEntityPickerReady
              ? `<ha-entity-picker id="calendar" label="Calendar" show-entity-id></ha-entity-picker>`
              : `<label>Calendar<select id="calendar">${this._calendarOptions(f.calendar)}</select></label>`}
          </div>
          <label>Summary
            <input id="summary" value="${this._escape(f.summary)}" placeholder="例如：開啟夜間模式" />
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
          <label class="fullrow">Recurrence RRULE
            <input id="rrule" value="${this._escape(f.rrule)}" placeholder="例如：FREQ=WEEKLY;COUNT=4（選填）" />
          </label>
          ${this._haPickersReady
            ? `<div class="fullrow native-control">
                 <div class="native-label">Service / Action</div>
                 <ha-service-control id="service-control" show-service-id></ha-service-control>
               </div>`
            : `<label>Service
                 <select id="service">${this._serviceOptions(f.service)}</select>
                 <div class="field-note">找不到 HA 原生 ha-service-control 時，使用 HA service 清單。</div>
               </label>
               <label class="fullrow">Service data JSON
                 <textarea id="data" placeholder='{"brightness_pct": 80}'>${this._escape(f.data)}</textarea>
               </label>`}
          ${this._haPickersReady ? "" : `<div class="fullrow native-control">
            <label>Target entity_id<select id="entity">${this._entityOptions(f.target?.entity_id || "")}</select></label>
            <div class="field-note">此欄位會合併進 service target；原生 service-control 可用時會改用其內建目標欄位。</div>
          </div>`}
          <label class="fullrow">Description
            <textarea id="description" placeholder="會顯示在 Local Calendar 事件描述中">${this._escape(f.description)}</textarea>
          </label>
          <div class="message fullrow ${this._message.startsWith("Error:") ? "error" : ""}">${this._escape(this._message)}</div>
        </div>
        <div class="actions">
          ${this._editingEvent ? `<button id="delete-event">刪除行程</button>` : ""}
          <button id="cancel">取消</button>
          <button class="primary" id="create">${this._editingEvent ? "儲存修改" : "建立行程與服務"}</button>
        </div>
      </section>
    `;
  }

  _bind() {
    this.shadowRoot.getElementById("calendar-select")?.addEventListener("change", (ev) => {
      this._selectedCalendar = ev.target.value;
      this._form.calendar = this._selectedCalendar;
      this._loadEvents();
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
    this.shadowRoot.getElementById("prev-month")?.addEventListener("click", () => this._moveMonth(-1));
    this.shadowRoot.getElementById("next-month")?.addEventListener("click", () => this._moveMonth(1));
    this.shadowRoot.getElementById("today")?.addEventListener("click", () => {
      this._visibleMonth = new Date();
      this._loadEvents();
    });
    this.shadowRoot.querySelectorAll(".day").forEach((el) => el.addEventListener("dblclick", () => this._openDialog(el.dataset.date)));
    this.shadowRoot.querySelectorAll(".pill[data-uid]").forEach((el) => el.addEventListener("click", (ev) => {
      ev.stopPropagation();
      this._openEventByUid(el.dataset.uid);
    }));
    this.shadowRoot.querySelector(".scrim")?.addEventListener("click", () => this._closeDialog());
    this.shadowRoot.getElementById("cancel")?.addEventListener("click", () => this._closeDialog());
    this.shadowRoot.getElementById("delete-event")?.addEventListener("click", () => this._deleteCurrentEvent());
    this.shadowRoot.getElementById("create")?.addEventListener("click", () => this._create());
    ["calendar", "summary", "location", "start", "end", "rrule", "service", "entity", "data", "description"].forEach((id) => {
      this.shadowRoot.getElementById(id)?.addEventListener("input", () => this._captureForm());
      this.shadowRoot.getElementById(id)?.addEventListener("change", () => this._captureForm());
    });
    const serviceControl = this.shadowRoot.getElementById("service-control");
    if (serviceControl) {
      serviceControl.hass = this._hass;
      serviceControl.value = this._form.serviceAction || { action: "", target: {}, data: {} };
      serviceControl.addEventListener("value-changed", (ev) => {
        const nextValue = ev.detail?.value || {};
        const nextAction = nextValue.action || nextValue.service || "";
        if (!nextAction && this._form.service) return;
        this._form.serviceAction = {
          action: nextAction,
          target: nextValue.target || this._form.target || {},
          data: nextValue.data || {},
        };
        this._form.service = nextAction;
        this._form.target = this._form.serviceAction.target;
        this._form.data = JSON.stringify(this._form.serviceAction.data || {}, null, 2);
      });
    }
    const entityPicker = this.shadowRoot.getElementById("entity-picker");
    if (entityPicker) {
      entityPicker.hass = this._hass;
      entityPicker.value = this._form.target?.entity_id || "";
      entityPicker.addEventListener("value-changed", (ev) => {
        const entityId = ev.detail?.value || "";
        this._form.target = {
          ...(this._form.target || {}),
          ...(entityId ? { entity_id: entityId } : {}),
        };
      });
    }
    this.shadowRoot.getElementById("all_day")?.addEventListener("change", (ev) => this._toggleAllDay(ev.target.checked));
  }

  _moveMonth(delta) {
    this._visibleMonth = new Date(this._visibleMonth.getFullYear(), this._visibleMonth.getMonth() + delta, 1);
    this._loadEvents();
  }

  _captureForm() {
    const get = (id) => this.shadowRoot.getElementById(id)?.value ?? this._form[id] ?? "";
    const serviceControlValue = this.shadowRoot.getElementById("service-control")?.value;
    const serviceControlAction = serviceControlValue?.action || serviceControlValue?.service || "";
    const explicitEntityId = get("entity");
    const target = {
      ...(serviceControlValue?.target || this._form.target || {}),
      ...(explicitEntityId ? { entity_id: explicitEntityId } : {}),
    };
    const service = serviceControlAction || get("service") || this._form.service || "";
    this._form = {
      calendar: get("calendar"),
      summary: get("summary"),
      location: get("location"),
      allDay: this.shadowRoot.getElementById("all_day")?.checked ?? this._form.allDay,
      start: get("start"),
      end: get("end"),
      rrule: get("rrule"),
      service,
      target,
      serviceAction: serviceControlAction
        ? { action: serviceControlAction, target, data: serviceControlValue?.data || {} }
        : (this._form.serviceAction || { action: service, target, data: {} }),
      actionId: this._form.actionId || "",
      uid: this._form.uid || "",
      recurrenceId: this._form.recurrenceId || null,
      data: serviceControlValue ? JSON.stringify(serviceControlValue.data || {}, null, 2) : get("data"),
      description: get("description"),
    };
  }

  _toggleAllDay(allDay) {
    this._captureForm();
    this._form.allDay = allDay;
    if (allDay) {
      this._form.start = (this._form.start || this._dateInputValue()).slice(0, 10);
      this._form.end = (this._form.end || this._dateInputValue(new Date(Date.now() + 86400000))).slice(0, 10);
    } else {
      this._form.start = this._localInputValue(new Date(`${this._form.start}T00:00:00`));
      this._form.end = this._localInputValue(new Date(`${this._form.end}T00:00:00`));
    }
    this._render();
  }

  _openEventByUid(uid) {
    const event = this._events.find((ev) => ev.uid === uid);
    if (!event) return;
    const actionId = this._actionIdFromDescription(event.description || "");
    const storedAction = this._storedAction(actionId);
    this._editingEvent = event;
    const start = this._eventStart(event) || "";
    const end = this._eventEnd(event) || start;
    const isAllDay = Boolean(event.start?.date);
    this._form = {
      ...this._defaultForm(),
      calendar: this._selectedCalendar,
      summary: event.summary || "",
      location: event.location || "",
      allDay: isAllDay,
      start: isAllDay ? start.slice(0, 10) : start.slice(0, 16),
      end: isAllDay ? end.slice(0, 10) : end.slice(0, 16),
      rrule: event.rrule || "",
      description: this._cleanDescription(event.description || ""),
      actionId,
      uid: event.uid || "",
      recurrenceId: event.recurrence_id || null,
      service: storedAction?.service || "",
      target: storedAction?.target || {},
      data: JSON.stringify(storedAction?.data || {}, null, 2),
      serviceAction: { action: storedAction?.service || "", target: storedAction?.target || {}, data: storedAction?.data || {} },
    };
    this._dialogOpen = true;
    this._message = actionId ? "" : "此事件沒有綁定 Uninus service action；可修改日曆事件，但不能更新 service action。";
    this._render();
  }

  _storedAction(actionId) {
    const actions = this._hass?.states?.["sensor.uninus_calendar_service_scheduler_status"]?.attributes?.actions || [];
    return actions.find((action) => action.action_id === actionId);
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

  _openDialog(dateKey) {
    this._editingEvent = undefined;
    this._form = this._defaultForm();
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
    this._editingEvent = undefined;
    this._message = "";
    this._render();
  }

  async _loadEvents() {
    if (!this._hass || !this._selectedCalendar) return;
    this._loading = true;
    if (!this._dialogOpen) this._render();
    try {
      const year = this._visibleMonth.getFullYear();
      const month = this._visibleMonth.getMonth();
      const first = new Date(year, month, 1);
      const start = new Date(first);
      start.setDate(first.getDate() - first.getDay());
      const end = new Date(start);
      end.setDate(start.getDate() + 42);
      const qs = `start=${encodeURIComponent(start.toISOString())}&end=${encodeURIComponent(end.toISOString())}`;
      const entityPath = encodeURIComponent(this._selectedCalendar);
      this._events = await this._hass.callApi("GET", `calendars/${entityPath}?${qs}`);
    } catch (err) {
      this._message = `Error: ${err?.message || err}`;
      this._events = [];
    } finally {
      this._loading = false;
      if (!this._dialogOpen) this._render();
    }
  }

  _calendarEventPayload(payload) {
    return {
      summary: payload.summary,
      dtstart: payload.all_day ? payload.start.slice(0, 10) : payload.start,
      dtend: payload.all_day ? (payload.end || payload.start).slice(0, 10) : payload.end || payload.start,
      description: this._calendarDescription(payload.description, payload.action_id || this._form.actionId),
      ...(payload.location ? { location: payload.location } : {}),
      ...(payload.rrule ? { rrule: payload.rrule } : {}),
    };
  }

  _calendarDescription(description, actionId) {
    const parts = [];
    if (description) parts.push(String(description).trim());
    if (actionId) parts.push(`HA_SERVICE_ACTION_ID: ${actionId}`);
    parts.push("Created by Uninus Calendar Service Scheduler");
    return parts.join("\n\n");
  }

  async _updateCurrentEvent(payload) {
    const eventUid = this._currentEventUid();
    const recurrenceId = this._currentEventRecurrenceId();
    if (!eventUid) throw new Error("此行程缺少 uid，無法更新");
    const actionId = this._form.actionId;
    if (actionId) {
      await this._hass.callWS({
        type: "call_service",
        domain: "uninus_calendar_service_scheduler",
        service: "update_event_action",
        service_data: { ...payload, action_id: actionId, calendar_event_uid: eventUid },
        return_response: true,
      });
    }
    await this._hass.callWS({
      type: "calendar/event/update",
      entity_id: this._form.calendar,
      uid: eventUid,
      recurrence_id: recurrenceId || undefined,
      event: this._calendarEventPayload({ ...payload, action_id: actionId }),
    });
  }

  async _deleteCurrentEvent() {
    try {
      const eventUid = this._currentEventUid();
      const recurrenceId = this._currentEventRecurrenceId();
      if (!eventUid) throw new Error("此行程缺少 uid，無法刪除");
      if (this._form.actionId) {
        await this._hass.callWS({
          type: "call_service",
          domain: "uninus_calendar_service_scheduler",
          service: "delete_event_action",
          service_data: { action_id: this._form.actionId },
          return_response: true,
        });
      }
      await this._hass.callWS({
        type: "calendar/event/delete",
        entity_id: this._form.calendar,
        uid: eventUid,
        recurrence_id: recurrenceId || undefined,
      });
      this._dialogOpen = false;
      this._editingEvent = undefined;
      this._message = "已刪除行程。";
      await this._loadEvents();
    } catch (err) {
      this._message = `Error: ${err?.message || err}`;
      this._render();
    }
  }

  async _create() {
    try {
      this._captureForm();
      const f = this._form;
      const serviceData = f.data ? JSON.parse(f.data) : {};
      const payload = {
        calendar_entity: f.calendar,
        summary: f.summary,
        start: f.allDay ? `${f.start}T00:00:00` : this._toIsoWithOffset(f.start),
        end: f.allDay ? `${f.end}T00:00:00` : this._toIsoWithOffset(f.end),
        all_day: f.allDay,
        location: f.location,
        rrule: f.rrule,
        service: f.service,
        target: f.target || {},
        data: serviceData,
        description: f.description,
      };
      for (const field of ["calendar_entity", "summary", "start", "service"]) {
        if (!payload[field]) throw new Error(`${field} is required`);
      }
      const wasEditing = Boolean(this._editingEvent);
      if (wasEditing) {
        await this._updateCurrentEvent(payload);
      } else {
        await this._hass.callWS({
          type: "call_service",
          domain: "uninus_calendar_service_scheduler",
          service: "create_event_action",
          service_data: payload,
          return_response: true,
        });
      }
      this._dialogOpen = false;
      this._editingEvent = undefined;
      this._message = wasEditing ? "已更新行程。" : "已建立行程與服務排程。";
      await this._loadEvents();
    } catch (err) {
      this._message = `Error: ${err?.message || err}`;
      this._render();
    }
  }
}

customElements.define("uninus-calendar-service-scheduler-panel", UninusCalendarServiceSchedulerPanel);
