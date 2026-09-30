# Fixtures

- `open-meteo.json`: a response captured from Open-Meteo for Austin on 2026-09-29, with the hours trimmed; each day's strongest wind was added from a second request the same day.
- `weatherkit.json`: the shape the Swift bridge returns (`src-tauri/swift/EdenWeatherKit`), written by hand from the
  same day's figures. It is not a capture: WeatherKit answers only a signed build with the entitlement. Replace it
  with a capture once one exists. The Rust crate's tests read this file too.
- `nws-alerts.json`: three alerts captured from the National Weather Service for Texas on 2026-09-30, one of each of three severities, with the geometry and the long text fields left out.
- `nws-out-of-bounds.json`: what the service answers, with status 400, for a point outside the United States (Tokyo, the same day).
