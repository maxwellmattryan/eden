# Fixtures

- `open-meteo.json`: a response captured from Open-Meteo for Austin on 2026-09-29, with the hours trimmed.
- `weatherkit.json`: the shape the Swift bridge returns (`src-tauri/swift/EdenWeatherKit`), written by hand from the
  same day's figures. It is not a capture: WeatherKit answers only a signed build with the entitlement. Replace it
  with a capture once one exists. The Rust crate's tests read this file too.
