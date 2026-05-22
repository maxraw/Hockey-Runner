# Native iOS tracker plan

Target pipeline:

```text
Native iOS camera
→ Vision/CoreML puck detector
→ bbox puck
→ normalized field coordinates
→ motion classifier
→ React Native WebSocket bridge
→ relay / second device
→ game WebView
```

Phase 1:
- Keep existing WebView game.
- Keep React Native WebSocket bridge.
- Add native PuckTrackerView as experimental tracker screen.

Phase 2:
- Add 4-corner field calibration to native view.
- Convert bbox center to normalized field coordinates.

Phase 3:
- Use PuckMotionEngine to convert x/y into left/right/jump/duck.

Phase 4:
- Add Bonjour discovery for _hockeyrunner._tcp and remove manual IP entry.
