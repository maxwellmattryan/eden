# Eden docs index

Every doc in one table per layer: path, status, one-liner, size (S under 120 lines, M under 300, L 300 or more; computed from the file), and when to load it. Statuses here must match each doc's front matter. `planned` rows are docs that do not exist yet.

## Reading paths

**New agent, five minutes**: `CONVENTIONS.md` → `product/vision.md` → `product/glossary.md` → `product/decisions.md` → `product/domains/README.md`.

**Working on a domain**: `product/decisions.md` → `product/substrate/registry.md` → the domain doc → `product/substrate/shell.md` for widgets, palette and Quick Log → the substrate docs the domain doc lists in `depends-on` → `product/domains/_template.md` only if editing structure.

**Designing mockups**: `design/brand.md` → `design/visual-language.md` → `design/ux-patterns.md` → `design/screens.md` → `design/sample-data.md`, then the domain docs for the screens you are drawing.

**Building a component**: `CONVENTIONS.md` → `engineering/ui-kit.md` → `design/visual-language.md` → `design/ux-patterns.md` → `engineering/ui-kit-components.md`.

## Conventions

| path | status | one-liner | size | load when |
|---|---|---|---|---|
| CONVENTIONS.md | draft | The doc header, status vocabulary, rules for every change, Crate patterns to reuse | S | editing any doc |

## Product

| path | status | one-liner | size | load when |
|---|---|---|---|---|
| product/vision.md | draft | What Eden is, principles, personas, non-goals, success criteria | S | new to Eden, or settling scope |
| product/glossary.md | draft | Every fixed term, the domain names in English and Japanese, the metaphor policy | S | naming anything |
| product/decisions.md | draft | Decided (D-n) and open (OQ-n) items, never deleted | S | before any design choice |
| product/roadmap.md | draft | Phases, cut lines, done criteria, risks | S | planning or scoping |

## Substrate

| path | status | one-liner | size | load when |
|---|---|---|---|---|
| product/substrate/privacy.md | draft | Tiers T0–T3, what never leaves the device, third parties, user controls, threat model | S | anything touching data sensitivity or AI |
| product/substrate/registry.md | draft | The single resource registry: every fact type, entity type and kind with owner and tier | M | declaring reads, grants, or a new resource |
| product/substrate/profile.md | draft | The facts store: model, provenance, write/read rules, "What Eden knows about me" | S | facts between domains |
| product/substrate/grants.md | draft | One permission model for integrations, AI reads, AI actions, devices, plugins | S | permissions or confirmations |
| product/substrate/primitives.md | draft | Task, Event, Place, Attachment: ids, kinds, mirrors and overlays, links, lifecycle | S | any shared entity |
| product/substrate/domain-manifest.md | draft | What a domain declares, isolation rules, entity URIs, intents, plugin path | S | adding or changing a domain |
| product/substrate/data.md | draft | Storage, Vault, export/import, backup, end-to-end sync, purge, retention | S | data ownership, sync, export |
| product/substrate/tasks.md | draft | Task detail: recurrence, routines, habits, Today view | S | to-dos, routines, reminders |
| product/substrate/signals-notifications.md | draft | Signals, rules, scheduler, channels, digests, inbox, activity feed | S | notifications or automation |
| product/substrate/integrations.md | draft | Connector lifecycle, catalog, secrets, per-device connections | S | any external service |
| product/substrate/ai.md | draft | The Gardener: providers, keys, context packs, tools, Council, budgets, audit | S | any AI feature |
| product/substrate/shell.md | draft | Sidebar, Garden dashboard, ⌘K, back navigation, status bar, Quick Log, mobile | S | navigation or layout |
| product/substrate/onboarding.md | draft | First launch wizard, per-domain first run, tour | S | onboarding screens |
| product/substrate/settings-utilities.md | draft | Settings modal tabs, appearance, i18n, updater, diagnostics, shortcuts | S | settings screens |

## Domains

| path | status | one-liner | size | load when |
|---|---|---|---|---|
| product/domains/README.md | draft | Table of all domains with id, name, subtitle, status, phase | S | orienting on domains |
| product/domains/_template.md | draft | The ten-section domain template, plus stub and candidate templates | S | writing a domain doc |
| product/domains/kitchen.md | draft | Hearth: stock by location, recipes from what you have, grocery lists, capture a haul | S | kitchen work |
| product/domains/toolbench.md | draft | Toolbench: ideas, projects, homelab, generative-art studio, technical notes | S | ideas or projects |
| product/domains/weather.md | draft | Sky: forecasts by a chosen provider, details, air quality, allergens, alerts, sun and moon, the default Garden widget | S | weather or ephemeris |
| product/domains/calendar.md | draft | Almanac: Eden's own calendar with layers over Events, Google as a source | S | calendar work |
| product/domains/fitness.md | draft | Vigor: workouts, gyms, body metrics, supplements, weight trend | S | fitness work |
| product/domains/spirit.md | draft | Sanctuary: traditions, readings, values, the daily line, optional astrology | S | reflection features |
| product/domains/places.md | draft | Meadow: places and listings on a map, vibes, favorites, outings | S | places or events near you |
| product/domains/finance.md | stub | Orchard stub: budgets, read-only accounts, categories including housing | S | finance scope |
| product/domains/health.md | stub | Wellspring stub: medical notes, meds, care, insurance | S | health scope |
| product/domains/people.md | candidate | Companions candidate: relationships, birthdays, gift ideas | S | considering a People domain |
| product/domains/journal.md | candidate | Rings candidate: daily reflection and mood | S | considering a Journal domain |
| product/domains/travel.md | candidate | Trails candidate: trips, itineraries, packing | S | considering a Travel domain |
| product/domains/library.md | candidate | Leaves candidate: reading list, highlights | S | considering a Library domain |

## Design

| path | status | one-liner | size | load when |
|---|---|---|---|---|
| design/brand.md | draft | Name, metaphor policy, voice and tone, motifs, the app icon, the domain glyph family, splash | S | any visual or copy decision |
| design/visual-language.md | draft | Tokens, light and dark themes, accents, type, icons, spacing, motion, a11y | S | styling anything |
| design/ux-patterns.md | draft | Navigation, forms, Quick Log, Capture sheet, states, AI surfaces, confirmations | S | designing a screen |
| design/screens.md | draft | Screen inventory with must-show, actions, states, and mockup order | S | mockups |
| design/sample-data.md | draft | One consistent fictional dataset for every mockup | S | mockups |

## Engineering

| path | status | one-liner | size | load when |
|---|---|---|---|---|
| engineering/README.md | draft | Where engineering stands and the questions still open | S | starting engineering |
| engineering/ui-kit.md | draft | The kit: location, exports, tokens pipeline, conventions, Storybook, gates | M | adding or consuming a component or token |
| engineering/ui-kit-components.md | draft | Per-component contract: props, bindables, callbacks, snippets, stories | S | changing a component |
| engineering/app-scaffold.md | draft | The two apps, the shared package and the crate: layout, platform features, commands, the domain module and where its data lives, Sky's providers and the WeatherKit bridge, pre-paint, the placeholder identifier | M | building under apps/*, packages/shared or src-tauri |
| engineering/data-layer.md | draft | The workspace database and everything over it: the SQLCipher file and its key per platform, the schema, migrations, stamps and ids, the IPC boundary command by command, the frontend module and its browser fallback, a store on rows, the export bundle, the import, testing | M | reading or writing the owner's data from Rust or from an app, adding a table, a command or an entity type, moving a store onto rows, touching export or import |
| engineering/domain-module.md | draft | The manifest and the registry as code: manifest.json, the builder and what it refuses, the generated registry, app bindings, the shell's composition functions, where a domain's code lives, isolation | M | adding or changing a domain, a registry row, a widget, a quick action, an intent or a palette entry |
| engineering/release.md | draft | The owner's release checklist: bucket, updater key, Apple and iOS ad-hoc signing, the WeatherKit capability, Android keystore, Pages, the secrets, the tag flow | S | setting up release accounts or cutting a release |

## Status legend

planned · draft · review · stable · stub · candidate · deprecated. Definitions are in `CONVENTIONS.md`.
