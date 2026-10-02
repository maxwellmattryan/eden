---
title: Almanac
status: draft
summary: Eden's own calendar over the Event primitive, with a layer stack of event filters and day annotations (holidays, sun and moon, weather, astrology); Google Calendar is a read-only source in Phase 2. Id `calendar`, Phase 2.
read-this-if: You are working on calendar views, layers, holidays, Google Calendar, or anything that puts something on a date.
depends-on: [substrate/registry, substrate/primitives, substrate/integrations, domains/weather, substrate/shell, substrate/ai]
updated: 2026-10-01
---

## 1. Purpose

Almanac is a native calendar styled to the brand, never an embedded Google component (D-18). It shows the substrate's Events through **layers**, and dresses each day with **annotations** that a real almanac would carry: holidays, sunrise and sunset, the moon, the weather, and, if the owner wants, astrology. The one thing it must do well: **a month that reads like an almanac, where a glance tells you what the day holds.**

## 2. User stories

- MVP: See day, week, month and agenda views of every Event, whatever domain created it, with layers I can toggle and colour.
- MVP: See my Google calendars read-only, per calendar, without leaving Eden.
- MVP: See holidays for the countries I choose, sunrise, sunset and moon phase, and the day's weather on every day cell.
- MVP: Create a local event by typing "dentist thursday 3pm".
- MVP: Ask for free time this week, or what is on a given date across every layer.
- MVP: Get a morning agenda.
- Later: A year view drawn as a seasons wheel.
- Later: Write to Google, per calendar, including recurrence exceptions (D-28).
- Later: Japanese almanac layers: the 24 solar terms and rokuyō (D-20).
- Later: Astrology transits from Sanctuary as an annotation.

## 3. Entities

| entity | key fields | tier | links out |
|---|---|---|---|
| `calendar-source` (substrate entity, extended here) | kind (local, google, ics), name, colour, read or write, **tier** inherited by its Events (default T1), selected external calendar id | T1 | Events |
| `layer` | id, type (event filter or annotation), the kinds it filters or the provider it shows, colour, enabled, per-view visibility | T0 | |
| `holiday-set` | country or region, dataset version, localised names | T0 | |

Events are the substrate primitive (`substrate/primitives.md`). Google events are mirror-flagged Event rows keyed by source + external id; the owner's links, tags and notes on them are overlays (D-32).

## 4. Facts

Written: none. Read: `home-area` (substrate, T1) to default holiday countries and the ephemeris location. Timezone, work hours and holiday countries are settings (D-27).

## 5. Gardener tools and guardrails

| tool | reads | access | confirm | grade |
|---|---|---|---|---|
| `find-free-time` | `local-event`, `google-event`, `workout-session`, `outing`, `shop-day`, `task` | read | none | plain |
| `summarize-week` | the same | read | none | `standard` |
| `whats-on-date` | the same, plus `holiday-set`, `ephemeris`, `forecast` | read | none | plain |
| `create-local-event` | `local-event` | write | confirm sheet naming date, time and place | plain |

Until Almanac is built the Gardener makes no event of its own, with the one exception of D-136 (an `outing` from a listing, which Meadow's Listings tab shows): no page shows any other, so a `create-local-event` would write what the owner cannot see. The substrate's `agenda` (D-125) already answers a day's events with its tasks and Sky's reading; when these tools are built, `whats-on-date` either becomes it or adds what it lacks (`holiday-set`, `ephemeris`), and three things `agenda` leaves open are decided here: it does not expand an event's `recurrence`, it takes an all-day `endAt` as the event's last day, and it does not mark a mirrored event's title as untrusted.

Never-do list: never sends invites or touches attendees; never writes to Google before Phase 3, and then only under a per-calendar grant (OQ-6); treats Google event content as untrusted data in any context pack.

## 6. Surfaces

**Desktop views (Phase 2)**: day, week, month and agenda, a layer panel with toggles and colours, an event detail pane, and a date-jump field. Year as a seasons wheel later. Day cells show small glyphs for annotations (moon phase, weather icon, holiday dot) with a legend, and never more than three glyphs.

**Mobile (Phase 2)**: agenda and day; month later.

**Garden widgets**: `next-up` (S), `week-strip` (M), `today-almanac` (M: sunrise, sunset, moon, weather, holiday).

**Palette**: go to a date ("next tuesday"), create event, toggle a layer, open Almanac.

**Quick actions**: none. **Capture sources**: none.

**Day annotations consumed**: `weather` and `ephemeris` from Sky; `astrology` from Sanctuary (later). **Provided**: `holidays`; `japanese-almanac` (later).

## 7. Kinds, signals, notifications, intents

Kinds: `google-event` (event, tier from its source), `ics-event` (event, later).

Signals: `calendar.synced` per source refresh; failures use `integration.failed`.

| notification | channel | cadence | default |
|---|---|---|---|
| event reminder | OS | per event, default 15 minutes before | on |
| morning agenda | part of the morning digest | daily | on |

Intents handled: `calendar.show-date`. Intents sent: none.

## 8. Integrations

| integration | phase | access | sends | receives |
|---|---|---|---|---|
| bundled holiday dataset (OQ-14) | 2 | none | | holidays by country |
| Google Calendar | 2 read, 3 write | per calendar | calendar id, time window | events as mirrors |
| ICS subscriptions | later | read | the URL | events as mirrors |
| Apple, Outlook | later | read | | |

Connections are per device (D-37): a calendar granted on the desktop shows "granted, not connected here" on the phone until connected there.

## 9. Settings

Default view, week start (from General, D-58), work hours shading, holiday countries (US and Japan by default), default reminder, layer defaults, Google calendars selected with a per-calendar tier.

## 10. Non-goals and open questions

Non-goals: invites and attendee management, scheduling links, calendars shared with other people, task management (that is Today).

Open: OQ-6, OQ-14, OQ-16.

## Handoffs

- **Outings from Meadow** (for Almanac, #5): `outing` Events exist now, written by Meadow (`packages/shared/src/domains/places/outings.ts`). One is `tentative` when the owner marked its listing interested and `confirmed` when going; it carries the listing's `source` and `externalId` and a snapshot (title, start, end, venue name, point, url; D-133, D-37), so it renders on a device that never fetched the listing. Almanac draws a tentative one dashed and a confirmed one as any event. `find-free-time` and the other tools above already name `outing` in their reads. The `outing-reminder` notification is declared with no signal (#28).

## Registry rows

Appended under Almanac: entities `layer` T0, `holiday-set` T0 (`calendar-source` is a substrate row); kinds `google-event` (event, tier from source, phase 2), `ics-event` (event, later).
