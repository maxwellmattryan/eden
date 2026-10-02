---
title: Screens
status: draft
summary: The screen inventory for mockups: a template per screen, the shell screens, the domain screens, mobile variants, and the priority order for Claude Design.
read-this-if: You are drawing mockups or checking that a screen covers its states.
depends-on: [ux-patterns, sample-data, product/substrate/shell]
updated: 2026-10-01
---

## Screen template

Each screen below lists: id, platform, purpose, must show, primary actions, states, widgets or sample-data reference, and mockup notes. Every screen uses `design/sample-data.md` so the mockups agree with each other. A screen that has been mocked in the kit's Storybook (D-54, `engineering/ui-kit.md` "Domain mockups") names its story in the id cell; the story is the reference until the page is built.

## Shell screens

| id | platform | purpose | must show | primary actions | states | sample data |
|---|---|---|---|---|---|---|
| `splash` | both | the daily line while the workspace opens | wordmark, one line, source | none | neutral line when Sanctuary is off | Sanctuary Wednesday line |
| `onboarding-1..10` | both | first launch | step indicator, back, skip | continue | steps 5, 7, 8 are the ones that matter | Rowan's home, key entry, the two T2 grants with the "can see" chip |
| `garden`, mocked as `Domains/Garden/Garden`, built in `apps/desktop` (edit mode pending) | both | the dashboard | quick-nav row, widget grid, activity feed, daily line | edit mode, ⌘K | first run empty, edit mode, offline | the Phase 1 default layout (`gardenLayout`) |
| `garden-edit` | desktop | arrange widgets | drag handles, resize, catalog sheet by domain | done | | |
| `today`, built in `apps/desktop`, mocked as `Domains/Today/Today` (the mirror of the page, under the owner's exception to D-54) | both | tasks and routines | overdue (closed until opened), due today, routines, habits, Quick Log strip, quick-add with parsed chips | add, done, snooze, skip, tally, delete, each with undo | empty, overdue, parsed quick-add | Wednesday's tasks, the routine done and the habit at 2 / 3 |
| `palette` | desktop | ⌘K | verbs, fuzzy results, recents | run | no results | "log weight 82.4", "go to almanac" |
| `gardener-panel` | both | the assistant | thread list, conversation (Markdown replies, a sent or received time and a copy glyph under each message), "can see" chip row, model chip with budget meter, composer | send, expand chip, copy a message | no key, offline, budget exhausted, tool confirm, tool running, tool failed | the Hearth audit entry as a conversation |
| `council` | desktop | side-by-side models | columns per model, cost preview, optional chair | run | | a "which recipe tonight" question to two models |
| `capture-sheet`, built in `apps/desktop` as Hearth's capture (D-86) | both | collect a haul's sources, then verify its rows | collect: the sources as chips, the provider, the model and the cost estimate beside Read; rows: the sources' thumbnails, draft rows with location chips, a date with an estimated badge, a category, a merge switch, a tip button | read, add a row, commit | no key or budget reached, reading, read failed, recognised nothing | the captured haul |
| `quick-log-sheet` | both | one-field logging | field, unit chip, last value, sparkline | save | | weight 82.4 |
| `inbox` | both | notifications | cards by domain and day, inline actions | open, snooze, clear | empty | the two unread cards |
| `profile`, mocked as `Domains/Garden/Profile`, built in `apps/desktop` (Garden → What Eden knows about me) | desktop | What Eden knows about me | facts by domain, provenance, "used by N requests", lock glyphs on T2 | add, edit, delete | empty | the facts table |
| `grants-ledger` | desktop | permissions (Phase 2 UI) | grants by subject, revoke, history | revoke | | the grants list |
| `egress-ledger`, built in `apps/desktop` (Settings → Privacy) | desktop | bytes out by destination | a table by destination and day; the Vault → AI row at zero | | | provider, Open-Meteo, Google |
| `gardener-usage` | desktop | what the Gardener came to | the Gardener's page on its first tab (D-113): four figures (this month against the cap, the last thirty days, all time, the month's requests), the spend over time as bars stacked by grade, the breakdown by model, by grade and by what ran; mocked in Storybook (Domains/Gardener/Usage) | switch the period (day, week, month, year) | nothing spent yet, the development clamp | the usage figures |
| `gardener-conversations` | desktop | every conversation | the page's second tab: one row per thread with its domain, its requests and tokens, when it was last used and what it cost over the log's ninety days | open one in the panel, show its requests in the audit log, delete with undo | no conversations yet | the Hearth audit entry as a conversation |
| `audit-log` | desktop | Gardener requests | the page's third tab (D-114): one row per request; headers that sort; filter chips for when, kind, tool, grade, model and outcome, with a chip for one conversation or one fact when the address names it; a pager; a row unfolds beneath itself to registry ids and tools | sort, filter, clear filters, page, open the conversation, narrow to the conversation | nothing recorded, nothing matching the filters | the audit entry |
| `gardener-tools` | desktop | what the Gardener can do | the page's fourth tab: one row per tool: owner, access, grade, reads; a row unfolds beneath itself to its description, declaration and input shape | open a tool | a tool without a handler | the declared tools |
| `settings-*` | both | each tab in `product/substrate/settings-utilities.md` | the tab's contents | | | |
| `vault` | both | T3 attachments | count and lock; after auth, the list | open, share, add | locked | one identity document |
| `status-bar` | desktop | global state | sync, integration chips, Gardener chip with budget, bell, + | | offline, no key, granted-not-connected | 2.84 of 10.00 |

## Domain screens

| id | platform | purpose | must show | primary actions | states | sample data |
|---|---|---|---|---|---|---|
| `hearth-stock`, mocked as `Domains/Hearth/Stock`, built in `apps/desktop` | both | stock by location | the header's live motif, the same on all three Hearth screens (D-123); Fridge, Freezer, Pantry, Counter sections, Ran out at the side under the open item (D-92), the Expiring and Low stock filters, a sort menu (expiry, name, newest), a picture on every row and in the pane (the item's own, else its category's glyph, D-90), a tip as the info button on a row and in the pane (D-87), the detail pane, and the item's form in a sheet (D-95), blank for Add (D-109); each location's name a heading with its glyph and count, the lists with no header row | capture haul (the button, a drop or a paste), take stock from photos of the shelves (D-89), add, edit, choose or remove a picture, and in select mode move, add to grocery, delete | empty, expiring, low, selecting, editing | the stock table |
| `hearth-recipes`, mocked as `Domains/Hearth/Recipes`, built in `apps/desktop` | desktop | recipes and cook this | a narrow column with the search, the filters, the order and the list, each row with its picture; the picked recipe as a page: picture across the top, name, credit, time, servings with a stepper, tags, the tip, ingredients for the servings shown marked in stock, missing or not enough beside the steps (D-93, D-107); a danger badge on a recipe that names something the owner avoids; an unsaved draft in the pane. The mock still shows the earlier list and card | add a recipe (pasted text, a link, a photo or a file), search, filter, sort, change the servings, cook this, add missing to grocery, edit, delete | empty, no recipe matches, draft to check, a recipe with no picture, one that does not scale, units that do not agree on cook | the three recipes |
| `hearth-grocery`, mocked as `Domains/Hearth/Grocery`, built in `apps/desktop` | both | the lists | one list per store, all at once, then Miscellaneous (D-96); check off, origin badges, at the side Buy it again (D-92) above the stores in the owner's order, each with what is left to buy and its shop day or last trip (D-101), an item's form and a store's in a sheet, to add as to edit (D-95, D-102) | add an item or a store from the header's Add menu (D-102), move, edit, complete a list, go to a store's list, edit or reorder a store, set a shop day (D-98), export (later) | empty, all checked, no shop day | H-E-B, Target and one item not filed |
| `toolbench-ideas`, mocked as `Domains/Toolbench/Ideas` (desktop), built in `apps/desktop` | both | the inbox of ideas | status filter, list, detail with log and brainstorm thread | capture, change status | empty | the six ideas, `ideaLog` |
| `toolbench-projects` | desktop | projects | list, detail with repo, next steps, log | add step | | weather-field, pi-pantry |
| `toolbench-lab` | desktop | devices | device rows with services and routine status | add device | | the two devices |
| `toolbench-studio` | desktop | render gallery | grid of renders, sketch detail with seed and parameters | | empty | weather-field |
| `toolbench-notes` | both | technical notes | search-first list, Markdown detail | add | | |
| `sky`, mocked as `Domains/Sky/Sky`, built in `apps/desktop` | both | weather | now, hours, the calendar week from the week start with today marked and past days observed (D-58), details, air quality, allergens, sun and moon, alerts, the sources' attribution with a glyph each, location switcher with "Change home" (the app opens the change-home sheet, D-143; the mock still shows the retired search by name); the header's live motif (D-62); the alerts behind a counted button beside the location chip, dismissible; the sun on its wave beside the temperature chart; the day's temperature as a chart beside the reading, a tick to the hour, the hours as one strip, a glyph per detail and per light, the moon drawn from its cycle, the air on a banded scale, a hint on every figure, the alerts as notices in the header's top right, two columns that end on one line, the week beneath them as a strip across the page with a day to a column | | offline (last updated), night, week from Sunday, 12-hour clock, WeatherKit with Apple's attribution, fallback note, allergens unavailable, change home (D-56, D-59) | the Austin week, `skyHours`, `skyDetails`, `skyAirQuality`, `skyAllergens` |
| `almanac-month` | desktop | the almanac | month grid with layer glyphs and legend, layer panel | create, toggle layer | no sources | the week's layers |
| `almanac-week` | desktop | the week | timeline with Events by kind colour, task markers | | | |
| `almanac-agenda` | both | the list | days with Events and annotations | | | |
| `almanac-detail` | both | an Event | fields, source, links, mirror note | edit local, open in Google | | dinner at Mom's (T2 source) |
| `vigor-workouts` | both | templates and sessions | templates, start, log form | start, log | | Push A |
| `vigor-body` | both | weight trend | chart with average and goal line, metrics list | quick log | empty | the weight series |
| `vigor-supplements` | both | supplements and doses | list with stock link, intake log | took it | | LMNT |
| `sanctuary-line` | both | today's line | large serif line, source, save | share as text | | Wednesday |
| `sanctuary-library` | desktop | sources and excerpts | by theme, search | add excerpt | | |
| `meadow-map`, mocked as `Domains/Meadow/Map` (Default, Filtered, Place selected, Suggestions, Searching, No provider, Empty, Offline, Search failed), built in `apps/desktop` and `apps/mobile` | both | places | the page of D-129: the header's live motif (D-123), the map with saved pins, the home pin and suggestion pins in the Gardener's green, the filter panel (the four facets of vibes, category, price, distance, collection, alcohol-free, open now, favourites, a line of text), the results list, the picked place's detail (picture, hours with their source, why it fits, notes, visits), "Find more" with what is sent and the estimate under it; a still drawing for the ground in the mock. On the phone a full map, the filter in a sheet and the place in a sheet | pick a pin or a row, filter, find more, save or dismiss a suggestion, favourite, log a visit, edit, add to a collection, open in Maps, import | filtered, a place picked, suggestions, searching, no provider, empty, offline, search failed | `meadowPlaces`, `meadowSuggestions`, `meadowSearch`, `meadowMap` |
| `meadow-import`, mocked as `Domains/Meadow/Import` (Pasted, Resolving, Review, Tagged), built in `apps/desktop` | desktop | bring a list of places in by paste | the sheet: the pasted text, then a row per name as it is found (matched, already saved, ambiguous with its choices, not found), the Gardener's vibes on the found rows in its green | paste, tag vibes with the Gardener, choose between matches, place a row on the map by hand, leave a row out, save all | pasted, resolving, review, tagged | `meadowImport` |
| `meadow-listings`, mocked as `Domains/Meadow/Listings` (This weekend, Interested and going, Empty, No provider), built in `apps/desktop`; read-only on the phone | both | happenings | this weekend's listings, each with when, where, why it fits and its source, and its mark | find listings, interested, going (an `outing`, D-136), open the listing | empty, no provider | `meadowListings` |
| `meadow-collections`, mocked as `Domains/Meadow/Collections` (Default, Empty), built in `apps/desktop` | desktop | named groups of places | each collection with its note and its places, the saved places beside them to drag in (D-106) | new collection, add or remove a place, rename, delete | empty | `meadowCollections` |
| `meadow-visits`, mocked as `Domains/Meadow/Visits` (Default, Empty), built in `apps/desktop` | desktop | where the owner has been | visits by day, each with its place, rating and note | open the place, delete with undo; a visit is logged from a place's detail, in a sheet (D-95) | empty | `meadowVisits` |
| `meadow-widgets`, mocked as `Domains/Meadow/Widgets` (Default, Empty), built in `apps/desktop` | desktop | Meadow on the Garden | `nearby-favorites` and `upcoming-listings` as M tiles | open Meadow | empty | `meadowPlaces`, `meadowListings` |

## Mobile variants (Phase 2)

`garden`, `today`, `hearth-grocery`, `hearth-stock`, `capture-sheet`, `quick-log-sheet`, `gardener-panel` as a sheet, `sky`, `inbox`, `settings-root`. Bottom tabs: Garden, Today, Hearth, Sky, More.

## Mockup priority for Claude Design

1. `garden` in light and dark, with the glyph family.
2. `hearth-stock` and `capture-sheet`.
3. `gardener-panel` with a real "can see" chip and a tool-confirm card.
4. `onboarding-5`, `onboarding-7`, `onboarding-8`.
5. `today` and `quick-log-sheet`.
6. `toolbench-ideas`.
7. `sky` and the `status-bar`.
8. `almanac-month` with layers.
9. `settings-privacy` with the egress ledger.
10. the mobile `hearth-grocery` and `capture-sheet`.
