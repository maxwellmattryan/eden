---
title: Glossary
status: draft
summary: Every fixed term in Eden, the domain names in English and Japanese with their plain ids and subtitles, and the metaphor policy that decides what gets a themed name.
read-this-if: You are naming anything, writing copy, or unsure what a word means in these docs.
depends-on: []
updated: 2026-09-27
---

## Core terms

| term | meaning |
|---|---|
| **domain** | A standalone module of Eden with its own UI, entities and settings (Hearth, Almanac, …). The word in code and docs. Never "context", which is reserved for AI context. |
| **substrate** | The shared layer every domain plugs into: profile, grants, primitives, signals, data, the Gardener, the shell. Plain names only. |
| **workspace** | The per-user store: everything one person's Eden holds. One user per workspace (D-22). |
| **fact** | A typed statement about the owner in the profile (`allergy`, `gym-preference`). Has a tier, a provenance and an owner. |
| **tier** | Sensitivity level T0 (harmless), T1 (personal), T2 (sensitive), T3 (restricted). Defined once in `substrate/privacy.md`. |
| **resource** | Anything a grant or a declared read can name: a fact type, an entity type or a primitive kind. All live in `substrate/registry.md`. |
| **registry id** | The kebab-case id of a resource (`stock-item`, `allergy`, `shop-day`). No domain prefix, no dots. |
| **primitive** | One of the four shared entity types: Task, Event, Place, Attachment. |
| **kind** | The owner-declared subtype of a primitive that carries its tier (`workout-session`, `home`, `identity-document`). |
| **event** | The calendar primitive: something with a time. Never a pub/sub message. |
| **signal** | A pub/sub message emitted by the substrate or a domain (`stock.expiring`). Feeds rules, notifications, the activity feed. |
| **rule** | Trigger → condition → action, where the action is notify, create a task, or run a tool under a grant. |
| **intent** | A domain-owned action another part of Eden can request (`kitchen.add-to-grocery`). Never primitive CRUD. |
| **entity link** | A typed reference to another entity by URI (`eden://recipe/<ulid>`). Degrades to plain text if the target is gone. |
| **mirror** | A row that caches external state (a Google event, a provider place, a forecast), flagged `mirror`, keyed by source + external id, excluded from sync and export. |
| **overlay** | The owner's edits, tags, favorites and links on a mirror, keyed by the same source + external id. Overlays sync. |
| **grant** | A permission: subject (integration, model, plugin, device capability) × resource × access level × lifetime. |
| **access level** | `read`, `write-draft`, `write`, `act-external`, `never`. One vocabulary for AI tools, integrations and rule actions. |
| **Gardener** | The AI assistant. One persona across every surface. |
| **Council** | Fanning one prompt to several models side by side, with optional chair synthesis. |
| **context pack** | What one AI request is allowed to see, assembled from the declared reads of its tools and surface, gated by tier grants. |
| **declared reads** | The registry ids an AI tool or surface states it reads. Nothing outside them reaches the model. |
| **audit log** | The per-request record of what the Gardener saw, did and cost. |
| **egress ledger** | The Settings view of every byte that left the device, by destination. |
| **Vault** | The store for T3 attachment kinds. Separate keys, biometric to open, unreachable by the AI subsystem. Only ever this. |
| **Quick Log** | A one-field entry reachable in two seconds from anywhere (log weight, capture an idea). |
| **Capture** | Photo, receipt or barcode → draft entities → verification sheet → commit. |
| **widget** | A dashboard tile a domain contributes. |
| **surface** | A place UI appears: a desktop view, a mobile view, a widget, a palette action, a chat panel. |
| **Garden** | The dashboard (OQ-1). |
| **Today** | The Tasks view: what is due, routines, quick logs. |
| **daily line** | The proverb or excerpt shown on the splash screen and the Garden. Provided by Sanctuary; neutral when Sanctuary is disabled. |
| **manifest** | What a domain declares to the shell. Plugins later are manifests you did not write. |
| **layer** | In Almanac, either a filter over Events by kind, or a day annotation provider (sun, moon, weather, holidays, astrology). |
| **Listing** | A provider event in Meadow (a mirror). "Interested" makes a tentative Event; "going" confirms it. |

## Domain names

Ids are plain and permanent. Display names are themed and translatable. The subtitle is always shown next to the name in the sidebar and onboarding until the user collapses it.

| id | English | 日本語 | subtitle | status |
|---|---|---|---|---|
| `kitchen` | **Hearth** | 台所 | Food, recipes, pantry, groceries | full |
| `toolbench` | **Toolbench** | 工房 | Ideas, projects, homelab, generative art | full |
| `weather` | **Sky** | 空 | Weather, forecasts, sun and moon | full |
| `calendar` | **Almanac** | 暦 | Calendar and scheduling | full |
| `fitness` | **Vigor** | 活力 | Workouts, gyms, body metrics | full |
| `spirit` | **Sanctuary** | 聖域 | Reflection, readings, values | full |
| `places` | **Meadow** | 野原 | Places and events near you | full |
| `finance` | **Orchard** | 果樹園 | Money, budgets, assets | stub |
| `health` | **Wellspring** | 泉 | Medical, meds, care | stub |
| `people` | **Companions** | 仲間 | Relationships | candidate |
| `journal` | **Rings** | 年輪 | Daily reflection and mood | candidate |
| `travel` | **Trails** | 旅路 | Trips and itineraries | candidate |
| `library` | **Leaves** | 書庫 | Reading and articles | candidate |

Shell names: **Garden** (庭, dashboard), **Today** (今日), **Gardener** (庭師), **Council** (評議会), **Vault** (金庫), **Settings** (設定).

Japanese names prefer a native noun where the metaphor survives (暦, 年輪, 工房, 空, 泉, 庭師) and a plain noun where it does not (台所, 活力, 仲間). They are display strings in the `ja` locale, never ids.

## Metaphor policy

Themed: the app name, the domain display names, Gardener, Council, Garden, the daily line, the visual language (D-2). Everything else is plain: substrate terms, statuses, settings, errors, data terms, primitive names, kind ids. A themed word is never used for a state or an error ("your seedling failed to sprout" is forbidden). "Greenhouse" is reserved (OQ-13).

## Naming rules

- Registry ids, kind ids, signal names, file names: kebab-case, English, no domain prefix in kind ids.
- Signals are namespaced by subject, not owner: `stock.expiring`, `weather.alert`, `task.completed`.
- Intents are namespaced by the handling domain: `kitchen.add-to-grocery`.
- Entity URIs: `eden://<type>/<ulid>`.
- The app name is never hard-coded in copy; it is a locale variable, as in Crate.
- UI copy is plain and warm. The Gardener speaks in first person, briefly, and says what it can see.
