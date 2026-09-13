#!/usr/bin/env python3
"""Shared local extension build and CRX packaging."""

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Mapping, Optional
from urllib.parse import urlsplit

from ..components import component_version_from_package, normalize_component_version
from ..feeds.spec import CDN_BASE_URL
from .crx import pack_crx
from .specs import ExtensionSpec, InRepoSource
from .workspace import (
    require_env,
    resolve_source,
    run_command,
    update_manifest_version,
    write_env_file,
)


_UPDATE_MANIFEST_PATH = "extensions/update-manifest.xml"
_UPDATE_MANIFEST_URL = (
    f"{CDN_BASE_URL.rstrip('/')}/{_UPDATE_MANIFEST_PATH}" if CDN_BASE_URL.strip() else ""
)
_UPDATE_FEED_NAMES = frozenset({"agent", "browserclaw"})


@dataclass(frozen=True)
class BuiltExtension:
    """Identity and output of one locally packed extension."""

    name: str
    extension_id: str
    version: str
    path: Path


def _manifest_version(path: Path) -> str:
    document = json.loads(path.read_text(encoding="utf-8"))
    version = document.get("version")
    if not isinstance(version, str) or not version:
        raise ValueError(f"Extension manifest is missing its version: {path}")
    return version


def _validate_built_manifest(
    spec: ExtensionSpec, manifest: Mapping[str, object], dist_path: Path, version: str
) -> None:
    if manifest.get("version") != version:
        raise RuntimeError(
            f"Extension '{spec.name}' output version {manifest.get('version')!r} "
            f"does not match {version}"
        )
    validate_manifest_update_url(spec, manifest, dist_path)


def is_placeholder_feed_url(url: Optional[str]) -> bool:
    """True while no real update feed is configured (empty or a .invalid host)."""
    if not url or not url.strip():
        return True
    host = urlsplit(url).hostname or ""
    return host.endswith(".invalid")


def validate_manifest_update_url(
    spec: ExtensionSpec, manifest: Mapping[str, object], dist_path: Path
) -> None:
    """Require bundled update-feed extensions to use the stable updater.

    With no feed host configured yet, builds ship without auto-update: a
    missing ``update_url`` is accepted. A declared one must still match.
    """
    if spec.name not in _UPDATE_FEED_NAMES:
        return
    actual = manifest.get("update_url")
    if actual is None and is_placeholder_feed_url(_UPDATE_MANIFEST_URL):
        return
    if actual != _UPDATE_MANIFEST_URL:
        raise RuntimeError(
            f"Extension '{spec.name}' build at '{dist_path}' has update_url "
            f"{actual!r}; expected '{_UPDATE_MANIFEST_URL}'"
        )


def build_extension_crx(
    *,
    spec: ExtensionSpec,
    version: str,
    output_path: Path,
    monorepo_root: Path,
    work_root: Path,
    chrome_binary: str,
    branch_override: Optional[str] = None,
    stamp_version: bool,
) -> BuiltExtension:
    """Build and sign one extension from a resolved source checkout."""
    source_root = resolve_source(
        spec,
        monorepo_root=monorepo_root,
        work_root=work_root,
        branch_override=branch_override,
    )
    manifest_path = source_root / spec.manifest_path
    in_repo = isinstance(spec.source, InRepoSource)
    if stamp_version and not in_repo:
        update_manifest_version(manifest_path, version)
    elif not stamp_version:
        source_version = _manifest_version(manifest_path)
        expected = (
            normalize_component_version(spec.name, version) if in_repo else version
        )
        actual = (
            component_version_from_package(spec.name, source_version)
            if in_repo
            else source_version
        )
        if actual != expected:
            raise ValueError(
                f"Extension '{spec.name}' source version does not match requested version {version}"
            )
    if spec.env:
        env_dir = source_root / spec.env_dir if spec.env_dir else source_root
        write_env_file(env_dir, spec.env, required_names=spec.required_env)
    if spec.pre_build:
        run_command(spec.pre_build, source_root)
    run_command(spec.build, source_root)

    dist_path = source_root / spec.dist_path
    built_manifest_path = dist_path / "manifest.json"
    if in_repo:
        update_manifest_version(built_manifest_path, version)
    manifest = json.loads(built_manifest_path.read_text(encoding="utf-8"))
    if not isinstance(manifest, dict):
        raise RuntimeError(f"Extension output manifest must be an object: {dist_path}")
    _validate_built_manifest(spec, manifest, dist_path, version)
    pack_crx(
        dist_path,
        require_env(spec.signing_key_env),
        chrome_binary,
        output_path,
    )
    return BuiltExtension(
        name=spec.name,
        extension_id=spec.extension_id,
        version=version,
        path=output_path,
    )
