import { LitElement, html, css } from "lit";
import { property } from "lit/decorators.js";
import { classMap } from "lit/directives/class-map.js";
import { bindActionHandler } from "./helpers/action";
import pjson from "../package.json";
import { bind_template, hasTemplate } from "./helpers/templates";
import { hass } from "./helpers/hass";

declare global {
  interface Window {
    loadCardHelpers?: { () };
  }
}

const OPTIONS = [
  "icon",
  "active",
  "name",
  "secondary",
  "state",
  "condition",
  "image",
  "entity",
  // Secret option -
  // Set color to a hs-color value ("[<hue>,<saturation>]")
  // with hue in the range 0-360 and saturation 0-100.
  // Works only if entity is unset and active is set.
  "color",
  "rowtype",
  "tap_action",
  "hold_action",
  "double_tap_action",
];

const LOCALIZE_PATTERN = /_\([^)]*\)/g;

const translate = (hass, text: String) => {
  return text.replace(LOCALIZE_PATTERN, (key) => {
    const params = key
      .substring(2, key.length - 1)
      .split(new RegExp(/\s*,\s*/));
    return hass.localize.apply(null, params) || key;
  });
};

const stopPropagation = (ev) => ev.stopPropagation();

class TemplateEntityRow extends LitElement {
  @property() _config;
  @property() hass;
  @property() config; // Rendered configuration of the row to display
  @property() _action;

  setConfig(config) {
    this._config = { ...config };
    this.config = { ...this._config };

    this.bind_templates();

    (async () => {
      const cardHelpers = await window.loadCardHelpers();
      if (!customElements.get("ha-select"))
        cardHelpers.createRowElement({type: "select-entity"});
      if (!customElements.get("ha-date-input") || !customElements.get("ha-time-input"))
        cardHelpers.createRowElement({type: "input-datetime-entity"});
    })();
  }

  async bind_templates() {
    const hs = await hass();
    for (const k of OPTIONS) {
      if (!this._config[k]) continue;
      if (hasTemplate(this._config[k])) {
        bind_template(
          (res) => {
            const state = { ...this.config };
            if (typeof res === "string") res = translate(hs, res);
            state[k] = res;
            this.config = state;
          },
          this._config[k],
          { config: this._config }
        );
      } else if (typeof this._config[k] === "string") {
        this.config[k] = translate(hs, this._config[k]);
      }
    }
    this.requestUpdate();
  }

  async firstUpdated() {
    // Hijack the action handler from the hidden generic entity row in the #staging area
    // Much easier than trying to implement all of this ourselves
    const gen_row = this.shadowRoot.querySelector(
      "#staging hui-generic-entity-row"
    ) as any;
    if (!gen_row) return;
    await gen_row.updateComplete;
    this._action = gen_row._handleAction;
    const options = {
      hasHold: this._config.hold_action !== undefined,
      hasDoubleClick: this._config.hold_action !== undefined,
    };
    if (
      this.config.entity ||
      this.config.tap_action ||
      this.config.hold_action ||
      this.config.double_tap_action
    ) {
      bindActionHandler(this.shadowRoot.querySelector("state-badge"), options);
      bindActionHandler(this.shadowRoot.querySelector(".info"), options);
    }
  }

  _actionHandler(ev) {
    return this._action?.(ev);
  }

  render() {
    const base = this.hass.states[this.config.entity];
    const entity = (base && JSON.parse(JSON.stringify(base))) || {
      entity_id: "binary_sensor.",
      attributes: { icon: "no:icon", friendly_name: "" },
      state: "off",
    };

    const icon =
      this.config.icon !== undefined
        ? this.config.icon || "no:icon"
        : undefined;
    const image = this.config.image;
    let color = this.config.color;

    const name =
      this.config.name ??
      entity?.attributes?.friendly_name ??
      entity?.entity_id;
    const secondary = this.config.secondary;
    const state = this.config.state ?? base?.state;
    let stateColor = true;

    const active = this.config.active ?? false;
    if (active) {
      entity.attributes.brightness = 255;
      entity.state = "on";
    }
    if (this.config.active === false) {
      entity.state = "off";
      stateColor = false;
    }

    const hidden =
      this.config.condition !== undefined &&
      String(this.config.condition).toLowerCase() !== "true";

    const rowtype = this.config.rowtype;
    const has_action =
      this.config.entity ||
      this.config.tap_action ||
      this.config.hold_action ||
      this.config.double_tap_action;

    return html`
      <div id="wrapper" class="${hidden ? "hidden" : ""}">
        <state-badge
          .hass=${this.hass}
          .stateObj=${entity}
          @action=${this._actionHandler}
          .overrideIcon=${icon}
          .overrideImage=${image}
          .color=${color}
          class=${classMap({ pointer: has_action })}
          ?stateColor=${stateColor}
        ></state-badge>
        <div
          class=${classMap({ info: true, pointer: has_action })}
          @action="${this._actionHandler}"
        >
          ${name}
          <div class="secondary">${secondary}</div>
        </div>
        <div class="state">
          ${rowtype === "toggle"
          ? html`<ha-entity-toggle .hass=${this.hass} .stateObj=${entity}>
            </ha-entity-toggle>`
          : (rowtype === "select"
          ? html`<ha-select .value=${state} .options=${entity.attributes.options} .disabled=${state === "unavailable"} naturalMenuWidth @action=${this._handleSelectAction} @click=${stopPropagation} @closed=${stopPropagation}>
            ${entity.attributes.options
            ? entity.attributes.options.map((option) =>
              html`<ha-list-item .value=${option}>
                ${this.hass!.formatEntityState(entity, option)}
              </ha-list-item>`)
            : ""}
            </ha-select>`
          : (rowtype === "input-datetime"
            ? html`<div class=${entity.attributes.has_date && entity.attributes.has_time ? "both" : ""} style="display:inline-flex;">
            ${entity.attributes.has_date
            ? html`<ha-date-input .locale=${this.hass.locale} .disabled=${state === "unavailable" || state === "unknown"} .value=${entity.attributes.year || "1970"}-${String(entity.attributes.month || "01").padStart(2, "0")}-${String(entity.attributes.day || "01").padStart(2, "0")}T${String(entity.attributes.hour || "00").padStart(2, "0")}:${String(entity.attributes.minute || "00").padStart(2, "0")}:${String(entity.attributes.second || "00").padStart(2, "0")} @value-changed=${this._dateChanged}>
              </ha-date-input>`
            : ``}
            ${entity.attributes.has_date && entity.attributes.has_time ? html`&nbsp;` : ""}
            ${entity.attributes.has_time
            ? html`<ha-time-input .value=${state === "unknown" ? "" : entity.attributes.has_date ? state.split(" ")[1] : state} .locale=${this.hass.locale} .disabled=${state === "unavailable" || state === "unknown"} .enableSecond=${true} @value-changed=${this._timeChanged} @click=${stopPropagation}>
              </ha-time-input>`
            : ``}
            </div>`
          : state))}
        </div>
      </div>
      <div id="staging">
        <hui-generic-entity-row .hass=${this.hass} .config=${this.config}></hui-generic-entity-row>
        <input-datetime-entity></input-datetime-entity>
      </div>
    `;
  }

  static get styles() {
    return [
      (customElements.get("hui-generic-entity-row") as any)?.styles,
      css`
        :host {
          display: inline;
        }
        #wrapper {
          display: flex;
          align-items: center;
          flex-direction: row;
        }
        .state {
          text-align: right;
        }
        #wrapper {
          min-height: 40px;
        }
        #wrapper.hidden {
          display: none;
        }
        #staging {
          display: none;
        }
      `,
    ];
  }

  private _handleSelectAction(ev): void {
    const stateObj = this.hass!.states[this._config!.entity];

    const option = ev.target.value;

    if (
      option === stateObj.state ||
      !stateObj.attributes.options.includes(option)
    ) {
      return;
    }

    if (stateObj.entity_id.startsWith("select."))
        this.hass!.callService("select", "select_option", { option }, { entity_id: stateObj.entity_id });
    else if (stateObj.entity_id.startsWith("input_select."))
        this.hass!.callService("input_select", "select_option", { option, entity_id: stateObj.entity_id });
  }

  private _timeChanged(ev): void {
    const stateObj = this.hass!.states[this._config!.entity];

    const param = { entity_id: stateObj.entity_id, time: ev.detail.value, date: stateObj.attributes.has_date ? stateObj.state.split(" ")[0] : undefined };
    this.hass!.callService("input_datetime", "set_datetime", param);
  }

  private _dateChanged(ev): void {
    const stateObj = this.hass!.states[this._config!.entity];

    const param = { entity_id: stateObj.entity_id, time: stateObj.attributes.has_time ? stateObj.state.split(" ")[1] : undefined, date: ev.detail.value };
    this.hass!.callService("input_datetime", "set_datetime", param);
  }
}

if (!customElements.get("template-entity-row")) {
  customElements.define("template-entity-row", TemplateEntityRow);
  console.info(
    `%cTEMPLATE-ENTITY-ROW ${pjson.version} IS INSTALLED`,
    "color: green; font-weight: bold",
    ""
  );
}
