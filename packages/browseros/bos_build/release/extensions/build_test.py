#!/usr/bin/env python3
"""Reusable extension build tests."""

import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from bos_build.release.extensions.build import (
    _UPDATE_FEED_NAMES,
    build_extension_crx,
    is_placeholder_feed_url,
    validate_manifest_update_url,
)
from bos_build.release.extensions.specs import EXTENSION_SPECS, spec_by_name


MODULE = "bos_build.release.extensions.build"


class ExtensionBuildTest(unittest.TestCase):
    def test_builds_and_packs_without_stamping_candidate_checkout(self) -> None:
        spec = spec_by_name("agent")
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            source = root / "packages/browseros-agent"
            manifest = source / spec.manifest_path
            dist = source / spec.dist_path
            manifest.parent.mkdir(parents=True)
            manifest.write_text(json.dumps({"version": "0.0.101"}))
            dist.mkdir(parents=True)
            (dist / "manifest.json").write_text(json.dumps({"version": "0.0.101"}))
            output = root / "agent.crx"

            with (
                patch(f"{MODULE}.resolve_source", return_value=source),
                patch(f"{MODULE}.write_env_file"),
                patch(f"{MODULE}.run_command") as run,
                patch(f"{MODULE}.require_env", return_value="private-key"),
                patch(f"{MODULE}.pack_crx") as pack,
            ):
                pack.side_effect = lambda dist, key, chrome, path: (
                    path.write_bytes(b"crx") or path
                )
                built = build_extension_crx(
                    spec=spec,
                    version="0.0.101.0",
                    output_path=output,
                    monorepo_root=root,
                    work_root=root / "work",
                    chrome_binary="chrome",
                    stamp_version=False,
                )

            self.assertEqual(json.loads(manifest.read_text())["version"], "0.0.101")
            self.assertEqual(
                json.loads((dist / "manifest.json").read_text())["version"],
                "0.0.101.0",
            )
            self.assertEqual(built.path, output)
            self.assertEqual(built.version, "0.0.101.0")
            self.assertEqual(run.call_count, 2)
            pack.assert_called_once()

    def test_standalone_build_stamps_only_the_built_manifest(self) -> None:
        spec = spec_by_name("browserclaw")
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            source = root / "packages/browseros-agent"
            manifest = source / spec.manifest_path
            dist = source / spec.dist_path
            manifest.parent.mkdir(parents=True)
            manifest.write_text(json.dumps({"version": "0.1.7"}))
            dist.mkdir(parents=True)
            (dist / "manifest.json").write_text(json.dumps({"version": "0.1.7"}))

            with (
                patch(f"{MODULE}.resolve_source", return_value=source),
                patch(f"{MODULE}.write_env_file"),
                patch(f"{MODULE}.run_command"),
                patch(f"{MODULE}.require_env", return_value="private-key"),
                patch(f"{MODULE}.pack_crx") as pack,
            ):
                pack.side_effect = lambda dist, key, chrome, path: (
                    path.write_bytes(b"crx") or path
                )
                build_extension_crx(
                    spec=spec,
                    version="0.1.8.0",
                    output_path=root / "browserclaw.crx",
                    monorepo_root=root,
                    work_root=root / "work",
                    chrome_binary="chrome",
                    stamp_version=True,
                )

            self.assertEqual(json.loads(manifest.read_text())["version"], "0.1.7")
            self.assertEqual(
                json.loads((dist / "manifest.json").read_text())["version"],
                "0.1.8.0",
            )

    def test_refuses_version_drift_before_build(self) -> None:
        spec = spec_by_name("agent")
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            source = root / "packages/browseros-agent"
            manifest = source / spec.manifest_path
            manifest.parent.mkdir(parents=True)
            manifest.write_text(json.dumps({"version": "0.0.100"}))

            with patch(f"{MODULE}.resolve_source", return_value=source):
                with self.assertRaisesRegex(ValueError, "version"):
                    build_extension_crx(
                        spec=spec,
                        version="0.0.101.0",
                        output_path=root / "agent.crx",
                        monorepo_root=root,
                        work_root=root / "work",
                        chrome_binary="chrome",
                        stamp_version=False,
                    )


class PlaceholderFeedUrlTest(unittest.TestCase):
    def test_empty_and_sentinel_urls_are_placeholders(self) -> None:
        for url in (None, "", "   ", "https://updates.browser.invalid/x.xml"):
            with self.subTest(url=url):
                self.assertTrue(is_placeholder_feed_url(url))

    def test_real_host_is_not_a_placeholder(self) -> None:
        self.assertFalse(
            is_placeholder_feed_url("https://updates.example.com/extensions/u.xml")
        )


class ManifestUpdateUrlTest(unittest.TestCase):
    def setUp(self) -> None:
        self.dist_path = Path("apps/app/dist/chrome-mv3")
        self.real_url = "https://updates.example.com/extensions/update-manifest.xml"

    def _expect(self, url: str):
        return patch(f"{MODULE}._UPDATE_MANIFEST_URL", url)

    def test_sentinel_feed_accepts_missing_update_url(self) -> None:
        with self._expect("https://updates.browser.invalid/extensions/u.xml"):
            validate_manifest_update_url(spec_by_name("agent"), {}, self.dist_path)

    def test_unconfigured_feed_accepts_missing_update_url(self) -> None:
        with self._expect(""):
            validate_manifest_update_url(spec_by_name("agent"), {}, self.dist_path)

    def test_sentinel_feed_still_rejects_a_foreign_update_url(self) -> None:
        sentinel = "https://updates.browser.invalid/extensions/u.xml"
        with self._expect(sentinel):
            with self.assertRaisesRegex(RuntimeError, "agent.*apps/app/dist/chrome-mv3"):
                validate_manifest_update_url(
                    spec_by_name("agent"),
                    {"update_url": "https://example.com/update.xml"},
                    self.dist_path,
                )

    def test_sentinel_feed_accepts_a_matching_update_url(self) -> None:
        sentinel = "https://updates.browser.invalid/extensions/u.xml"
        with self._expect(sentinel):
            validate_manifest_update_url(
                spec_by_name("agent"), {"update_url": sentinel}, self.dist_path
            )

    def test_real_feed_requires_the_update_url(self) -> None:
        with self._expect(self.real_url):
            with self.assertRaisesRegex(RuntimeError, "expected"):
                validate_manifest_update_url(spec_by_name("agent"), {}, self.dist_path)

    def test_real_feed_rejects_a_mismatched_update_url(self) -> None:
        with self._expect(self.real_url):
            with self.assertRaisesRegex(RuntimeError, "expected"):
                validate_manifest_update_url(
                    spec_by_name("agent"),
                    {"update_url": "https://example.com/update.xml"},
                    self.dist_path,
                )

    def test_real_feed_accepts_the_expected_update_url(self) -> None:
        with self._expect(self.real_url):
            validate_manifest_update_url(
                spec_by_name("agent"), {"update_url": self.real_url}, self.dist_path
            )

    def test_extension_outside_the_feed_is_never_checked(self) -> None:
        outside = [
            spec for spec in EXTENSION_SPECS if spec.name not in _UPDATE_FEED_NAMES
        ]
        if not outside:
            self.skipTest("every spec is in the update feed")
        with self._expect(self.real_url):
            validate_manifest_update_url(outside[0], {}, self.dist_path)


if __name__ == "__main__":
    unittest.main()
