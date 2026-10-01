---
title: Hearth
status: draft
summary: Stock by location, recipes from what you have and from a link, a photo or pasted text, grocery lists, capture a haul from photos, receipts and order confirmations, take stock from photos of the shelves, a picture and a tip on the item, food allergies and supplements. Id `kitchen`, Phase 1.
read-this-if: You are working on stock, recipes, grocery lists, capture, food allergies or supplements.
depends-on: [substrate/registry, substrate/primitives, substrate/grants, substrate/tasks, substrate/shell, substrate/ai]
updated: 2026-10-01
---

## 1. Purpose

Hearth keeps track of the food and consumables in the home, helps cook from what is there, and shops for what is missing. It respects allergies and medical restrictions without needing to know why they exist. The one thing it must do well: **know what is in the fridge and pantry without the owner typing it in.**

## 2. User stories

- MVP: Photograph a grocery haul or a receipt, or bring the order's confirmation, check what was read, and have it land in stock under the right location with an estimated expiry.
- MVP: Photograph the fridge, the freezer and the pantry as they stand and have what is in them become the stock, so a first stock is never typed in (D-89).
- MVP: See each item with a picture: the one cut from its photo, one I chose, or its category's glyph (D-90).
- MVP: See what is expiring soon and get a recipe that uses it.
- MVP: Ask what I can cook tonight; nothing suggested contains my allergens or breaks a medical restriction.
- MVP: Keep a grocery list grouped by store; add an item in one gesture; add a recipe's missing ingredients in one tap.
- MVP: Mark "I cooked this" and have the stock decrement.
- MVP: See a storage tip on an item or a recipe when there is one worth knowing, and ask the Gardener for one ("keep ginger in the freezer") (D-87).
- MVP: Bring a recipe in from a link, a photo, a file or pasted text, or have the Gardener write one, and check it before it is saved.
- MVP: Keep supplements and mixes such as LMNT packets in stock with a low-stock alert.
- MVP: See what ran out in one place, and put it back on the grocery list from "Buy it again" (D-92).
- Later: Plan the week; Hearth drafts shop-day events and a list for it.
- Later: Use the grocery list on my phone in the store; scan a barcode to add stock.
- Later: Export the list to a grocery service; have an order's confirmation read from the mailbox, without bringing it as a file.

## 3. Entities

| entity | key fields | tier | links out |
|---|---|---|---|
| `stock-item` | name, qty, unit, `location` (pantry, fridge, freezer, counter), category (one of twelve ids: produce, meat-and-fish, dairy-and-eggs, bakery, grains-and-pasta, canned-and-jarred, frozen, snacks, drinks, condiments-and-spices, supplements-and-mixes, other), purchased, expires, `expiryEstimated`, `source` (manual, capture), low-stock threshold, optional tip (D-87), optional picture (D-90), `outAt` while it holds nothing (D-92) | T0 | `haul-photo` and `item-photo` attachments |
| `recipe` | title, ingredients (name, qty, unit, note), steps, time, servings, tags, source URL, optional tip (D-87), optional label nutrition | T0 | stock items it consumed |
| `grocery-list` | name, default store, shop day, active flag | T0 | `shop-day` Event |
| `grocery-item` | name, qty, unit, store, aisle, note, `origin` (manual, recipe, low-stock, ran-out), checked | T0 | recipe, stock item |

Allergies are facts, not entities. Stock is shown sectioned by location; the location list is fixed to the four values so capture can place items without a picker. Low stock is derived, never stored: an item is low while it has a threshold and holds no more than it, and an item without one is never low. Ran out is derived the same way, from a quantity of nothing; `outAt` is only its date (D-92). A recipe written before recipes held their lines reads with no ingredients and no steps.

## 4. Facts

Written: `allergy` T2 (kind `food`, from the allergen editor; drug allergies are Wellspring's later), `dietary-preference` T1, `disliked-ingredient` T0, `cuisine-preference` T0, `household-size` T1.

Read: `medical-dietary-restriction` (Wellspring, T2; the owner may assert it in the profile before Wellspring exists), `favorite-supplement` (Vigor, T1) to keep favourites in the supplements category, `home-area` (substrate, T1) for store suggestions later.

## 5. Gardener tools and guardrails

| tool | reads | access | confirm | grade |
|---|---|---|---|---|
| `suggest-recipes` | `stock-item`, `recipe`, `dietary-preference`, `disliked-ingredient`, `cuisine-preference`, `allergy`, `medical-dietary-restriction` | read | none | `standard` |
| `storage-tip` | `stock-item` | read | none | `light` |
| `capture-haul` | none (the files the owner brought; `mode` says a haul, D-86, or the shelves as they stand, D-89) | write-draft | the capture sheet's Read, then its rows | `light`, needs `vision` |
| `draft-grocery-list` | `stock-item`, `recipe`, `grocery-list`, `grocery-item` | write-draft | editable list card | `standard` |
| `add-stock` | `stock-item` | write | confirm sheet; Quick Log path uses undo | plain |
| `import-recipe` | none (the text, the page or the files the owner brought) | write-draft | the draft in the Recipes pane | `light`, needs `vision` |
| `save-recipe` | `recipe` | write-draft | the draft in the Recipes pane | plain |
| `plan-week` | `stock-item`, `recipe`, `local-event`, `task` | write-draft | a plan card; commit creates `shop-day` Events and tasks through the substrate API (D-33) | `deep`, needs `tools` |

`save-recipe` takes a whole recipe the Gardener wrote, and it passes the safety filter before it is drafted. `storage-tip` answers in the conversation and stores nothing (D-87).

Never-do list: never suggests anything containing an allergen or a restricted ingredient, and every suggestion passes the local safety filter before display regardless of what the model saw (D-25); never gives nutrition or medical advice beyond label facts; never orders groceries; never sends a source before the capture sheet has named the provider and the owner has pressed Read (D-86).

The safety filter fails closed: when the profile cannot be read, nothing is suggested. It looks for a word's singular as well as the word.

## 6. Surfaces

**Desktop views (Phase 1, built)**: Stock, Recipes and Grocery. There is no Tips view (D-87).

- **Stock**: sections Fridge, Freezer, Pantry, Counter, which hold what is there, and at the side Ran out, what ran out in the last 7 days with where it was kept (D-92); a click on a row opens it in the detail pane under Ran out, and a double-click does nothing more (D-94); the side stays in view while the lists scroll, as Grocery's pane does; the Expiring and Low stock filters; a sort menu (expiry, name, newest); quick-add; the detail pane with an edit mode (name, quantity, unit, location, expiry, category, low-stock threshold, tip); select mode with Move, Add to grocery, Ran out and Delete on the selection, each one write with one undo (D-41). Add to grocery from a low item carries the origin `low-stock`, from one that ran out `ran-out`. Ran out, on a row, in the pane or on a selection, keeps the item at nothing; Delete forgets it.
- **Recipes**: the list in tonight's order (what uses up expiring stock first, then what misses least, then the quickest) and a detail pane with each ingredient marked in stock, missing or not enough, by local matching; Cook this; Add missing to grocery (origin `recipe`, the recipe's name as the note, skipping what is already on the list); Edit and Delete. A recipe that names something the owner avoids carries a danger badge.
- **Grocery**: the active list grouped by store (an item's own, else the list's), a checklist: every row leads with its checkbox and a click on the row checks it off, Edit being in the row's menu (D-94); origin badges, quick-add, Clear checked. Beneath the list, Buy it again: everything that ran out and is not on the list, each put on it by a click on its row (D-92). An item is edited in the pane (name, quantity, store, note); with no item open the pane shows the list itself: its name, its default store and its shop day, a date and a time.

**Capture** opens from the Stock primary action, and from files dropped or pasted on the Stock page.

**A tip** is shown as the small info button with a tooltip beside the name, in a list row and in the detail pane (D-87).

**Mobile (Phase 2)**: Grocery list is the primary tab surface; Capture with barcode scanning; Stock read and edit. Hearth on the phone is still its placeholder page.

**Garden widgets** (all built): `expiring-soon` (S, M; reads `stock-item`), `cook-tonight` (M; reads `stock-item`, `recipe`, `dietary-preference`, `allergy`, `medical-dietary-restriction`; computed locally by matching recipes to stock and expiry, with the safety filter, no model call), `grocery-quick-add` (S; reads `grocery-list`, `grocery-item`).

**Palette**: go to Hearth, add to grocery, capture haul, cook tonight, search stock and recipes.

**Quick actions**: `capture-haul`, `add-to-grocery`.

**Capture sources**: photos of a haul, photos of a receipt, an order's confirmation (Phase 1, D-86); barcode and share sheet (Phase 2).

### Capture a haul

Capture is the sheet of D-86, in two steps: collect the sources and press Read, then check the rows and commit. `design/ux-patterns.md` has the sheet.

- **Sources.** Up to ten, in any mix, within the request's 20 MB: photos (JPEG, PNG, WebP, GIF, and HEIC or HEIF, which is redrawn as a JPEG first), a PDF, a text, Markdown or CSV file, a saved HTML page (reduced to its text), an email file (reduced to its subject, sender, date and body text), and pasted text. A PDF or a text source records the per-request `document` grant, as a file on a message does (D-82).
- **Rows.** Name, quantity, unit, location, expiry as a date (setting it clears the estimate), category, a tip when the model had one worth giving, and the merge when the row lands on an item in stock. The merge is worked out again when the name, the location, the quantity or the unit changes. A row can be removed and one can be added.
- **Commit.** New items are created and merged ones updated, the quantities added in the item's own unit. The undo takes back the rows, the merges and the photos together.
- **Kept.** Only the photos, as `haul-photo` Attachments linked `from` the stock they made. A PDF, an email and pasted text are read and let go (D-86).
- **From a conversation.** `capture-haul` takes no input: it reads the files on the owner's message, or on the latest earlier message that had any, and its card opens the sheet at the rows. Those files are already stored with their thread (D-83), so the stock is linked to them and they are not copied.

On mobile, barcode and receipt OCR run on-device; haul photos go to the configured cloud provider after the sheet names it (D-29).

### Taking stock

The same sheet reads photos of the shelves as they stand (D-89): Stock's second action, and the empty state's. `capture-haul` runs with `mode` `stock`, and three things differ from a haul. An item is placed where its photo shows it. No expiry is estimated; a date read from a label is kept. A row that matches an item in stock sets its quantity where a haul adds to it, and the sheet says "Update" for it. A second look at the same shelf therefore changes amounts and counts nothing twice.

### Pictures

Every stock item is shown with a picture (D-90). The model answers a box around each item it sees in a photo; the app cuts the box out in the webview, small, shows it on the row to be checked, and keeps it with the item on commit, unless the item it merges into has a picture already. In the item's pane the owner chooses a picture of their own, pastes a link to one, or takes the picture away. A grocer's product link gives the grocer's picture of the product, in the pane or in the quick-add line, where it also adds the item under the name the link gives (D-91). An item with none shows its category's glyph. A picture goes with its item when the item is deleted, and comes back with the undo; it stays with an item that ran out (D-92).

### Recipes arrive as drafts

A recipe arrives three ways, and each opens in the Recipes pane as an unsaved draft the owner checks and saves. There is no blank form.

- **Add a recipe**: a sheet that takes pasted text, a link, or a photo or a file. Read runs `import-recipe` without a conversation, under the same consent as capture's Read (D-86). A link is fetched as D-88 says, and a page that describes its recipe in schema.org JSON-LD is read with no model asked.
- **`import-recipe` in a conversation**: the Gardener's card opens the draft in the pane.
- **`save-recipe`**: a recipe the Gardener wrote itself, drafted the same way.

### Cooking decrements stock

"Cook this" subtracts each ingredient's quantity where the units agree, and asks in the pane, "leave it" or "used it up", where they do not. It never drops an item below zero. An item left at zero stays, as run out (D-92); one with a low-stock threshold also reads as low. The whole is one write with one undo.

## 7. Kinds, signals, notifications, intents

Kinds: `shop-day` (event, T0), `haul-photo` (attachment, T1), `item-photo` (attachment, T1; an item's picture, D-90).

Signals, all built: `stock.expiring` (daily at 08:00 via the scheduler, when something is dated no later than two days on), `stock.low` (from the same morning check, once a week, when something is at or under its threshold), `grocery.shop-day` (at 08:00 on the list's shop day).

| notification | channel | cadence | default |
|---|---|---|---|
| expiring digest | in-app; part of the morning digest from Phase 2 | daily | on |
| low stock | in-app | weekly | on |
| shop-day reminder | OS | morning of the `shop-day` Event | on |

Until the shop day is an Event, the reminder is set from the list's own shop-day field (D-73, `engineering/signals.md`), which the Grocery pane sets.

Intents handled: `kitchen.add-to-grocery`. Intents sent: none.

## 8. Integrations

| integration | phase | access | sends | receives |
|---|---|---|---|---|
| camera | 1 | per device | | photos |
| vision through the Gardener | 1 | per-request confirm (D-86) | the sources | draft rows, a draft recipe |
| a web page the owner gave the link of | 1 | the owner's paste (D-88) | the request for the page | the page's HTML |
| share sheet | 2 | | | URLs, photos |
| barcode lookup | later | read | a barcode | product name |
| grocery service export (HEB, Instacart) | later | export file or link; ordering would be `act-external` | the list | |
| order-confirmation email, label-scoped | later | read | | order lines |

The camera is the phone's, with mobile capture; on desktop a photo arrives as a file. Until a mail connector exists, an order's email reaches capture as a file or as pasted text (D-86).

## 9. Settings

Locations shown; expiry estimation on or off; low-stock thresholds by category; default store; supplements category on or off; a link to the allergen editor in the profile.

## 10. Non-goals and open questions

Non-goals: calorie or intake tracking (OQ-8), ordering, meal plans against nutrition targets, inventory of anything that is not consumable.

Open: none.

## Registry rows

Appended to `substrate/registry.md` under Hearth: facts `allergy` T2, `dietary-preference` T1, `disliked-ingredient` T0, `cuisine-preference` T0, `household-size` T1; entities `stock-item`, `recipe`, `grocery-list`, `grocery-item`, all T0; kinds `shop-day` (event, T0), `haul-photo` (attachment, T1), `item-photo` (attachment, T1).

## Handoffs

Left for later issues, each where its agent will read it.

- **Mobile capture and the phone's Hearth pages (issues 19 and 27).** The staging and the capture state (`apps/desktop/src/lib/domains/kitchen/staging.svelte.ts` and `capture.svelte.ts`) and `apps/desktop/src/lib/shell/gardener/files.ts` hold nothing that is the desktop's, and move to `@eden/shared` with the phone work. The camera and photo-library permissions are not set. Pasting a list on a phone needs a field, because the collect step has none.
- **Order emails from Gmail.** Its own issue: a connector that only hands an email's text to `capture-haul`.
- **The shop day as an Event** (D-23), with the reminder read from it and not from the list's field.
- **Barcode.** Not started.
- **Keeping a PDF or an email source** would need a new T2 attachment kind; today only photos are kept.
- **Low-stock thresholds by category.** A threshold is set per item; the setting in section 9 is not built.
- **Select mode** spans one location section at a time.
- **Tips on items added by hand** arrive only when the owner writes one.
- **Pictures are crops, not cut-outs.** Taking the background away needs a segmentation model on the device (D-29, D-90). When one arrives, `cutPicture` in `apps/desktop/src/lib/domains/kitchen/staging.svelte.ts` is where it goes.
- **How well a box fits its item** has not been seen against the live model. The light grade may draw loose boxes; the per-tool model override (D-74) is the first thing to try, and a box that shows nothing or most of the photo is already dropped.
- **An item read from a receipt** has no picture until the owner gives it one. Recipes have none.
- **Product links are H-E-B's alone** (D-91), read from two address forms that are observed, not documented: `productLink` in `packages/shared/src/domains/kitchen/product-link.ts` is where another grocer goes, and where a change at H-E-B is mended. A link gives no store to the item, because a stock item has none; whether it should is an open question with the owner.
- **What ran out and "Buy it again" (D-92), built on desktop.** Left for later: how consistently the live model names a product from one shop to the next is unknown, and it decides how often a returning item finds the row that ran out; the name-only match in `mergeTarget` (`packages/shared/src/domains/kitchen/match.ts`) is where to loosen or tighten it. The 7 and 90 day windows are constants (`out.ts`), not settings. A `buy-it-again` Garden widget was proposed and not built. The Gardener's context still lists an item that ran out, at a quantity of 0. The Ran out and Buy it again lists have no select mode. An item at nothing from before `outAt` existed has no date: it shows as recent and is never let go. The Storybook mock (`Domains/Hearth/Stock`, story `RanOut`) still draws Ran out beneath the locations and opens the first item in the pane unasked; no mock shows the side staying in view or the pane empty until a row is picked (D-94). The phone's pages show neither list (issues 19 and 27).
- **A cooked recipe** does not link to the items it consumed, which the entity table's "links out" still asks for.
- **Not verified in the real app.** None of this has run in the installed Tauri app or against the live API. HEIC decoding in the Tauri webview is assumed.
