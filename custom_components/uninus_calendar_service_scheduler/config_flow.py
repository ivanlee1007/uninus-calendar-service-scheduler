"""Config flow for Uninus Calendar Service Scheduler."""

from __future__ import annotations

from typing import Any

import voluptuous as vol
from homeassistant import config_entries
from homeassistant.helpers import selector

from .const import (
    CONF_ALLOWED_SERVICES,
    CONF_CLEAR_TRACEABILITY_DATA,
    CONF_CONFIRM_CLEAR_TRACEABILITY_DATA,
    CONF_DEFAULT_CALENDAR,
    DEFAULT_ALLOWED_SERVICES,
    DOMAIN,
    SERVICE_CLEAR_TRACEABILITY_DATA,
)
from .models import normalize_allowed_services


class ConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    """Handle a config flow."""

    VERSION = 1

    async def async_step_user(
        self, user_input: dict[str, Any] | None = None
    ) -> config_entries.FlowResult:
        """Create the single integration entry."""
        await self.async_set_unique_id(DOMAIN)
        self._abort_if_unique_id_configured()
        if user_input is not None:
            data = _normalize_options(user_input)
            return self.async_create_entry(title="Uninus Scheduler", data=data)
        return self.async_show_form(step_id="user", data_schema=_schema())

    @staticmethod
    def async_get_options_flow(
        config_entry: config_entries.ConfigEntry,
    ) -> OptionsFlowHandler:
        """Return options flow."""
        return OptionsFlowHandler(config_entry)


class OptionsFlowHandler(config_entries.OptionsFlow):
    """Handle options and an explicitly-confirmed traceability reset."""

    def __init__(self, config_entry: config_entries.ConfigEntry) -> None:
        self._config_entry = config_entry
        self._pending_options: dict[str, Any] | None = None

    async def async_step_init(
        self, user_input: dict[str, Any] | None = None
    ) -> config_entries.FlowResult:
        if user_input is not None:
            self._pending_options = _normalize_options(user_input)
            if user_input.get(CONF_CLEAR_TRACEABILITY_DATA):
                return await self.async_step_confirm_clear_traceability()
            return self.async_create_entry(title="", data=self._pending_options)
        defaults = dict(self._config_entry.options or self._config_entry.data or {})
        return self.async_show_form(
            step_id="init", data_schema=_schema(defaults, include_clear=True), errors={}
        )

    async def async_step_confirm_clear_traceability(
        self, user_input: dict[str, Any] | None = None
    ) -> config_entries.FlowResult:
        """Require a second explicit confirmation before destructive reset."""
        errors: dict[str, str] = {}
        if user_input is not None:
            if not user_input.get(CONF_CONFIRM_CLEAR_TRACEABILITY_DATA):
                errors["base"] = "confirmation_required"
            else:
                try:
                    await self.hass.services.async_call(
                        DOMAIN,
                        SERVICE_CLEAR_TRACEABILITY_DATA,
                        {"confirm": True},
                        blocking=True,
                        return_response=True,
                    )
                except Exception:
                    errors["base"] = "clear_failed"
                else:
                    return self.async_create_entry(
                        title="", data=self._pending_options or {}
                    )
        return self.async_show_form(
            step_id="confirm_clear_traceability",
            data_schema=vol.Schema(
                {
                    vol.Required(
                        CONF_CONFIRM_CLEAR_TRACEABILITY_DATA,
                        default=False,
                    ): selector.BooleanSelector()
                }
            ),
            errors=errors,
        )


def _normalize_options(user_input: dict[str, Any]) -> dict[str, Any]:
    """Remove transient destructive-flow controls before persisting options."""
    data = dict(user_input)
    data.pop(CONF_CLEAR_TRACEABILITY_DATA, None)
    data.pop(CONF_CONFIRM_CLEAR_TRACEABILITY_DATA, None)
    data[CONF_ALLOWED_SERVICES] = normalize_allowed_services(
        data.get(CONF_ALLOWED_SERVICES)
    )
    return data


def _schema(
    defaults: dict[str, Any] | None = None, *, include_clear: bool = False
) -> vol.Schema:
    defaults = defaults or {}
    allowed_default = "\n".join(
        normalize_allowed_services(
            defaults.get(CONF_ALLOWED_SERVICES, DEFAULT_ALLOWED_SERVICES)
        )
    )
    fields: dict[Any, Any] = {
        vol.Optional(
            CONF_DEFAULT_CALENDAR,
            default=defaults.get(CONF_DEFAULT_CALENDAR),
        ): selector.EntitySelector(selector.EntitySelectorConfig(domain="calendar")),
        vol.Optional(
            CONF_ALLOWED_SERVICES,
            default=allowed_default,
        ): selector.TextSelector(
            selector.TextSelectorConfig(multiline=True, type=selector.TextSelectorType.TEXT)
        ),
    }
    if include_clear:
        fields[vol.Optional(CONF_CLEAR_TRACEABILITY_DATA, default=False)] = (
            selector.BooleanSelector()
        )
    return vol.Schema(fields)
