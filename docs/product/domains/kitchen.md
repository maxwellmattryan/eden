---
title: Hearth
status: draft
summary: Stock by location, food and household consumables alike, recipes from what you have and from a link, a photo or pasted text, grocery lists, capture a haul from photos, receipts and order confirmations, take stock from photos of the shelves, a picture and a tip on the item, food allergies and supplements. Id `kitchen`, Phase 1.
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
- MVP: Keep a grocery list for each store I shop at, groceries and home goods alike (D-96); add an item in one gesture and have it land on the list of the store it was last bought at (D-97); add a recipe's missing ingredients in one tap.
- MVP: Mark "I cooked this" and have the stock decrement.
- MVP: See a storage tip on an item or a recipe when there is one worth knowing, and ask the Gardener for one ("keep ginger in the freezer") (D-87).
- MVP: Bring a recipe in from a link, a photo, a file or pasted text, or have the Gardener write one, and check it before it is saved.
- MVP: See a recipe with its picture, taken from its page when it came by link, and with who wrote it and where it came from (D-93).
- MVP: Cook a recipe for more or fewer than it was written for and have the amounts, the stock check and the grocery amounts follow; a recipe that does not scale says so (D-107).
- MVP: Find a recipe among many: by words or by the ingredients I list, by what is all in stock, quick, about to expire or tagged, in the order I ask for (D-107).
- MVP: Keep supplements and mixes such as LMNT packets in stock with a low-stock alert.
- MVP: Keep the brand and the package size of an item beside its name, so "butter" from a shelf photo and "Kerrygold butter, 8 oz" from a receipt are one item (D-104).
- MVP: See about what a store's list will cost, and about what a recipe's missing ingredients cost to buy, from what each store last charged (D-105), without typing prices in: a receipt teaches them.
- MVP: See what ran out in one place, and put it back on a grocery list from "Buy it again" (D-92).
- Later: Plan the week; Hearth drafts shop-day events and a list for it.
- Later: Use the grocery list on my phone in the store; scan a barcode to add stock.
- Later: Export the list to a grocery service; have an order's confirmation read from the mailbox, without bringing it as a file.

## 3. Entities

| entity | key fields | tier | links out |
|---|---|---|---|
| `stock-item` | name, optional brand and package size (D-104), qty, unit, `location` (pantry, fridge, freezer, counter, and household for what is not food, D-122), category (one of fifteen ids: for food produce, meat-and-fish, dairy-and-eggs, bakery, grains-and-pasta, canned-and-jarred, frozen, snacks, drinks, condiments-and-spices, supplements-and-mixes; for a household item cleaning-and-laundry, personal-care, health; and other), purchased, expires, `expiryEstimated`, `source` (manual, capture), low-stock threshold, optional tip (D-87), optional picture (D-90), `outAt` while it holds nothing (D-92) | T0 | `haul-photo` and `item-photo` attachments |
| `recipe` | title, ingredients (name, qty, unit, note), steps, time, servings, `scales` (false when the amounts do not follow the servings, D-107), tags, source URL, source name and author (D-93), optional tip (D-87), `photo`, the id of its `recipe-photo` Attachment (D-93), optional label nutrition | T0 | its `recipe-photo` attachment, stock items it consumed |
| `grocery-store` | name, what it sells (grocery, home goods), what was last bought there, when (D-97) and for how much (D-105), its position among the stores, when it was last shopped, a note, `place` (address, which is T2, url, phone) until it links a Place (D-101), and `photo`, the id of its `store-photo` Attachment (D-103) | T0 | a `venue` Place, later |
| `grocery-list` | its store (none for the list of what is not filed), an optional shop day (D-98) | T0 | `grocery-store`, `shop-day` Event |
| `grocery-item` | name, optional brand and package size (D-104), an optional typed price (D-105), qty, its list, note, `origin` (manual, recipe, low-stock, ran-out), checked | T0 | `grocery-list` |

Allergies are facts, not entities. Stock is shown sectioned by location; the location list is fixed to the five values so capture can place items without a picker. An item under `household` is a household consumable (D-122): the location alone says so, it never covers a recipe's ingredient, and a household category puts an item there whatever location it was given (`placed` in `types.ts`). Low stock is derived, never stored: an item is low while it has a threshold and holds no more than it, and an item without one is never low. Ran out is derived the same way, from a quantity of nothing; `outAt` is only its date (D-92). A recipe written before recipes held their lines reads with no ingredients and no steps.

## 4. Facts

Written: `allergy` T2 (kind `food`, from the allergen editor; drug allergies are Wellspring's later), `dietary-preference` T1, `disliked-ingredient` T0, `cuisine-preference` T0, `household-size` T1.

Read: `medical-dietary-restriction` (Wellspring, T2; the owner may assert it in the profile before Wellspring exists), `favorite-supplement` (Vigor, T1) to keep favourites in the supplements category, `home-area` (substrate, T1) for store suggestions later.

## 5. Gardener tools and guardrails

| tool | reads | access | confirm | grade |
|---|---|---|---|---|
| `suggest-recipes` | `stock-item`, `recipe`, `dietary-preference`, `disliked-ingredient`, `cuisine-preference`, `allergy`, `medical-dietary-restriction` | read | none | `standard` |
| `storage-tip` | `stock-item` | read | none | `light` |
| `capture-haul` | none (the files the owner brought; `mode` says a haul, D-86, or the shelves as they stand, D-89) | write-draft | the capture sheet's Read, then its rows | `light`, needs `vision` |
| `draft-grocery-list` | `stock-item`, `recipe`, `grocery-store`, `grocery-list`, `grocery-item` | write-draft | editable list card | `standard` |
| `add-stock` | `stock-item` | write | the tool card's confirm, then an undo | plain |
| `update-stock` | `stock-item`, `recipe` | write | the tool card's confirm, then an undo | plain |
| `edit-grocery` | `grocery-store`, `grocery-list`, `grocery-item`, `stock-item`, `recipe` | write | the tool card's confirm, then an undo | plain |
| `edit-stores` | `grocery-store`, `grocery-list`, `home-area` | write | the tool card's confirm, then an undo | plain |
| `import-recipe` | none (the text, the page or the files the owner brought) | write-draft | the draft in the Recipes pane | `light`, needs `vision` |
| `save-recipe` | `recipe` | write-draft | the draft in the Recipes pane | plain |
| `change-recipe` | `recipe` | write | the tool card's confirm, then an undo | plain |
| `plan-week` | `stock-item`, `recipe`, `local-event`, `task` | write-draft | a plan card; commit creates `shop-day` Events and tasks through the substrate API (D-33) | `deep`, needs `tools` |

`save-recipe` takes a whole recipe the Gardener wrote, and it passes the safety filter before it is drafted. `storage-tip` answers in the conversation and stores nothing (D-87). `capture-haul` answers each row's name, brand and package size apart (D-104) and, from a receipt or an order, the line's price in cents with the packages it is for, and the shop and the day beside the rows (D-105). `add-stock` takes a brand, a size, a category and a grocer's product link, `draft-grocery-list` and `plan-week` may name a brand and a size, and `draft-grocery-list` a store for its items. A `grocery-store` row reaches a model without what it remembers, its picture, its position or its address (D-105).

The four tools that change what is there are batches (D-108): one call holds every change, every id is checked before anything is written, and the whole call is one confirm and one undo. The card names each row by its name. `update-stock` edits fields, moves an item, marks it as run out with a quantity of 0, deletes it, and with `cookedRecipeId` writes what cooking used as "I cooked this" does. `edit-grocery` adds to a named store's list, to the unfiled one or by memory (D-97), edits, moves, checks off, deletes, and completes a store's trip. `edit-stores` adds, changes and deletes stores and sets a shop day; it takes no address and answers none, and a website it saves is read as the store form's is (D-103, D-108). `change-recipe` edits or deletes a saved recipe, and an edit passes the safety filter. Looking something up is what the model knows and what the owner links; nothing is searched.

Never-do list: never suggests anything containing an allergen or a restricted ingredient, and every suggestion passes the local safety filter before display regardless of what the model saw (D-25); never gives nutrition or medical advice beyond label facts; never orders groceries; never sends a source before the capture sheet has named the provider and the owner has pressed Read (D-86).

The safety filter fails closed: when the profile cannot be read, nothing is suggested. It looks for a word's singular as well as the word.

## 6. Surfaces

**Desktop views (Phase 1, built)**: Stock, Recipes and Grocery. There is no Tips view (D-87). The header carries Hearth's motif on all three (D-123): embers, as many as the stock is full, the expiring share in the accent, with a legend that says both in words.

- **Stock**: sections Fridge, Freezer, Pantry, Counter and Household (D-122), which hold what is there, and at the side Ran out, what ran out in the last 7 days with where it was kept (D-92); a click on a row opens it in the detail pane above Ran out, which fades in as it makes its room, and a double-click does nothing more (D-94); the side stays in view while the lists scroll, as Grocery's pane does; the Expiring and Low stock filters; a sort menu (expiry, name, newest); each location's name as a heading over its list, with its glyph and the count on the same line, and no header row on the list (D-109); the header's Add, which opens the item's form blank as "Add to stock" (D-109), with no quick-add line on the page; the detail pane, whose Edit opens the item's form in a sheet over the page (D-95: name, brand, package size, quantity, unit, location, expiry, category, low-stock threshold, tip, and its picture; the category menu offers the location's own, food's or a household item's, and moving between the two drops a category that no longer fits, D-122); select mode, begun from Select in a row's menu, with Move, Add to grocery, Ran out and Delete on the selection, each one write with one undo (D-41). Add to grocery from a low item carries the origin `low-stock`, from one that ran out `ran-out`. Ran out, on a row, in the pane or on a selection, keeps the item at nothing; Delete forgets it. A row can be dragged to another location (Move to) or onto Ran out (Ran out), and one that ran out, dragged to a location, opens its form there for its quantity (D-111); every location shows while a row is held.
- **Recipes**: a narrow column to find a recipe in and the picked one as a page on the rest. The column has a search (words, or ingredients listed with commas: every recipe that has them all, by name, tag, ingredient, author or source), filters (In stock, Under 30 min, Uses expiring, and Tags from a menu), an order (tonight's, which is what uses up expiring stock first, then what misses least, then the quickest; name; quickest; least missing) and Clear; then the list, each row with the recipe's picture or the pot on a tile, its time and what it uses up or misses. The column stays in view and scrolls on its own. A click picks a recipe (D-94); the picked one stays open when a filter hides its row, and until one is picked the page shows the first of the list. The search, the filters, the order and the servings asked for are the session's, and none is stored. The page (D-93, D-107): the picture across the top, the name, the credit (author, and the source, which opens its page), then time, servings with a stepper, and tags; the tip as a line; ingredients beside the steps, each ingredient with its amount for the servings shown and marked in stock, missing or not enough by local matching; then about what the missing ones cost to buy when the stores remember a price for any (D-105), Cook this, Add missing to grocery (origin `recipe`, the recipe's name as the note, the amounts for the servings shown, each filed where it was last bought, D-97, skipping what is already on a list), Edit and Delete. A recipe that does not scale shows its servings with no stepper. A recipe that names something the owner avoids carries a danger badge. The form, still in the pane (D-95), has the picture with Choose (from a file or from a link: a picture's own address, or the page it is on; D-110) and Remove, the author, the source's name and address, and whether the amounts follow the servings; a saved recipe's picture changes when the form is saved, with the fields, under one undo.
- **Grocery**: one list per store, all on the page at once (D-96): each has its store's picture (D-103) and name, its shop day when one is set (D-98), Complete (clears what is checked), Add (the item's sheet with that store picked) and Edit store as quiet icon buttons, and its rows, with about what the list costs and how many lines have no price in the list's header when any line is priced (D-105); what no store has yet sits under Miscellaneous. Nothing is typed on the page: the header's Add opens a menu of Add item and Add store, each the sheet below, blank (D-102); an item added with no store picked is filed where it was last bought (D-97). Each list is a checklist: every row leads with its checkbox and a click on the row checks it off, Edit and Move to being in the row's menu (D-94); a row can also be dragged onto another store's list, which is the same move, and Miscellaneous shows while a row is held so it can be dropped there (D-106); origin badges. At the side, in view while the lists scroll (D-101): Buy it again, everything that ran out and is not on a list, each put on the list of the store it was last bought at by a click on its row, or on a named store's from its menu (D-92); and beneath it the stores in the owner's order. A store's row leads with its picture, or the store glyph on a tile, and says what is left to buy and its shop day, or its last trip when it has no shop day; a click goes to its list, and its menu has Edit, Open website, Move up, Move down and Delete. An item's form (name, brand, package size, quantity, price, store, note) and a store's (its picture with Choose a picture, Fetch from the website and Remove, then name, what it sells, address, website, phone, note, shop day and time, Delete store) open in a sheet (D-95). Saving a website on a store with no picture fetches the site's icon for it (D-103).

**Capture** opens from the Stock primary action, and from files dropped or pasted on the Stock page.

**A tip** is shown as the small info button with a tooltip beside the name, in a list row and in the detail pane (D-87).

**Mobile (Phase 2)**: Grocery list is the primary tab surface; Capture with barcode scanning; Stock read and edit. Hearth on the phone is still its placeholder page.

**Garden widgets** (all built): `expiring-soon` (S, M; reads `stock-item`), `cook-tonight` (M; reads `stock-item`, `recipe`, `dietary-preference`, `allergy`, `medical-dietary-restriction`; computed locally by matching recipes to stock and expiry, with the safety filter, no model call), `grocery-quick-add` (S; reads `grocery-store`, `grocery-list`, `grocery-item`).

**Palette**: go to Hearth, add to grocery, capture haul, cook tonight, search stock and recipes.

**Quick actions**: `capture-haul`, `add-to-grocery`.

**Capture sources**: photos of a haul, photos of a receipt, an order's confirmation (Phase 1, D-86); barcode and share sheet (Phase 2).

### Capture a haul

Capture is the sheet of D-86, in two steps: collect the sources and press Read, then check the rows and commit. `design/ux-patterns.md` has the sheet.

- **Sources.** Up to ten, in any mix, within the request's 20 MB: photos (JPEG, PNG, WebP, GIF, and HEIC or HEIF, which is redrawn as a JPEG first), a PDF, a text, Markdown or CSV file, a saved HTML page (reduced to its text), an email file (reduced to its subject, sender, date and body text), and pasted text. A PDF or a text source records the per-request `document` grant, as a file on a message does (D-82).
- **Rows.** Name, brand, package size, what one cost when a receipt or an order priced it (D-104, D-105), quantity, unit, location, expiry as a date (setting it clears the estimate), category, a tip when the model had one worth giving, and the merge when the row lands on an item in stock. A household line (cleaning and laundry, paper goods, personal care, health) is kept and placed under Household, with no expiry estimated (D-122). The merge is worked out again when the name, the brand, the location, the quantity or the unit changes. A row can be removed and one can be added.
- **Commit.** New items are created and merged ones updated, the quantities added in the item's own unit. The undo takes back the rows, the merges and the photos together.
- **The store.** A haul read from a receipt or an order names its shop and its day. The sheet picks the owner's store of that name under the provider line, and the owner may pick another or none; a shop that is not one of theirs is named and nothing is picked. On commit the store picked learns every row, with the price of each that has one, as bought on that day (D-105); the same undo takes it back. With no store picked, no price is kept.
- **Kept.** Only the photos, as `haul-photo` Attachments linked `from` the stock they made. A PDF, an email and pasted text are read and let go (D-86).
- **From a conversation.** `capture-haul` takes no input: it reads the files on the owner's message, or on the latest earlier message that had any, and its card opens the sheet at the rows. Those files are already stored with their thread (D-83), so the stock is linked to them and they are not copied.

On mobile, barcode and receipt OCR run on-device; haul photos go to the configured cloud provider after the sheet names it (D-29).

### Taking stock

The same sheet reads photos of the shelves as they stand (D-89): Stock's second action, and the empty state's. `capture-haul` runs with `mode` `stock`, and three things differ from a haul. An item is placed where its photo shows it. Nothing has a price or a store (D-105). No expiry is estimated; a date read from a label is kept. A row that matches an item in stock sets its quantity where a haul adds to it, and the sheet says "Update" for it. A second look at the same shelf therefore changes amounts and counts nothing twice.

### Pictures

Every stock item is shown with a picture (D-90). The model answers a box around each item it sees in a photo; the app cuts the box out in the webview, small, shows it on the row to be checked, and keeps it with the item on commit, unless the item it merges into has a picture already. In the item's sheet the picture's button offers a file or a link (D-110), a picture dropped on the sheet or pasted into it is taken too, and Remove takes the picture away. A pasted link is fetched at once; the link itself is not kept, only the picture. A grocer's product link gives the grocer's picture of the product in the item's form, and in the blank Add to stock form it also fills the name, the brand and the size left empty (D-91, D-109). An item with none shows its category's glyph. A picture goes with its item when the item is deleted, and comes back with the undo; it stays with an item that ran out (D-92).

### Recipes arrive as drafts

A recipe arrives three ways, and each opens in the Recipes pane as an unsaved draft the owner checks and saves. There is no blank form.

- **Add a recipe**: a sheet that takes pasted text, a link, or a photo or a file. Read runs `import-recipe` without a conversation, under the same consent as capture's Read (D-86). A link is fetched as D-88 says, and a page that describes its recipe in schema.org JSON-LD is read with no model asked. Any other page is given to the model as its text, so a recipe needs no markup to be read. A site that turns apps away (H-E-B's bot wall answers a page with one line on it) gives no text to read: the sheet says so before any model is asked, and the owner pastes the text or adds a screenshot or a PDF of the page.
- **`import-recipe` in a conversation**: the Gardener's card opens the draft in the pane.
- **`save-recipe`**: a recipe the Gardener wrote itself, drafted the same way.

### Brand and size

An item's name is the thing itself and what it is matched by; its brand and its package size are fields beside it (D-104), shown as the row's second line and a mono chip. A row merges into an item of the same name whose brand can be its own, the item of its brand first. "Buy it again" and Add to grocery carry both to the list.

### Prices

A store remembers what each thing last cost there (D-105), under the name that files it (D-97): `Bought` in `packages/shared/src/domains/kitchen/types.ts`, read and written by `filing.ts`, summed by `prices.ts`. A receipt teaches prices through capture; a price typed on a grocery line is learned when its list is completed; a listing or a move teaches none. A list's sum and a recipe's are "about": packages at their last price, no unit converted, what has no price counted beside the sum.

### Cooking decrements stock

"Cook this" subtracts each ingredient's quantity where the units agree, and asks in the pane, "leave it" or "used it up", where they do not. It never drops an item below zero. An item left at zero stays, as run out (D-92); one with a low-stock threshold also reads as low. The whole is one write with one undo.

## 7. Kinds, signals, notifications, intents

Kinds: `shop-day` (event, T0), `haul-photo` (attachment, T1), `item-photo` (attachment, T1; an item's picture, D-90), `recipe-photo` (attachment, T1; a recipe's picture, D-93), `store-photo` (attachment, T1; a store's picture, D-103).

Signals, all built: `stock.expiring` (daily at 08:00 via the scheduler, when something is dated no later than two days on), `stock.low` (from the same morning check, once a week, when something is at or under its threshold), `grocery.shop-day` (at 08:00 on a store's shop day, once per list; D-98).

| notification | channel | cadence | default |
|---|---|---|---|
| expiring digest | in-app; part of the morning digest from Phase 2 | daily | on |
| low stock | in-app | weekly | on |
| shop-day reminder | OS | morning of the `shop-day` Event | on |

Until the shop day is an Event, the reminder is set from each list's own shop-day field (D-73, `engineering/signals.md`), which the store's form sets.

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

Locations shown; expiry estimation on or off; low-stock thresholds by category; supplements category on or off; a link to the allergen editor in the profile.

## 10. Non-goals and open questions

Non-goals: calorie or intake tracking (OQ-8), ordering, meal plans against nutrition targets, inventory of anything that is not consumable, shopping lists for anything but groceries and home goods (D-96): a thing bought once, or one that is not used up, is not Hearth's (D-122).

Open: none.

## Registry rows

Appended to `substrate/registry.md` under Hearth: facts `allergy` T2, `dietary-preference` T1, `disliked-ingredient` T0, `cuisine-preference` T0, `household-size` T1; entities `stock-item`, `recipe`, `grocery-store`, `grocery-list`, `grocery-item`, all T0; kinds `shop-day` (event, T0), `haul-photo`, `item-photo`, `recipe-photo` and `store-photo` (attachments, T1).

## Handoffs

Left for later issues, each where its agent will read it.

- **The Gardener's quick action and links (D-124, D-126).** `log-quick` no longer offers `add-to-grocery`: a model puts items on a list with `edit-grocery`, and the quick action stays for the Quick Log strip and its sheet (#27). `import-recipe` still fetches a `url` the model passes with no confirm, outside the rule `read-page` follows (an address the owner wrote is read at once, any other waits on a card showing it whole); bring it under that rule (`engineering/gardener.md`, "The substrate's tools", handoffs).

- **Brand, size and prices (D-104, D-105), built on desktop.** Left for later, none of it started:
  - *Never run against a live model or in the installed app.* The capture prompt now asks for the name, the brand and the size apart, and for a receipt's line prices, shop and day; how reliably a model keeps a brand out of the name, and reads a price in cents with its package count, has not been seen. `captureRules` and the `capture-haul` schema in `apps/desktop/src/lib/domains/kitchen/tools.ts` are where to mend it, `unitPrice` and `haulReceipt` in `packages/shared/src/domains/kitchen/capture.ts` what reads the answer. A store row whose memory holds objects has not been written through the crate.
  - *Purchase history.* A store holds the last price only. A row per purchase line (item, brand, store, price, size, day) would give trends and is what Orchard's `receipt` and `transaction` would reconcile against (`product/domains/finance.md`); the receipt's day and store already reach `commitHaul` (`HaulFrom` in `store.svelte.ts`), which is where such rows would be written.
  - *Cost per serving.* A recipe's sum is one package of each missing ingredient. What a recipe uses of a package needs the package's size parsed against the ingredient's amount (`quantity.ts` converts within mass and volume); a weighed line's price is stored as paid, its weight as the size, and no price per weight is worked out.
  - *A store Hearth does not have.* A receipt from one is named on the sheet (`storeHint`) and teaches nothing. Adding the store from the sheet, inside the commit's undo (`addStore`), is the follow-up.
  - *The other brand's price.* A list's sum prices a line by the name alone, whatever brand the store remembers; `priceFor` in `prices.ts` is where a brand that differs would count as no price. The memory is keyed by name, so two brands of one thing at one store share an entry, the last bought.
  - *Line quantity.* A sum multiplies only a bare count ("2"); "500 g" or "1 box" is one package (`packages` in `prices.ts`).
  - *The Gardener's `add-stock`* brings back an item that ran out (`addStockRows`, D-108) and still never adds to one that is in stock, as the Add to stock form does not.
  - *Stock holds no price and no store.* What the stock is worth, and where an item in it came from, are not kept; a product link's store is still only shown.
  - *Old names.* Items named with their brand or their size in the name before D-104 are not rewritten; one with its size in brackets still matches, and the owner moves either by hand.
  - *One currency.* Amounts are plain numbers shown with a dollar sign through `formatUsd`; the profile has no currency.
  - *The phone and the mocks.* Mobile Hearth is still the placeholder; `Domains/Hearth/Stock` and `Grocery` show brand, size and a list's sum, and no mock shows a recipe's sum or the item forms' new fields.

- **Mobile capture and the phone's Hearth pages (issues 19 and 27).** The staging and the capture state (`apps/desktop/src/lib/domains/kitchen/staging.svelte.ts` and `capture.svelte.ts`) and `apps/desktop/src/lib/shell/gardener/files.ts` hold nothing that is the desktop's, and move to `@eden/shared` with the phone work. The camera and photo-library permissions are not set. Pasting a list on a phone needs a field, because the collect step has none.
- **Order emails from Gmail.** Its own issue: a connector that only hands an email's text to `capture-haul`.
- **The shop day as an Event** (D-23), with the reminder read from it and not from the list's field.
- **Grocery lists per store (D-96 to D-98, D-101), built on desktop.** Left for later, none of it started:
  - *A store becomes a Place.* A `grocery-store` keeps its address, website and phone under `place` (`StorePlace` in `packages/shared/src/domains/kitchen/types.ts`), under the names a Place has (D-101). This is unblocked: Meadow is built, `@eden/shared/geo` can find a store by its name and a rounded point (its `Geocoder`, Photon under D-128 and D-131), and Meadow's map shows a `venue` with no profile as a plain saved pin (D-133). The copy and the `at` link stay Hearth's to write. Each store with a `place` gets a `venue` Place (D-23): `createPlace` with kind `venue`, the store's name and the three fields, then a typed link `at` from the store to it with the name as its label; `place` is then dropped from the store, the address becomes the Place's own T2 field and the registry row loses its field note. The store stays the overlay, as Vigor's `gym` is: name, `sells`, `bought`, `position`, `shoppedAt` and `note` are Hearth's. `geo` comes from the geocoder's hit. `updateStore` in `apps/desktop/src/lib/domains/kitchen/store.svelte.ts` and the store's form in `views/Grocery.svelte` are the two places that write `place`.
  - *A store with more than one location.* The owner shops at two H-E-Bs: the usual one, and a nearer one for quick trips. The model stays one list per store; the store gains locations. Today `place` holds one, so the second address goes in the note, and two stores of one name would split the list and what it remembers (D-97), which is wrong. With Places it is several `at` links from the one store, the first being the usual one, each link's label the owner's name for it ("Lamar"). Which location a trip goes to belongs to the trip, not the store: the `shop-day` Event carries a Place (D-23), and `shoppedAt` could name one. What the store remembers stays the store's, unless use shows the small one lacks things. Reading today's `place` as the first location is the whole migration.
  - *A route across stores.* Ordering the stores of a trip, by where they are, when they are quiet and what the roads are like, needs each store to be somewhere, which is the Place above. Until then the order is the owner's, by Move up and Move down; the stores themselves are not dragged (D-106 drags items between lists, and reorders nothing).
  - *The last trip* (`shoppedAt`) is set from the first list completed after D-101; a store shopped only before it shows none. Open website was not run in the installed app (`openExternal`, the opener plugin).
  - *Assembling a cart at the grocer.* The owner's curbside orders are made on H-E-B's own site and come back as a receipt through capture (D-86). Filling a cart there from a list is the wish; it is ordering, a non-goal today, and H-E-B's pages are not fetched (D-91).
  - *A weekly grocery day.* A shop day is one date, set by hand. A store with a usual day (every Thursday) would set its own; whether the owner shops by a fixed day or by what has run out is not settled, so use should show it first.
  - *What was checked going into Stock.* Completing a list clears what was checked and teaches the store; it does not add to Stock. An in-store trip leaves Stock to be told by capture or by hand, which is the friction the owner expects to feel most.
  - *What a store sells* is recorded and not used: filing goes by what was bought where (`storeFor` in `packages/shared/src/domains/kitchen/filing.ts`), and a new item of an obvious kind (dish soap) could go by `sells` when no store remembers it.
  - *The plan's shop day carries no store.* `draft-grocery-list` takes a `storeId` and its card files there (D-108); `plan-week` still files each item by memory, and its shop day is a calendar Event that sets no list's `shopDay`, so `grocery.shop-day` does not fire for it. A plan that names a store needs the plan card to carry one (`DraftCard` in `packages/shared/src/gardener/runtime-types.ts`, the commit in `shell/gardener/DraftCard.svelte`).
  - *The phone.* Grocery on mobile is still the placeholder page; the mock (`Domains/Hearth/Grocery`) shows the lists there with no side, so Buy it again, the stores, a store's form and Move to have no mobile design. Dragging an item between lists is desktop only (D-106), so the phone needs Move to.
  - *Not seen in the installed app.* The lists were exercised in the browser build only; the upgrade of old rows (`groceryUpgrade` in `upgrade.ts`) has run against the browser's engine, not the crate's.
- **The Gardener's write tools (D-108), built on desktop.** Left for later, none of it started:
  - *Never run against a live model or in the installed app.* The handlers were driven by hand in the browser build; how a model fills the batches, and whether it keeps to what it knows when it fills a brand, a size or a website, is unseen. The words are in `SCHEMAS` (`packages/shared/src/gardener/tools.ts`), the handlers in `apps/desktop/src/lib/domains/kitchen/tools.ts`.
  - *The Gardener fills the Add sheets.* The wish is a store or an item drafted by the Gardener and opened in its sheet for the owner to check, as a recipe opens in the pane. It needs new `DraftCard` kinds (`store`, `grocery-item`, `stock-item`) routed through `kitchenOpenDraft` to `Grocery.svelte`'s exported `addStore()` and `addItem()`, which would take the fields to open with; `StockEditSheet` has its add mode (`add()`, D-109, reached through `Stock.svelte`'s exported `addItem()`), which opens blank and would take the fields to open with. A draft tool is strict, and eleven of the twenty strict tools are taken (the count is held in `packages/shared/src/gardener/tools.test.ts`; `engineering/gardener.md`, "Tools"), so a `draft` flag on the write tools costs less than new ones.
  - *Searching the web* for a product or a store is not built for Hearth, and the mechanism now exists (D-132, built for Meadow): a Hearth tool declares `needs: ["search"]` in the manifest and its delegate carries a `research` step, as `suggest-places` does in `apps/desktop/src/lib/domains/places/tools.ts`. What is left is Hearth's own decision: a search tells a third party what the owner buys and where. Until then a lookup is the model's own knowledge and the owner's links (D-108).
  - *A store's page that describes many shops.* `storeDetails` (`packages/shared/src/domains/kitchen/store-logo.ts`) takes a phone or an address only when the page's shops agree on it, so a chain's front page gives none; the owner links the branch's own page. Sites that describe themselves in microdata and not JSON-LD give nothing.
  - *One feed entry per change.* A batch is one undo and as many Garden feed entries as it made writes; a batch method per list in `store.svelte.ts` would make it one.
  - *Prices stay out of the context* (D-105): the Gardener cannot say what a thing cost at a store.
- **Store pictures (D-103), built on desktop.** Left for later:
  - *Never run in the installed app.* The browser build has no `fetch_page` or `fetch_image`, so `storeLogo` in `apps/desktop/src/lib/domains/kitchen/staging.svelte.ts` has only been read, and the addresses it tries (`iconAddresses`, `guessedIcons` in `packages/shared/src/domains/kitchen/store-logo.ts`) only unit-tested. Whether WKWebView decodes each site's icon is unseen.
  - *A grocer that keeps programs out* refuses the page: H-E-B answers a check page that names no icon, and its picture comes from `/favicon.ico`, a 128 pixel `.ico`. A store whose site refuses that too keeps its tile until the owner chooses a picture.
  - *An `.ico` in the installed app* is unseen: `fitPicture` asks the webview to decode it, and reads it through an image element when that fails (`drawn` in `staging.svelte.ts`); neither path has run in WKWebView. An SVG is never taken.
  - *A small icon is soft.* A site whose every icon is 32 pixels (99 Ranch) gets that one, kept at its own size and drawn larger by the tile; one under 32 is refused. A sharper mark needs the owner's own picture, or a larger source such as the page's `og:image` or its web manifest, neither read today.
  - *A website changed on a store that has a picture* keeps the picture; Fetch from the website in the store's form replaces it.
  - *When a store becomes a Place* (above), its picture goes with it: the `store-photo` Attachment's `from` link moves to the Place.
  - *The sample workspace* seeds no store picture: the kit's stand-in is not a real mark.
  - *Stock's detail pane and the item's form* draw their own picture tile (`.picture` in `Stock.svelte` and `StockEditSheet.svelte`); `Thumbnail` could take both with a larger size.
- **The header motif (D-123), built on desktop.** Left for later, none of it started:
  - *Seen in the browser build only*, never in the installed app, and its visual baselines are not made (`yarn vrt:update` on the owner's machine).
  - *The phone.* Hearth's phone page is a placeholder; when it is built its header mounts the same sketch (`hearthEmbers` from the kit) with the same readings.
  - *Tuning.* How many sparks, how fast and how bright are constants at the top of `packages/ui-kit/src/lib/sketches/hearth-embers.ts`, set by eye against the sample stock; use will say whether they are right.
  - *The other domains' motifs* are each their own work: a sketch in the kit beside this one, the readings from the domain's store, and a row in `decisions.md`.
- **Household consumables (D-122), built on desktop.** Left for later, none of it started:
  - *Never run against a live model or in the installed app.* Whether capture keeps a receipt's household lines, places them under `household` and gives them a household category is unseen; the words are in the `capture-haul` prompt and schema in `apps/desktop/src/lib/domains/kitchen/tools.ts`, and `placed` in `packages/shared/src/domains/kitchen/types.ts` mends a row whose location and category disagree. The Stock page was exercised in the browser build only.
  - *Rooms.* One Household section holds everything. If it gets long, Bathroom, Laundry and the like are more locations; `isHousehold` in `types.ts` is then a set of locations, and it is the one test every food path uses (`stockFor` in `match.ts`).
  - *A grocery item has no kind.* The lists stay mixed by the owner's choice, so a list cannot group or mark its household lines; that would need a category on `grocery-item`, carried from the stock item by Add to grocery and Buy it again.
  - *Filing by what a store sells.* A new household item no store remembers goes to the unfiled list; `storeFor` in `filing.ts` could send it to a store whose `sells` has `home-goods`.
  - *Expiring includes household.* A dated household item (medicine) shows under the Expiring filter and in the digest; nothing estimates a date for one. Use will show whether that is wanted.
  - *Moving by hand keeps the category.* Move to and a drag between a food location and Household leave the category as it was; only the item's form and the write tools drop or follow it.
  - *The capture sheet's rows* offer all fifteen categories whatever the row's location (`HaulCapture.svelte` passes `CATEGORIES`); the commit does not run `placed`.
  - *The quick-add parser* (`parseStock` in `parse.ts`) is unused and does not read "household" as a place, since it is also a word in names ("household cleaner").
  - *One-off and durable purchases* (a pan, clothes, a gift) are a later Shopping domain's, not designed.
  - *The phone.* Mobile Hearth is still the placeholder.
- **Barcode.** Not started.
- **Nutrition facts on an item** (OQ-23). Not started, and wanted: the owner will want to pull up the label of any item that has one. Thought through on 2026-10-01:
  - *The first source is the camera.* The owner photographs the nutrition facts box and the Gardener reads it, as capture reads a receipt (D-86): any store, no new egress, and the only source that covers a store's own brand. A screenshot of a product page's panel is the same path on desktop.
  - *H-E-B's page is not fetched.* It shows the panel, but a grocer's product page is not asked for (D-91), and `productLink` reads the address alone. The owner's idea for later is a browser extension: the owner's own browser, on a page the owner is looking at, hands the panel to Eden, which still fetches nothing. A page that describes its product in JSON-LD would be read as `recipeFromJsonLd` reads a recipe.
  - *Databases, later.* A lookup by barcode once Barcode (above) exists: USDA FoodData Central (free key, public domain, branded foods by GTIN and unlabelled foods such as produce) and Open Food Facts (free, ODbL, thin on store brands). A lookup sends a barcode or a name to a third party, which D-88 does not allow today: it needs its own decision and its own ledger destination (D-71). The model's own idea of a food is not a label fact and is never shown as one.
  - *Not every item has one.* Three states: never asked, none (not food, or sold loose, so it is not offered again), and present. A database answer for loose produce is a reference value, not a label, and should say so.
  - *Where it lives, as data.* The owner wants the facts structured, not only a picture. On the `stock-item`, which stays after it runs out (D-92) and is the nearest thing to a product; a `grocery-item` shows it through the name match and holds none. An optional field needs no upgrade. Present is: serving size, servings per container, calories, nutrients (id, amount, unit, percent daily value), the ingredients line, the allergen line, the source and when. The label's photo is kept as a new attachment kind beside `item-photo`, so a read can be checked against it; the read is a draft the owner confirms, as a haul's rows are. A barcode on the item is the join for every database and the field Barcode would write.
  - *What it is not.* Per serving as printed: no totals, no intake, no targets (OQ-8, section 10). `recipe` already names optional label nutrition; summing a recipe from its items is a later question.
  - *What it could feed.* The ingredients and allergen lines against the `allergy` fact, which is T2 and needs a declared read.
- **Keeping a PDF or an email source** would need a new T2 attachment kind; today only photos are kept.
- **Low-stock thresholds by category.** A threshold is set per item; the setting in section 9 is not built.
- **Select mode** spans one location section at a time.
- **Tips on items added by hand** arrive only when the owner writes one.
- **Pictures are crops, not cut-outs.** Taking the background away needs a segmentation model on the device (D-29, D-90). When one arrives, `cutPicture` in `apps/desktop/src/lib/domains/kitchen/staging.svelte.ts` is where it goes.
- **How well a box fits its item** has not been seen against the live model. The light grade may draw loose boxes; the per-tool model override (D-74) is the first thing to try, and a box that shows nothing or most of the photo is already dropped.
- **An item read from a receipt** has no picture until the owner gives it one.
- **Recipes: pictures, credits, servings and the browsable view (D-93, D-107), built on desktop.** Left for later, none of it started:
  - *Never run in the installed app.* The browser build has no `fetch_page` or `fetch_image` (both throw `web:unavailable`), so a link's picture has only been read: `#fetchPicture` in `apps/desktop/src/lib/domains/kitchen/recipe-draft.svelte.ts` and `recipePicture` in `staging.svelte.ts`. Whether WKWebView decodes each site's picture, and how the whole picture reads back from the workspace for the banner (`recipeImage` in `store.svelte.ts`), are unseen. A picture chosen by hand has not been exercised either; only the form's buttons were. The same holds for D-110: a picture from a link (`linkedRecipePicture` in `staging.svelte.ts`, and its fall back to the page's own picture), a pasted picture and a dropped one (`PictureDrop.svelte`) have only been read in the browser build. Unseen in the installed app: whether WKWebView puts a copied image in the paste's `clipboardData.files`, whether Tauri's own file-drop handling lets the drop reach the form, and, on a phone, whether the picker still opens from the menu's sheet, which reports the pick only once it has closed.
  - *The mock and the sample data.* `Domains/Hearth/Recipes` (`packages/ui-kit/src/stories/domains/hearth/`) still draws the old list and card, with no picture, search, filters, servings or credit, and `SampleRecipe` in `sample-data.ts` (with `design/sample-data.md` and the app's `seed.ts`) has no picture, author, source name or recipe with `scales: false`. The mock follows the app here; the owner chose that order.
  - *A listed ingredient is not topped up.* Add missing skips a name already on any list, so raising the servings after adding leaves the smaller amount there (`addMissing` in `views/Recipes.svelte`).
  - *The row's count is the written recipe's.* A row's "n missing", the In stock filter and the least-missing order look at the recipe as written (`browseRecipes`), not at the servings asked for, which only the page knows.
  - *Scaling reads the amount, not the step.* A time, a tin or a count said in a step is never rewritten; a range and an amount with no number stay as written (`scaleQty` in `scale.ts`).
  - *Filters stand in for nutrition.* "Low-sodium" is a tag the owner or the page gave; a filter by what a recipe holds waits on label nutrition (below).
  - *Nothing is remembered between sessions.* The order, the filters and the servings asked for live in `recipe-browse.svelte.ts` and go when the app closes; a kept order is the first candidate for a setting.
  - *The ingredient column is tight* when the Gardener is open beside the page: below about 36rem the page reads top to bottom. Every line carries its mark, "in stock" included, which use may show to be noise.
  - *The form is still in the pane* (D-95 moves it to a sheet when next worked on), and it is long.
  - *The phone.* Mobile Hearth is still the placeholder; the column and the page have no mobile design.
- **Product links are H-E-B's alone** (D-91), read from two address forms that are observed, not documented: `productLink` in `packages/shared/src/domains/kitchen/product-link.ts` is where another grocer goes, and where a change at H-E-B is mended. A link gives no store to the item, because a stock item has none; whether it should is an open question with the owner.
- **What ran out and "Buy it again" (D-92), built on desktop.** Left for later: how consistently the live model names a product from one shop to the next is unknown, and it decides how often a returning item finds the row that ran out; the match by name and brand in `mergeTarget` (`packages/shared/src/domains/kitchen/match.ts`, D-104) is where to loosen or tighten it, and how reliably the model keeps a brand out of the name is as unknown. The 7 and 90 day windows are constants (`out.ts`), not settings. A `buy-it-again` Garden widget was proposed and not built. The Gardener's context still lists an item that ran out, at a quantity of 0, and the system prompt now says what that means. The Ran out and Buy it again lists have no select mode. An item at nothing from before `outAt` existed has no date: it shows as recent and is never let go. The Storybook mock (`Domains/Hearth/Stock`, story `RanOut`) still draws Ran out beneath the locations and opens the first item in the pane unasked; no mock shows the side staying in view or the pane empty until a row is picked (D-94). The phone's pages show neither list (issues 19 and 27).
- **A cooked recipe** does not link to the items it consumed, which the entity table's "links out" still asks for.
- **Not verified in the real app.** None of this has run in the installed Tauri app or against the live API. HEIC decoding in the Tauri webview is assumed.
