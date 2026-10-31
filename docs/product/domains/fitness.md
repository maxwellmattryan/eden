---
title: Vigor
status: draft
summary: Workouts and templates, an exercise library, gyms, goals, body metrics with a weight trend, supplements and doses, and a training schedule as routines. Owns the body until Wellspring exists. Id `fitness`, Phase 2.
read-this-if: You are working on workouts, body metrics, weight logging, gyms or supplements.
depends-on: [substrate/registry, substrate/primitives, substrate/tasks, substrate/grants, substrate/shell, substrate/ai]
updated: 2026-10-31
---

## 1. Purpose

Vigor is where movement lives: what the owner trains, where, with what, and how the body responds. It owns body metrics and supplements until Wellspring is specced, at which point ownership moves in the registry without touching a row (D-5). The one thing it must do well: **log a workout or a weight in seconds and show the trend.**

## 2. User stories

- MVP: Log my weight from anywhere in two seconds and see a trend with a seven-day average and a goal line.
- MVP: Build workout templates from an exercise library and log a session with sets, reps, load, RPE and duration.
- MVP: Keep my training schedule as a routine and see this week's sessions on the Garden and in Almanac.
- MVP: Keep the gyms I use, linked to their places.
- MVP: Keep the supplements I take, log a dose in one tap, and have Hearth keep them stocked.
- MVP: Ask for a workout for today that respects my equipment, goal and limitations.
- MVP: See a progress summary and a streak.
- Later: Import weight and workouts from HealthKit, a smart scale or Strava.
- Later: Get progression suggestions from my history.

## 3. Entities

| entity | key fields | tier | links out |
|---|---|---|---|
| `exercise` | name, muscle groups, equipment, bundled or custom | T0 | |
| `workout-template` | title, exercises with target sets and reps, estimated duration | T1 | exercises |
| `workout-log` | template, date, per-exercise sets (reps, load), RPE, duration, calorie estimate | T1 | `workout-session` Event, gym |
| `gym` | name, equipment, hours, notes | T1 | a `venue` Place |
| `training-goal` | kind (strength, endurance, weight, habit), target, by date | T1 | |
| `body-metric` | kind (weight, body fat, waist), value, unit, at, source (manual, quick-log, healthkit) | T2 | |
| `supplement` | name, brand, dose, when (daily, pre-workout, as needed) | T1 | a Hearth `stock-item` by URI |
| `intake-log` | supplement, at | T1 | supplement |

## 4. Facts

Written: `gym-preference` T1, `training-schedule` T1, `equipment` T1, `fitness-goal` T1, `favorite-supplement` T1, `training-limitation` T2 (injuries and limits, until Wellspring takes over), `current-weight` T2 (domain-derived from the latest weight metric).

Read: none from other domains.

## 5. Gardener tools and guardrails

| tool | reads | access | confirm | grade |
|---|---|---|---|---|
| `generate-workout` | `exercise`, `workout-template`, `workout-log`, `equipment`, `fitness-goal`, `training-limitation` | write-draft | a workout card; commit saves a template or starts a session | `deep` |
| `log-workout` | `workout-log`, `workout-template` | write | undo | `light` |
| `log-body-metric` | `body-metric` | write | undo (Quick Log) | plain |
| `took-supplement` | `supplement`, `intake-log` | write | undo (Quick Log) | plain |
| `progress-summary` | `workout-log`, `body-metric`, `fitness-goal` | read | none | `standard` |
| `suggest-progression` | `workout-log`, `workout-template` | read | none | `standard` |

`training-limitation` and `body-metric` are T2, so their grants are requested the first time a tool needs them, in context.

Never-do list: never gives medical advice or diagnoses pain; always respects `training-limitation`; never sets diet or calorie targets (OQ-8); never shares body metrics with any tool outside these.

## 6. Surfaces

**Desktop views (Phase 2)**: Workouts (templates, start a session, log), History, Body (weight trend chart with seven-day average and goal line; other metrics), Gyms, Supplements.

**Mobile (Phase 2)**: log a session, Quick Log weight and doses, Body.

**Garden widgets**: `this-week-training` (M), `streak` (S), `next-session` (S), `weight-trend` (M; sparkline, average, goal line).

**Palette**: log weight, start workout, took supplement, go to Vigor.

**Quick actions**: `log-weight`, `workout-done`, `took-supplement`.

**Capture sources**: none.

## 7. Kinds, signals, notifications, intents

Kinds: `workout-session` (event, T1). A scheduled session is an Event; the log links to it.

Signals: `body-metric.logged`, `workout.logged`.

| notification | channel | cadence | default |
|---|---|---|---|
| session reminder | OS, through the routine | per session | on |
| weekly progress | in-app | weekly | on |
| supplement dose | through the routine task | per routine | on when set |

Intents: none.

## 8. Integrations

| integration | phase | access | notes |
|---|---|---|---|
| HealthKit, Health Connect | later | read | weight, workouts |
| smart scale (Withings) | later | read | weight |
| Strava | later | read | sessions |

## 9. Settings

Units and week start (from General, D-58), default rest timer, exercise library filters, current goal, Quick Log defaults, whether the weight widget shows on the Garden.

## 10. Non-goals and open questions

Non-goals: nutrition or intake tracking, social features, coaching claims, medical interpretation of metrics.

Open: OQ-8. A future `parent: health` is a manifest field, not a data move.

## Registry rows

Appended under Vigor: facts `gym-preference` T1, `training-schedule` T1, `equipment` T1, `fitness-goal` T1, `favorite-supplement` T1, `training-limitation` T2, `current-weight` T2; entities `exercise` T0, `workout-template` T1, `workout-log` T1, `gym` T1, `training-goal` T1, `body-metric` T2, `supplement` T1, `intake-log` T1; kind `workout-session` (event, T1).

## Built

Issue 6, D-177. The mocks are `Domains/Vigor/{Workouts,History,Body,Gyms,Supplements,Widgets}` in Storybook; the page is `/fitness/[[tab]]` on both apps, one shared page (`packages/shared/src/domains/fitness/views/Vigor.svelte`) whose narrow layout is the phone's, reached from More there and pickable as a pinned tab (D-160). The five tabs (Workouts, History, Body, Gyms, Supplements), every write with an undo toast and a feed line (a body metric's or the goal's line names the kind and the date, never the value: the feed is stored outside the encrypted workspace and these are T2), the sample data, the four tiles (none in the default Garden), and the three quick actions: `log-weight` (a number in kg, or lb under the imperial system, refused outside 0 to 1000 with a toast that says why; its readout is the last value, the last seven daily weights and their average, which the Garden's `quick-log` tile draws), `workout-done` (today's planned template first) and `took-supplement`. `body-metric.logged` and `workout.logged` are emitted; nothing answers them yet. The pure rules (streak, average, the week's sessions, units, the weight's parse and the readouts, the rows) are in `packages/shared/src/domains/fitness/` with their tests. Vigor has no crate module: its rows go through the generic entity and event commands. Its facts are live as the registry's rows, so the owner may assert them on the profile; Vigor writes none of them yet.

## Handoffs

- **Gardener tools (§5).** None of `generate-workout`, `log-workout`, `log-body-metric`, `took-supplement`, `progress-summary` or `suggest-progression` is declared, since a declared tool needs a handler (`engineering/gardener.md`, "Tools"). Declare each in `manifest.json` with its handler in `logic.ts`; `log-quick` can carry the three quick actions once `QUICK_ACTION_WORDS` (`packages/shared/src/gardener/tools.ts`) has a line for each.
- **The schedule as a routine, reminders, weekly progress, dose notifications.** A planned session is an Event (D-177). The notifications in §7 need `notificationKinds` and a rule that answers `workout.logged` and `body-metric.logged`; the session reminder needs the Event's time on the scheduler, not a routine.
- **Facts Vigor writes.** `current-weight` (derived from the latest weight; its shape is in `packages/shared/src/profile/shapes.ts`, marked derived), `gym-preference`, `equipment`, `favorite-supplement`, `training-schedule`, `fitness-goal`, `training-limitation`: written by the owner on the profile today; Vigor deriving any of them is open.
- **The header motif (D-123).** Vigor's page has none; `VigorPage.svelte` in the mocks has no `motif` snippet yet.
- **Settings (§9).** The rest timer, the library filters, the Quick Log defaults and the weight tile's visibility have no settings yet; units and week start come from General (D-58).
- **Export formats.** `export` lists Vigor's types, so they are in a whole-workspace bundle; `logic.ts` has no `extras` for formats made for reading.
- **The Quick Log sheet's own error line.** A refused weight is said in an error toast (`QuickLogRefusal`, `packages/shared/src/domains/define.ts`); the kit's `QuickLogSheet` has no error line under its field to say it in place.
- **A gym's Place from the sample.** The seed links Castle Hill Fitness to a venue Place of that name when the workspace has one; Meadow's sample has none, so the seeded gym shows no Place until the owner links one.
