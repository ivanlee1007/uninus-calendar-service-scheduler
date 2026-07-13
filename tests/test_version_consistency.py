"""Release metadata consistency tests."""

from __future__ import annotations

import ast
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
COMPONENT = ROOT / "custom_components" / "uninus_calendar_service_scheduler"


def test_manifest_and_frontend_cache_buster_versions_match() -> None:
    """A release must invalidate browser caches with the manifest version."""
    manifest_version = json.loads(
        (COMPONENT / "manifest.json").read_text(encoding="utf-8")
    )["version"]
    module = ast.parse((COMPONENT / "const.py").read_text(encoding="utf-8"))
    version = next(
        node.value.value
        for node in module.body
        if isinstance(node, ast.Assign)
        and any(isinstance(target, ast.Name) and target.id == "VERSION" for target in node.targets)
        and isinstance(node.value, ast.Constant)
    )

    assert version == manifest_version
