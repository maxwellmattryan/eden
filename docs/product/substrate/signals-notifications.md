---
title: Signals and notifications
status: draft
summary: The signal model, the scheduler, rules that turn signals into notifications or tasks, channels, digests and quiet hours, the notification center, the activity feed, and the toast policy.
read-this-if: You are designing anything that tells the owner something happened, or anything that runs on a schedule.
depends-on: [primitives, grants]
updated: 2026-09-27
---

## Signal model (Phase 1)

A signal is an in-process message with a name, a small payload and a stamp. Names are `subject.verb`, namespaced by subject rather than emitter (`stock.expiring`, `task.completed`, `weather.alert`), so the word "event" stays reserved for the calendar primitive (D-34). The payload carries entity URIs and a few fields, never full entities. A signal's tier is the highest tier of any resource it references, which decides whether its notification may show content on the lock screen.

Signals are persisted for the activity feed and consumed by rules. They are not a queue between devices; each device emits its own.

## Scheduler

| phase | capability |
|---|---|
| 1 | one-shot triggers at a time, daily triggers at a local time, catch-up on launch for triggers missed while closed |
| 2 | weekly and monthly triggers, digests, quiet hours, sync jobs, the daily line |
| 3 | mobile background execution, push through the relay (OQ-3) |

The scheduler emits `scheduler.fired` signals; domains subscribe to their own named schedules (Hearth's expiring check at 08:00, Sky's forecast refresh every three hours).

## Rules

A rule is **trigger → condition → action**. Triggers are signal names or schedules. Conditions are simple predicates on payload fields and time. Actions are: notify on a channel with a template, create a task, or run a Gardener tool under an existing grant (Phase 2). Domains ship default rules in their manifest. The owner can toggle each in Phase 1 and edit conditions and channels in Phase 2 (Settings → Notifications). Rules never widen a grant.

## Channels

| channel | phase | use |
|---|---|---|
| in-app inbox | 1 | everything |
| toast | 1 | errors and undo only |
| OS local notification | 1 | reminders, shop-day, severe weather; content hidden on the lock screen for T2 signals |
| push through a relay | 3 | mobile when the app is closed (OQ-3) |
| email, SMS | 3 | opt-in per rule (OQ-3) |

## Digests and quiet hours (Phase 2)

A morning digest at a chosen time collects agenda, tasks due, expiring stock, weather and the daily line into one notification and one inbox card. An optional evening digest previews tomorrow. Quiet hours default to 22:00–07:00; only severe-weather alerts and reminders the owner marked urgent break through.

## Notification center (Phase 1)

The inbox opens from the status bar bell. Cards group by domain and day, carry read state, snooze, and inline actions (open, done, add to grocery). The bell shows an unread count. Clearing the inbox never deletes the underlying signals from the activity feed.

## Activity feed (Phase 1)

A reverse-chronological list on the Garden of what happened: captures committed, tasks completed, metrics logged, ideas touched, integrations connected, sync overrides. Each entry is a template over a signal ("Logged 82.4 kg", "3 items expiring by Friday") with a link to the entity. Filter by domain. Retention 30 days (`substrate/data.md`). The feed is the owner's memory of Eden's activity, and the place a sync override or a failed connection is noticed.

## Toast policy

Success is silent. Toasts show errors and offer undo. This is Crate's rule and Eden keeps it.

## Phase 1 signal list

| signal | emitter | payload |
|---|---|---|
| `task.created`, `task.completed`, `task.due` | substrate | task URI |
| `event.created`, `event.upcoming` | substrate | event URI, start |
| `place.created` | substrate | place URI |
| `attachment.added` | substrate | attachment URI, kind |
| `fact.changed` | substrate | fact type, provenance |
| `integration.connected`, `integration.disconnected`, `integration.failed` | substrate | integration id, device |
| `ai.request.completed`, `ai.budget.threshold` | Gardener | audit id; percent |
| `scheduler.fired` | scheduler | schedule name |
| `stock.expiring`, `stock.low`, `grocery.shop-day` | Hearth | item URIs; list URI |
| `idea.stale`, `project.updated` | Toolbench | idea or project URI |
| `weather.alert`, `weather.rain-before-plan` | Sky | alert id; event URI |

Phase 2 adds `daily-line.ready`, `body-metric.logged`, `workout.logged`, `reading.logged`; Phase 3 adds `sync.override`, `listing.matched`.

## Non-goals

Notifications to other people, marketing or engagement nudges, and any notification a rule cannot explain.
