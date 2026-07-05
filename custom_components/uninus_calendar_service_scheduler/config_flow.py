"""Config flow for Uninus Calendar Service Scheduler."""

from __future__ import annotations

from typing import Any

import voluptuous as vol
from homeassistant import config_entries
from homeassistant.helpers import selector

from .const import (
    CONF_ALLOWED_SERVICES,
    CONF_DEFAULT_CALENDAR,
    DEFAULT_ALLOWED_SERVICES,
    DOMAIN,
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
            data = dict(user_input)
            data[CONF_ALLOWED_SERVICES] = normalize_allowed_services(
                data.get(CONF_ALLOWED_SERVICES)
            )
            return self.async_create_entry(title="Uninus Scheduler", data=data)
        return self.async_show_form(step_id="user", data_schema=_schema())

    @staticmethod
    def async_get_options_flow(
        config_entry: config_entries.ConfigEntry,
    ) -> OptionsFlowHandler:
        """Return options flow."""
        return OptionsFlowHandler(config_entry)


class OptionsFlowHandler(config_entries.OptionsFlow):
    """Handle options."""

    def __init__(self, config_entry: config_entries.ConfigEntry) -> None:
        self._config_entry = config_entry

    async def async_step_init(
        self, user_input: dict[str, Any] | None = None
    ) -> config_entries.FlowResult:
        if user_input is not None:
            data = dict(user_input)
            data[CONF_ALLOWED_SERVICES] = normalize_allowed_services(
                data.get(CONF_ALLOWED_SERVICES)
            )
            return self.async_create_entry(title="", data=data)
        defaults = dict(self._config_entry.options or self._config_entry.data or {})
        return self.async_show_form(
            step_id="init", data_schema=_schema(defaults), errors={}
        )


def _schema(defaults: dict[str, Any] | None = None) -> vol.Schema:
    defaults = defaults or {}
    allowed_default = "\n".join(
        normalize_allowed_services(
            defaults.get(CONF_ALLOWED_SERVICES, DEFAULT_ALLOWED_SERVICES)
        )
    )
    return vol.Schema(
        {
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
    )
