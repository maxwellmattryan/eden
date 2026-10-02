---
title: Meadow
status: draft
summary: Places and listings near you on a map, filtered by vibe, with favourites, collections, visits, and a one-tap path from "let's go" to a calendar event. Id `places`, Phase 3.
read-this-if: You are working on the map, place discovery, vibes, favourites, listings or outings.
depends-on: [substrate/registry, substrate/primitives, substrate/integrations, substrate/grants, substrate/shell, substrate/ai]
updated: 2026-10-01
---

## 1. Purpose

Meadow is the open space beyond the garden: where to go, what is happening, and what the owner thought of it afterwards. Places and listings are one domain because they share the map, the vibe taxonomy, favourites and the path into the calendar (D-6). The one thing it must do well: **answer "somewhere cozy and alcohol-free tonight" with three good options on a map.**

## 2. User stories

- MVP: See saved places and found places as pins on a map, filtered by vibe, category, price, alcohol-free and distance from home.
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
| `place-profile` | what Meadow keeps about a saved `venue` Place: vibes, price, alcohol-free, favourite, notes, its public address in parts (D-138) and its part of town, provider ids, hours and rating with their source, its picture, where it was saved from | T1 | Place (`about`) |
| `vibe` | a custom vibe: label and facet. The bundled vibes are code, not rows | T0 | |
| `collection` | name, places, note | T1 | Places |
| `visit` | place, day, note, rating | T1 | Place (`at`) |
| `place-suggestion` | a place found and not saved: the candidate, the query that found it, dismissed or not; a mirror | T1 | |
| `listing` | title, venue, start, end, category, price, url, why it fits, sources; a mirror | T0 | Place |
| `place-detail` | one detail slot of a place from one source, with its status and fetch time; a mirror | T0 | |

Which rows are the owner's and which are mirrors of this device is D-133: a saved place is a `venue` Place with its profile, and everything found and not saved is a mirror, swept after seven days. A place's picture is a `place-photo` Attachment (T1). A vibe belongs to one of four facets:

| facet | bundled vibes |
|---|---|
| purpose | deep work, work-friendly, read, meet people, catch up, date, unwind, celebrate |
| mood | calm, cozy, lively, buzzing, romantic, playful |
| setting | quiet, spacious, outdoors, natural light, intimate, industrial, late-night |
| crowd | solo-friendly, locals, laptop crowd, social, kid-friendly |

Marking a listing **interested** creates a tentative `outing` Event, drawn dashed in Almanac; **going** confirms it. The Event carries the listing's source and id and snapshots title, time, place name and geo so it renders on a device that never fetched the listing (D-37).

## 4. Facts

Written: `favorite-vibe` T0.

Read: `home-area` (substrate, T1), `dietary-preference` (Hearth, T1; includes alcohol-free), `allergy` (Hearth, T2) for restaurant suggestions.

## 5. Gardener tools and guardrails

| tool | reads | access | confirm | grade |
|---|---|---|---|---|
| `suggest-places` | `place-profile`, `venue`, `vibe`, `favorite-vibe`, `home-area`, `dietary-preference`, `allergy` | read; searches the web (D-132) | none | `standard`, needs `search` |
| `suggest-listings` | `listing`, `favorite-vibe`, `home-area`, `local-event`, `outing` | read; searches the web (D-132) | none | `standard`, needs `search` |
| `import-places` | `vibe`, `favorite-vibe` | write-draft; tags a pasted list of names with vibes, no search | none | `standard` |
| `add-to-calendar` | `listing` | write, through the substrate `createEvent` (D-136) | confirm sheet | plain |

How a search runs, what it costs and what it may not do is D-132; the page and picture of a place are D-135, and the picture the owner chooses for one, from a file or a link, is D-144; the weekly listings search nobody pressed is D-134.

What a model receives: the filter, `home-area` or the area the owner typed, the names of saved places and the dietary facts under their grants. Never coordinates. A candidate gets a pin only if the geocoder finds it inside the search area; one it cannot find is listed as "could not be placed". Nothing is saved unasked.

Never-do list: never sends coordinates finer than city level to a model or provider without a precise-location grant; keeps no location history; never books, reserves or publishes reviews; never fetches an address a model composed.

## 6. Surfaces

**Desktop views**: Map (a large map, the filter panel, a results list, the place detail; saved pins and suggestion pins; "Find more" through the Gardener; bulk import by paste), Listings (this weekend, interested and going), Collections (a place is dragged into one, D-106), Visits. The page's shape is D-129. The filter panel holds the four facets of vibes, category, price, distance, collection, alcohol-free, open now, favourites and one line of free text; filtering saved places is local, with no key and no network. Forms are sheets (D-95): the place's form, with the address form of D-137, and the visit's. The home pin opens a card with the home's address and "Change home" (D-143).

**Import**: a pasted list of names (a note's bullets, numbers or checkboxes) is parsed on the device, each name geocoded, optionally tagged with vibes by the Gardener, reviewed row by row and saved as one change. A name the geocoder cannot find is placed by a click on the map. It works with no key.

**Mobile**: one page with three tabs, Map, Nearby and Listings, as read surfaces over the store the desktop shares. The map is the full page with saved pins and the home pin, the same seam as the desktop's (D-129); where the map cannot start in the webview, the pins stand on plain ground. Nearby is the saved places as a list with how far each is. The filter is a sheet (open now, alcohol-free, favourites and the four facets) and a picked place is a sheet from the foot: what it is, its hours and where they were read, its vibes, notes and visits. The phone writes two things, each with an undo: favourite, and a visit with a rating and a note. Listings shows what the desktop found, each with its mark and a link out; marking interested or going is the desktop's. There is no discovery, no import and no listings search until the Gardener's runtime is on the phone (#19), and the pages say nothing of one. The phone does not ask the device where it is: distance is from home, as on the desktop.

**Garden widgets**: `nearby-favorites` (M), `upcoming-listings` (M), both in the default Garden.

**Header motif** (D-123): seeds drifting on a light wind. How many drift follows how many places are saved; the share in the accent is the share that are favourites.

**Palette**: `places.open` is declared; nothing dispatches it until the palette runs intents (#23).

**Quick actions**: none. **Capture sources**: a shared URL becomes a place or a listing (later; it goes through the crate's page fetch into the import sheet's review rows).

## 7. Kinds, signals, notifications, intents

Kinds: `outing` (event, T1), `place-photo` (attachment, T1).

Signals: `listing.matched`, `visit.logged`.

| notification | channel | cadence | default |
|---|---|---|---|
| matching listings this week | in-app | weekly, Sunday (D-134) | on |
| outing reminder | OS, through the Event | per outing; declared, no signal yet (#28) | on |

Intents handled: `places.open`. Intents sent: none.

## 8. Integrations

Settled by D-128; what each receives is D-131.

| integration | access | sends | receives |
|---|---|---|---|
| map tiles and label glyphs (OpenFreeMap) | no key | tile requests for where the owner looks | vector tiles |
| geocoder (Photon) | no key | a name and a rounded point | places from OpenStreetMap |
| hours (Overpass) | no key | a public OpenStreetMap id | that object's tags |
| discovery and listings (the Gardener's provider, web search) | the owner's key | the filter and a city-level area | cited notes, read into candidates |
| a place's page and picture | none | the request for that page (D-135) | the page, its picture |
| device location, precise | not built on either app; "near me" is distance from home or the searched area | | coordinates for "near me now", later (`engineering/meadow.md`, Handoffs) |

Each is behind a seam (`engineering/meadow.md`), so another source is additive. A keyed place card is OQ-24.

## 9. Settings

Under Settings → Integrations: discovery on or off, each detail source on or off, the weekly listings search on or off, which maps app "Open in Maps" uses. The search area and the filters are per device. The map's style follows the theme.

## 10. Non-goals and open questions

Non-goals: reservations and bookings, publishing reviews, social sharing, turn-by-turn navigation, a location history.

Open: OQ-24.

## Handoffs

- **Share-sheet capture** (Phase 3 capture): a shared URL goes through the crate's page fetch (D-88) into the import sheet's review rows. The page's name and address come from the readers in `@eden/shared/api/html.ts`; an import row holds a name and a note today (`ImportName` in `packages/shared/src/domains/places/import.ts`, `ImportRow` in the desktop's `import.svelte.ts`) and gains the address it came from, which a saved place already keeps under `savedFrom`.
- **Trails**: a `trip-destination` Place is a `SearchArea` (`types.ts`): the area of kind `named` takes a label and a point, so browsing around a destination is passing it one. Nothing in the views or the store changes.
- **The phone** (#19): discovery, import and the listings search need the Gardener's runtime there; the store's sources are given at bind time, so the phone's views do not change. Marking a listing and device location are not on the phone either.

## Registry rows

Appended under Meadow: fact `favorite-vibe` T0; entities `place-profile` T1, `vibe` T0, `collection` T1, `listing` T0, `visit` T1, `place-suggestion` T1, `place-detail` T0; kinds `outing` (event, T1), `place-photo` (attachment, T1).
