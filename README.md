# arrcc — aid rescue, resilience and community coverage

A multilingual, safety-oriented web/PWA prototype with an emergency-first interface, location display, emergency call links, optional local evidence capture, trusted contacts, and a Google Apps Script email relay.

## Important safety limits

- The browser cannot turn ordinary Wi-Fi/4G/5G into a reliable radar or prove that a person or place is dangerous. The displayed circle is GPS accuracy, not RF coverage.
- Emergency call links open the device's normal phone flow; arrcc does not silently call or dispatch emergency services.
- The email relay sends a user-submitted incident report from the Google account that owns the Apps Script deployment to the ARRCC inbox and any explicitly configured, allow-listed recipients. It is not connected to police/fire dispatch. Do not treat this prototype as a certified emergency service.
- Country selection for email routing uses the country code derived from GPS reverse geocoding. Country-specific emergency-service email addresses are **not prefilled globally**: many services do not publish a monitored emergency email, and guessed addresses could silently fail. Only add an address after verifying it on the relevant authority's official website. Direct local emergency calls remain the primary route.
- Camera, location, audio and flashlight functions require device/browser support and permissions.

## Languages

The current complete interface packs are English, French, Spanish, German, Portuguese, Italian, Dutch, Russian, Japanese, Simplified Chinese and Arabic. The language selector intentionally lists only language packs that have full interface coverage; other languages from the wider roadmap are not yet complete and should be added only after their translations are reviewed.

## Deploy the web app on GitHub Pages

1. Upload this repository to GitHub.
2. Enable GitHub Pages using the workflow in `.github/workflows/pages.yml` (or publish the contents of `web/`).
3. Open the HTTPS site and grant location/camera permissions only if desired.
4. For a Google Sites mirror, use **Insert → Embed → URL** and paste the GitHub Pages HTTPS URL. Google Sites is a mirror; GitHub remains the source of truth.

## RF sensing roadmap

The web browser cannot access raw Wi-Fi CSI from an ordinary laptop/phone connection. The future path is an ESP32 CSI or mmWave sensor → authenticated gateway → arrcc observation UI. The UI must treat sensor readings as uncertain observations, not proof of an attacker, weapon, assault or hazard.
