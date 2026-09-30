---
title: Grants
status: draft
summary: One permission model for integrations, the Gardener's reads and actions, plugins and device capabilities; defaults, confirmation patterns by access level, the never-automated list, per-device exceptions and the ledger.
read-this-if: You are designing anything that reads personal data on behalf of a model or a service, or anything that acts on the world.
depends-on: [privacy, registry]
updated: 2026-09-29
---

## Purpose

Every question of the form "may X see or do Y" is answered by a grant. Integrations, AI models, plugins and device capabilities are all subjects. Registry ids, connector scopes, tools and capabilities are all resources. One vocabulary, one store, one ledger.

## Grant anatomy (Phase 1)

| field | values |
|---|---|
| `subject` | an integration id (`google-calendar`), an AI provider or model id, a plugin id (later), a device capability holder (`this-device`) |
| `resource` | for AI: a registry id (fact type, entity type or kind, D-31); for integrations: a connector scope (`calendar:<id>:read`); for actions: a tool id; for devices: `camera`, `location-precise`, `os-notifications`, `healthkit` |
| `resourceType` | which of those the resource is: `registry`, `scope`, `tool`, `capability` (D-70) |
| `access` | `read`, `write-draft`, `write`, `act-external`; `never` is a verdict, not a grant anyone holds |
| `lifetime` | `standing`, `session` (until the app closes), `per-request` |
| `narrowing` | optional: calendar ids, label ids (later), a place, a date range |
| `origin`, stamps | onboarding, settings, an inline confirm sheet; created and updated stamps, and a tombstone when revoked |

Grants are workspace policy and **sync** (D-37), with the exceptions listed below. The store's rules, what it refuses and what a check answers are D-70; `engineering/data-layer.md` has the table.

## Defaults

- Integrations connect **read-only** with the narrowest scope the connector offers. Widening is a separate grant.
- The Gardener may read **T0 and T1** resources that a tool or surface declares. **T2** needs a standing or per-request grant on that registry id. **T3** is `never` and cannot be granted.
- The Gardener's tools default to `read`. `write-draft` needs no grant because nothing is stored until the owner commits. `write` needs a per-tool standing grant or a per-request confirm. `act-external` always confirms per request.
- Device capabilities are off until asked for, in context, the first time a feature needs them.
- **Onboarding asks for the T2 grants the Phase 1 flows need**: `allergy` and `medical-dietary-restriction` for Hearth's Gardener tools. The prompt explains what the grant enables and what happens without it (D-25).

## Safety filters do not depend on grants

Allergy and medical-restriction checks are deterministic and local. Recipe and grocery suggestions are filtered against the allergen list before they are displayed, whether or not the model was allowed to see the allergies. The grant improves suggestions; the filter guarantees safety (D-25).

## Confirmation patterns by access level

| access | what the owner sees |
|---|---|
| `read` | nothing at the moment; the "can see" chip on the Gardener panel and the audit log afterwards |
| `write-draft` | the draft itself, in a verification sheet or an editable card; commit is the owner's click |
| `write` | a confirm sheet naming the entities that will change, with undo after; Quick Log writes skip the sheet and rely on undo (D-12) |
| `act-external` | a confirm sheet naming the destination and showing the exact payload; never batched, never remembered as standing |
| `never` | the action is not offered; the tool is not registered |

## The never-automated list

These are `never` for every subject, cannot be granted, and appear in `settings-utilities.md` as a read-only list: sending email or messages as the owner, payments and transfers, deleting data in an external service, changing account settings in an external service, accepting terms on the owner's behalf (D-8).

## Per-device exceptions

| what | why | state shown |
|---|---|---|
| device-capability grants (camera, precise location, OS notifications, HealthKit) | the OS grants them per device | "not granted on this device", asked in context |
| session grants | they last until the app closes, which is one device's event | ended when the workspace opens again (D-70) |
| secrets: bring-your-own-key API keys, connection tokens | T3, never sync before Phase 3 | "Gardener configured, no key on this device"; "granted, not connected here" for integrations, each with a one-tap fix in the status bar |

## Ledger

The grant store ships in Phase 1 because every read and confirm consults it; Settings → Privacy shows the count of standing grants beside the egress ledger. The ledger UI arrives in Phase 2: a list grouped by subject, with resource, access, lifetime, origin and date; revoke in place; a history of grants and revocations, which the tombstones already keep. Revoking a grant ends future reads immediately and never retroactively changes stored data.

## Interaction with the audit log

Every Gardener request writes an audit entry naming the registry ids read and the tools run. Each entry links to the grants that allowed it, so "why could it see that" is one tap from "what did it see" (`substrate/ai.md`).

## Examples

- **Hearth, suggest recipes.** Declared reads `stock-item`, `recipe`, `dietary-preference`, `disliked-ingredient`, `cuisine-preference`, `allergy`, `medical-dietary-restriction`. The first five are T0–T1 and need nothing. The last two are T2 and were granted in onboarding. Output is filtered locally against allergies regardless.
- **Sky, rain during my run.** Declared reads `workout-session`, `forecast`, `home-area`. All T0–T1. Runs from any chat under the default grant.
- **Google Calendar.** Phase 2 grant: `calendar:<id>:read` per selected calendar, standing. Write is a Phase 3 grant, per calendar (OQ-6).
- **Capture a haul.** Device grant `camera` on this device; a per-request confirm naming the vision provider before the photo is sent (D-29).
- **A Quick Log of weight.** Tool `log-body-metric`, access `write`, standing grant created the first time the owner uses it; undo instead of a confirm sheet.
