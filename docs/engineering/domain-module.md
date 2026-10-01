---
title: Domain module
status: draft
summary: The domain manifest and the resource registry as code: the manifest.json a domain declares itself in, the builder that checks it and generates the registry for TypeScript and Rust, the bindings an app adds, the functions the shell composes itself with, model grades and the resolution of a tool to a model, where a domain's code lives, and how isolation is enforced.
read-this-if: You are adding or changing a domain, a registry row, a widget, a quick action, an intent, a palette entry or a tool's grade, or anything in the shell that lists domains, or sending a request to a model.
depends-on: [product/substrate/domain-manifest, product/substrate/registry, product/substrate/shell, engineering/app-scaffold, engineering/data-layer]
updated: 2026-10-01
---

## What this covers

| here | elsewhere |
|---|---|
| the manifest as data, the generated registry, the build-time checks, the app bindings, the composition functions, the homes of a domain's code, isolation | the grant store and the egress ledger, which read tiers from the registry; the Gardener's tools and the audit log, which read the declared reads; signals, rules and schedules at work (`engineering/signals.md`); the palette, the Garden's catalog and edit mode, and Quick Log as interfaces; the Domains tab, which makes the order and the enabled set the owner's |

D-68 records the decision; this page is how it works.

## Two halves

A domain is what it **declares** and what an app **binds** to that.

| half | where | holds |
|---|---|---|
| declaration | `packages/shared/src/domains/<id>/manifest.json` | data only: resources, reads, widgets, quick actions, tools, signals, rules, schedules, intents, palette entries, export sections. The same for every app and for the crate |
| bindings | `apps/<app>/src/lib/domains/<id>/manifest.ts` | what the data cannot hold: the route, each widget's component and `hasData()`, the live glyph, the store's `load`, `seed`, `reload` and `extras`, `subscribe`, which binds what the domain hears, the tool handlers, and the surfaces a draft opens on (`openDraft`, `overlay`) |

The declaration is JSON because two languages read it. A JSON import would widen every id to `string`, so the builder writes the declarations out again as `as const` TypeScript, and the types come from that.

## The sources

All under `packages/shared/src/`, hand-edited and formatted by Prettier:

| file | holds |
|---|---|
| `domains/<id>/manifest.json` | one built domain |
| `registry/substrate.json` | the substrate's rows: its facts, the four primitives, its entity types, its kinds |
| `registry/planned.json` | the rows of the owners that are not built, keyed by owner, so a Phase 1 read of a later resource resolves; a block moves into a manifest when its domain is built |
| `manifest/shell.json` | what the shell declares for itself: the built domains in order, the sidebar entries that are not domains (D-64), the phone's tab bar, the Garden tiles no domain owns, the Garden's default layout |

### Manifest fields

| field | status | notes |
|---|---|---|
| `id`, `phase` | consumed | the plain id; the phase of the domain's rows, which a row may override |
| `sidebar` | consumed | `group` (`shell` beside the Garden and the Gardener, `domains` otherwise), `order`, `visible` |
| `tabs` | consumed | tab ids in order; the label is `domains.<id>.tabs.<tab>` |
| `resources` | consumed | `facts`, `entities`, `kinds`, each row an `id` and a `tier`; a kind names its `primitive` |
| `reads` | consumed | the resources of other owners it consumes |
| `widgets` | consumed | `id`, `sizes` (the default first), `default`, `reads`, and `planned` for a tile the domain's doc names and nobody has built |
| `quickActions` | consumed | `id`, `label`, `icon` |
| `intents` | consumed | each `<id>.<action>` (D-33) |
| `palette` | consumed | `entries` that **run** a quick action or an intent, and `search`, the types of its own the palette searches. Going to the domain and to each tab is implied |
| `export` | consumed | the types of its own in its export |
| `signals` | consumed | the names it emits, each `subject.verb`; what `emit` accepts is typed from them (`engineering/signals.md`) |
| `notificationKinds` | consumed | `id`, `channel` (`in-app`, `os`), `cadence`, `default`. With `signal` (one of the domain's own) it is a rule, and `when` is its condition: fields, each with the words it may be. Its words are `domains.<id>.notifications.<kind>.line` and, for `os`, `.title` |
| `schedules` | consumed | `id` with `daily` (`HH:MM`) or `every` (seconds, sixty at least); the scheduler knows it as `<id of the domain>.<id>` |
| `deviceCapabilities` | consumed | what it needs of the device; `os-notifications` is what an `os` rule needs |
| `tools`, `captureSources` | consumed (`tools`), declared (`captureSources`) | checked and generated; the Gardener's runtime consumes `tools` (`engineering/gardener.md`) and Capture will consume `captureSources`. A tool is `id`, `access`, `confirm`, `reads`, and, when a model runs it, `grade` (`light`, `standard`, `deep`), `needs` (`tools`, `vision`) and `minContext` in tokens; no grade is a plain tool (D-74, "Model grades") |
| `parent`, `integrations`, `dayAnnotations`, `dailyLine`, `mobile`, `settings` | planned | the builder refuses them until a domain consumes one. `settings` is Phase 1 in the manifest doc and waits for the Domains tab |

The name, the subtitle, the glyph and a widget's title and prompt are derived from ids (`domains.<id>.name`, `domainGlyph(id)`, `garden.widgets.<widgetId>`, `garden.empty.<widgetId>`, the id in camelCase), so a manifest never repeats them.

## The builder

`packages/shared/scripts/build-registry.mjs`, run as `yarn registry`; `yarn registry:check` fails on drift and is part of `yarn check`, `yarn build` and CI. It follows the kit's generators (`engineering/ui-kit.md`). The logic is in `scripts/registry/core.mjs`, which takes parsed sources and is unit-tested beside it.

It writes two files, never hand-edited:

| file | holds |
|---|---|
| `packages/shared/src/registry/generated.ts` | `RESOURCES`, `DECLARATIONS`, `SHELL` |
| `src-tauri/src/substrate/registry_generated.rs` | `RESOURCES`, the same rows; marked `#[rustfmt::skip]` so the Node job needs no Rust toolchain |

lint-staged runs it with `--add` when a source changes, which stages the two files.

### What it refuses

Each error names the file and the id.

1. An id that is not kebab-case, or has a dot; a kind id that starts with a domain id (D-36); a domain id the kit has no glyph for.
2. A resource id registered twice, in any category or file; an owner that has a manifest and a block in `planned.json`.
3. A kind of no primitive; a tier outside `T0` to `T3`, `by-kind`, `by-source`; a phase outside 1, 2, 3, `later`.
4. A read that is not in the registry, in `reads`, a widget, a tool or a shell tile; a read of another domain's resource that `reads` does not declare; an `export` or `palette.search` id the domain does not own.
5. A read of a T3 resource, anywhere (D-14, D-31).
6. An intent that is not `<id>.<action>`; a tool access outside `read`, `write-draft`, `write`.
7. A widget id used twice, by domains or by the shell; a quick action or a tool id used twice in a domain; a sidebar order used twice in a group.
8. A default widget the Garden's default layout does not place, and a layout id nothing declares.
9. A locale key missing from `en.json` or `ja.json`, for anything that is not planned; an icon the kit does not list.
10. A planned field, and a field it does not know.
11. A rule that answers a signal the domain does not emit; a condition that is not fields, each with the words it may be, or one on a kind with no signal; an `os` rule in a domain that does not declare `os-notifications`.
12. A schedule id used twice in a domain; a schedule that is neither `daily` nor `every`, or both; a `daily` that is not a time of day; an `every` that is not a whole number of seconds, sixty at least.
13. A row that differs from `docs/product/substrate/registry.md`, in either direction: id, category, primitive, owner, tier, and phase where the doc gives one.
14. A tool field outside `id`, `access`, `confirm`, `reads`, `grade`, `needs`, `minContext`, so a `model` or a `provider` on a tool, which names a grade, never a model (D-74); a grade outside `light`, `standard`, `deep`; a `needs` that is not a list, names something outside `tools` and `vision`, or names one twice; a `minContext` that is not a whole number above zero; `needs` or `minContext` on a tool with no grade.

The doc stays hand-written and the builder keeps it honest. It reads each table by its header names, takes the owner from the section's heading (`` ## Hearth (`kitchen`) ``) or the `owner` column, and the category from the `category` column or the heading above the table. The doc lists the four primitives among the substrate's entity types; in code they are their own category, so `task` is never an entity type.

## The registry

`@eden/shared/registry` and `src-tauri/src/substrate/registry.rs` hold the same rows and answer the same questions.

| | TypeScript | Rust |
|---|---|---|
| a row | `resource(id)`, `ownerOf`, `tierOf`, `resourcesOf(owner)` | `resource(id)` |
| what a write may name | `isEntityType`, `isKind`, `kindsOf(primitive)` | `is_entity_type`, `is_kind`, `is_owner`, `entity_types_of`, `kinds_of` |
| types | `ResourceId`, `FactId`, `EntityTypeId`, `KindId`, `KindOf<P>`, `Tier` | `Category`, `Tier`, `Resource` |

A row is **live** when its phase is 1. A write names a live resource or is refused, in the crate and in the browser engine alike; a read, a grant or an audit entry may name any row (D-31), which is how Sky declares that it reads `workout-session` before Vigor exists. An import still accepts any well-formed id (`engineering/data-layer.md`). When a phase ships, the rule moves with it.

An entity URI resolves to its owner through `ownerOf`, so a link survives a change of owner (D-24): moving a resource is an edit to a manifest and to the doc, and no row changes.

## Bindings

Each app has `src/lib/domains/manifest.ts` with `defineDomain(id, bindings)`, which joins a declaration to what the app binds. On desktop the widget bindings are typed over the declaration's built widget ids: a widget without a binding does not compile, and neither does a binding for a widget nobody declared. The phone binds a route and a live glyph, and its widgets when its Garden is built.

`pack` is what the Gardener's context pack carries of a row, by entity type, for a type whose row is more than a request should pay for (D-85): the shell's pack readers apply it after the query, a type without an entry is sent whole, and `null` leaves a row out. Sky binds one for `forecast`.

`labels` is what a row is called where the Gardener lists what it read (the "can see" chip, the audit log), by entity type, for a type whose rows hold no `name`, `title` or `label` of their own: `labelRows` (`apps/desktop/src/lib/shell/gardener/labels.ts`) asks it first and falls back to the row's name, then its id. Hearth binds one for `grocery-list`, which is called by its store, or "Miscellaneous" for the list of what is not filed.

`subscribe` is where a domain hears its schedules and its signals and registers its mirrors with the refresh coordinator (`engineering/signals.md`). The shell calls it once when it starts, before any store is loaded, so what it binds reads rows and not the domain's store; its answer unbinds.

`tools` binds a handler to each tool the domain declares and `quickActionHandlers` a store write to each quick action (`engineering/gardener.md`, "Tools"); the domain keeps them in `tools.ts`, which imports its own store and the shell and nothing of another domain.

`commitDraft(card)` is the domain's part of committing a draft its tool left, from the card in the Gardener's panel (a grocery list, a plan's shop list); the substrate's parts, tasks and events, are the shell's. `openDraft(card, settle)` is for a draft the owner checks on a surface of the domain's own instead: it opens the draft there and answers whether it took it, and `settle` is told when the owner keeps or discards it, until which the card stays as it was. Hearth binds it for a `capture` draft, which opens its capture sheet at the rows, and for a `recipe` draft, which opens in its Recipes pane unsaved (D-86).

`overlay` is a component the shell mounts once, over whatever page is open, beside its own sheets. Hearth's capture sheet is one, since a haul is captured from its page, from a drop and from a card in the Gardener's panel. The root layout mounts each enabled domain's overlay and names none of them.

`src/lib/domains/index.ts` lists the enabled domains in the shell's order and exports their `declarations`. Disabling a domain is leaving it out of that list: its sidebar entry, its tiles, its palette entries, its quick actions, its rules and its schedules go, and its rows stay.

## Composition

`@eden/shared/manifest` holds the functions the shell composes itself with. They are pure, take the enabled domains' declarations, and answer ids and locale keys; an app turns those into kit props with its translations, routes and components.

| function | answers | consumer |
|---|---|---|
| `sidebarGroups(declarations, shell, preferences?)` | the groups in order (D-64), with the owner's order and hidden list applied | the desktop sidebar |
| `shortcutPositions(groups)` | the ⌘ position of each place | the desktop sidebar |
| `tabBar(declarations, shell, pinned?)` | the phone's tabs, and what waits behind More | the mobile tab bar and More |
| `gardenCatalog(declarations, shell)` | every built tile with its sizes and reads | the Garden's catalog |
| `defaultLayout(declarations, shell)` | the default tiles in order, each at its first size | the Garden |
| `paletteIndex(declarations, shell)` | the **go** and **run** entries, and the types each domain lets the palette search | the command palette |
| `quickActions(declarations)` | the Quick Log's entries | Quick Log |
| `handlerOf(declarations, intent)` | the domain that handles an intent, or nothing when it is disabled | intent routing |

The shell names no domain. Toolbench sits in the second group because its manifest says `group: "shell"`; Sky's glyph follows the conditions because its bindings carry `liveGlyph`. The rules and the schedules are composed the same way, by `rulesOf(declarations)` in `@eden/shared/signals` and by the runtime that declares each domain's `schedules` (`engineering/signals.md`).

## Model grades

A tool declares a grade and what it needs of a model; which model runs it is resolved when it is asked for (D-74). `@eden/shared/gardener` holds that resolution. It is pure, never throws, and lives in TypeScript because what is derived from the manifests is the frontend's (D-72, D-73); whichever side sends a request is handed the provider and the model. If the tools are ever generated into the crate, `resolve.test.ts` ports as shared vectors.

| export | answers | consumer |
|---|---|---|
| `ANTHROPIC_SEED`, `PROVIDERS` | the seeded provider: its models, each with flags, context size and pricing, and its map from grade to model. `providers.ts` is the only place a model id appears | the Gardener tab, every resolution |
| `gradeMapOf(provider)`, `modelLookup(providers)` | a provider's map as refs; a ref's row across every provider, or nothing | the resolver's callers |
| `effectiveProvider(seed, edits)` | the seed with the owner's sparse edits laid over it, and the edits that would not hold, which leave the seed's value standing | the Gardener runtime, the Gardener tab |
| `validateProvider(row)` | what is wrong with a row: ids, flags, context, pricing, a grade mapped to a model the row does not list | the seed's tests, the Gardener tab before it keeps an edit |
| `priceRatio(candidate, baseline)` | how many times dearer one model is than another, the larger of the input and output ratios | the Gardener tab's warning on a model dearer than the seeded one for its grade |
| `resolveTool({ tool, domain, overrides, map, models })` | `plain`; or the provider, model, grade it runs at, declared grade, source (`tool-override`, `domain-override`, `map`) and `confirm`; or `unavailable` with `no-provider` or `no-capable-model` and what was missing. Every model passed over is in `skipped` with why, and a model the map names at several grades is there once | every model-backed tool request |
| `resolveGrade(grade, needs, map, models)` | the same for the conversation, at its grade or at one the owner accepted from a proposal; only a move above that grade confirms | every conversation message |

The per-tool override is keyed `<domain>.<tool>`, the per-domain one by the domain's id. A tool's grade is read from its declaration each time, never cached, so a tool may gain a grade later (OQ-22).

The Gardener's runtime (`engineering/gardener.md`) calls `resolveTool` before every model-backed tool request and `resolveGrade` for the conversation, estimates from the resolved model's pricing row, and never sends while `confirm` is owed. It writes the audit entry from the result (`declared`, `grade`, `provider`, `model`, `source`, the confirm's outcome) with the thread and the request that called it (`product/substrate/ai.md`, "Audit log"). A tool id is unique within its domain (refusal 7); on the wire it is `<domain>_<id>`, a grant names the bare id (`@eden/shared/grants`), and an override is keyed `<domain>.<tool>` (D-76). In development the map is clamped before it is handed to the resolver: the light model for light and standard, the standard one for deep (D-81).

## Where a domain's code lives

| side | path | holds |
|---|---|---|
| shared | `packages/shared/src/domains/<id>/` | `manifest.json`, and the modules both apps use: types, row mapping, formats, what the domain does on its schedules (`signals.ts`), and its pure rules, each with its test beside it (Hearth's are listed in `engineering/data-layer.md`, "A store on rows") |
| desktop | `apps/desktop/src/lib/domains/<id>/` | `manifest.ts` (bindings), `store.svelte.ts`, `seed.ts`, `tools.ts`, `views/`, `widgets/` |
| mobile | `apps/mobile/src/lib/domains/<id>/` | `manifest.ts` (bindings), and its surfaces as they are built |
| Rust | `src-tauri/src/domains/<id>/` | models, services and commands, for a domain that needs the crate |

Every folder under a `domains/` is a domain, named by its plain id. What belongs to the shell lives in `src/lib/shell/`: the Garden (`shell/garden/`), the activity feed (`shell/feed.svelte.ts`), the inbox (`shell/inbox.svelte.ts`), the undo toast. Sky's model, providers, row mapping and store predate this layout and stay in `packages/shared/src/weather/`; its manifest is in `domains/weather/`. In the crate, `domains/documents.rs` is the document store and not a domain.

## Isolation

A domain never imports another domain's code (`product/substrate/domain-manifest.md`, "Isolation rules"). Two checks hold it:

- **ESLint.** `eslint.config.js` builds one `no-restricted-imports` block per domain id, for its folder in each app and in `@eden/shared`. It refuses a relative import into another domain's folder, `$lib/domains/<other>`, `@eden/shared/domains/<other>`, and `@eden/shared/weather` from any domain but Sky.
- **The crate.** A test in `src-tauri/src/domains/mod.rs` reads every domain's sources and fails on a path into another domain.

A domain may import the shell and the substrate. What two domains would share goes there, or travels as a fact, a primitive, a signal, an intent or a typed link.

## Adding a domain

1. Write `packages/shared/src/domains/<id>/manifest.json`; move the domain's block out of `registry/planned.json`; add the id to `domains` in `manifest/shell.json`.
2. Add the locale keys the builder asks for, to `en.json` and `ja.json`.
3. Run `yarn registry`. Fix what it refuses; update `docs/product/substrate/registry.md` when a row changed.
4. Add `apps/*/src/lib/domains/<id>/manifest.ts` with `defineDomain`, list it in that app's `domains/index.ts`, and add its route.
5. Add `src-tauri/src/domains/<id>/` when the domain needs the crate, and list it in `domains/mod.rs`.

Adding a registry row to a built domain is steps 1 and 3. Adding a widget is a row in `widgets`, its two locale keys, its binding, and its id in `gardenDefault` when it is a default.
