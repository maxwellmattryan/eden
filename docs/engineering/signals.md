---
title: Signals and the scheduler
status: draft
summary: The scheduler, signals, rules and the inbox as code: the alarm in the crate and the take in the webview, the store and its commands, the rules a manifest declares and the frontend evaluates, the runtime both apps start, the refresh coordinator, the desktop inbox with its OS notifications, the first consumers, and how it is tested.
read-this-if: You are adding a schedule, a signal, a rule or a mirror that refreshes itself, touching the inbox or an OS notification, or changing when Sky fetches.
depends-on: [product/substrate/signals-notifications, engineering/data-layer, engineering/domain-module, engineering/app-scaffold]
updated: 2026-09-30
---

## Where it stands

| built | not yet |
|---|---|
| the scheduler with `once`, `daily` and `every`; signals with a key that emits once; rules from the manifests; the inbox rows; the alarm; the runtime in both apps; the refresh coordinator; the desktop bell as a plain list with mark-read; OS notifications on desktop behind the capability grant; Sky's alerts and forecast; Hearth's expiring digest and shop-day reminder | the substrate's own signals from the changes seam; the activity feed on signals; grouping, snooze and clearing in the inbox; rule toggles in Settings; quiet hours and digests; weekly and monthly triggers; the inbox and OS notifications on mobile; background execution on mobile; a measurement of the cadence in a hidden window |

D-73 records the decisions; this page is how they work.

## The pieces

| piece | where | holds |
|---|---|---|
| scheduler store | `src-tauri/src/substrate/scheduler.rs` | the `schedules` table: declare, set, cancel, take, the next instant due |
| alarm | `src-tauri/src/services/scheduler.rs` | a thread that tells the shell when something is due |
| signals store | `src-tauri/src/substrate/signals.rs` | the `signals` and `inbox` tables: emit, the inbox, mark read, the sweep, the capability check |
| commands | `src-tauri/src/commands/signals.rs` | the IPC boundary of all three |
| browser engine | `packages/shared/src/data/engine.ts` | the same stores over localStorage, for `yarn dev:web` |
| `@eden/shared/scheduler` | `packages/shared/src/scheduler/` | the rules (pure), the client |
| `@eden/shared/signals` | `packages/shared/src/signals/` | the rules (pure), the bus, the pump, the client, the runtime |
| `@eden/shared/refresh` | `packages/shared/src/refresh/` | the coordinator |
| inbox store | `apps/desktop/src/lib/shell/inbox.svelte.ts` | the cards behind the bell, and the OS notification of one |

## The scheduler

A schedule is a row: a name (`<owner>.<id>`, as `weather.alerts`), a kind, and `next_at`, the instant it is next due in milliseconds since the epoch.

| kind | declared by | next due after a take |
|---|---|---|
| `daily` | a manifest, at a local `HH:MM` | the first time the local clock reads that time after now |
| `every` | a manifest, in seconds, sixty at least | one period from now |
| `once` | a domain while the app runs, for an instant | never: the row is gone |

- **A take answers each due schedule once**, with the instant it was due at, however many occurrences were missed: ten missed periods of `every` are one fire, three missed mornings are one.
- **Declaring** makes the repeating rows what the manifests say. One that stands as declared keeps its `next_at`; a new or changed one starts today, a `daily` at its time (due at once when that has passed) and an `every` now; one no longer declared goes. The one-shots are not touched.
- **A one-shot** set for an instant already past is due at once. It cannot take a repeating schedule's name, and a cancel removes only a one-shot.
- **Daylight saving.** A daily time the clocks skip is read as the first one after it that exists, and a time they repeat as the earlier of the two, so a day has one occurrence. The browser engine reads both as the platform's `Date` does.
- **A change of timezone** leaves a `daily` due at the old zone's instant once, and right from then on.
- **Time is always a parameter** of the store's functions, so the tests choose it.

### The alarm and the take

A timer in a webview is slowed or stopped while its window is hidden, so the tick is the crate's. The alarm is a plain thread, started in `setup` once the workspace is managed. Every thirty seconds it reads the earliest `next_at` and, when that has passed, emits the Tauri event `scheduler-due`. It changes nothing.

The shell takes what is due (`take_due_schedules`) in three places: when the alarm rings, when it starts, and when its window becomes visible or takes focus. Only a take moves a schedule on. What follows from that:

- An occurrence is never lost to a webview that was not listening: a launch still loading, a reload after the content process was killed, an app suspended in the background. The alarm rings again at its next look until someone takes.
- Catch-up after a launch, a sleep or a spell in the background is the same call as any other take.
- Delivery is **at most once** per occurrence. A subscriber that fails after the take has lost that occurrence, so the bus isolates each subscriber, and every handler keys what it emits (below), so running one twice is harmless.
- The app has one window. A second would take from the first.

Each taken schedule is handed to its subscribers as `scheduler.fired` with its name and `dueAt`, and to the refresh coordinator. It is not a stored signal: a five-minute schedule would write some 8,600 rows a month.

## Signals and the inbox

A signal is a row of `signals`: a name (`subject.verb`), a payload, the tier of what it names, an optional key and its stamp. An inbox row is one rule's card for one signal: the signal's id, the rule (`<domain>.<kind>`), the channel and whether it was read. A card carries no words.

- **The payload** is a JSON object of at most 4 KB: the URIs of what the signal is about under `uris`, and a few fields for its rules and its words.
- **The tier** is the highest among the URIs' types in the registry, and T0 when the payload names nothing. A primitive whose tier is its kind's or its source's counts as T2, and so does a type the registry does not know.
- **The key** (`dedupeKey`) is what makes an occurrence the same one if it is emitted again: an alert's id, a day, a list and a day. A signal whose name and key were already emitted changes nothing and answers `null`. A signal without a key is always new.
- **One write.** The signal and its cards are stored together or not at all.
- **Thirty days.** The sweep runs when the workspace opens and takes a signal's cards with it; the browser engine sweeps at each emit.

The frontend works out the tier and the cards, and the crate checks shapes and stores: only the frontend has the manifests' rules, as it alone has the shape of a fact (D-72).

| command | arguments | answers |
|---|---|---|
| `declare_schedules` | `schedules`: `[{ name, daily? , every? }]` | nothing |
| `set_schedule` | `name`, `at` (milliseconds since the epoch) | nothing |
| `cancel_schedule` | `name` | whether there was a one-shot |
| `take_due_schedules` | | `[{ name, dueAt }]`, the longest overdue first |
| `emit_signal` | `input`: `{ name, payload?, tier, dedupeKey?, deliveries?: [{ rule, channel }] }` | `{ signal, deliveries }`, or `null` for a key already emitted |
| `query_inbox` | `filter`: `{ unreadOnly?, limit? }` | the cards with their signal's name, payload, tier and time, the latest first; fifty unless told, two hundred at most |
| `mark_inbox_read` | `ids` | how many were unread |
| `show_notification` | `title`, `body` | whether it was handed to the system: never while the capability is off |

A refusal starts with `schedule:invalid` or `signal:invalid` (`engineering/data-layer.md`, "The IPC boundary").

## Rules

A rule is a notification kind of a manifest that names a signal:

```json
{ "id": "severe-alert", "channel": "os", "cadence": "on-issue", "signal": "weather.alert", "when": { "severity": ["severe", "extreme"] } }
```

| field | meaning |
|---|---|
| `signal` | the trigger: a signal of the domain's own. A kind without one is declared and answers nothing |
| `when` | the condition: each field named must be, in the payload, one of the words listed |
| `channel` | the action: `in-app` is a card; `os` is a card and an OS notification |
| `default` | whether the rule is on; nothing else turns one on or off until the notification center's toggles |

Its words are locale keys derived from its id: `domains.<id>.notifications.<kind>.line` for the card, and `.title` for the OS notification, the kind in camelCase. They are ICU messages over the payload's words and numbers.

A manifest also declares its repeating schedules: `"schedules": [{ "id": "alerts", "every": 300 }]`, named `<domain>.<id>`. What the builder refuses of both is in `engineering/domain-module.md`.

`rulesOf(declarations)` makes the rules of the enabled domains, `deliveriesFor(rules, name, payload)` the cards a signal asks for, `signalTier(payload)` its tier. All three are pure, in `signals/rules.ts`.

## The runtime

`@eden/shared/signals` is what a domain and the shell call.

| function | does |
|---|---|
| `startSignals({ declarations, bind })` | binds each domain's subscriptions, declares the schedules, listens for the alarm, takes what is due; answers the stop. Each layout calls it once on mount, after the settings are read |
| `emit(name, payload, { dedupeKey })` | stores the signal with its cards, tells the inbox, then hands the payload to the signal's subscribers. `null` for a key already emitted, and then nobody hears it |
| `subscribe(name, handler)` | hears a declared signal |
| `onSchedule(name, handler)` | hears one schedule each time it is taken |
| `onDelivered(listener)` | hears the cards each emit makes |

A domain binds what it hears in its manifest binding, `subscribe: () => () => void` (`engineering/domain-module.md`, "Bindings"). The name of an emitted signal is typed from the manifests, so a signal no domain declares does not compile.

The pump (`signals/pump.ts`) is what takes: a call while a take is under way does not start a second beside it but asks for one more after, since the alarm, the window's return and the start can arrive together.

In a plain browser there is no alarm; the runtime looks every thirty seconds with a timer of its own, which is good enough for a preview.

## The refresh coordinator

`@eden/shared/refresh` decides when a mirror is fetched again, by who needs it.

```ts
coordinator.register({ id, refresh, age, foreground?, schedule? })   // answers the unregister
coordinator.watch(id)                                                // a view starts reading; answers the release
```

| a resource | is refreshed |
|---|---|
| with `foreground` and a reader | once `age()` reaches `foreground`, while the window is seen: on a check every minute, on the window's return, and at once when a reader arrives |
| with `schedule` | when that schedule fires, read or not, seen or not |
| with neither a reader nor a schedule | never |

The division of work: the scheduler owns the clock for what must happen unobserved; the coordinator owns freshness for what is on screen, where a late check costs nothing because the window's return checks again. A rule is what gives a resource a reason to stay fresh in the background, and that reason is a schedule. A refresh already under way is joined, not repeated, and a failed one is logged and stops nothing.

## The inbox on desktop

`InboxStore` reads the cards once and then hears each delivery, so the bell's count moves without asking the store again. The layout writes each card's line from its rule's keys and its signal's payload, which is why the inbox reads in the current locale, and gives it one action, Open, to the rule's domain (`manifestFor(domain).routes.open`, so the shell names no domain). Closing the bell marks what it showed as read (`StatusBar`'s `oninboxclose`).

A card on the `os` channel is also shown as an OS notification when it arrives, through `show_notification`:

- It needs the capability grant `os-notifications` for `this-device` (D-70). The desktop systems ask for no permission of their own, so this grant is the gate. The crate checks it again.
- While it is off, the latest such card offers "Turn on notifications", which records the grant. Notifications start with the next card; nothing is replayed.
- From T2 up the notification names the domain and says "Open Eden to see it", and not what the signal is about.
- In `yarn dev` on macOS the notification is posted as Terminal's, and nothing reports a failure: Terminal's notifications must be allowed and no Focus on.

The phone has no inbox and sends no OS notification yet. It runs the runtime, so its schedules are taken and its signals are stored.

## The first consumers

**Sky** (`packages/shared/src/weather/store.svelte.ts`). `weather.bind()` registers two resources:

| resource | refreshed | fetches |
|---|---|---|
| `weather.forecast` | once it is fifteen minutes old while read (each layout holds a watch for the live glyph), and whenever the owner asks | the forecast and the supplementary slots that are due; the alerts too when they are older than five minutes |
| `weather.alerts` | when the schedule `weather.alerts` fires, every five minutes | the alerts alone |

Each active alert is emitted as `weather.alert` with its id as the key, so it is a signal once however often it is answered; the rule `severe-alert` answers the severe and the extreme. The alert service answers 400 for a point outside the United States: Sky remembers that in the mirror (`alertsCovered`) and does not ask again until the home place changes or the owner presses Refresh. A service that does not answer leaves the alerts as they were.

**Hearth** (`packages/shared/src/domains/kitchen/signals.ts`, with the pure parts in `digest.ts`). The handlers read the rows and not the app's store, which is not loaded until a Hearth page opens.

| schedule | on fire | rule |
|---|---|---|
| `kitchen.morning`, daily at 08:00 | emits `stock.expiring` when something is dated no later than two days on, keyed by the day | `expiring-digest`, in-app |
| `kitchen.shop-day`, a one-shot at 08:00 on the list's shop day | emits `grocery.shop-day` if today is still that day, keyed by the list and the day | `shop-day-reminder`, OS |

`ensureShopDay()` sets or cancels the one-shot from the list as it is stored: when the shell starts, and after a seed, its undo and a reload. Nothing in the interface sets a shop day yet, so the reminder is reachable only through the sample data.

## Adding one

- **A schedule.** Add it to the manifest's `schedules`, run `yarn registry`, and hear it with `onSchedule` in the domain's `subscribe` binding. A one-shot is `setSchedule(name, at)` at the moment its instant is known, and again whenever that changes.
- **A signal.** Add its name to the manifest's `signals`, then `emit` it with a key whenever the same occurrence could be emitted twice.
- **A rule.** Give a notification kind its `signal`, and `when` if it has a condition; add its `line` (and `title` for `os`) to `en.json` and `ja.json`; an `os` rule needs `os-notifications` in `deviceCapabilities`.
- **A mirror that refreshes.** Register it with the coordinator in the domain's `subscribe` binding, with `foreground` if a view keeps it fresh and `schedule` if it has a background reason, and `watch` it from the view that reads it.

## Testing

| where | pins |
|---|---|
| `substrate/scheduler.rs` | `declaring_keeps_what_stands_and_removes_what_is_no_longer_declared`, `a_new_daily_starts_today_and_a_new_every_starts_now`, `many_missed_periods_are_one_fire`, `a_one_shot_is_gone_once_taken`, `a_daily_time_the_clocks_skip_or_repeat_still_comes_once` (in America/Chicago, through `chrono-tz`, a dev-dependency), `what_is_malformed_is_refused` |
| `substrate/signals.rs` | `a_signal_with_a_key_is_emitted_once`, `the_cards_are_written_with_the_signal_or_not_at_all`, `signals_are_swept_at_thirty_days_with_their_cards`, `an_os_notification_needs_the_capability_on_this_device` |
| `substrate/bundle.rs` | `a_replace_clears_grants_and_leaves_the_ledger` also proves a replace leaves the three tables |
| `scheduler/rules.test.ts`, `data/engine.test.ts` | the same rules in the browser engine |
| `signals/rules.test.ts`, `bus.test.ts`, `pump.test.ts` | the rules, the tier, a subscriber that throws, takes that arrive together |
| `refresh/coordinator.test.ts` | read and due, unread, hidden, fired, joined, reported |
| `scripts/registry/core.test.mjs` | what the builder refuses of a rule and a schedule |
| `weather/nws.test.ts` | the alert service's answers, from two captures |
| `domains/kitchen/digest.test.ts` | the digest and the shop day's morning |

The alarm, the runtime and the OS notification are not under test: they need a window. What is **not measured** is how punctual the alarm and the take are while the window is hidden. The alarm's thread is outside the webview, but macOS may still slow a hidden app (App Nap). Due times are wall-clock instants, so a slowed look is late and never lost. To measure: minimise the `yarn dev` window for twenty minutes and compare the `scheduler: something is due` lines in the log (`RUST_LOG=debug`), and the NWS count in Settings → Privacy, with five-minute steps.
