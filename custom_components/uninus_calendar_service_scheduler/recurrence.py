"""RRULE occurrence helpers for scheduled service actions."""

from __future__ import annotations

from datetime import datetime, timedelta

from dateutil.rrule import rrulestr

try:
    from homeassistant.util import dt as dt_util
except ModuleNotFoundError:  # pragma: no cover - lightweight test fallback
    from datetime import UTC

    class _DtUtil:
        @staticmethod
        def parse_datetime(value: str) -> datetime | None:
            try:
                return datetime.fromisoformat(value.replace("Z", "+00:00"))
            except ValueError:
                return None

        @staticmethod
        def as_local(value: datetime) -> datetime:
            return value if value.tzinfo else value.replace(tzinfo=UTC)

        @staticmethod
        def as_utc(value: datetime) -> datetime:
            if value.tzinfo is None:
                value = value.replace(tzinfo=UTC)
            return value.astimezone(UTC)

        @staticmethod
        def utcnow() -> datetime:
            return datetime.now(UTC)

    dt_util = _DtUtil()

from .models import ScheduledAction


def _parse_datetime(value: str | None) -> datetime | None:
    if not value:
        return None
    parsed = dt_util.parse_datetime(value)
    if parsed is None:
        return None
    if parsed.tzinfo is None:
        parsed = dt_util.as_local(parsed)
    return parsed


def _rrule_set(action: ScheduledAction):
    if not action.rrule:
        return None
    start = _parse_datetime(action.start)
    if start is None:
        return None
    rule_text = action.rrule.strip()
    if not rule_text:
        return None
    if not rule_text.upper().startswith("RRULE:"):
        rule_text = f"RRULE:{rule_text}"
    try:
        return rrulestr(rule_text, dtstart=start)
    except Exception:  # noqa: BLE001 - invalid RRULE should not break HA setup
        return None


def action_duration(action: ScheduledAction) -> timedelta:
    """Return the event duration used for end-phase recurring occurrences."""
    start = _parse_datetime(action.start)
    end = _parse_datetime(action.end)
    if start is None or end is None:
        return timedelta(0)
    return max(end - start, timedelta(0))


def next_occurrence_start(
    action: ScheduledAction, after: datetime | None = None, *, include_after: bool = False
) -> datetime | None:
    """Return the next start occurrence for an action.

    Non-recurring actions return their configured start if it is still pending.
    Recurring actions use the action's RRULE with the configured start as DTSTART.
    """
    after = after or dt_util.utcnow()
    after_utc = dt_util.as_utc(after)
    rule = _rrule_set(action)
    if rule is None:
        start = _parse_datetime(action.start)
        if start is None:
            return None
        start_utc = dt_util.as_utc(start)
        return start if start_utc > after_utc or (include_after and start_utc == after_utc) else None
    occurrence = rule.after(after_utc, inc=include_after)
    if occurrence is None:
        return None
    if occurrence.tzinfo is None:
        occurrence = dt_util.as_local(occurrence)
    return occurrence


def next_phase_time(
    action: ScheduledAction, phase: str, after: datetime | None = None, *, include_after: bool = False
) -> datetime | None:
    """Return the next datetime for a start or end phase."""
    after = after or dt_util.utcnow()
    if phase != "end":
        return next_occurrence_start(action, after, include_after=include_after)
    if not action.end or (not action.end_service and not action.operation_id):
        return None
    duration = action_duration(action)
    # For recurring events, the next pending end may belong to the occurrence
    # whose start has already fired. Look back by the event duration so a start
    # trigger does not reschedule past today's matching end trigger.
    candidate_after = dt_util.as_utc(after) - duration
    start_occurrence = next_occurrence_start(action, candidate_after, include_after=True)
    if start_occurrence is None:
        return None
    end_occurrence = start_occurrence + duration
    if dt_util.as_utc(end_occurrence) <= dt_util.as_utc(after):
        start_occurrence = next_occurrence_start(action, after, include_after=include_after)
        if start_occurrence is None:
            return None
        end_occurrence = start_occurrence + duration
    return end_occurrence
