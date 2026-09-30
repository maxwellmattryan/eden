---
title: Meadow
status: draft
summary: Places and listings near you on a map, filtered by vibe, with favourites, collections, visits, and a one-tap path from "let's go" to a calendar event. Id `places`, Phase 3.
read-this-if: You are working on the map, place discovery, vibes, favourites, listings or outings.
depends-on: [substrate/registry, substrate/primitives, substrate/integrations, substrate/grants, substrate/shell, substrate/ai]
updated: 2026-09-30
---

## 1. Purpose

Meadow is the open space beyond the garden: where to go, what is happening, and what the owner thought of it afterwards. Places and listings are one domain because they share the map, the vibe taxonomy, favourites and the path into the calendar (D-6). The one thing it must do well: **answer "somewhere cozy and alcohol-free tonight" with three good options on a map.**

## 2. User stories

- MVP: See saved places and provider results as pins on a map, filtered by vibe, category, price, alcohol-free and distance from home.
- MVP: Open a place to see images, rating, hours, my notes and my visits.
- MVP: Keep favourites and collections ("coworking spots", "date nights").
- MVP: See listings this weekend that match my vibes; mark interested or going and have it appear in Almanac.
- MVP: Log a visit with a note and a rating.
- MVP: Ask the Gardener for suggestions that respect my allergies and preferences.
- Later: Save a place or listing from the share sheet.
- Later: Browse around a trip destination from Trails.

## 3. Entities

| entity | key fields | tier | links out |
|---|---|---|---|
| `place-profile` | an overlay on a `venue` Place: vibes, price, alcohol-free, external rating, images, favourite, provider ids, notes | T1 | Place |
| `vibe` | taxonomy row: cozy, industrial, romantic, lively, quiet, outdoors, work-friendly, kid-friendly, custom | T0 | |
| `collection` | name, places | T1 | Places |
| `listing` | title, venue Place, start, end, category, price, url, source + external id; a mirror | T0 | Place |
| `visit` | place, date, note, rating | T1 | Place |

Places themselves are the substrate primitive; provider places are mirrors and the profile is their overlay (D-32). Marking a listing **interested** creates a tentative `outing` Event, drawn dashed in Almanac; **going** confirms it. The Event snapshots title, time, place name and geo so it renders on a device that never fetched the listing (D-37).

## 4. Facts

Written: `favorite-vibe` T0.

Read: `home-area` (substrate, T1), `dietary-preference` (Hearth, T1; includes alcohol-free), `allergy` (Hearth, T2) for restaurant suggestions.

## 5. Gardener tools and guardrails

| tool | reads | access | confirm | grade |
|---|---|---|---|---|
| `suggest-places` | `place-profile`, `venue`, `vibe`, `favorite-vibe`, `home-area`, `dietary-preference`, `allergy` | read; provider queries under the location grant | none | `standard` |
| `suggest-listings` | `listing`, `favorite-vibe`, `home-area`, `local-event`, `outing` | read | none | `standard` |
| `add-to-calendar` | `listing` | write, through the substrate `createEvent` | confirm sheet | plain |

Never-do list: never sends coordinates finer than city level to a model or provider without a precise-location grant; keeps no location history; never books, reserves or publishes reviews.

## 6. Surfaces

**Desktop views (Phase 3)**: Map (pins, filter bar, a list and detail split), Place detail, Listings (this weekend, filters), Collections, Visits.

**Mobile (Phase 3)**: map, nearby, listings.

**Garden widgets**: `nearby-favorites` (M), `upcoming-listings` (M).

**Palette**: "find a cozy cafe", open a place, go to Meadow.

**Quick actions**: none. **Capture sources**: a shared URL becomes a place or a listing (Phase 3).

## 7. Kinds, signals, notifications, intents

Kinds: `outing` (event, T1).

Signals: `listing.matched`, `visit.logged`.

| notification | channel | cadence | default |
|---|---|---|---|
| matching listings this week | in-app | weekly, Sunday | on |
| outing reminder | OS, through the Event | per outing | on |

Intents handled: `places.open`. Intents sent: none.

## 8. Integrations

| integration | phase | access | sends | receives |
|---|---|---|---|---|
| map tiles | 3 | key | tile requests | tiles |
| places provider | 3 | read | city-level coordinates, filters | places as mirrors |
| listings providers | 3 | read | city-level coordinates, date window | listings as mirrors |
| device location, precise | 3 | per device | | coordinates for "near me now" |

Provider choice and cost are OQ-4.

## 9. Settings

Home radius, default vibes, providers on or off, precise location on or off, map style (follows the theme).

## 10. Non-goals and open questions

Non-goals: reservations and bookings, publishing reviews, social sharing, turn-by-turn navigation.

Open: OQ-4.

## Registry rows

Appended under Meadow: fact `favorite-vibe` T0; entities `place-profile` T1, `vibe` T0, `collection` T1, `listing` T0, `visit` T1; kind `outing` (event, T1).
