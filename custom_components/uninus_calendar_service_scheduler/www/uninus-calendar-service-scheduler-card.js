class UninusCalendarServiceSchedulerCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._config = {};
    this._message = "";
  }

  setConfig(config) {
    this._config = config || {};
    this._render();
  }

  set hass(hass) {
    this._hass = hass;
    this._render();
  }

  _calendarOptions() {
    if (!this._hass) return "";
    const selected = this._config.calendar_entity || "";
    return Object.keys(this._hass.states)
      .filter((id) => id.startsWith("calendar."))
      .sort()
      .map((id) => `<option value="${id}" ${id === selected ? "selected" : ""}>${id}</option>`)
      .join("");
  }

  _serviceOptions() {
    if (!this._hass?.services) return "";
    const services = [];
    Object.entries(this._hass.services).forEach(([domain, domainServices]) => {
      Object.keys(domainServices || {}).forEach((service) => services.push(`${domain}.${service}`));
    });
    return services.sort().map((id) => `<option value="${id}"></option>`).join("");
  }

  _entityOptions() {
    if (!this._hass) return "";
    return Object.keys(this._hass.states)
      .sort()
      .map((id) => `<option value="${id}"></option>`)
      .join("");
  }

  _styles() {
    return `
      :host { display: block; }
      ha-card { padding: 16px; }
      .grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
      label { display: flex; flex-direction: column; gap: 4px; font-weight: 500; }
      input, select, textarea { box-sizing: border-box; width: 100%; padding: 8px; border: 1px solid var(--divider-color); border-radius: 8px; background: var(--card-background-color); color: var(--primary-text-color); }
      textarea { min-height: 84px; font-family: var(--code-font-family, monospace); }
      .full { grid-column: 1 / -1; }
      .actions { display: flex; gap: 8px; align-items: center; margin-top: 14px; }
      button { border: 0; border-radius: 8px; padding: 9px 12px; cursor: pointer; background: var(--primary-color); color: var(--text-primary-color); }
      button.secondary { background: var(--secondary-background-color); color: var(--primary-text-color); }
      .message { margin-top: 10px; color: var(--secondary-text-color); white-space: pre-wrap; }
      @media (max-width: 600px) { .grid { grid-template-columns: 1fr; } }
    `;
  }

  _render() {
    if (!this.shadowRoot) return;
    this.shadowRoot.innerHTML = `
      <style>${this._styles()}</style>
      <ha-card header="Uninus Calendar Service Scheduler">
        <div class="grid">
          <label>Calendar
            <select id="calendar"><option value="">Select calendar</option>${this._calendarOptions()}</select>
          </label>
          <label>Summary
            <input id="summary" placeholder="開啟客廳燈" />
          </label>
          <label>Start
            <input id="start" type="datetime-local" />
          </label>
          <label>End
            <input id="end" type="datetime-local" />
          </label>
          <label>Service
            <input id="service" list="services" placeholder="script.turn_on" />
            <datalist id="services">${this._serviceOptions()}</datalist>
          </label>
          <label>Target entity_id
            <input id="entity" list="entities" placeholder="script.night_mode" />
            <datalist id="entities">${this._entityOptions()}</datalist>
          </label>
          <label class="full">Service data JSON
            <textarea id="data" placeholder='{"brightness_pct": 80}'></textarea>
          </label>
          <label class="full">Description
            <textarea id="description" placeholder="Optional note shown in Local Calendar"></textarea>
          </label>
        </div>
        <div class="actions">
          <button id="create">Create event action</button>
          <button id="clear" class="secondary">Clear</button>
        </div>
        <div class="message">${this._message}</div>
      </ha-card>
    `;
    this.shadowRoot.getElementById("create")?.addEventListener("click", () => this._create());
    this.shadowRoot.getElementById("clear")?.addEventListener("click", () => this._clear());
  }

  _value(id) {
    return this.shadowRoot.getElementById(id)?.value?.trim() || "";
  }

  _localDateTimeToIso(value) {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    const offset = -date.getTimezoneOffset();
    const sign = offset >= 0 ? "+" : "-";
    const hh = String(Math.floor(Math.abs(offset) / 60)).padStart(2, "0");
    const mm = String(Math.abs(offset) % 60).padStart(2, "0");
    return `${value}:00${sign}${hh}:${mm}`;
  }

  async _create() {
    try {
      const dataText = this._value("data");
      const serviceData = dataText ? JSON.parse(dataText) : {};
      const entityId = this._value("entity");
      const payload = {
        calendar_entity: this._value("calendar"),
        summary: this._value("summary"),
        start: this._localDateTimeToIso(this._value("start")),
        service: this._value("service"),
        target: entityId ? { entity_id: entityId } : {},
        data: serviceData,
        description: this._value("description"),
      };
      const end = this._localDateTimeToIso(this._value("end"));
      if (end) payload.end = end;
      for (const required of ["calendar_entity", "summary", "start", "service"]) {
        if (!payload[required]) throw new Error(`${required} is required`);
      }
      const response = await this._hass.callService(
        "uninus_calendar_service_scheduler",
        "create_event_action",
        payload,
        undefined,
        true
      );
      this._message = `Created action: ${response?.action_id || "ok"}`;
    } catch (err) {
      this._message = `Error: ${err.message || err}`;
    }
    this._render();
  }

  _clear() {
    ["summary", "start", "end", "service", "entity", "data", "description"].forEach((id) => {
      const el = this.shadowRoot.getElementById(id);
      if (el) el.value = "";
    });
    this._message = "";
    this._render();
  }

  static getStubConfig() {
    return { type: "custom:uninus-calendar-service-scheduler-card" };
  }
}

customElements.define("uninus-calendar-service-scheduler-card", UninusCalendarServiceSchedulerCard);
window.customCards = window.customCards || [];
window.customCards.push({
  type: "uninus-calendar-service-scheduler-card",
  name: "Uninus Calendar Service Scheduler",
  description: "Create Local Calendar events that execute Home Assistant services.",
});
