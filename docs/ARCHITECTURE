# arrcc architecture

## Current browser layer

The PWA can collect, with explicit permission:
- GPS coordinates;
- browser/device language;
- network connection type when exposed by the browser;
- compass/motion data where available;
- camera photo/video;
- local incident notes;
- a local map centered on the user;
- manually supplied RF observations.

It cannot access raw Wi-Fi CSI from ordinary browser JavaScript.

## RF layer

A future sensor can publish observations such as:

```json
{
  "sensorId": "esp32-01",
  "timestamp": 0,
  "position": {"lat": 0, "lon": 0},
  "confidence": 0.0,
  "type": "motion",
  "value": "activity"
}
```

The web client treats these as **sensor observations**, not as proof of an attacker or hazard.

## Safety model

Recommended states:

- `normal`
- `attention`
- `danger`
- `emergency`

A state transition should be explainable and auditable. Never classify a named person or criminal act from RF alone.

## Emergency actions

The current UI provides:
- local alarm;
- flashlight/strobe attempt;
- emergency call buttons using `tel:`;
- trusted-contact email report;
- copyable incident summary.

A production native application can integrate OS-specific emergency APIs after legal and platform review.

## Evidence

Photos/videos are captured locally by the browser. The Apps Script relay can accept a small image attachment, but large video uploads should use a proper authenticated object-storage backend. Do not put secrets in client-side JavaScript.

## Google Sites

Google Sites is a mirror/vitrine. The recommended arrangement is:

`GitHub Pages PWA → embedded in Google Sites`

The source of truth remains GitHub.
