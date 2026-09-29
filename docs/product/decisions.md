---
title: Decisions
status: draft
summary: Everything settled (D-n) and everything open (OQ-n), with ids the other docs cite. Entries are never deleted; a superseded decision stays with a note.
read-this-if: You are about to make a design choice, or a doc cites an id you need to resolve.
depends-on: []
updated: 2026-09-29
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
| D-27 | Units, timezone and work hours are settings, not facts. (Which settings, and that they are global, is D-58.) |
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
| D-42 | Two exceptions to the motif limits in `design/brand.md`: paper grain sits behind the page at the `lush` brand level only, and the Breeze specks play once on an accepted proposal or a settled action. Grain is off at `tended` and `plain`; Breeze renders nothing under reduced motion. The grain's placement is superseded by D-61. |
| D-43 | Engineering begins with the UI kit ahead of the rest of the docs reaching `review`. The repo is a Yarn 1 workspace with `apps/*` and `packages/*`; the kit is `packages/ui-kit` (`@eden/ui-kit`), consumed from source inside the workspace, with `svelte-package` and `publint` as a build gate. The app scaffolds follow, ported from Crate. |
| D-44 | Toolchain pins: Node 22.18, Yarn 1.22, Svelte 5.57, SvelteKit 2.70 (tooling only), Vite 7.3, Vitest 4.1 in browser mode, Storybook 10.6 with Svelte CSF, Tailwind 4.3, TypeScript 5.9, ESLint 10 flat config, Prettier 3.9 with Crate's rules. Exact versions live in the package manifests. |
| D-45 | Storybook 10 with Svelte CSF is the acceptance surface. Every story renders desktop and mobile side by side by default and runs as a Vitest browser test once per platform with an axe gate at `error`. |
| D-46 | `tokens.json` in the kit is the single source for tokens; the theme, base and Tailwind stylesheets, the pre-paint script and the token types are generated from it and never hand-edited. The type scale is strict: 12, 13, 14, 15 (voice), 16, 18, 22, 28, 36 and nothing between. |
| D-47 | Root attributes: `data-theme` (light, dark; "system" is resolved in JS), `data-accent`, `data-font`, `data-brand` (plain, tended, lush), `data-platform` (desktop, mobile) and `data-density` (comfortable, compact; desktop only). Selectors are element-scoped so a subtree can carry its own value; components never read the attributes, only tokens and `--ed-*` variables. |
| D-48 | Fonts are self-hosted OFL files shipped with the kit (Newsreader, Inter, Geist Mono), never loaded from a CDN. New fonts arrive the same way. |
| D-49 | The relief is `raised`. Every button-family control (Button in every variant, IconButton, BackButton, button chips) presses the same way: it compresses from the top with its bottom edge fixed, as if it sank into its hole; a filled control's shadow collapses too. Reduced motion removes the movement. (Promoted from OQ-21.) |
| D-50 | Visual baselines are generated artifacts, never committed: CI regenerates them from `main` and compares pull requests against the latest set; locally `yarn vrt:update` writes them git-ignored. (Promoted from OQ-20.) |
| D-51 | One Rust crate at the repo root `src-tauri/` (package `eden-app`, lib `eden_lib`) with cargo features `desktop` and `mobile` as equals and no default feature, as in Crate: `tauri ios|android` cannot pass `--no-default-features`, so a desktop default would leak desktop-only plugins into the mobile build. Rust stable, pinned by `rust-toolchain.toml` (Crate's nightly pin buys nothing: it has no `rustfmt.toml`). |
| D-52 | Identifier, channels, hosting. The identifier is deferred until the owner buys a studio domain (shortlist: pottingshed.dev, windrow.dev, topsoil.dev, smallholding.dev, canopyworks.dev). The scaffold uses the placeholder `dev.mattmaxwell.eden` in exactly one place, `src-tauri/tauri.conf.json`; the overlays derive `.dev` and `.staging`; no Android override (no hyphen, `eden` is not a keyword). Channels `production` and `staging`; GCS bucket `eden-releases`; download page on GitHub Pages at `eden.mattmaxwell.dev` (one `CNAME` file, movable). iOS ships ad-hoc from the BBX team (no App Store Connect record, so the App ID can move to a personal team later); Windows unsigned. |
| D-53 | Shared frontend code is a workspace package `packages/shared` (`@eden/shared`) consumed from source like the kit, with i18n `en`/`ja` on svelte-i18n and `en.json` as the source of truth. |
| D-54 | Domain mockups live in the kit's Storybook under `Domains/<Domain>/<Page>` in `packages/ui-kit/src/stories/domains/`, never exported; an approved mockup is implemented in `apps/*` and the story stays as the reference. |
| D-55 | The desktop sidebar has a head and groups. The app mark and the lowercase wordmark (display-md) sit centred at its top, the one place in the chrome besides the splash and About that carries them. Below, the nav runs Today, a rule, Garden, a rule, then the domains, so ⌘1 is Today and ⌘2 Garden; Gardener and Settings stay pinned at the bottom. The current item's ground fades in and its leaf bar settles from the middle; reduced motion keeps only the fade. The mobile tab order is unchanged. Order and pinned pair amended by D-64. |
| D-56 | The weather provider is the owner's choice, behind a provider-neutral forecast model. Open-Meteo is the keyless default on every platform, Apple's included. Sky looks and behaves the same whatever the provider: the model holds only what Open-Meteo can supply, and the provider changes the source and the attribution line, nothing else. Where a provider cannot run, its choice is absent rather than disabled. (Promoted from OQ-15.) |
| D-57 | WeatherKit is reached through Apple's native framework on macOS and iOS, under the app's entitlement, never through the REST API with credentials the owner would have to enter. A WeatherKit failure falls back to Open-Meteo with a visible note and leaves the setting alone. The minimum systems rise to macOS 13 and iOS 16 for it. |
| D-58 | Week start (Monday or Sunday; default Monday), clock (24-hour or 12-hour; default 24-hour) and measurement system (metric or imperial; default metric) are global settings in General that every domain reads; no domain keeps its own. The measurement system replaces the temperature-only unit and drives temperature, wind, pressure, distance and rainfall together. A domain shows a week as the calendar week from the start day, and the times of a place in that place's timezone. |
| D-59 | Air quality and allergens are supplementary sources beside the forecast provider, each a swappable slot with its own mirror, fetch time and failure state, so a failed supplement never blocks the forecast. The defaults are keyless (Open-Meteo Air Quality; Open-Meteo pollen where it has coverage); a slot with no source for a place reads "unavailable". Keyed sources (AccuWeather first, for pollen and mold) arrive later as further entries in the same slots, with their key in the OS keychain. |
| D-60 | Coordinates leave the device rounded to two decimals, about one kilometre, for every provider and model unless a precise-location grant exists. This is what "city level" and "rounded coordinates" mean wherever the docs say them. |
| D-61 | The paper grain overlays the whole page instead of sitting behind it (supersedes the placement in D-42; the `lush`-only scope stands). It is the topmost layer (`--ed-z-grain`), inert to the pointer, and blended (`overlay`, D-63) so one mid-grey tile reads in both themes without shifting colour, at an opacity D-63 sets. Behind the page it was hidden by every opaque surface, and the first tile was a light grey of almost no contrast, so no opacity showed it. Surfaces in the browser top layer (the sheet panel, popovers, menus, tooltips) paint above any z-index, so each carries its own grain layer. |
| D-62 | A third exception to the motif limits in `design/brand.md`: a domain's page header may carry a live motif in the room it leaves empty beside the name, never behind what the header holds, a generative sketch drawn on a canvas from the domain's own readings, and it may loop. Sky's is the first: the wind as a flow field. The limits that remain: it draws only what the page already says, is a texture with no figure in it (no arc, no glyph, nothing a name could collide with), stays quiet enough that the name reads over it, takes no pointer and has no name, rests while out of sight, and under reduced motion is a single still. Every sketch runs on the kit's one canvas, `Sketch`, with seeded randomness, so nannou and p5 ideas are ported to it rather than embedded. |
| D-63 | The paper grain moves and is drawn from one channel of noise (amends D-61 and the "never animated in loops" limit in `design/brand.md`, for the grain alone). The tile is 256 px of raw desaturated noise (four octaves at 0.7, its own alpha left noisy), centred on mid-grey and never pushed for contrast, `overlay` blended at 0.3 opacity in both themes; this is what makes it fine. The earlier tiles multiplied the noise into hard speckle, and the first noised each colour channel on its own. The layer jumps to a new offset ten times in a 1.2 s loop (`--ed-grain-motion`, stepped, never eased), which reads as fresh grain and not as a texture sliding. It holds still under reduced motion and does not run at `tended` or `plain`. |
| D-64 | The sidebar's groups are Today; Garden, Gardener and Toolbench; then the domains; Settings alone stays pinned at the bottom (amends the order and the pinned pair in D-55; the head and the current item's motion stand). The Gardener shows its key only when the sidebar shows shortcuts. The ⌘ positions count the places in order, so ⌘3 is Toolbench and the domains follow; the Gardener keeps ⌘G. Settings is an action, not a place: it opens its sheet and never becomes the current item. |

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
| OQ-15 | Promoted to D-56. | |
| OQ-16 | Which astrology computations run locally versus via a provider? | Local ephemeris for sun, moon and transits; horoscope text from a provider only under grant. |
| OQ-17 | Free-text pseudonymization with re-identification, if ever. | Not before Phase 3, and only with a measured leak rate. |
| OQ-18 | Re-tune the light accents for contrast before the accent picker ships? | Yes. No picker for now; the kit keeps `data-accent`, the `accents` union and a computed `--on-brand` per accent, so the picker is one settings row once the light values are re-tuned. |
| OQ-19 | `SwipeRow`: hand-rolled pointer handling or a library? | Hand-rolled, last in the kit's shell wave; may slip to the app scaffold without blocking. |
| OQ-20 | Promoted to D-50. | |
| OQ-21 | Promoted to D-49. | |
