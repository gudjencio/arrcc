# arrcc RF sensor layer

This directory is intentionally a research interface, not a weapon-detection system.

Recommended research path:

1. ESP32 CSI collection.
2. Timestamp and normalize CSI.
3. Extract amplitude/phase features.
4. Detect changes/motion.
5. Calibrate multiple sensors.
6. Estimate location/occupancy.
7. Send signed observations to an authenticated arrcc backend.
8. Fuse observations with non-RF signals.

The browser must not be treated as a raw CSI receiver.
