---
title: Sanctuary
status: draft
summary: The traditions and values the owner chooses, bundled and personal readings, a reading log with reflections, the daily line for the splash and the Garden, and optional astrology. Id `spirit`, Phase 2.
read-this-if: You are working on the daily line, readings, reflection, values or astrology.
depends-on: [substrate/registry, substrate/tasks, substrate/ai, substrate/shell, substrate/ai]
updated: 2026-09-27
---

## 1. Purpose

Sanctuary is the quiet corner of the garden: a place for whatever the owner draws on, whether Buddhism, Stoicism, a faith, or none. It presents traditions neutrally, keeps only content the owner is allowed to have, and provides the daily line the rest of Eden shows (D-2). The one thing it must do well: **a line worth reading every morning, from sources the owner chose.**

## 2. User stories

- MVP: Choose one or more traditions, or none, and see a daily line on the splash screen and the Garden.
- MVP: Browse bundled public-domain sources by theme and add my own excerpts and authors.
- MVP: Log a reading with a short reflection, and keep a reading routine.
- MVP: Record my values in my own words.
- MVP: Ask the Gardener to explain a passage or find an excerpt on a theme.
- Later: Enter birth data and see today's transits computed locally, labelled as non-predictive.
- Later: Japanese-language sources.
- Later: Photograph a book page and keep the passage as an excerpt with on-device OCR.

## 3. Entities

| entity | key fields | tier | links out |
|---|---|---|---|
| `tradition` | id, name, enabled, custom flag | T1 | |
| `reading-source` | title, author, tradition, licence, bundled or personal | T0 | author |
| `excerpt` | text, reading source, themes, language | T0 | reading-source |
| `author` | name, dates, traditions | T0 | |
| `reading-log` | excerpt, date, reflection | T1 | excerpt |
| `astrology-profile` | birth date, time, place | T2 | |

Values are facts, not entities.

## 4. Facts

Written: `followed-tradition` T1, `value` T1, `favorite-author` T1, `birth-data` T2. (`tradition` is the entity; the fact is `followed-tradition`.)

Read: none from other domains. The `ephemeris` entity from Sky is read for transits.

## 5. Gardener tools and guardrails

| tool | reads | access | confirm |
|---|---|---|---|
| `daily-reflection-prompt` | `followed-tradition`, `value`, `reading-log` | read | none |
| `find-excerpt` | `excerpt`, `reading-source`, `tradition` | read | none |
| `explain-passage` | `excerpt` | read | none |
| `draft-reflection` | `reading-log`, `excerpt` | write-draft | editable card |
| `transits-today` | `astrology-profile`, `ephemeris` | read | T2 grant on `astrology-profile` the first time |

Never-do list: never proselytises or ranks traditions; labels astrology as non-predictive; uses only public-domain, licensed or owner-added content (OQ-5); never offers psychological or medical advice; never sends birth data to a provider (transits are computed locally; horoscope text, if ever, is fetched by sun sign only, OQ-16).

## 6. Surfaces

**Desktop views (Phase 2)**: Today's line (large type, source, save, share as text), Library (sources and excerpts by theme), Reading log, Values, Astrology (a tab that exists only when enabled).

**Mobile (Phase 2)**: today's line and the reading log.

**Garden widgets**: `daily-line` (M; default on when Sanctuary is enabled, neutral text otherwise), `reading-routine` (S), `moon-and-transits` (S, later).

**Palette**: go to Sanctuary, "find an excerpt about patience", log a reading.

**Quick actions**: none.

**Capture sources**: a photo of a page becomes an excerpt via on-device OCR (later).

**Daily line provider**: yes (`dailyLine: true` in the manifest). **Day annotation provided**: `astrology` (later).

## 7. Kinds, signals, notifications, intents

Kinds: none.

Signals: `daily-line.ready` (scheduler, at the chosen morning time), `reading.logged`.

| notification | channel | cadence | default |
|---|---|---|---|
| morning line | part of the morning digest | daily | on |
| reading routine | through the routine task | per routine | on when set |

Intents: none.

## 8. Integrations

| integration | phase | access | notes |
|---|---|---|---|
| bundled public-domain texts | 2 | none | licensing per OQ-5 |
| horoscope text provider | later | read, under grant | sun sign only |

## 9. Settings

Traditions, morning line time and which sources feed it, splash line on or off, source languages, astrology on or off.

## 10. Non-goals and open questions

Non-goals: community features, proselytising, therapy or counselling, ranking traditions.

Open: OQ-5, OQ-16, OQ-9 for whether Rings would fold in.

## Registry rows

Appended under Sanctuary: facts `followed-tradition` T1, `value` T1, `favorite-author` T1, `birth-data` T2; entities `tradition` T1, `reading-source` T0, `excerpt` T0, `author` T0, `reading-log` T1, `astrology-profile` T2. No kinds.
