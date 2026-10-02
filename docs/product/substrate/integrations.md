---
title: Integrations
status: draft
summary: The connector lifecycle, the catalog of every external service Eden will talk to with its phase and default access, per-device connections and their visible states, secrets, status surfaces, and failure handling.
read-this-if: You are adding or designing anything that talks to a service outside the device.
depends-on: [grants, privacy]
updated: 2026-10-01
---

## Lifecycle

**discover** (the catalog in Settings → Integrations, or a domain's empty state) → **grant** (scopes and access, synced as workspace policy) → **connect** (OAuth or key entry, on this device) → **sync or poll** (mirrors refresh on the connector's cadence) → **status** (healthy, stale, expired, failed, shown in the status bar) → **disconnect** (delete mirrors; ask about overlays) and **purge**.

## Catalog

| integration | domain | auth | default access | phase |
|---|---|---|---|---|
| Anthropic, OpenAI, Google AI (bring your own key) | Gardener | API key, T3, per device | n/a | 1 |
| Ollama (desktop only) | Gardener | local URL | n/a | 2 |
| Open-Meteo | Sky | none | read | 1 |
| Open-Meteo Air Quality | Sky | none | read | 1 |
| Open-Meteo Geocoding | Sky | none | read | 1 |
| NWS alerts (US) | Sky | none | read | 1 |
| bundled holiday dataset | Almanac | none | n/a | 2 |
| Google Calendar | Almanac | OAuth | read, per calendar | 2 (write 3) |
| ICS subscriptions | Almanac | URL | read | later |
| Apple WeatherKit (macOS and iOS, D-57) | Sky | the app's entitlement | read | 1 |
| AccuWeather (D-59) | Sky | API key, T3, per device | read | later |
| OpenFreeMap, map tiles and label glyphs (D-128, D-131) | Meadow | none | read | 3 |
| Photon, a geocoder over OpenStreetMap (D-128) | Meadow | none | read | 3 |
| Overpass, a place's hours from OpenStreetMap (D-128) | Meadow | none | read | 3 |
| the AI provider's web search, for places and listings (D-128, D-132) | Meadow, through the Gardener | the Gardener's key | read | 3 |
| Google's map, places or place card (OQ-24) | Meadow | API key, T3, per device | read | later |
| device location (precise) | Sky, Meadow | OS | per device | 3, not built; Sky and Meadow use the rounded home until then (Handoffs) |
| camera | Hearth, Toolbench | OS | per device | 1 |
| OS notifications | substrate | OS | per device | 1 |
| share sheet in (URLs, photos) | Hearth, Toolbench, Leaves | OS | n/a | 2 |
| HealthKit, Health Connect | Vigor | OS | read | later |
| Strava | Vigor | OAuth | read | later |
| GitHub | Toolbench | OAuth | read; `act-external` for issues, confirmed each time | later |
| grocery export (HEB, Instacart) | Hearth | file or deep link | export only; ordering would be `act-external` | later |
| Gmail, label-scoped | Trails, Hearth | OAuth | read on chosen labels only | later |
| Plaid or SimpleFIN | Orchard | token | read | later |
| Oura | Wellspring | OAuth | read | later |
| sync backend (Crate's vendor-agnostic trait, Firebase first) | substrate | Google or Apple sign-in | n/a | 3 |

## Per-device connections

Grants are workspace policy and sync. Tokens and keys are T3 and stay on the device that entered them until Phase 3 vault sync (D-37). Two states follow:

| state | shown | fix |
|---|---|---|
| granted, not connected here | grey chip in the status bar, banner in the domain | one-tap connect on this device |
| Gardener configured, no key on this device | grey Gardener chip | one-tap key entry, or choose a local model on desktop |

Device-capability grants (camera, location, notifications, HealthKit) are also per device by nature and are requested in context.

## Secrets

Keys and tokens live in the OS keychain (macOS Keychain, iOS Keychain, Android Keystore, Windows Credential Manager, the Linux secret service). They never appear in exports, diagnostics, the audit log or the egress ledger beyond "key present".

## Status surfaces

- The status bar shows one chip per connected integration with a colour for healthy, stale and failed.
- Settings → Integrations lists the catalog with state, last refresh, scopes, and connect, reconnect and disconnect actions.
- A domain that depends on a failed integration shows a banner with the same actions in place.

## Failure handling

An expired or revoked token marks mirrors stale rather than deleting them, retries with backoff, and raises `integration.failed` once. Reconnecting resumes without data loss because overlays are keyed by external id. A provider outage degrades the domain to its cached mirrors with a "last updated" note.

## What goes out and what comes in

Each connector documents, in its domain doc, the request parameters it sends (rounded coordinates for weather, a calendar id and time window for Google) and the mirror rows it creates. The general rules are in `substrate/privacy.md`.

## Handoffs

- **Google's place card.** Meadow's details come from sources registered for a slot, and the `card` slot is declared with no source. A Google source is a `DetailSource` on that slot, with its hosts in the CSP and its key in the keychain; how the key reaches it is OQ-24. Neither the views nor the store change (`engineering/meadow.md`, Handoffs).
- **Precise location.** Not built on desktop or mobile: Meadow's map opens on the rounded home and a search looks around home or a place the owner named (D-131). What remains: `tauri-plugin-geolocation` under the crate's `mobile` feature, the permission strings of each platform, the `location-precise` device-capability grant (the id exists in the grants store; no manifest declares it), and a `device` kind on Meadow's `SearchArea` beside `home` and `named`. Details are in `engineering/meadow.md`, Handoffs.

## Non-goals

Scraping services without an API, two-way sync beyond what the catalog lists, and any connector whose only purpose is growth or analytics.
