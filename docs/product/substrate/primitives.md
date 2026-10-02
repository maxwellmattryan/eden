---
title: Primitives
status: draft
summary: The four shared entity types every domain uses instead of inventing its own: Task, Event, Place, Attachment. Ids, kinds, mirrors and overlays, snapshots, typed links, and what happens to them when a domain is disabled or removed.
read-this-if: You are touching anything with a time, a location, a to-do or a file, or wiring one domain's data to another's.
depends-on: [privacy, registry]
updated: 2026-10-01
---

## Purpose and boundary

Anything timed is an Event. Anything located is a Place. Anything to do is a Task. Any file is an Attachment. Domains never define their own versions of these; they register **kinds** and read and write the primitives through the substrate API (D-23, D-33). Almanac is the UI and integrations over Events, Meadow over Places, Today over Tasks, the Vault over T3 Attachments. Each keeps working when the others are disabled.

## Common shape (Phase 1)

| field | meaning |
|---|---|
| `id` | ULID; the URI is `eden://<type>/<id>` (D-24) |
| `type` | `task`, `event`, `place`, `attachment` |
| `kind` | a registry kind id; carries the tier and names the owner through the registry (D-30, D-36) |
| `createdAt`, `updatedAt`, `deletedAt` | hybrid logical clock stamps; deletes are tombstones for sync |
| `links` | typed entity links (below) |
| `mirror` | true when the row caches external state (below) |
| `source`, `externalId` | present on mirrors and overlays |
| `snapshot` | essentials copied from a mirror when a derived row must render without it |

## Event

`title`, `start`, `end`, `allDay`, `timezone`, `recurrence` (an RRULE subset with exception dates), `status` (`tentative`, `confirmed`, `cancelled`), `place` (link), `notes`, `reminders`, `calendarSource` (link; every Event has one, local by default), `attendees` (read-only, mirrors only). Tier comes from the kind, except mirrored Events, which inherit their CalendarSource tier (default T1).

## Place

`name`, `kind`, `geo` (lat, lng), `address` (a T2 field, populated only for `home` and places the owner enters by hand; its parts, D-137, kept as D-138 says), `category`, `phone`, `url`. Exactly one Place has kind `home` (D-38, D-141); the substrate derives the `home-area` fact from its address. A place the owner saved in Meadow is a `venue` Place of their own with its `place-profile`, not a mirror; what Meadow found and the owner has not saved is an entity mirror of this device (D-133).

## Task

Summarised here, detailed in `substrate/tasks.md`: `title`, `kind` (`todo`, `checklist`, `routine`, `habit`, `reminder`), `due`, `recurrence`, `items`, `done`, `streak`, `source` (link to the entity that created it, such as a recipe or a workout template).

## Attachment

`kind`, `mime`, `size`, `hash`, `store` (`workspace` or `vault`), `thumbnail` (never for Vault items), `ocrText` (on-device OCR; Vault text stays inside the Vault and feeds search only), `captured` (device, time, rough location if granted). T3 kinds are stored in the Vault with their own keys (`substrate/data.md`).

## Mirrors and overlays (Phase 2 for Google, Phase 1 for forecasts)

A row that caches external state carries `mirror: true`, `source` and `externalId`, and is identified by that pair, not by its ULID. Mirrors live in the normal tables so layers and declared reads query one source, but they are **excluded from sync and export** and are re-fetched on each device (D-32). Connections are per device, so a mirror can exist on the phone and not on the desktop until that device connects (D-37).

The owner's edits, tags, favorites, notes and links on a mirror are **overlays**: separate rows keyed by the same `source` + `externalId`. Overlays sync and export. When the mirror is re-fetched, the overlay reattaches by key. Meadow keeps no overlay: saving a found place makes the owner's rows and drops the mirror (D-133).

## Snapshots

A row derived from a mirror (an `outing` Event created from a Listing, a Vigor Gym linked to a provider place) copies the essentials it needs to render: title, time, place name, geo. If the mirror is absent on this device, the row renders from its snapshot with a "details from <source>" note (D-37).

## Typed entity links

A link is `{uri, relation, label}`: the target URI, a relation from a short list (`about`, `at`, `from`, `for`, `part-of`, `see-also`), and a label snapshot. Links are the allowed way to reference another domain's entity. If the target is deleted or its domain is removed, the link degrades to its label as plain text and stops resolving. Links never carry the target's data.

## Kinds

Registered in `substrate/registry.md` by the owning domain with a primitive, a tier and a phase. Ids are plain nouns without domain prefix (`workout-session`, `shop-day`, `outing`, `home`, `venue`, `haul-photo`). Kinds are structural, not folders: a Vigor session is one Event of kind `workout-session`, and Almanac shows it through a layer that filters on that kind.

## Substrate API (Phase 1)

`createTask`, `createEvent`, `createPlace`, `attach`, `update`, `delete`, `query` (by type, kind, time range, place, link), `link`, `snapshot`. Domains and the Gardener's tools call these; there are no intents for primitive CRUD (D-33). Writes emit signals (`event.created`, `task.completed`) that rules and the activity feed consume.

## Lifecycle when a domain is disabled or removed

- **Disabled**: its UI, widgets, quick actions and tools disappear. Its primitives, kinds, facts and links stay. Other domains' links to its entities render with a "from a disabled domain" note and still resolve.
- **Removed** (explicit, rare): export first, then its entities are deleted, its kinds are marked retired in the registry, its derived facts are retracted, and links to its entities degrade to text (`substrate/domain-manifest.md`).

## Non-goals

- Domain-specific copies of any primitive.
- Attachments as a general file manager. They exist attached to entities.
- Synchronising mirrors. The source of truth is the external service; Eden caches.
