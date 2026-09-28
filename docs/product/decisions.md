---
title: Decisions
status: draft
summary: Everything settled (D-n) and everything open (OQ-n), with ids the other docs cite. Entries are never deleted; a superseded decision stays with a note.
read-this-if: You are about to make a design choice, or a doc cites an id you need to resolve.
depends-on: []
updated: 2026-09-28
---

## How to use this doc

Cite ids; never restate. To settle an open question, add a `D-n` entry and mark the `OQ-n` "promoted to D-n". To change a decision, add a new `D-n` and mark the old one "superseded by D-n". Both stay in place.

## Decided

| id | decision |
|---|---|
| D-1 | The product is named Eden and lives in `~/dev/repos/eden`. The former toolbox repo of that name was renamed `shed`. |
| D-2 | Modules are "domains" in code and docs. Domains carry themed display names with a plain subtitle; substrate and utility names stay plain; ids are plain. |
| D-3 | Single-user first, multi-user capable. No billing. Accounts exist only for optional sync. |
| D-4 | Orchard (finance) and Wellspring (health) are stubs until after Phase 2. |
| D-5 | Vigor is a standalone domain and owns body metrics and supplements until Wellspring exists; a later move is a registry owner change. |
| D-6 | Places and events are one domain, Meadow, with Listing as its own entity from day one. |
| D-7 | AI is bring-your-own-key or local models, with hard token and dollar caps and a per-request audit log. |
| D-8 | Read-only by default, confirm before acting, and a never-automated list: sending messages or email, payments, deleting external data. |
| D-9 | Local-first with opt-in sync, following Crate. |
| D-10 | Tasks are a substrate, not a domain. |
| D-11 | Every doc carries the six-field front matter and a row in INDEX. |
| D-12 | Quick Log is a shell pattern; domains register quick actions in their manifest. |
| D-13 | Capture (photo, receipt or barcode → draft → verify → commit) is the standard way physical things become data. |
| D-14 | The Vault is a separate store the AI subsystem cannot reach. T3 leaves the device only by user-authenticated export or end-to-end encrypted sync. |
| D-15 | Toolbench absorbs the idea sandbox and adds projects, homelab and a generative-art studio. |
| D-16 | A Home domain was considered and dropped. Housing cost, utilities, insurance and subscriptions are Orchard budget categories. |
| D-17 | Every domain gets a bespoke icon from one glyph family drawn on Lucide's grid. |
| D-18 | Almanac is a native in-app calendar with a layer stack. Google Calendar is a source, never the UI. |
| D-19 | Sky owns weather and ephemeris; Almanac and the Garden consume them as layers and widgets. (Its original "home area is a user-asserted fact" clause is superseded by D-38.) |
| D-20 | Launch locales are English and Japanese. The i18n system stays multi-locale. |
| D-21 | Sync is client-merged, end-to-end encrypted blobs. The server never holds plaintext for any tier. (Promoted from OQ-7.) |
| D-22 | One user per workspace. Household sharing is a v1 non-goal; if it comes it is shared collections, never shared workspaces. |
| D-23 | Task, Event, Place and Attachment are substrate primitives. Everything timed is an Event with a kind. (Owner lives in the registry per D-36, not in the kind id.) |
| D-24 | Entity ids are domain-free ULIDs behind `eden://<type>/<ulid>`. (Its "central type registry" is superseded by the single resource registry, D-35.) |
| D-25 | Safety filters for allergies and medical restrictions are deterministic, local, and applied to model output. Onboarding requests the T2 grants Phase 1 flows need. |
| D-26 | Phase 1 redaction is tier-based field exclusion plus a deterministic scrub of emails, phone numbers and account-like numbers. No pseudonymization. |
| D-27 | Units, timezone and work hours are settings, not facts. |
| D-28 | Google Calendar is read-only in Phase 2. Write, with recurrence exceptions, lands in Phase 3. |
| D-29 | On-device models are desktop-only. Mobile capture uses on-device OCR and barcode scanning, and cloud vision under grant. |
| D-30 | Primitive tiers follow the owning domain's kind, not the primitive type. The Vault holds T3 attachment kinds only. |
| D-31 | AI grants name registry ids (fact types, entity types, kinds; widened by D-35), never domains. Context packs are assembled from declared reads gated by tier. |
| D-32 | External state is mirrored per device with source + external id, flagged `mirror`, excluded from sync and export. The owner's edits are synced overlays. |
| D-33 | Primitive CRUD is the substrate API. Intents are domain-owned actions only. |
| D-34 | Pub/sub messages are "signals". The per-user store is the "workspace". Meadow's provider events are "Listings". |
| D-35 | One resource registry holds every fact type, entity type and kind with category, owner and tier. Declared reads, grants and the audit log reference registry ids only. |
| D-36 | Kind ids carry no domain prefix and no dot. The registry maps each kind to its current owner. |
| D-37 | Grants sync as workspace policy; connections, device-capability grants and secrets are per device. Mirror-derived entities snapshot their essentials. An interested Listing becomes a tentative Event. |
| D-38 | Home is a Place of kind `home` (T2). The `home-area` fact (T1) is derived from it by the substrate. There is no separate address fact. |
| D-39 | The display face is Newsreader, with metric overrides (ascent 98%, descent 26%, line gap 0%). Fraunces, Instrument Serif and Bricolage exist only behind the Storybook face dial and never ship. (Supersedes the Fraunces display face named in `design/visual-language.md` before the kit existed.) |
| D-40 | The Gardener has two colours, neither the accent: `--ai` (spruce green, sea-glass in dark) when it speaks, `--honey` when it acts (tool cards, the model chip); proposal cards and the can-see row speak, so they are green. (Supersedes the honey-only pairing in `design/visual-language.md`.) |
| D-41 | Selection is a mode, not a checkbox. Rows show no mark outside select mode; "Select" in the list header or a row's menu turns it on, Space toggles a row, "Done" leaves it. (Supersedes the hover-checkbox sentence in `design/ux-patterns.md`.) |
| D-42 | Two exceptions to the motif limits in `design/brand.md`: paper grain sits behind the page at the `lush` brand level only, and the Breeze specks play once on an accepted proposal or a settled action. Grain is off at `tended` and `plain`; Breeze renders nothing under reduced motion. |
| D-43 | Engineering begins with the UI kit ahead of the rest of the docs reaching `review`. The repo is a Yarn 1 workspace with `apps/*` and `packages/*`; the kit is `packages/ui-kit` (`@eden/ui-kit`), consumed from source inside the workspace, with `svelte-package` and `publint` as a build gate. The app scaffolds follow, ported from Crate. |
| D-44 | Toolchain pins: Node 22.18, Yarn 1.22, Svelte 5.57, SvelteKit 2.70 (tooling only), Vite 7.3, Vitest 4.1 in browser mode, Storybook 10.6 with Svelte CSF, Tailwind 4.3, TypeScript 5.9, ESLint 10 flat config, Prettier 3.9 with Crate's rules. Exact versions live in the package manifests. |
| D-45 | Storybook 10 with Svelte CSF is the acceptance surface. Every story renders desktop and mobile side by side by default and runs as a Vitest browser test once per platform with an axe gate at `error`. |
| D-46 | `tokens.json` in the kit is the single source for tokens; the theme, base and Tailwind stylesheets, the pre-paint script and the token types are generated from it and never hand-edited. The type scale is strict: 12, 13, 14, 15 (voice), 16, 18, 22, 28, 36 and nothing between. |
| D-47 | Root attributes: `data-theme` (light, dark; "system" is resolved in JS), `data-accent`, `data-font`, `data-brand` (plain, tended, lush), `data-platform` (desktop, mobile) and `data-density` (comfortable, compact; desktop only). Selectors are element-scoped so a subtree can carry its own value; components never read the attributes, only tokens and `--ed-*` variables. |
| D-48 | Fonts are self-hosted OFL files shipped with the kit (Newsreader, Inter, Geist Mono), never loaded from a CDN. New fonts arrive the same way. |
| D-49 | The relief is `raised`. Every button-family control (Button in every variant, IconButton, BackButton, button chips) presses the same way: it compresses from the top with its bottom edge fixed, as if it sank into its hole; a filled control's shadow collapses too. Reduced motion removes the movement. (Promoted from OQ-21.) |
| D-50 | Visual baselines are generated artifacts, never committed: CI regenerates them from `main` and compares pull requests against the latest set; locally `yarn vrt:update` writes them git-ignored. (Promoted from OQ-20.) |

## Open questions

| id | question | leaning |
|---|---|---|
| OQ-1 | Is the dashboard called Garden or Home? | Garden, since domains carry themed names and "Home" collides with the home Place. Confirm with mockups. |
| OQ-2 | Is Council chair synthesis on by default? | Off; show side-by-side first, synthesis on request. |
| OQ-3 | Which relay carries push, email and SMS notifications? | Decide with the sync backend in Phase 3. |
| OQ-4 | Map tiles, places provider and events providers, and their cost. | Decide before Meadow. |
| OQ-5 | Licensing for Sanctuary's bundled texts. | Public domain only until reviewed. |
| OQ-6 | Should Google Calendar write, when it arrives, be granted per calendar? | Yes, per calendar. |
| OQ-7 | Promoted to D-21. | |
| OQ-8 | Will Eden ever track calorie intake? | No plan. Kitchen holds label facts, Vigor holds expenditure, Wellspring would hold targets. |
| OQ-9 | Is Rings its own domain, or part of Sanctuary or Toolbench? | Own domain if promoted; mood and reflection are not spiritual by default. |
| OQ-10 | Crash logs: local only, or opt-in send? | Local only in v1, export by hand. |
| OQ-11 | Default vision provider for Capture, and how photos appear in the audit log. | Cloud provider chosen by the user; the audit log stores a hash and dimensions, never the image. |
| OQ-12 | Vault and sync passphrase UX and recovery. | Passphrase set on first sync, recovery key shown once, no server escrow. |
| OQ-13 | Reuse "Greenhouse" for the experimental area in Settings → Domains where candidate domains and plugins are tried before being planted? | Yes. |
| OQ-14 | Holiday dataset source and licensing. | Bundle an open dataset; user selects countries; US and Japan default. |
| OQ-15 | Weather provider. | Open-Meteo as the keyless default; WeatherKit later. |
| OQ-16 | Which astrology computations run locally versus via a provider? | Local ephemeris for sun, moon and transits; horoscope text from a provider only under grant. |
| OQ-17 | Free-text pseudonymization with re-identification, if ever. | Not before Phase 3, and only with a measured leak rate. |
| OQ-18 | Re-tune the light accents for contrast before the accent picker ships? | Yes. No picker for now; the kit keeps `data-accent`, the `accents` union and a computed `--on-brand` per accent, so the picker is one settings row once the light values are re-tuned. |
| OQ-19 | `SwipeRow`: hand-rolled pointer handling or a library? | Hand-rolled, last in the kit's shell wave; may slip to the app scaffold without blocking. |
| OQ-20 | Promoted to D-50. | |
| OQ-21 | Promoted to D-49. | |
