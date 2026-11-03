#!/usr/bin/env python3
"""ARRCC browser smoke tests. Network services, audio output and device APIs are mocked."""

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
    on(name, callback) { this.handlers[name] = callback; if (name === "load") setTimeout(callback, 0); return this; }
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
  window.maplibregl = {Map, Marker, NavigationControl: class {}, ScaleControl: class {}};
})();
"""

# The alarm is exercised without producing sound or touching audio hardware.
AUDIO_STUB = r"""
(() => {
  const param = () => ({
    value: 0,
    setValueAtTime() {}, exponentialRampToValueAtTime() {},
    cancelScheduledValues() {}, setTargetAtTime() {}
  });
  class Node {
    constructor() { this.gain = param(); this.frequency = param(); this.Q = param(); this.threshold = param(); this.knee = param(); this.ratio = param(); this.attack = param(); this.release = param(); this.offset = param(); }
    connect() { return this; } disconnect() {} start() {} stop() {}
  }
  class AudioContextMock {
    constructor() { this.state = "running"; this.currentTime = 0; this.destination = new Node(); }
    resume() { return Promise.resolve(); }
    close() { this.state = "closed"; return Promise.resolve(); }
    createDynamicsCompressor() { return new Node(); }
    createGain() { return new Node(); }
    createOscillator() { return new Node(); }
    createConstantSource() { return new Node(); }
    createBiquadFilter() { return new Node(); }
  }
  window.AudioContext = AudioContextMock;
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
        cls.browsers: dict[str, Browser] = {}
        for name in ("chromium", "firefox", "webkit"):
            cls.browsers[name] = getattr(cls.playwright, name).launch()

    @classmethod
    def tearDownClass(cls):
        for browser in cls.browsers.values():
            browser.close()
        cls.playwright.stop()
        cls.server.shutdown()
        cls.server.server_close()
        cls.server_thread.join(timeout=2)

    def create_context(self, *, browser_name="chromium", mobile=False, geolocation=None) -> BrowserContext:
        browser = self.browsers[browser_name]
        options = {
            "viewport": {"width": 390, "height": 844} if mobile else {"width": 1365, "height": 900},
            "locale": "fr-FR",
        }
        if geolocation is not None:
            options["geolocation"] = geolocation
            options["permissions"] = ["geolocation"]
        context = browser.new_context(**options)
        context.add_init_script(AUDIO_STUB)

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
                self.assertGreater(page.locator(f'a[href="tel:{number}"]').count(), 0)
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
            self.assertLessEqual(dimensions["scroll"], dimensions["width"], f"Mobile overflow: {dimensions}")
            for selector in ("#sosButton", "#locateButton", "#alarmButton"):
                self.assertTrue(page.locator(selector).is_visible(), selector)
        finally:
            context.close()

    def test_all_engines_critical_flows_desktop_and_mobile(self):
        # Exercise alarm and screen signal in all engines with silent audio and no device APIs.
        for browser_name in ("chromium", "firefox", "webkit"):
            with self.subTest(browser=browser_name):
                context = self.create_context(browser_name=browser_name)
                try:
                    page = self.open_page(context)
                    for selector in ("#sosButton", "#alarmButton", "#signalButton", "#locateButton"):
                        self.assertTrue(page.locator(selector).is_visible(), f"{browser_name}: {selector}")

                    # The SOS panel opens/closes; tel links are inspected but never activated.
                    page.locator("#sosButton").click()
                    self.assertIn("open", page.locator("#sosModal").get_attribute("class") or "")
                    page.locator("#closeModal").click()
                    self.assertNotIn("open", page.locator("#sosModal").get_attribute("class") or "")

                    # Web Audio is replaced by a silent mock; verify start/stop state only.
                    alarm = page.locator("#alarmButton")
                    alarm.click()
                    page.wait_for_function("document.querySelector('#alarmButton').getAttribute('aria-pressed') === 'true'")
                    alarm.click()
                    self.assertEqual(alarm.get_attribute("aria-pressed"), "false")

                    # Screen signal is toggled on and off; no camera, flash or emergency call.
                    signal = page.locator("#signalButton")
                    initial_label = signal.inner_text()
                    signal.click()
                    self.assertNotEqual(signal.inner_text(), initial_label)
                    signal.click()
                    self.assertEqual(signal.inner_text(), initial_label)
                finally:
                    context.close()

                mobile_context = self.create_context(browser_name=browser_name, mobile=True)
                try:
                    mobile_page = self.open_page(mobile_context)
                    dimensions = mobile_page.evaluate(
                        "() => ({width: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth})"
                    )
                    self.assertLessEqual(
                        dimensions["scroll"], dimensions["width"],
                        f"{browser_name} mobile overflow: {dimensions}",
                    )
                    self.assertTrue(mobile_page.locator("#sosButton").is_visible())
                    self.assertTrue(mobile_page.locator("#alarmButton").is_visible())
                    self.assertTrue(mobile_page.locator("#signalButton").is_visible())

                    # Mobile alarm interaction uses the same silent audio mock.
                    mobile_alarm = mobile_page.locator("#alarmButton")
                    mobile_alarm.click()
                    mobile_page.wait_for_function(
                        "document.querySelector('#alarmButton').getAttribute('aria-pressed') === 'true'"
                    )
                    mobile_alarm.click()
                    self.assertEqual(mobile_alarm.get_attribute("aria-pressed"), "false")

                    # Mobile screen signal must also return to its initial state.
                    mobile_signal = mobile_page.locator("#signalButton")
                    mobile_signal_label = mobile_signal.inner_text()
                    mobile_signal.click()
                    self.assertNotEqual(mobile_signal.inner_text(), mobile_signal_label)
                    mobile_signal.click()
                    self.assertEqual(mobile_signal.inner_text(), mobile_signal_label)
                finally:
                    mobile_context.close()


    def test_geolocation_error_states_are_recoverable(self):
        # Simulate browser geolocation errors across all engines; never request real GPS.
        cases = (
            (1, "Autorisation de position refusée"),
            (2, "momentanément indisponible"),
            (3, "trop de temps"),
        )
        for browser_name in ("chromium", "firefox", "webkit"):
            for error_code, expected_message in cases:
                with self.subTest(browser=browser_name, geolocation_error=error_code):
                    context = self.create_context(browser_name=browser_name)
                    mock_script = """(() => {
                      Object.defineProperty(navigator, 'geolocation', {
                        configurable: true,
                        value: {
                          getCurrentPosition(success, error) {
                            window.setTimeout(() => error({code: ERROR_CODE_PLACEHOLDER, message: 'Mock geolocation error'}), 0);
                          }
                        }
                      });
                    })();""".replace("ERROR_CODE_PLACEHOLDER", str(error_code))
                    context.add_init_script(mock_script)
                    try:
                        page = self.open_page(context)
                        page.locator("#language").select_option("fr")
                        button = page.locator("#locateButton")
                        button.click()
                        page.get_by_text(expected_message, exact=False).wait_for(timeout=3000)
                        self.assertFalse(button.is_disabled(), "Location button must be usable after an error")
                        self.assertNotIn("Position obtenue", page.locator("#locationStatus").inner_text())
                    finally:
                        context.close()

    def test_geolocation_unsupported_state_is_recoverable(self):
        for browser_name in ("chromium", "firefox", "webkit"):
            with self.subTest(browser=browser_name):
                context = self.create_context(browser_name=browser_name)
                context.add_init_script(
                    """(() => {
                      Object.defineProperty(navigator, 'geolocation', {
                        configurable: true,
                        value: undefined
                      });
                    })();"""
                )
                try:
                    page = self.open_page(context)
                    page.locator("#language").select_option("fr")
                    button = page.locator("#locateButton")
                    button.click()
                    page.get_by_text("n’est pas prise en charge", exact=False).wait_for(timeout=3000)
                    self.assertFalse(button.is_disabled(), "Location button must be usable when geolocation is unsupported")
                finally:
                    context.close()


    def test_camera_permission_denial_is_handled_without_device_access(self):
        # Camera/microphone denial is simulated; no physical device is opened.
        denial_mock = """(() => {
          Object.defineProperty(navigator, 'mediaDevices', {
            configurable: true,
            value: {
              getUserMedia() {
                return Promise.reject(new DOMException('Mock permission denied', 'NotAllowedError'));
              }
            }
          });
        })();"""
        for browser_name in ("chromium", "firefox", "webkit"):
            for selector in ("#photoButton", "#recordButton"):
                with self.subTest(browser=browser_name, control=selector):
                    context = self.create_context(browser_name=browser_name)
                    context.add_init_script(denial_mock)
                    try:
                        page = self.open_page(context)
                        page.locator("#language").select_option("fr")
                        page.locator(selector).click()
                        page.get_by_text("Accès caméra impossible", exact=False).wait_for(timeout=3000)
                        self.assertFalse(page.locator(selector).is_disabled())
                        self.assertFalse(page.locator("#cameraPreview").is_visible())
                    finally:
                        context.close()


    def test_camera_api_unavailable_is_handled_without_device_access(self):
        # Simulate browsers without MediaDevices; never open a physical camera.
        unsupported_mock = """(() => {
          if (navigator.mediaDevices) {
            Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {
              configurable: true,
              value: undefined
            });
          } else {
            Object.defineProperty(navigator, 'mediaDevices', {
              configurable: true,
              value: {}
            });
          }
        })();"""
        for browser_name in ("chromium", "firefox", "webkit"):
            for selector in ("#photoButton", "#recordButton"):
                with self.subTest(browser=browser_name, control=selector):
                    context = self.create_context(browser_name=browser_name)
                    context.add_init_script(unsupported_mock)
                    errors = []
                    try:
                        page = self.open_page(context)
                        page.on("pageerror", lambda error: errors.append(str(error)))
                        page.locator("#language").select_option("fr")
                        page.locator(selector).click()
                        page.get_by_text("Caméra indisponible dans ce navigateur", exact=False).wait_for(timeout=3000)
                        self.assertFalse(page.locator(selector).is_disabled())
                        self.assertFalse(page.locator("#preview").is_visible())
                        self.assertEqual(errors, [], f"{browser_name}: unexpected page errors {errors}")
                    finally:
                        context.close()


    def test_alarm_audio_unavailable_fails_safely(self):
        # Simulate browsers without Web Audio; the alarm must remain stopped and reusable.
        for browser_name in ("chromium", "firefox", "webkit"):
            with self.subTest(browser=browser_name):
                context = self.create_context(browser_name=browser_name)
                errors = []
                try:
                    page = self.open_page(context)
                    page.on("pageerror", lambda error: errors.append(str(error)))
                    page.evaluate("window.AudioContext = undefined; window.webkitAudioContext = undefined")
                    button = page.locator("#alarmButton")
                    button.click()
                    self.assertEqual(button.get_attribute("aria-pressed"), "false")
                    self.assertFalse(button.is_disabled())
                    self.assertEqual(errors, [], f"{browser_name}: unexpected page errors {errors}")
                finally:
                    context.close()



if __name__ == "__main__":
    unittest.main(verbosity=2)
