---
title: Resource registry
status: draft
summary: The single list of every resource a grant, a declared read or an audit entry can name: fact types, entity types and primitive kinds, each with an owner, a tier and a phase.
read-this-if: You are declaring what an AI tool reads, writing a grant, adding an entity or a kind, or checking who owns a resource.
depends-on: [privacy]
updated: 2026-10-01
---

## Rules

- One row per resource. Ids are kebab-case, unique across all categories, and never reused. No domain prefix, no dot (D-36).
- `category` is `fact`, `entity` or `kind`. Kinds also name their primitive.
- `owner` is a domain id or `substrate`. Moving ownership edits this column only; rows and links do not change (D-24, D-35).
- `tier` is T0–T3 as defined in `substrate/privacy.md`. Entities may list per-field overrides in `notes`.
- `phase` is when the resource first exists: 1, 2, 3 or later. A fact type may be asserted by the owner in the profile before its owning domain ships.
- Substrate rows come first; each domain's rows follow under its heading and must match its doc. A removed domain's rows are marked `retired` in `notes`.
- Declared reads, grants and audit entries reference these ids and nothing else (D-31).

## Substrate

### Facts

| id | owner | tier | phase | value | notes |
|---|---|---|---|---|---|
| `preferred-name` | substrate | T1 | 1 | string | what greetings and the Gardener call you |
| `home-area` | substrate | T1 | 1 | city, region, country | derived from the `home` Place (D-38); provenance `system-derived` |

### Entity types

| id | owner | tier | phase | notes |
|---|---|---|---|---|
| `task` | substrate | T1 | 1 | |
| `event` | substrate | by kind | 1 | mirrored Events inherit their CalendarSource tier |
| `place` | substrate | by kind | 1 | `address` field is T2 |
| `attachment` | substrate | by kind | 1 | T3 kinds live in the Vault |
| `calendar-source` | substrate | T1 | 1 | local in Phase 1; Almanac adds external kinds |

### Kinds

| id | primitive | owner | tier | phase | notes |
|---|---|---|---|---|---|
| `todo` | task | substrate | T1 | 1 | default Task kind |
| `checklist` | task | substrate | T1 | 1 | |
| `routine` | task | substrate | T1 | 1 | recurring template |
| `habit` | task | substrate | T1 | 1 | streak-tracked |
| `reminder` | task | substrate | T1 | 1 | no completion state |
| `local-event` | event | substrate | T1 | 1 | user-entered |
| `home` | place | substrate | T2 | 1 | exactly one |
| `venue` | place | substrate | T1 | 1 | any saved place |
| `document` | attachment | substrate | T2 | 1 | generic file |
| `photo` | attachment | substrate | T1 | 1 | generic image |
| `identity-document` | attachment | substrate | T3 | 2 | Vault only |

## Hearth (`kitchen`), Phase 1

| id | category | tier | notes |
|---|---|---|---|
| `allergy` | fact | T2 | value `{kind: food \| drug \| environmental, substance, severity}`; Wellspring writes `drug` later |
| `dietary-preference` | fact | T1 | includes `alcohol-free` |
| `disliked-ingredient` | fact | T0 | |
| `cuisine-preference` | fact | T0 | |
| `household-size` | fact | T1 | |
| `stock-item` | entity | T0 | |
| `recipe` | entity | T0 | |
| `grocery-store` | entity | T0 | a store Hearth shops at; each has a list of its own; `place.address` field is T2 (D-101) |
| `grocery-list` | entity | T0 | |
| `grocery-item` | entity | T0 | |
| `shop-day` | kind (event) | T0 | |
| `haul-photo` | kind (attachment) | T1 | |
| `item-photo` | kind (attachment) | T1 | a stock item's picture (D-90) |
| `recipe-photo` | kind (attachment) | T1 | a recipe's picture (D-93) |
| `store-photo` | kind (attachment) | T1 | a store's picture (D-103) |

## Toolbench (`toolbench`), Phase 1

| id | category | tier | notes |
|---|---|---|---|
| `skill` | fact | T1 | |
| `owned-hardware` | fact | T1 | |
| `preferred-tool` | fact | T1 | |
| `idea` | entity | T1 | |
| `project` | entity | T1 | |
| `device` | entity | T2 | hostnames; never credentials |
| `parts-list` | entity | T1 | |
| `sketch` | entity | T1 | |
| `note` | entity | T1 | |
| `brainstorm-session` | entity | T1 | |
| `render` | kind (attachment) | T0 | |

## Sky (`weather`), Phase 1

| id | category | tier | notes |
|---|---|---|---|
| `forecast` | entity | T0 | mirror |
| `alert` | entity | T0 | mirror |
| `ephemeris` | entity | T0 | computed on-device |
| `air-quality` | entity | T0 | mirror |
| `allergens` | entity | T0 | mirror |

## Almanac (`calendar`), Phase 2

| id | category | tier | notes |
|---|---|---|---|
| `layer` | entity | T0 | |
| `holiday-set` | entity | T0 | |
| `google-event` | kind (event) | by source | mirror; tier from its CalendarSource |
| `ics-event` | kind (event) | by source | later |

## Vigor (`fitness`), Phase 2

| id | category | tier | notes |
|---|---|---|---|
| `gym-preference` | fact | T1 | |
| `training-schedule` | fact | T1 | |
| `equipment` | fact | T1 | |
| `fitness-goal` | fact | T1 | |
| `favorite-supplement` | fact | T1 | |
| `training-limitation` | fact | T2 | moves to Wellspring later |
| `current-weight` | fact | T2 | domain-derived from the latest weight metric |
| `exercise` | entity | T0 | |
| `workout-template` | entity | T1 | |
| `workout-log` | entity | T1 | |
| `gym` | entity | T1 | links a `venue` Place |
| `training-goal` | entity | T1 | |
| `body-metric` | entity | T2 | moves to Wellspring later |
| `supplement` | entity | T1 | links a Hearth `stock-item`; moves to Wellspring later |
| `intake-log` | entity | T1 | moves to Wellspring later |
| `workout-session` | kind (event) | T1 | |

## Sanctuary (`spirit`), Phase 2

| id | category | tier | notes |
|---|---|---|---|
| `followed-tradition` | fact | T1 | |
| `value` | fact | T1 | |
| `favorite-author` | fact | T1 | |
| `birth-data` | fact | T2 | |
| `tradition` | entity | T1 | catalog of traditions, bundled and custom |
| `reading-source` | entity | T0 | |
| `excerpt` | entity | T0 | |
| `author` | entity | T0 | |
| `reading-log` | entity | T1 | |
| `astrology-profile` | entity | T2 | |

## Meadow (`places`), Phase 3

| id | category | tier | notes |
|---|---|---|---|
| `favorite-vibe` | fact | T0 | |
| `place-profile` | entity | T1 | what Meadow keeps about a saved `venue` Place, linked `about` it (D-133) |
| `vibe` | entity | T0 | a custom vibe only; the bundled ones are code (D-133) |
| `collection` | entity | T1 | |
| `listing` | entity | T0 | mirror |
| `visit` | entity | T1 | |
| `place-suggestion` | entity | T1 | mirror: a place found and not saved (D-133) |
| `place-detail` | entity | T0 | mirror: one detail slot of a place, from one source (D-128) |
| `outing` | kind (event) | T1 | tentative when interested, confirmed when going |
| `place-photo` | kind (attachment) | T1 | a saved place's picture (D-133) |

## Wellspring (`health`), stub, after Phase 2

| id | category | tier | notes |
|---|---|---|---|
| `medical-dietary-restriction` | fact | T2 | assertable in the profile from Phase 1 |
| `blood-type` | fact | T2 | later |
| `condition` | entity | T2 | later |
| `medication` | entity | T2 | later |
| `appointment-note` | entity | T2 | later |
| `provider` | entity | T1 | later; doctors, pharmacies, clinics |
| `insurance-plan` | entity | T2 | later; documents T3 |
| `medical-appointment` | kind (event) | T2 | later |
| `insurance-card` | kind (attachment) | T3 | later; Vault only |

## Orchard (`finance`), stub, after Phase 2

| id | category | tier | notes |
|---|---|---|---|
| `monthly-income-band` | fact | T2 | later |
| `savings-goal` | fact | T2 | later |
| `account` | entity | T2 | later; number field T3 |
| `transaction` | entity | T2 | later |
| `budget` | entity | T2 | later |
| `budget-category` | entity | T1 | later |
| `recurring-charge` | entity | T2 | later |
| `holding` | entity | T2 | later |
| `receipt` | kind (attachment) | T2 | later |
| `bill-due` | kind (event) | T2 | later |

## Candidates, Phase 3 or later

| id | category | owner | tier | notes |
|---|---|---|---|---|
| `person` | entity | people | T1 | notes field T2 |
| `interaction` | entity | people | T1 | |
| `birthday` | kind (event) | people | T1 | |
| `entry` | entity | journal | T1 | mood field T2 |
| `prompt` | entity | journal | T0 | |
| `trip` | entity | travel | T1 | |
| `itinerary-item` | entity | travel | T1 | |
| `trip-document` | entity | travel | T2 | |
| `trip-destination` | kind (place) | travel | T1 | |
| `trip-item` | kind (event) | travel | T1 | |
| `home-airport` | fact | travel | T1 | |
| `seat-preference` | fact | travel | T1 | |
| `passport-expiry` | fact | travel | T2 | typed by hand, never read from the document |
| `reading-item` | entity | library | T1 | |
| `highlight` | entity | library | T1 | |
| `reading-interest` | fact | library | T1 | |
