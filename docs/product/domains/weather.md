---
title: Sky
status: draft
summary: Conditions and forecasts for home and saved places, severe-weather alerts, sunrise, sunset and moon computed on-device, the default Garden widget, and the weather and ephemeris layers Almanac draws. Id `weather`, Phase 1.
read-this-if: You are working on weather, forecasts, alerts, sun and moon, or anything that plans around them.
depends-on: [substrate/registry, substrate/primitives, substrate/signals-notifications, substrate/shell, substrate/ai]
updated: 2026-09-29
---

## 1. Purpose

Sky knows what the sky is doing where the owner is and where they are going, and lets the rest of Eden plan around it. It owns weather and ephemeris; Almanac and the Garden consume them (D-19). The one thing it must do well: **show today's weather and light on the Garden with no setup beyond the home Place.**

## 2. User stories

- MVP: See current conditions and the next hours for home on the Garden the moment onboarding ends.
- MVP: See the week's outlook, as the calendar week from my week start (D-58).
- MVP: See the details I plan around: feels-like, humidity, wind, UV, pressure, visibility, air quality, pollen and mold.
- MVP: See sunrise, sunset, golden hour, moon phase and illumination for today.
- MVP: Be told about severe weather even during quiet hours.
- MVP: Get a "good day for" hint: an outdoor workout, airing the house, a frost warning.
- MVP: Ask whether it will rain during my run, and have the answer use my plans.
- Later: See forecasts for saved venues and trip destinations.
- Later: Use precise device location when travelling.

## 3. Entities

| entity | key fields | tier | links out |
|---|---|---|---|
| `forecast` | place (link), timezone, current reading, hourly and daily series (a day is observed or forecast), provider, attribution, fetched at; provider-neutral (D-56); a mirror keyed by source + place, never synced or exported | T0 | place |
| `air-quality` | place, source, index (US and European), pollutants, fetched at; a mirror (D-59) | T0 | place |
| `allergens` | place, source, pollen by kind, mold, fetched at; a mirror (D-59) | T0 | place |
| `alert` | place, source, severity, headline, window; a mirror | T0 | place |
| `ephemeris` | place, date, sunrise, sunset, golden hours, moon phase and illumination; computed on-device and cached | T0 | place |

Sky has no Location entity. It reads Places of kinds `home`, `venue` and, later, `trip-destination`. The measurement system, week start and clock are General settings (D-58); favourite locations are settings (D-27).

## 4. Facts

Written: none. Read: `home-area` (substrate, T1) for the Gardener; the `home` Place geo is read locally for computation and never sent to a model.

## 5. Gardener tools and guardrails

| tool | reads | access | confirm |
|---|---|---|---|
| `forecast` | `forecast`, `home-area`, `venue` | read | none |
| `rain-during-plan` | `forecast`, `home-area`, `workout-session`, `local-event`, `outing` | read | none |
| `sun-and-moon` | `ephemeris` | read | none |

Never-do list: never sends coordinates finer than city level (D-60) to a model or a provider unless a precise-location grant exists; keeps no location history; never claims certainty beyond the provider's own confidence.

## 6. Surfaces

**Desktop views (Phase 1)**: the Sky view with now, hours, the week, details, air quality, allergens, sun and moon, active alerts behind a button in the header that shows only while one is active (a popover lists them, and each can be dismissed for as long as it is issued), the sources' attribution, the header's motif (D-62: the wind now as a flow field, north up, with a small compass at its foot whose needle points the way the wind blows and whose tooltip says it is one reading for the place, not a map), the sun on its wave in the now block, and a location switcher over home and saved venues, with "Change home", a search by name, until Places exist (D-38).

**Mobile (Phase 2)**: the same view as a tab candidate; Sky is pinned by default.

**Garden widgets**: `weather-now` (S, M; default on), `week-outlook` (M), `sun-moon` (S), `good-day-for` (S).

**Palette**: go to Sky, "weather in <place>".

**Quick actions**: none. **Capture sources**: none.

**Day annotations for Almanac** (Phase 2): `weather` (a daily icon with high and low) and `ephemeris` (sunrise, sunset, moon phase glyph).

## 7. Kinds, signals, notifications, intents

Kinds: none.

Signals: `weather.alert`, `weather.rain-before-plan` (a rule over `event.upcoming` and the forecast), `weather.frost`.

| notification | channel | cadence | default |
|---|---|---|---|
| severe alert | OS; breaks quiet hours | on issue | on |
| rain before plans | in-app | evening before, morning of | on |
| frost warning | in-app | evening before | on |

Intents: none.

## 8. Integrations

| integration | phase | access | sends | receives |
|---|---|---|---|---|
| Open-Meteo | 1 | none needed | rounded coordinates | hourly and daily forecast, the past days of the week |
| Open-Meteo Air Quality | 1 | none needed | rounded coordinates | air quality index and pollutants; pollen where covered (Europe) |
| NWS alerts | 1 | none needed | rounded coordinates | active alerts (US) |
| Open-Meteo Geocoding | 1 | none needed | the place name the owner types, the language | places by name, to change home |
| device location, precise | 3 | per device | | coordinates for a travelling forecast |
| Apple WeatherKit (macOS, iOS) | 1 | the app's entitlement (D-57) | rounded coordinates | forecast |
| AccuWeather | later | key | rounded coordinates | pollen and mold |

The provider is the owner's choice (D-56); air quality and allergens are supplementary sources (D-59). Forecasts are held in metric and converted for display. The refresh cadence is every three hours on the scheduler and on demand.

## 9. Settings

Measurement system, week start and clock (from General, D-58), the forecast provider (in Integrations), refresh cadence, alert sources, "good day for" hints on or off, saved locations, which Places to show.

## 10. Non-goals and open questions

Non-goals: radar and satellite maps, historical climate data, agriculture-grade forecasting.

Open: none.

## Registry rows

Appended under Sky: entities `forecast` T0, `alert` T0, `ephemeris` T0, `air-quality` T0, `allergens` T0. No facts, no kinds.
