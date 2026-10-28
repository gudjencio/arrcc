# arrcc — Amergency Rescue, Resilience and Community Coverage

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

## Configure the Apps Script email relay

1. Open [Google Apps Script](https://script.google.com/) and create a project.
2. Copy the complete `apps-script/Code.gs` into the script editor. Save it.
3. In **Project Settings → Script properties**, optionally add:
   - `ARRCC_COUNTRY_RECIPIENTS_JSON`: optional JSON object mapping ISO country codes to verified official emergency-service email addresses. Example syntax: `{"FR":["official-address-you-verified@example.fr"],"DE":["verified-address@example.de"]}`. Replace examples with real, officially published addresses only; do not use placeholders in production. Countries with no configured verified address send only to ARRCC and the trusted contacts.
   - `ARRCC_DEFAULT_RECIPIENTS`: comma-separated allow-list of trusted-contact email addresses. Only requested contacts that appear in this allow-list receive reports.
   - `ARRCC_SENDER_NAME`: optional sender display name (default `ARRCC Rescue`).
   - `ARRCC_SHARED_SECRET`: optional extra check, but a secret embedded in public browser code is not truly secret.
4. Select **Deploy → New deployment → Web app**. Set **Execute as: Me** and choose access suitable for your deployment. Authorize email sending.
5. Copy the deployed Web App URL ending in `/exec`.
6. In `web/app.js`, set `CONFIG.emailRelayUrl` to that URL, commit the change, and redeploy GitHub Pages.

### ARRCC sender and inbox

Use **`arrccrescue@gmail.com`** as the Google account that owns and deploys the Apps Script web app. The script sends reports from that account; it cannot impersonate this address if deployed by another account. Sign in to Google as `arrccrescue@gmail.com`, create/deploy the script there, and grant mail permissions. The same address is the fixed ARRCC inbox.

Country-specific routing is configuration-driven: the browser submits the detected ISO country code, and Apps Script adds only addresses configured under `ARRCC_COUNTRY_RECIPIENTS_JSON`. This package does not claim to have a complete, verified directory of emergency-service email inboxes worldwide. Many authorities do not monitor email for urgent incidents. Verify every address with the authority before configuring it.

The browser uses a cross-origin `no-cors` submission because Apps Script web apps do not provide a straightforward browser-readable CORS response. The UI cannot confirm delivery. Test the relay with non-emergency sample reports before relying on it. Apps Script quotas and delivery delays may apply.

## RF sensing roadmap

The web browser cannot access raw Wi-Fi CSI from an ordinary laptop/phone connection. The future path is an ESP32 CSI or mmWave sensor → authenticated gateway → arrcc observation UI. The UI must treat sensor readings as uncertain observations, not proof of an attacker, weapon, assault or hazard.
