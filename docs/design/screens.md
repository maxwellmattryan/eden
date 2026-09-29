---
title: Screens
status: draft
summary: The screen inventory for mockups: a template per screen, the shell screens, the domain screens, mobile variants, and the priority order for Claude Design.
read-this-if: You are drawing mockups or checking that a screen covers its states.
depends-on: [ux-patterns, sample-data, product/substrate/shell]
updated: 2026-09-29
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
| `today` | both | tasks and routines | overdue, due today, routines, habits, Quick Log strip, quick-add | add, done, snooze | empty, overdue | Wednesday's task and routines |
| `palette` | desktop | ⌘K | verbs, fuzzy results, recents | run | no results | "log weight 82.4", "go to almanac" |
| `gardener-panel` | both | the assistant | thread list, conversation, "can see" chip row, model chip with budget meter, composer | send, expand chip | no key, offline, budget exhausted, tool confirm | the Hearth audit entry as a conversation |
| `council` | desktop | side-by-side models | columns per model, cost preview, optional chair | run | | a "which recipe tonight" question to two models |
| `capture-sheet` | both | verify a haul | image, provider named, cost, draft rows with location chips and estimated badges, merge indicators | commit | recognised nothing, provider unavailable | the captured haul |
| `quick-log-sheet` | both | one-field logging | field, unit chip, last value, sparkline | save | | weight 82.4 |
| `inbox` | both | notifications | cards by domain and day, inline actions | open, snooze, clear | empty | the two unread cards |
| `profile` | desktop | What Eden knows about me | facts by domain, provenance, "used by N requests", lock glyphs on T2 | add, edit, delete | empty | the facts table |
| `grants-ledger` | desktop | permissions (Phase 2 UI) | grants by subject, revoke, history | revoke | | the grants list |
| `egress-ledger` | desktop | bytes out by destination | a table by destination and day; the Vault → AI row at zero | | | provider, Open-Meteo, Google |
| `audit-log` | desktop | Gardener requests | one row per request; expand to registry ids and tools | | | the audit entry |
| `settings-*` | both | each tab in `product/substrate/settings-utilities.md` | the tab's contents | | | |
| `vault` | both | T3 attachments | count and lock; after auth, the list | open, share, add | locked | one identity document |
| `status-bar` | desktop | global state | sync, integration chips, Gardener chip with budget, bell, + | | offline, no key, granted-not-connected | 2.84 of 10.00 |

## Domain screens

| id | platform | purpose | must show | primary actions | states | sample data |
|---|---|---|---|---|---|---|
| `hearth-stock`, mocked as `Domains/Hearth/Stock`, built in `apps/desktop` | both | stock by location | Fridge, Freezer, Pantry, Counter sections, expiry sort, low-stock filter | capture haul, add | empty, expiring | the stock table |
| `hearth-recipes` | desktop | recipes and cook this | list, detail with ingredients marked in stock or missing | cook this, add missing to grocery | empty | the three recipes |
| `hearth-grocery`, mocked as `Domains/Hearth/Grocery`, built in `apps/desktop` | both | the list | grouped by store, check off, origin badges | add, clear checked, export (later) | empty, all checked | H-E-B Saturday |
| `hearth-tips` | desktop | storage tips | search, tip cards | | | miso, ginger, avocados |
| `toolbench-ideas`, mocked as `Domains/Toolbench/Ideas` (desktop), built in `apps/desktop` | both | the inbox of ideas | status filter, list, detail with log and brainstorm thread | capture, change status | empty | the six ideas, `ideaLog` |
| `toolbench-projects` | desktop | projects | list, detail with repo, next steps, log | add step | | weather-field, pi-pantry |
| `toolbench-lab` | desktop | devices | device rows with services and routine status | add device | | the two devices |
| `toolbench-studio` | desktop | render gallery | grid of renders, sketch detail with seed and parameters | | empty | weather-field |
| `toolbench-notes` | both | technical notes | search-first list, Markdown detail | add | | |
| `sky`, mocked as `Domains/Sky/Sky`, built in `apps/desktop` | both | weather | now, hours, the calendar week from the week start with today marked and past days observed (D-58), details, air quality, allergens, sun and moon, alerts, the sources' attribution with a glyph each, location switcher with "Change home"; the day's temperature as a chart beside the reading, a tick to the hour, the hours as one strip, a glyph per detail and per light, the moon drawn from its cycle, the air on a banded scale, a hint on every figure, the alerts as notices in the header's top right, two columns that end on one line, the week beneath them as a strip across the page with a day to a column | | offline (last updated), night, week from Sunday, 12-hour clock, WeatherKit with Apple's attribution, fallback note, allergens unavailable, change home (D-56, D-59) | the Austin week, `skyHours`, `skyDetails`, `skyAirQuality`, `skyAllergens` |
| `almanac-month` | desktop | the almanac | month grid with layer glyphs and legend, layer panel | create, toggle layer | no sources | the week's layers |
| `almanac-week` | desktop | the week | timeline with Events by kind colour, task markers | | | |
| `almanac-agenda` | both | the list | days with Events and annotations | | | |
| `almanac-detail` | both | an Event | fields, source, links, mirror note | edit local, open in Google | | dinner at Mom's (T2 source) |
| `vigor-workouts` | both | templates and sessions | templates, start, log form | start, log | | Push A |
| `vigor-body` | both | weight trend | chart with average and goal line, metrics list | quick log | empty | the weight series |
| `vigor-supplements` | both | supplements and doses | list with stock link, intake log | took it | | LMNT |
| `sanctuary-line` | both | today's line | large serif line, source, save | share as text | | Wednesday |
| `sanctuary-library` | desktop | sources and excerpts | by theme, search | add excerpt | | |
| `meadow-map` | both | places | map with pins, filter bar, list and detail | save, open | no provider | the five venues |
| `meadow-listings` | both | happenings | this weekend, filters, interested and going | add to calendar | | Hot Luck |

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
