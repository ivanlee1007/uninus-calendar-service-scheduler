class UninusCalendarServiceSchedulerPanel extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._hass = undefined;
    this._events = [];
    this._message = "";
    this._dialogOpen = false;
    this._rangeDays = 30;
    this._selectedCalendar = "";
    this._loading = false;
  }

  set hass(hass) {
    const oldHass = this._hass;
    this._hass = hass;
    if (!this._selectedCalendar) {
      this._selectedCalendar = this._calendarIds()[0] || "";
    }
    this._render();
    if (!oldHass && this._selectedCalendar) this._loadEvents();
  }

  set panel(panel) {
    this._panel = panel;
  }

  _calendarIds() {
    return Object.keys(this._hass?.states || {})
      .filter((id) => id.startsWith("calendar."))
      .sort();
  }

  _calendarOptions() {
    return this._calendarIds()
      .map((id) => `<option value="${id}" ${id === this._selectedCalendar ? "selected" : ""}>${this._stateName(id)}</option>`)
      .join("");
  }

  _stateName(entityId) {
    return this._hass?.states?.[entityId]?.attributes?.friendly_name || entityId;
  }

  _serviceOptions() {
    const services = [];
    Object.entries(this._hass?.services || {}).forEach(([domain, domainServices]) => {
      Object.keys(domainServices || {}).forEach((service) => services.push(`${domain}.${service}`));
    });
    return services.sort().map((id) => `<option value="${id}"></option>`).join("");
  }

  _entityOptions() {
    return Object.keys(this._hass?.states || {})
      .sort()
      .map((id) => `<option value="${id}"></option>`)
      .join("");
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
      .wrap { display: grid; grid-template-columns: 280px minmax(0, 1fr); gap: 16px; padding: 16px; }
      ha-card, .card { display: block; background: var(--card-background-color); border-radius: var(--ha-card-border-radius, 12px); box-shadow: var(--ha-card-box-shadow, none); border: var(--ha-card-border-width, 1px) solid var(--ha-card-border-color, var(--divider-color)); }
      .side, .main { padding: 16px; }
      label { display: flex; flex-direction: column; gap: 6px; font-weight: 500; margin-bottom: 14px; }
      input, select, textarea { box-sizing: border-box; width: 100%; padding: 10px 12px; border: 1px solid var(--divider-color); border-radius: 10px; background: var(--card-background-color); color: var(--primary-text-color); font: inherit; }
      textarea { min-height: 86px; font-family: var(--code-font-family, monospace); }
      button { border: 0; border-radius: 20px; padding: 10px 16px; cursor: pointer; font-weight: 600; background: var(--secondary-background-color); color: var(--primary-text-color); }
      button.primary { background: var(--primary-color); color: var(--text-primary-color); }
      button.full { width: 100%; margin-top: 6px; }
      .toolbar { display: flex; gap: 8px; align-items: center; justify-content: space-between; margin-bottom: 12px; }
      .events { display: grid; gap: 8px; }
      .event { padding: 12px; border-radius: 10px; border: 1px solid var(--divider-color); display: grid; gap: 4px; }
      .event .time { color: var(--secondary-text-color); font-size: 13px; }
      .marker { color: var(--primary-color); font-size: 12px; font-weight: 700; }
      .empty { padding: 24px; text-align: center; color: var(--secondary-text-color); }
      .fab { position: fixed; right: 24px; bottom: 24px; z-index: 4; border-radius: 28px; min-width: 136px; box-shadow: 0 6px 16px rgba(0,0,0,.28); }
      .scrim { position: fixed; inset: 0; background: rgba(0,0,0,.45); z-index: 9; display: ${this._dialogOpen ? "block" : "none"}; }
      .dialog { position: fixed; left: 50%; top: 50%; transform: translate(-50%, -50%); width: min(820px, calc(100vw - 32px)); max-height: min(840px, calc(100vh - 32px)); overflow: auto; z-index: 10; border-radius: 28px; background: var(--card-background-color); color: var(--primary-text-color); display: ${this._dialogOpen ? "block" : "none"}; box-shadow: 0 24px 38px rgba(0,0,0,.14), 0 9px 46px rgba(0,0,0,.12), 0 11px 15px rgba(0,0,0,.2); }
      .dialog header { padding: 24px 24px 8px; font-size: 22px; font-weight: 500; }
      .dialog .content { padding: 0 24px 16px; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
      .fullrow { grid-column: 1 / -1; }
      .checkbox { flex-direction: row; align-items: center; gap: 10px; }
      .checkbox input { width: auto; }
      .actions { display: flex; justify-content: flex-end; gap: 8px; padding: 8px 24px 24px; }
      .message { color: var(--secondary-text-color); white-space: pre-wrap; }
      .error { color: var(--error-color); }
      @media (max-width: 760px) { .wrap { grid-template-columns: 1fr; padding: 8px; } .dialog .content { grid-template-columns: 1fr; } .appbar { padding: 0 12px; } }
    `;
  }

  _render() {
    if (!this.shadowRoot) return;
    const now = new Date();
    const defaultStart = this._localInputValue(new Date(now.getTime() + 60 * 60 * 1000));
    const defaultEnd = this._localInputValue(new Date(now.getTime() + 2 * 60 * 60 * 1000));
    this.shadowRoot.innerHTML = `
      <style>${this._styles()}</style>
      <div class="appbar">
        <h1>Uninus Calendar Service Scheduler</h1>
        <a href="/calendar">原生日曆</a>
      </div>
      <div class="wrap">
        <aside class="card side">
          <label>Calendar
            <select id="calendar-select">${this._calendarOptions()}</select>
          </label>
          <label>顯示範圍
            <select id="range-days">
              <option value="7" ${this._rangeDays === 7 ? "selected" : ""}>未來 7 天</option>
              <option value="30" ${this._rangeDays === 30 ? "selected" : ""}>未來 30 天</option>
              <option value="90" ${this._rangeDays === 90 ? "selected" : ""}>未來 90 天</option>
            </select>
          </label>
          <button class="primary full" id="new-event-side">新增服務排程行程</button>
          <button class="full" id="refresh">重新整理</button>
          <p class="message">這是獨立 panel，不修改 Home Assistant 原生 /calendar 頁面。</p>
        </aside>
        <main class="card main">
          <div class="toolbar">
            <strong>${this._stateName(this._selectedCalendar) || "Calendar"}</strong>
            <span class="message">${this._loading ? "載入中…" : `${this._events.length} 個事件`}</span>
          </div>
          <div class="events">
            ${this._events.length ? this._events.map((ev) => this._eventTemplate(ev)).join("") : `<div class="empty">沒有事件，或尚未載入。</div>`}
          </div>
        </main>
      </div>
      <button class="primary fab" id="new-event-fab">＋ 增加行程</button>
      <div class="scrim"></div>
      <section class="dialog" role="dialog" aria-modal="true" aria-label="新增服務排程行程">
        <header>新增服務排程行程</header>
        <div class="content">
          <label>Calendar
            <select id="calendar">${this._calendarOptions()}</select>
          </label>
          <label>Summary
            <input id="summary" placeholder="例如：開啟夜間模式" />
          </label>
          <label class="fullrow">Location
            <input id="location" placeholder="選填，與原生 Calendar location 對應" />
          </label>
          <label class="checkbox fullrow"><input id="all_day" type="checkbox" /> 全天事件</label>
          <label>Start
            <input id="start" type="datetime-local" value="${defaultStart}" />
          </label>
          <label>End
            <input id="end" type="datetime-local" value="${defaultEnd}" />
          </label>
          <label class="fullrow">Recurrence RRULE
            <input id="rrule" placeholder="例如：FREQ=WEEKLY;COUNT=4（選填）" />
          </label>
          <label>Service
            <input id="service" list="uninus-services" placeholder="script.turn_on" />
            <datalist id="uninus-services">${this._serviceOptions()}</datalist>
          </label>
          <label>Target entity_id
            <input id="entity" list="uninus-entities" placeholder="script.night_mode" />
            <datalist id="uninus-entities">${this._entityOptions()}</datalist>
          </label>
          <label class="fullrow">Service data JSON
            <textarea id="data" placeholder='{"brightness_pct": 80}'></textarea>
          </label>
          <label class="fullrow">Description
            <textarea id="description" placeholder="會顯示在 Local Calendar 事件描述中"></textarea>
          </label>
          <div class="message fullrow ${this._message.startsWith("Error:") ? "error" : ""}">${this._message}</div>
        </div>
        <div class="actions">
          <button id="cancel">取消</button>
          <button class="primary" id="create">建立行程與服務</button>
        </div>
      </section>
    `;
    this._bind();
  }

  _eventTemplate(ev) {
    const start = ev.start?.dateTime || ev.start?.date || ev.start;
    const end = ev.end?.dateTime || ev.end?.date || ev.end;
    const desc = ev.description || "";
    const marker = desc.includes("HA_SERVICE_ACTION_ID:");
    return `<div class="event">
      <strong>${ev.summary || "(No title)"}</strong>
      <div class="time">${start || ""}${end ? ` → ${end}` : ""}</div>
      ${ev.location ? `<div>${ev.location}</div>` : ""}
      ${marker ? `<div class="marker">Uninus service action</div>` : ""}
    </div>`;
  }

  _bind() {
    this.shadowRoot.getElementById("calendar-select")?.addEventListener("change", (ev) => {
      this._selectedCalendar = ev.target.value;
      this._loadEvents();
    });
    this.shadowRoot.getElementById("range-days")?.addEventListener("change", (ev) => {
      this._rangeDays = Number(ev.target.value);
      this._loadEvents();
    });
    this.shadowRoot.getElementById("refresh")?.addEventListener("click", () => this._loadEvents());
    this.shadowRoot.getElementById("new-event-side")?.addEventListener("click", () => this._openDialog());
    this.shadowRoot.getElementById("new-event-fab")?.addEventListener("click", () => this._openDialog());
    this.shadowRoot.querySelector(".scrim")?.addEventListener("click", () => this._closeDialog());
    this.shadowRoot.getElementById("cancel")?.addEventListener("click", () => this._closeDialog());
    this.shadowRoot.getElementById("create")?.addEventListener("click", () => this._create());
    this.shadowRoot.getElementById("all_day")?.addEventListener("change", (ev) => this._toggleAllDay(ev.target.checked));
  }

  _toggleAllDay(allDay) {
    const start = this.shadowRoot.getElementById("start");
    const end = this.shadowRoot.getElementById("end");
    if (!start || !end) return;
    start.type = allDay ? "date" : "datetime-local";
    end.type = allDay ? "date" : "datetime-local";
    if (allDay) {
      start.value = start.value.slice(0, 10) || this._dateInputValue();
      end.value = end.value.slice(0, 10) || this._dateInputValue(new Date(Date.now() + 86400000));
    } else {
      start.value = this._localInputValue(new Date(`${start.value}T00:00:00`));
      end.value = this._localInputValue(new Date(`${end.value}T00:00:00`));
    }
  }

  _openDialog() {
    this._dialogOpen = true;
    this._message = "";
    this._render();
  }

  _closeDialog() {
    this._dialogOpen = false;
    this._render();
  }

  _value(id) {
    return this.shadowRoot.getElementById(id)?.value?.trim() || "";
  }

  async _loadEvents() {
    if (!this._hass || !this._selectedCalendar) return;
    this._loading = true;
    this._render();
    try {
      const start = new Date();
      const end = new Date(start.getTime() + this._rangeDays * 86400000);
      const qs = `start=${encodeURIComponent(start.toISOString())}&end=${encodeURIComponent(end.toISOString())}`;
      const entityPath = encodeURIComponent(this._selectedCalendar);
      this._events = await this._hass.callApi("GET", `calendars/${entityPath}?${qs}`);
    } catch (err) {
      this._message = `Error: ${err?.message || err}`;
      this._events = [];
    } finally {
      this._loading = false;
      this._render();
    }
  }

  async _create() {
    try {
      const allDay = this.shadowRoot.getElementById("all_day")?.checked || false;
      const dataText = this._value("data");
      const serviceData = dataText ? JSON.parse(dataText) : {};
      const entityId = this._value("entity");
      const startRaw = this._value("start");
      const endRaw = this._value("end");
      const payload = {
        calendar_entity: this._value("calendar"),
        summary: this._value("summary"),
        start: allDay ? `${startRaw}T00:00:00` : this._toIsoWithOffset(startRaw),
        end: allDay ? `${endRaw}T00:00:00` : this._toIsoWithOffset(endRaw),
        all_day: allDay,
        location: this._value("location"),
        rrule: this._value("rrule"),
        service: this._value("service"),
        target: entityId ? { entity_id: entityId } : {},
        data: serviceData,
        description: this._value("description"),
      };
      for (const field of ["calendar_entity", "summary", "start", "service"]) {
        if (!payload[field]) throw new Error(`${field} is required`);
      }
      await this._hass.callService("uninus_calendar_service_scheduler", "create_event_action", payload, undefined, true);
      this._message = "已建立行程與服務排程。";
      await this._loadEvents();
      this._dialogOpen = false;
    } catch (err) {
      this._message = `Error: ${err?.message || err}`;
    }
    this._render();
  }
}

customElements.define("uninus-calendar-service-scheduler-panel", UninusCalendarServiceSchedulerPanel);
