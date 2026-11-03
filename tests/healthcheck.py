#!/usr/bin/env python3
"""Read-only ARRCC integrity checks. No application files are modified."""

from __future__ import annotations

import json
import re
import subprocess
import tempfile
import unittest
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[1]
WEB = ROOT / "web"

REQUIRED_FILES = (
    "index.html",
    "app.js",
    "locales.js",
    "styles.css",
    "sw.js",
    "manifest.webmanifest",
)

CRITICAL_IDS = (
    "language",
    "sosButton",
    "locateButton",
    "locationStatus",
    "map",
    "alarmButton",
    "signalButton",
    "photoButton",
    "recordButton",
    "incidentNotes",
    "copyReportButton",
    "emailReportButton",
)

class DocumentInventory(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.ids = []
        self.local_refs = []
        self.inline_scripts = []
        self._in_inline_script = False
        self._script_buffer = []

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if "id" in attrs:
            self.ids.append(attrs["id"])
        for key in ("src", "href"):
            value = attrs.get(key, "")
            if value and not value.startswith(("#", "data:", "mailto:", "tel:", "javascript:")):
                parsed = urlsplit(value)
                if not parsed.scheme and not value.startswith("//"):
                    path = parsed.path
                    if path:
                        self.local_refs.append(path)
        if tag.lower() == "script":
            self._in_inline_script = not bool(attrs.get("src"))
            self._script_buffer = []

    def handle_data(self, data):
        if self._in_inline_script:
            self._script_buffer.append(data)

    def handle_endtag(self, tag):
        if tag.lower() == "script" and self._in_inline_script:
            self.inline_scripts.append("".join(self._script_buffer))
            self._in_inline_script = False
            self._script_buffer = []

class ARRCCHealthChecks(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.html = (WEB / "index.html").read_text(encoding="utf-8")
        cls.document = DocumentInventory()
        cls.document.feed(cls.html)
        cls.document.close()

    def test_required_application_files_exist(self):
        for name in REQUIRED_FILES:
            with self.subTest(file=name):
                self.assertTrue((WEB / name).is_file(), f"Missing web/{name}")

    def test_critical_safety_interface_elements_exist(self):
        ids = set(self.document.ids)
        missing = [element for element in CRITICAL_IDS if element not in ids]
        self.assertFalse(missing, "Missing critical interface IDs: " + ", ".join(missing))

    def test_no_duplicate_html_ids(self):
        seen = set()
        duplicates = set()
        for element in self.document.ids:
            if element in seen:
                duplicates.add(element)
            seen.add(element)
        self.assertFalse(duplicates, "Duplicate HTML IDs: " + ", ".join(sorted(duplicates)))

    def test_local_html_assets_resolve(self):
        missing = []
        for reference in self.document.local_refs:
            candidate = (WEB / reference.lstrip("/")).resolve()
            if not str(candidate).startswith(str(WEB.resolve())):
                missing.append(reference)
            elif not candidate.is_file():
                missing.append(reference)
        self.assertFalse(missing, "Missing or unsafe local asset references: " + ", ".join(missing))

    def test_manifest_is_valid_json(self):
        manifest = json.loads((WEB / "manifest.webmanifest").read_text(encoding="utf-8"))
        self.assertIsInstance(manifest, dict)
        self.assertTrue(manifest.get("name") or manifest.get("short_name"))

    def test_javascript_files_pass_node_syntax_check(self):
        for name in ("app.js", "locales.js", "sw.js"):
            result = subprocess.run(
                ["node", "--check", str(WEB / name)],
                text=True,
                capture_output=True,
                check=False,
            )
            self.assertEqual(result.returncode, 0, f"{name}: {result.stderr}")

    def test_inline_javascript_passes_node_syntax_check(self):
        for index, source in enumerate(self.document.inline_scripts):
            if not source.strip():
                continue
            with tempfile.NamedTemporaryFile("w", suffix=".js", encoding="utf-8") as handle:
                handle.write(source)
                handle.flush()
                result = subprocess.run(
                    ["node", "--check", handle.name],
                    text=True,
                    capture_output=True,
                    check=False,
                )
            self.assertEqual(result.returncode, 0, f"Inline script {index + 1}: {result.stderr}")

if __name__ == "__main__":
    unittest.main(verbosity=2)
