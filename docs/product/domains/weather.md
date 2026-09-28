---
title: Sky
status: draft
summary: Conditions and forecasts for home and saved places, severe-weather alerts, sunrise, sunset and moon computed on-device, the default Garden widget, and the weather and ephemeris layers Almanac draws. Id `weather`, Phase 1.
read-this-if: You are working on weather, forecasts, alerts, sun and moon, or anything that plans around them.
depends-on: [substrate/registry, substrate/primitives, substrate/signals-notifications, substrate/shell, substrate/ai]
updated: 2026-09-27
---

## 1. Purpose

Sky knows what the sky is doing where the owner is and where they are going, and lets the rest of Eden plan around it. It owns weather and ephemeris; Almanac and the Garden consume them (D-19). The one thing it must do well: **show today's weather and light on the Garden with no setup beyond the home Place.**

## 2. User stories

- MVP: See current conditions and the next hours for home on the Garden the moment onboarding ends.
- MVP: See the week's outlook.
- MVP: See sunrise, sunset, golden hour, moon phase and illumination for today.
- MVP: Be told about severe weather even during quiet hours.
- MVP: Get a "good day for" hint: an outdoor workout, airing the house, a frost warning.
- MVP: Ask whether it will rain during my run, and have the answer use my plans.
- Later: See forecasts for saved venues and trip destinations.
- Later: Use precise device location when travelling.

## 3. Entities

| entity | key fields | tier | links out |
|---|---|---|---|
| `forecast` | place (link), hourly and daily series, provider, fetched at; a mirror keyed by source + place, never synced or exported | T0 | place |
| `alert` | place, source, severity, headline, window; a mirror | T0 | place |
| `ephemeris` | place, date, sunrise, sunset, golden hours, moon phase and illumination; computed on-device and cached | T0 | place |

Sky has no Location entity. It reads Places of kinds `home`, `venue` and, later, `trip-destination`. Units and favourite locations are settings (D-27).

## 4. Facts

Written: none. Read: `home-area` (substrate, T1) for the Gardener; the `home` Place geo is read locally for computation and never sent to a model.

## 5. Gardener tools and guardrails

| tool | reads | access | confirm |
|---|---|---|---|
| `forecast` | `forecast`, `home-area`, `venue` | read | none |
| `rain-during-plan` | `forecast`, `home-area`, `workout-session`, `local-event`, `outing` | read | none |
| `sun-and-moon` | `ephemeris` | read | none |

Never-do list: never sends coordinates finer than city level to a model or a provider unless a precise-location grant exists; keeps no location history; never claims certainty beyond the provider's own confidence.

## 6. Surfaces

**Desktop views (Phase 1)**: the Sky view with now, hours, days, sun and moon, active alerts, and a location switcher over home and saved venues.

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
| Open-Meteo | 1 | none needed | rounded coordinates, units | hourly and daily forecast |
| NWS alerts | 1 | none needed | rounded coordinates | active alerts (US) |
| device location, precise | 3 | per device | | coordinates for a travelling forecast |
| Apple WeatherKit | later | key | rounded coordinates | forecast |

Provider choice is OQ-15. The refresh cadence is every three hours on the scheduler and on demand.

## 9. Settings

Units (from General), refresh cadence, alert sources, "good day for" hints on or off, saved locations, which Places to show.

## 10. Non-goals and open questions

Non-goals: radar and satellite maps, historical climate data, agriculture-grade forecasting.

Open: OQ-15.

## Registry rows

Appended under Sky: entities `forecast` T0, `alert` T0, `ephemeris` T0. No facts, no kinds.
