---
title: Tasks
status: draft
summary: The Task primitive in detail: kinds, recurrence, routines, habits, reminders, the Today view and its Garden widget, the relationship to the calendar, Gardener tools, and how domains use tasks.
read-this-if: You are designing anything the owner has to do, do again, or be reminded of.
depends-on: [primitives, signals-notifications]
updated: 2026-09-27
---

## Purpose and boundary

Tasks are the substrate's answer to "I need to do this". They are not a domain: there is no Tasks sidebar entry, only the **Today** view and a Garden widget. Domains create tasks from their own entities (a recipe to try, a project's next step, a supplement dose) and link back to them. Grocery lists are not tasks; they need quantities, stores and aisles and stay a Hearth entity (D-10).

## Entities (Phase 1)

| kind | fields beyond the common shape | completion |
|---|---|---|
| `todo` | `title`, `notes`, `due` (date or datetime), `priority` (none, low, high), `source` link | done once |
| `checklist` | `items[]` with per-item done, `due` | done when all items are |
| `routine` | a recurring template: `title`, `recurrence`, `timeOfDay`, `items[]` optional; occurrences are generated per period | done per occurrence; skips allowed |
| `habit` | `title`, `target` (n per day or week), `recurrence`, `streak`, `grace` (missed occurrences allowed before a streak breaks) | tally per period |
| `reminder` | `title`, `at`, optional `source` link | no done state; dismiss or snooze |

Every task may link to the entity that created it (`source`) and to a Place (`at`).

## Recurrence

An RRULE subset: daily, weekly on chosen weekdays, monthly on a day, yearly, with `interval`, `until` or `count`. Occurrences can be skipped without breaking a routine. Habit streaks count consecutive periods with the target met, with the grace allowance. Timezones follow the settings timezone (D-27) and travel with the device.

## Today view (Phase 1)

One screen, reachable from the sidebar and ⌘K: overdue (collapsed by default), due today, routines for today, habits with tallies, reminders coming up, and a quick-add field that parses "call dentist tomorrow 3pm" into a todo with a due time. A Quick Log strip sits at the top with the quick actions of enabled domains (D-12). Completing a task animates out and emits `task.completed`. Snooze offers later today, tomorrow, next week.

## Garden widget

The `today` tile: counts of due and overdue, the top three items, and the quick-add field. Sizes small and medium.

## Relationship to the calendar

A task with a due date appears in Almanac through the **tasks layer** as a marker on its day. It is never an Event; it has no duration and no place on the timeline. Conversely, Events never appear in Today. The two views meet only in the Garden.

## Gardener tools (Phase 1)

| tool | reads | access | confirm |
|---|---|---|---|
| `create-task` | `task` | write-draft | the draft card is the confirmation |
| `complete-task` | `task` | write | inline undo |
| `summarize-day` | `task`, `event` | read | none |

## Notifications

Reminders fire as OS local notifications at their time. Due and overdue items ride the morning digest from Phase 2; in Phase 1 they appear in the in-app inbox. Routines nudge only if the owner enabled a nudge on that routine.

## How domains use tasks

| domain | task use | phase |
|---|---|---|
| Hearth | "restock rice" todo from a low-stock signal; a checklist for a cooking session | 1 |
| Toolbench | a project's next steps as todos linked to the project | 1 |
| Vigor | the training schedule as a routine; supplement doses as a routine; workout sessions are Events, not tasks | 2 |
| Sanctuary | the reading routine | 2 |
| Wellspring (later) | medication routines with a stricter nudge | later |
| Trails (candidate) | packing lists as checklists from templates | later |

## Non-goals

Projects and kanban boards, collaboration, time tracking, delegation. A task has one owner and one line.
