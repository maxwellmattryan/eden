---
title: Hearth
status: draft
summary: Stock by location, recipes from what you have, grocery lists, capture a haul from a photo or receipt, storage tips, food allergies and supplements. Id `kitchen`, Phase 1.
read-this-if: You are working on stock, recipes, grocery lists, capture, food allergies or supplements.
depends-on: [substrate/registry, substrate/primitives, substrate/grants, substrate/tasks, substrate/shell, substrate/ai]
updated: 2026-09-30
---

## 1. Purpose

Hearth keeps track of the food and consumables in the home, helps cook from what is there, and shops for what is missing. It respects allergies and medical restrictions without needing to know why they exist. The one thing it must do well: **know what is in the fridge and pantry without the owner typing it in.**

## 2. User stories

- MVP: Photograph a grocery haul or a receipt, confirm what was recognised, and have it land in stock under the right location with an estimated expiry.
- MVP: See what is expiring soon and get a recipe that uses it.
- MVP: Ask what I can cook tonight; nothing suggested contains my allergens or breaks a medical restriction.
- MVP: Keep a grocery list grouped by store; add an item in one gesture; add a recipe's missing ingredients in one tap.
- MVP: Mark "I cooked this" and have the stock decrement.
- MVP: Get a storage tip for any item ("keep ginger in the freezer").
- MVP: Keep supplements and mixes such as LMNT packets in stock with a low-stock alert.
- Later: Plan the week; Hearth drafts shop-day events and a list for it.
- Later: Use the grocery list on my phone in the store; scan a barcode to add stock.
- Later: Export the list to a grocery service; import an online order from a confirmation email.

## 3. Entities

| entity | key fields | tier | links out |
|---|---|---|---|
| `stock-item` | name, qty, unit, `location` (pantry, fridge, freezer, counter), category (produce, dairy, grains, supplements-and-mixes, …), purchased, expires, `expiryEstimated`, `source` (manual, capture, recipe), low-stock threshold | T0 | `haul-photo` attachment |
| `recipe` | title, ingredients (name, qty, unit), steps, time, servings, tags, source URL, optional label nutrition | T0 | stock items it consumed |
| `grocery-list` | name, store, active flag | T0 | `shop-day` Event |
| `grocery-item` | name, qty, unit, store, aisle, `origin` (manual, recipe, low-stock), checked | T0 | recipe, stock item |
| `storage-tip` | item pattern, location, typical shelf life, tip text, `bundled` or owner-written | T0 | |

Allergies are facts, not entities. Stock is shown sectioned by location; the location list is fixed to the four values so capture can place items without a picker.

## 4. Facts

Written: `allergy` T2 (kind `food`, from the allergen editor; drug allergies are Wellspring's later), `dietary-preference` T1, `disliked-ingredient` T0, `cuisine-preference` T0, `household-size` T1.

Read: `medical-dietary-restriction` (Wellspring, T2; the owner may assert it in the profile before Wellspring exists), `favorite-supplement` (Vigor, T1) to keep favourites in the supplements category, `home-area` (substrate, T1) for store suggestions later.

## 5. Gardener tools and guardrails

| tool | reads | access | confirm | grade |
|---|---|---|---|---|
| `suggest-recipes` | `stock-item`, `recipe`, `dietary-preference`, `disliked-ingredient`, `cuisine-preference`, `allergy`, `medical-dietary-restriction` | read | none | `standard` |
| `storage-tip` | `stock-item`, `storage-tip` | read | none | `light` |
| `capture-haul` | none (image only) | write-draft | the verification sheet | `light`, needs `vision` |
| `draft-grocery-list` | `stock-item`, `recipe`, `grocery-list`, `grocery-item` | write-draft | editable list card | `standard` |
| `add-stock` | `stock-item` | write | confirm sheet; Quick Log path uses undo | plain |
| `plan-week` | `stock-item`, `recipe`, `local-event`, `task` | write-draft | a plan card; commit creates `shop-day` Events and tasks through the substrate API (D-33) | `deep`, needs `tools` |

Never-do list: never suggests anything containing an allergen or a restricted ingredient, and every suggestion passes the local safety filter before display regardless of what the model saw (D-25); never gives nutrition or medical advice beyond label facts; never orders groceries; never sends a photo before the confirm sheet (D-29).

## 6. Surfaces

**Desktop views (Phase 1)**: Stock (sections Fridge, Freezer, Pantry, Counter; sort by expiry; low-stock filter; supplements category), Recipes (list, detail with "cook this"), Grocery (active list grouped by store, check off, add from recipe, clear checked), Tips (search). **Capture** opens from the Stock primary action.

**Mobile (Phase 2)**: Grocery list is the primary tab surface; Capture with barcode scanning; Stock read and edit.

**Garden widgets**: `expiring-soon` (S, M; reads `stock-item`), `cook-tonight` (M; reads `stock-item`, `recipe`, `dietary-preference`, `allergy`, `medical-dietary-restriction`; computed locally by matching recipes to stock and expiry, with the safety filter, no model call), `grocery-quick-add` (S; reads `grocery-list`, `grocery-item`).

**Palette**: go to Hearth, add to grocery, capture haul, cook tonight, search stock and recipes.

**Quick actions**: `capture-haul`, `add-to-grocery`.

**Capture sources**: photo of a haul, photo of a receipt (Phase 1); barcode and share sheet (Phase 2).

### Capture a haul

Photo, receipt or barcode → a vision model returns draft rows (name, qty, unit, category, suggested location, estimated expiry from storage tips) → the verification sheet lets the owner edit, remove, merge into an existing item of the same name and location, and change locations → commit writes stock items, attaches the `haul-photo`, and emits `attachment.added`. On mobile, barcode and receipt OCR run on-device; haul photos go to the configured cloud provider after the sheet names it (D-29). Nothing is stored before commit (D-13).

### Cooking decrements stock

"I cooked this" subtracts each ingredient's quantity when units match, asks when they do not, and never drops an item below zero. The recipe links to the items it consumed.

## 7. Kinds, signals, notifications, intents

Kinds: `shop-day` (event, T0), `haul-photo` (attachment, T1).

Signals: `stock.expiring` (daily at 08:00 via the scheduler, when something is dated no later than two days on; built), `stock.low`, `grocery.shop-day` (at 08:00 on the list's shop day; built).

| notification | channel | cadence | default |
|---|---|---|---|
| expiring digest | in-app; part of the morning digest from Phase 2 | daily | on |
| low stock | in-app | weekly | on |
| shop-day reminder | OS | morning of the `shop-day` Event | on |

Until the shop day is an Event, the reminder is set from the list's own shop-day field (D-73, `engineering/signals.md`). Nothing in the interface sets that field yet, so the reminder is reachable only through the sample data.

Intents handled: `kitchen.add-to-grocery`. Intents sent: none.

## 8. Integrations

| integration | phase | access | sends | receives |
|---|---|---|---|---|
| camera | 1 | per device | | photos |
| vision through the Gardener | 1 | per-request confirm | the photo | draft rows |
| share sheet | 2 | | | URLs, photos |
| barcode lookup | later | read | a barcode | product name |
| grocery service export (HEB, Instacart) | later | export file or link; ordering would be `act-external` | the list | |
| order-confirmation email, label-scoped | later | read | | order lines |

## 9. Settings

Locations shown; expiry estimation on or off; low-stock thresholds by category; default store; supplements category on or off; a link to the allergen editor in the profile.

## 10. Non-goals and open questions

Non-goals: calorie or intake tracking (OQ-8), ordering, meal plans against nutrition targets, inventory of anything that is not consumable.

Open: OQ-11.

## Registry rows

Appended to `substrate/registry.md` under Hearth: facts `allergy` T2, `dietary-preference` T1, `disliked-ingredient` T0, `cuisine-preference` T0, `household-size` T1; entities `stock-item`, `recipe`, `grocery-list`, `grocery-item`, `storage-tip`, all T0; kinds `shop-day` (event, T0), `haul-photo` (attachment, T1).
