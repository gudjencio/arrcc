#!/usr/bin/env python3
"""Browser smoke tests for ARRCC. All external services and device APIs are mocked."""

from __future__ import annotations

import threading
import unittest
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from playwright.sync_api import Browser, BrowserContext, Page, sync_playwright

ROOT = Path(__file__).resolve().parents[1]
WEB = ROOT / "web"
BASE_URL = "http://127.0.0.1"


MAPLIBRE_STUB = r"""
(() => {
  class Map {
    constructor(options) { this.options = options; this.handlers = {}; }
    addControl() { return this; }
    on(name, callback) {
      this.handlers[name] = callback;
      if (name === "load") setTimeout(callback, 0);
      return this;
    }
    once(name, callback) { setTimeout(callback, 0); return this; }
    getStyle() { return {sources: {}, layers: []}; }
    getLayer() { return null; }
    addLayer() { return this; }
    resize() { return this; }
    flyTo(options) { this.lastFlyTo = options; return this; }
  }
  class Marker {
    setLngLat(value) { this.position = value; return this; }
    addTo(map) { this.map = map; return this; }
  }
  window.maplibregl = {
    Map, Marker,
    NavigationControl: class {},
    ScaleControl: class {}
  };
})();
"""


class QuietHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(WEB), **kwargs)

    def log_message(self, *_args):
        pass


class ARRCCBrowserSmokeTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = ThreadingHTTPServer(("127.0.0.1", 0), QuietHandler)
        cls.port = cls.server.server_address[1]
        cls.server_thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.server_thread.start()
        cls.base_url = f"{BASE_URL}:{cls.port}/"
        cls.playwright = sync_playwright().start()
        cls.browser: Browser = cls.playwright.chromium.launch()

    @classmethod
    def tearDownClass(cls):
        cls.browser.close()
        cls.playwright.stop()
        cls.server.shutdown()
        cls.server.server_close()
        cls.server_thread.join(timeout=2)

    def create_context(self, *, mobile=False, geolocation=None) -> BrowserContext:
        options = {
            "viewport": {"width": 390, "height": 844} if mobile else {"width": 1365, "height": 900},
            "is_mobile": mobile,
            "has_touch": mobile,
            "locale": "fr-FR",
        }
        if geolocation is not None:
            options["geolocation"] = geolocation
            options["permissions"] = ["geolocation"]
        context = self.browser.new_context(**options)

        def local_only(route):
            url = route.request.url
            if "maplibre-gl.js" in url:
                route.fulfill(status=200, content_type="application/javascript", body=MAPLIBRE_STUB)
            elif url.startswith(self.base_url):
                route.continue_()
            else:
                route.abort()

        context.route("**/*", local_only)
        return context

    def open_page(self, context: BrowserContext) -> Page:
        page = context.new_page()
        page.goto(self.base_url, wait_until="domcontentloaded")
        page.locator("#sosButton").wait_for(state="visible")
        return page

    def test_desktop_critical_controls_and_emergency_links(self):
        context = self.create_context()
        try:
            page = self.open_page(context)
            for selector in (
                "#sosButton", "#locateButton", "#map", "#alarmButton",
                "#signalButton", "#photoButton", "#recordButton",
                "#incidentNotes", "#copyReportButton", "#emailReportButton",
            ):
                self.assertTrue(page.locator(selector).is_visible(), selector)

            for number in ("112", "17", "18", "114"):
                self.assertGreater(
                    page.locator(f'a[href="tel:{number}"]').count(), 0,
                    f"Missing emergency link tel:{number}",
                )
        finally:
            context.close()

    def test_sos_dialog_opens_and_closes_without_calling(self):
        context = self.create_context()
        try:
            page = self.open_page(context)
            dialog = page.locator("#sosModal")
            self.assertNotIn("open", dialog.get_attribute("class") or "")
            page.locator("#sosButton").click()
            self.assertIn("open", dialog.get_attribute("class") or "")
            self.assertTrue(page.locator('#sosModal a[href="tel:112"]').is_visible())
            page.locator("#closeModal").click()
            self.assertNotIn("open", dialog.get_attribute("class") or "")
        finally:
            context.close()

    def test_language_switch_updates_document_language(self):
        context = self.create_context()
        try:
            page = self.open_page(context)
            page.locator("#language").select_option("en")
            self.assertEqual(page.locator("html").get_attribute("lang"), "en")
            page.locator("#language").select_option("fr")
            self.assertEqual(page.locator("html").get_attribute("lang"), "fr")
        finally:
            context.close()

    def test_location_permission_success_is_reflected_in_status(self):
        context = self.create_context(
            geolocation={"latitude": 48.8566, "longitude": 2.3522, "accuracy": 12}
        )
        try:
            page = self.open_page(context)
            page.locator("#locateButton").click()
            page.get_by_text("Position obtenue", exact=False).wait_for(timeout=5000)
            self.assertIn("48.85660", page.locator("#locationStatus").inner_text())
            self.assertIn("2.35220", page.locator("#locationStatus").inner_text())
        finally:
            context.close()

    def test_mobile_layout_has_no_horizontal_overflow(self):
        context = self.create_context(mobile=True)
        try:
            page = self.open_page(context)
            page.wait_for_timeout(150)
            dimensions = page.evaluate(
                "() => ({width: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth})"
            )
            self.assertLessEqual(
                dimensions["scroll"], dimensions["width"],
                f"Mobile horizontal overflow: {dimensions}",
            )
            for selector in ("#sosButton", "#locateButton", "#alarmButton"):
                self.assertTrue(page.locator(selector).is_visible(), selector)
        finally:
            context.close()


if __name__ == "__main__":
    unittest.main(verbosity=2)
