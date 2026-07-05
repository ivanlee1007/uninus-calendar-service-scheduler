(() => {
  const PATCH_FLAG = "__uninusCalendarServiceSchedulerPatched";
  const DIALOG_TAG = "uninus-calendar-service-scheduler-dialog";

  const pad = (value) => String(value).padStart(2, "0");
  const toLocalInputValue = (date) => {
    const d = date instanceof Date ? date : new Date();
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };
  const toIsoWithOffset = (localValue) => {
    if (!localValue) return "";
    const date = new Date(localValue);
    if (Number.isNaN(date.getTime())) return localValue;
    const offset = -date.getTimezoneOffset();
    const sign = offset >= 0 ? "+" : "-";
    const hh = pad(Math.floor(Math.abs(offset) / 60));
    const mm = pad(Math.abs(offset) % 60);
    return `${localValue}:00${sign}${hh}:${mm}`;
  };

  const defineDialog = () => {
    if (customElements.get(DIALOG_TAG)) return;

    customElements.define(
      DIALOG_TAG,
      class UninusCalendarServiceSchedulerDialog extends HTMLElement {
        constructor() {
          super();
          this.attachShadow({ mode: "open" });
          this._hass = undefined;
          this._calendars = [];
          this._selectedDate = undefined;
          this._refresh = undefined;
          this._message = "";
          this._open = false;
        }

        show({ hass, calendars = [], selectedDate, refresh }) {
          this._hass = hass;
          this._calendars = calendars;
          this._selectedDate = selectedDate;
          this._refresh = refresh;
          this._message = "";
          this._open = true;
          this._render();
        }

        _calendarOptions() {
          const ids = this._calendars.length
            ? this._calendars.map((calendar) => calendar.entity_id)
            : Object.keys(this._hass?.states || {}).filter((id) => id.startsWith("calendar."));
          return ids
            .filter(Boolean)
            .sort()
            .map((id, idx) => `<option value="${id}" ${idx === 0 ? "selected" : ""}>${id}</option>`)
            .join("");
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

        _styles() {
          return `
            :host { position: fixed; inset: 0; z-index: 2147483647; display: ${this._open ? "block" : "none"}; }
            .scrim { position: absolute; inset: 0; background: rgba(0, 0, 0, .45); }
            .dialog { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); width: min(720px, calc(100vw - 32px)); max-height: min(760px, calc(100vh - 32px)); overflow: auto; border-radius: 28px; background: var(--mdc-dialog-container-color, var(--card-background-color, #fff)); color: var(--primary-text-color, #212121); box-shadow: var(--ha-card-box-shadow, 0 24px 38px rgba(0,0,0,.14), 0 9px 46px rgba(0,0,0,.12), 0 11px 15px rgba(0,0,0,.2)); }
            header { padding: 24px 24px 8px; font-size: 22px; font-weight: 500; }
            .sub { padding: 0 24px 16px; color: var(--secondary-text-color); line-height: 1.4; }
            .content { padding: 0 24px 16px; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
            label { display: flex; flex-direction: column; gap: 6px; font-weight: 500; }
            input, select, textarea { box-sizing: border-box; width: 100%; padding: 10px 12px; border: 1px solid var(--divider-color, #ddd); border-radius: 10px; background: var(--card-background-color, #fff); color: var(--primary-text-color, #212121); font: inherit; }
            textarea { min-height: 86px; font-family: var(--code-font-family, monospace); }
            .full { grid-column: 1 / -1; }
            .actions { display: flex; justify-content: flex-end; gap: 8px; padding: 8px 24px 24px; }
            button { border: 0; border-radius: 20px; padding: 10px 16px; cursor: pointer; font-weight: 600; background: transparent; color: var(--primary-color, #03a9f4); }
            button.primary { background: var(--primary-color, #03a9f4); color: var(--text-primary-color, #fff); }
            .message { grid-column: 1 / -1; color: var(--secondary-text-color); white-space: pre-wrap; }
            .error { color: var(--error-color, #db4437); }
            @media (max-width: 640px) { .content { grid-template-columns: 1fr; } .dialog { border-radius: 18px; } }
          `;
        }

        _render() {
          if (!this.shadowRoot) return;
          const base = this._selectedDate instanceof Date ? this._selectedDate : new Date();
          const startDefault = toLocalInputValue(base);
          const endDefault = toLocalInputValue(new Date(base.getTime() + 60 * 60 * 1000));
          this.shadowRoot.innerHTML = `
            <style>${this._styles()}</style>
            <div class="scrim"></div>
            <section class="dialog" role="dialog" aria-modal="true" aria-label="新增服務排程行程">
              <header>新增服務排程行程</header>
              <div class="sub">使用 Home Assistant 原生日曆頁面建立事件，同時指定事件開始時要執行的 service。</div>
              <div class="content">
                <label>Calendar
                  <select id="calendar">${this._calendarOptions()}</select>
                </label>
                <label>Summary
                  <input id="summary" placeholder="例如：開啟夜間模式" />
                </label>
                <label>Start
                  <input id="start" type="datetime-local" value="${startDefault}" />
                </label>
                <label>End
                  <input id="end" type="datetime-local" value="${endDefault}" />
                </label>
                <label>Service
                  <input id="service" list="uninus-services" placeholder="script.turn_on" />
                  <datalist id="uninus-services">${this._serviceOptions()}</datalist>
                </label>
                <label>Target entity_id
                  <input id="entity" list="uninus-entities" placeholder="script.night_mode" />
                  <datalist id="uninus-entities">${this._entityOptions()}</datalist>
                </label>
                <label class="full">Service data JSON
                  <textarea id="data" placeholder='{"brightness_pct": 80}'></textarea>
                </label>
                <label class="full">Description
                  <textarea id="description" placeholder="會顯示在 Local Calendar 事件描述中"></textarea>
                </label>
                <div class="message ${this._message.startsWith("Error:") ? "error" : ""}">${this._message}</div>
              </div>
              <div class="actions">
                <button id="cancel">取消</button>
                <button id="create" class="primary">建立行程與服務</button>
              </div>
            </section>
          `;
          this.shadowRoot.querySelector(".scrim")?.addEventListener("click", () => this.close());
          this.shadowRoot.getElementById("cancel")?.addEventListener("click", () => this.close());
          this.shadowRoot.getElementById("create")?.addEventListener("click", () => this._create());
        }

        close() {
          this._open = false;
          this._render();
        }

        _value(id) {
          return this.shadowRoot.getElementById(id)?.value?.trim() || "";
        }

        async _create() {
          try {
            const dataText = this._value("data");
            const serviceData = dataText ? JSON.parse(dataText) : {};
            const entityId = this._value("entity");
            const payload = {
              calendar_entity: this._value("calendar"),
              summary: this._value("summary"),
              start: toIsoWithOffset(this._value("start")),
              end: toIsoWithOffset(this._value("end")),
              service: this._value("service"),
              target: entityId ? { entity_id: entityId } : {},
              data: serviceData,
              description: this._value("description"),
            };
            for (const field of ["calendar_entity", "summary", "start", "service"]) {
              if (!payload[field]) throw new Error(`${field} is required`);
            }
            await this._hass.callService(
              "uninus_calendar_service_scheduler",
              "create_event_action",
              payload,
              undefined,
              true
            );
            this._message = "已建立行程與服務排程。";
            this._render();
            setTimeout(() => {
              this.close();
              this._refresh?.();
            }, 700);
          } catch (err) {
            this._message = `Error: ${err?.message || err}`;
            this._render();
          }
        }
      }
    );
  };

  const showDialog = (options) => {
    defineDialog();
    let dialog = document.querySelector(DIALOG_TAG);
    if (!dialog) {
      dialog = document.createElement(DIALOG_TAG);
      document.body.appendChild(dialog);
    }
    dialog.show(options);
  };

  const patchFullCalendar = () => {
    const FullCalendarElement = customElements.get("ha-full-calendar");
    if (!FullCalendarElement || FullCalendarElement.prototype[PATCH_FLAG]) return;

    FullCalendarElement.prototype[PATCH_FLAG] = true;
    FullCalendarElement.prototype._uninusOriginalCreateEvent = FullCalendarElement.prototype._createEvent;
    FullCalendarElement.prototype._createEvent = function uninusCreateEvent(info) {
      const activeView = this._activeView;
      const currentStart = this.calendar?.view?.currentStart;
      const selectedDate =
        info?.date ||
        (activeView === "dayGridWeek" ||
        activeView === "dayGridDay" ||
        (activeView === "dayGridMonth" && currentStart && currentStart.getMonth() !== new Date().getMonth())
          ? currentStart
          : undefined);
      showDialog({
        hass: this.hass,
        calendars: this.calendars || [],
        selectedDate,
        refresh: () => this._fireViewChanged?.(),
      });
    };
  };

  defineDialog();
  if (customElements.get("ha-full-calendar")) {
    patchFullCalendar();
  } else {
    customElements.whenDefined("ha-full-calendar").then(patchFullCalendar);
  }
})();
