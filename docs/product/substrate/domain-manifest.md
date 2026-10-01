---
title: Domain manifest
status: draft
summary: What a domain declares to the shell, the isolation rules that keep domains standalone, entity URIs and intents, what enabling, disabling and removing a domain does, the plugin path, and Hearth as a worked example.
read-this-if: You are adding a domain, changing how domains plug into the shell, or wiring two domains together.
depends-on: [registry, primitives, grants]
updated: 2026-10-01
---

## Purpose

A domain is a manifest plus the code behind it. The shell composes the sidebar, the Garden, the command palette, notifications, the Gardener's tool set and the settings modal from manifests alone. A plugin later is a manifest the owner did not write (D-3).

## Manifest fields

| field | phase | meaning |
|---|---|---|
| `id` | 1 | plain, permanent (`kitchen`) |
| `displayName`, `subtitle` | 1 | locale keys; the themed name and its plain subtitle (D-2) |
| `icon` | 1 | the glyph from the domain family (D-17) |
| `parent` | planned | optional grouping (Vigor under Wellspring one day) |
| `sidebar` | 1 | order hint and default visibility |
| `resources` | 1 | the registry rows this domain owns: fact types, entity types, kinds with tiers |
| `reads` | 1 | fact types and kinds from other owners it consumes |
| `widgets` | 1 | Garden tiles with size (S, M, L), default placement, and the registry ids each reads; widgets compute locally and call a tool when they need the Gardener |
| `quickActions` | 1 | Quick Log entries (D-12) |
| `captureSources` | 1 | photo, receipt, barcode, share sheet (D-13) |
| `tools` | 1 | Gardener tools, each with `reads`, `access` and confirm rule; one a model runs also declares its grade and what it needs of the model (D-74) |
| `signals` | 1 | signal names it emits |
| `notificationKinds` | 1 | with default channel and cadence; one that names a `signal`, and optionally `when`, is a default rule (`substrate/signals-notifications.md`) |
| `schedules` | 1 | the repeating schedules it subscribes to: daily at a local time, or every so many seconds |
| `settings` | 1 | its settings page |
| `intents` | 1 | domain-owned actions it handles |
| `integrations` | 2 | connectors it uses, with default access |
| `deviceCapabilities` | 1 | `camera`, `location-precise`, `os-notifications`, `healthkit` |
| `palette` | 1 | command-palette verbs and search index contributions |
| `dayAnnotations` | 2 | Almanac annotation providers |
| `dailyLine` | 2 | whether it can provide the daily line |
| `i18n` | 1 | its locale namespace |
| `export` | 1 | its export sections |
| `mobile` | 2 | which surfaces exist on the phone |

Fields no Phase 1 domain consumes are marked planned and left unimplemented until a domain needs them. How a manifest is written in code, and what is checked when it is built, is in `engineering/domain-module.md` (D-68).

## Isolation rules

- A domain never imports another domain's code or reads another domain's tables.
- Domains communicate through five channels only: **facts** (profile), **primitives** (shared tables by kind), **signals** (pub/sub), **intents** (domain-owned actions), and **typed entity links**. Every other coupling is a bug.
- A domain's Gardener tools declare their reads as registry ids; the shell rejects a tool that names a resource outside the registry or a T3 resource (D-31, D-14).
- A tool names a grade, never a model or a provider; which model runs it is the provider's map and the owner's overrides (D-74).
- Safety filters that guard the owner (allergies) run in the substrate, not in the domain that happens to display the result (D-25).

## Entity URIs and typed links

`eden://<type>/<ulid>` resolves through the registry to the current owner, so links survive ownership moves (D-24). Links are typed and degrade to text when the target is gone (`substrate/primitives.md`).

## Intents (Phase 1 list)

Intents are domain-owned actions another part of Eden can request. Primitive CRUD is never an intent (D-33).

| intent | handler | phase | effect |
|---|---|---|---|
| `kitchen.add-to-grocery` | Hearth | 1 | adds an item or a recipe's missing ingredients to the grocery list of the store each was last bought at (D-97) |
| `toolbench.open-idea` | Toolbench | 1 | opens an idea, used by the activity feed and search |
| `calendar.show-date` | Almanac | 2 | opens the calendar on a date with a layer highlighted |
| `places.open` | Meadow | 3 | opens a place on the map |

Intents route through the shell; if the handler is disabled the caller gets a "not available" result and shows nothing.

## Lifecycle

- **Enable**: the domain's resources register, its widgets appear in the Garden catalog, its first-run empty states show, and its onboarding grants are requested in context.
- **Reorder** and **hide**: sidebar order and visibility are settings; hiding is not disabling.
- **Disable**: UI, widgets, quick actions, tools and notifications stop. Data, facts and links remain (`substrate/primitives.md`).
- **Remove**: explicit and rare. Export the domain, delete its entities, retire its registry rows, retract its derived facts, degrade links to text. User-asserted facts stay.

## Plugin path

Built-in domains are manifests compiled into the app. An external plugin is the same manifest plus code the shell loads in a sandbox defined by engineering. It gets no new powers: the same registry, the same grants, the same declared reads, the same audit. Plugins are a Phase 3 internal exercise (one built-in domain moved out) before any third-party story (OQ-13 for where they are tried).

## Example: Hearth's manifest

| field | value |
|---|---|
| `id` | `kitchen` |
| `displayName` / `subtitle` | Hearth / Food, recipes, pantry, groceries |
| `resources` | facts `allergy` T2, `dietary-preference` T1, `disliked-ingredient` T0, `cuisine-preference` T0, `household-size` T1; entities `stock-item` T0, `recipe` T0, `grocery-store` T0, `grocery-list` T0, `grocery-item` T0; kinds `shop-day` (event, T0), `haul-photo` (attachment, T1), `item-photo` (attachment, T1) |
| `reads` | `medical-dietary-restriction`, `favorite-supplement`, `home-area` |
| `widgets` | expiring-soon (S, M; reads `stock-item`), cook-tonight (M; reads `stock-item`, `recipe`, `allergy`, `medical-dietary-restriction`, `dietary-preference`), grocery-quick-add (S; reads `grocery-store`, `grocery-list`, `grocery-item`) |
| `quickActions` | capture-haul, add-to-grocery |
| `captureSources` | photo, receipt (barcode in Phase 2) |
| `tools` | suggest-recipes (read, standard), storage-tip (read, light), capture-haul (write-draft, light, needs vision), draft-grocery-list (write-draft, standard), add-stock, update-stock, edit-grocery and edit-stores (each write, confirm, plain), import-recipe (write-draft, light, needs vision), save-recipe (write-draft, plain), change-recipe (write, confirm, plain), plan-week (write-draft, deep, needs tools) |
| `signals` | `stock.expiring`, `stock.low`, `grocery.shop-day` |
| `notificationKinds` | expiring-digest (daily, in-app; answers `stock.expiring`), low-stock (weekly, in-app; answers `stock.low`), shop-day-reminder (OS, morning of; answers `grocery.shop-day`) |
| `schedules` | morning (daily at 08:00) |
| `intents` | `kitchen.add-to-grocery` |
| `deviceCapabilities` | `camera`, `os-notifications` |
| `palette` | go to Hearth, add to grocery, capture haul, cook tonight, search stock and recipes |
| `export` | stock, recipes, grocery lists |
