---
title: Tasks
status: draft
summary: The Task primitive in detail: kinds, recurrence, routines, habits, reminders, the Today view and its Garden widget, the relationship to the calendar, Gardener tools, and how domains use tasks.
read-this-if: You are designing anything the owner has to do, do again, or be reminded of.
depends-on: [primitives, signals-notifications]
updated: 2026-09-30
---

## Purpose and boundary

Tasks are the substrate's answer to "I need to do this". They are not a domain: there is no Tasks sidebar entry, only the **Today** view and a Garden widget. Domains create tasks from their own entities (a recipe to try, a project's next step, a supplement dose) and link back to them. Grocery lists are not tasks; they need quantities, stores and aisles and stay a Hearth entity (D-10).

## Entities (Phase 1)

| kind | fields beyond the common shape | completion |
|---|---|---|
| `todo` | `title`, `notes`, `due` (date or datetime), `priority` (none, low, high), `source` link | done once |
| `checklist` | `items[]` with per-item done, `due` | done when all items are |
| `routine` | a recurring template: `title`, `recurrence`, `timeOfDay`, `items[]` optional; occurrences are computed per day, never stored (D-75) | done per occurrence; skips allowed |
| `habit` | `title`, `target` (n per day or week), `recurrence`, `streak`, `grace` (missed occurrences allowed before a streak breaks) | tally per period |
| `reminder` | `title`, `at`, optional `source` link | no done state; dismiss or snooze |

Every task may link to the entity that created it (`source`) and to a Place (`at`).

The shapes of `recurrence`, `target` and `progress` are D-75's, read by `@eden/shared/tasks`; the crate holds them as JSON. Built: todos, routines and habits through Today's quick-add, a checklist done whole (it shows how many items are done, and Done finishes them all), a routine's done and skipped days and a habit's tallies in `progress`, the streak with its grace. Phase 2, "in full": the task editor and its detail pane, per-item checklists, a routine's `items[]`, the skip history, `until` and `count` in the interface, the grace setting, nudges, and pruning old days from `progress`, which until then grows a day at a time without bound.

## Recurrence

An RRULE subset (D-75): daily, weekly on chosen weekdays, monthly on a day, yearly, with `interval`, `until` or `count`; a month without the day is skipped, and a weekly interval counts weeks from Monday whatever the owner's week start. It is `@eden/shared/recurrence`, generic, so an Event repeats by the same rules. Occurrences can be skipped without breaking a routine. Habit streaks count consecutive periods with the target met, with the grace allowance; a habit's week runs from the owner's week start (D-58). Timezones follow the settings timezone (D-27) and travel with the device: every function takes the zone as a parameter, and until the setting exists (the Settings issue, which passes it to the Today store) it is the device's.

## Today view (Phase 1)

One screen, reachable from the sidebar and ⌘K: overdue (collapsed by default), due today, routines for today, habits with tallies, reminders coming up, and a quick-add field that parses "call dentist tomorrow 3pm" into a todo with a due time. A Quick Log strip sits at the top with the quick actions of enabled domains (D-12). Completing a task animates out and emits `task.completed`. Snooze offers later today, tomorrow, next week.

Built in `apps/desktop` (`shell/today/`), mirrored by the story `Domains/Today/Today`; the view is `todayView` in `@eden/shared/tasks`, pure. A line added here with no date is due today; a task made elsewhere with no due does not appear (D-75). Overdue is a todo or a checklist not done whose due day, in the owner's zone, is before today; a timed task whose time has passed today stays under Due today with its time marked, and a missed routine never becomes overdue. A done routine stays on the list, struck through with its time; a skipped one leaves. Reminders are not shown yet (the notification center). The quick-add grammar is `@eden/shared/tasks`' `vocabulary.ts`, read by `parse.ts` and pinned line by line in `parse.test.ts`: in English, today, tomorrow, a weekday (the next one after today), next week, in N days, MM-DD and YYYY-MM-DD; 3pm, 3:30pm and 15:00 (a bare number is not a time; a time alone is today while it is ahead, else tomorrow); every day, weekday, mon thu, week, N days, month or year, daily and weekly for a routine; N x a day or a week and N times a week for a habit. Japanese has the minimal forms, 今日, 明日, the weekdays with or without 日, N時 and N時M分, 毎日 and 毎週, and reads the English forms too; the fuller grammar is the Japanese pass's, in the same table. Each chip of the Quick Log strip opens its domain's page (`apps/desktop/src/lib/shell/quick-log.ts`) until the Quick Log sheet is built, which replaces the body of that one function.

## Garden widget

The `today` tile: counts of due and overdue, the top three items, and the quick-add field. Sizes small and medium.

## Relationship to the calendar

A task with a due date appears in Almanac through the **tasks layer** as a marker on its day. It is never an Event; it has no duration and no place on the timeline. Conversely, Events never appear in Today. The two views meet only in the Garden.

For the layer: a routine's `due` is `null`, so a range query never finds it; its days come from `occurrencesBetween` in `@eden/shared/recurrence`, and its state for a day from `progress` (D-75). A todo's marker is its due day in the owner's zone (`dueDay` in `@eden/shared/tasks`).

## Gardener tools (Phase 1)

| tool | reads | access | confirm |
|---|---|---|---|
| `create-task` | `task` | write-draft | the draft card is the confirmation |
| `complete-task` | `task` | write | inline undo |
| `summarize-day` | `task`, `event` | read | none |

## Notifications

Reminders fire as OS local notifications at their time. Due and overdue items ride the morning digest from Phase 2; in Phase 1 they appear in the in-app inbox. Routines nudge only if the owner enabled a nudge on that routine.

None of this is built with Today. Reminders can be stored but are never shown or fired; `task.due` is not emitted; and no inbox card or rule answers `task.created` or `task.completed`, because a rule can name only its own domain's signals today, so the substrate needs a way to have rules of its own. All of it, and the feed moving onto signals (with what it does about a completion that was undone), is the notification center's.

## How domains use tasks

| domain | task use | phase |
|---|---|---|
| Hearth | "restock rice" todo from a low-stock signal; a checklist for a cooking session | 1 |
| Toolbench | a project's next steps as todos linked to the project | 1 |
| Vigor | the training schedule as a routine; supplement doses as a routine; workout sessions are Events, not tasks | 2 |
| Sanctuary | the reading routine | 2 |
| Wellspring (later) | medication routines with a stricter nudge | later |
| Trails (candidate) | packing lists as checklists from templates | later |

The one rule (D-75): the data layer emits nothing for a task. Any code that creates or completes a task for the owner, a domain's included, calls `emitTaskCreated` or `emitTaskCompleted` from `@eden/shared/tasks` after its write, and asks the Today store to reload (`tasks.reload()` in `apps/desktop/src/lib/shell/today/store.svelte.ts`). Code that skips this still writes the task, but no signal is emitted and Today does not show it until the next launch. Nothing outside the store creates a task yet.

## Non-goals

Projects and kanban boards, collaboration, time tracking, delegation. A task has one owner and one line.
