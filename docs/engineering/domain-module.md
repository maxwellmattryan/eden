---
title: Domain module
status: draft
summary: The domain manifest and the resource registry as code: the manifest.json a domain declares itself in, the builder that checks it and generates the registry for TypeScript and Rust, the bindings an app adds, the functions the shell composes itself with, where a domain's code lives, and how isolation is enforced.
read-this-if: You are adding or changing a domain, a registry row, a widget, a quick action, an intent or a palette entry, or anything in the shell that lists domains.
depends-on: [product/substrate/domain-manifest, product/substrate/registry, product/substrate/shell, engineering/app-scaffold, engineering/data-layer]
updated: 2026-09-29
---

## What this covers

| here | elsewhere |
|---|---|
| the manifest as data, the generated registry, the build-time checks, the app bindings, the composition functions, the homes of a domain's code, isolation | the grant store and the egress ledger, which read tiers from the registry; the Gardener's tools and the audit log, which read the declared reads; signals and notifications; the palette, the Garden's catalog and edit mode, and Quick Log as interfaces; the Domains tab, which makes the order and the enabled set the owner's |

D-68 records the decision; this page is how it works.

## Two halves

A domain is what it **declares** and what an app **binds** to that.

| half | where | holds |
|---|---|---|
| declaration | `packages/shared/src/domains/<id>/manifest.json` | data only: resources, reads, widgets, quick actions, tools, signals, intents, palette entries, export sections. The same for every app and for the crate |
| bindings | `apps/<app>/src/lib/domains/<id>/manifest.ts` | what the data cannot hold: the route, each widget's component and `hasData()`, the live glyph, the store's `load`, `seed`, `reload` and `extras` |

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
| `tools`, `signals`, `notificationKinds`, `captureSources`, `deviceCapabilities` | declared | checked and generated; their consumers arrive with the Gardener, signals, Capture and the grant store |
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
11. A row that differs from `docs/product/substrate/registry.md`, in either direction: id, category, primitive, owner, tier, and phase where the doc gives one.

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

`src/lib/domains/index.ts` lists the enabled domains in the shell's order and exports their `declarations`. Disabling a domain is leaving it out of that list: its sidebar entry, its tiles, its palette entries and its quick actions go, and its rows stay.

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

The shell names no domain. Toolbench sits in the second group because its manifest says `group: "shell"`; Sky's glyph follows the conditions because its bindings carry `liveGlyph`.

## Where a domain's code lives

| side | path | holds |
|---|---|---|
| shared | `packages/shared/src/domains/<id>/` | `manifest.json`, and the pure modules both apps use: types, row mapping, formats |
| desktop | `apps/desktop/src/lib/domains/<id>/` | `manifest.ts` (bindings), `store.svelte.ts`, `seed.ts`, `views/`, `widgets/` |
| mobile | `apps/mobile/src/lib/domains/<id>/` | `manifest.ts` (bindings), and its surfaces as they are built |
| Rust | `src-tauri/src/domains/<id>/` | models, services and commands, for a domain that needs the crate |

Every folder under a `domains/` is a domain, named by its plain id. What belongs to the shell lives in `src/lib/shell/`: the Garden (`shell/garden/`), the activity feed (`shell/feed.svelte.ts`), the undo toast. Sky's model, providers and store predate this layout and stay in `packages/shared/src/weather/`; its manifest is in `domains/weather/`. In the crate, `domains/documents.rs` is the document store and not a domain.

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
