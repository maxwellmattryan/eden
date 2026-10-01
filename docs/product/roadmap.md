---
title: Roadmap
status: draft
summary: The phases from docs to a synced, multi-domain Eden, what each ships, what "done" means, what can slip, and the risks and external dependencies.
read-this-if: You are planning, scoping, or deciding what to build next.
depends-on: [vision, decisions, domains/README]
updated: 2026-09-30
---

## Phases

| phase | codename | ships | done when |
|---|---|---|---|
| 0 | Docs and mockups | this doc set; Claude Design mockups of the shell, onboarding, settings, Hearth, Toolbench, Sky and the glyph family | every non-stub doc is at `review`; Phase 1 screens are mocked |
| 1 | Trellis | the scaffold, the shell, the substrate every later phase stands on, and three domains | the owner runs groceries and ideas in Eden daily, the Garden shows today's weather and moon, export round-trips |
| 2 | Roots | time and the first integration: Almanac, Google read-only, Vigor, Sanctuary, Council, local models, Vault v0, mobile | Google events show under a grant, a digest fires, a Council run previews its cost, the phone captures a haul |
| 3 | Canopy | Meadow, end-to-end sync, Google write, push, import, one promoted candidate, the first externalised plugin | two devices sync, places render on a map, a candidate domain is live |
| after | | Orchard and Wellspring specs, plugins for others, more locales | |

## Phase 1, Trellis

- Port the Crate scaffold: Tauri 2, Svelte 5, Tailwind 4, the settings modal, theme tokens, i18n with `en` and `ja`, the desktop updater, diagnostics and the crash screen, backup.
- Shell: sidebar with themed names and subtitles, the Garden with static widgets and edit mode, ⌘K, navigation history and the back affordance, the status bar, Quick Log surfaces, the notification center (`substrate/shell.md`).
- Onboarding wizard with the two T2 grants (`substrate/onboarding.md`).
- Substrate: the profile store and "What Eden knows about me"; the manifest and resource registries; the grant store (ledger UI in Phase 2); the data layer with export and import; a minimal scheduler with one-shot and daily triggers; the stores for all four primitives with minimal UI (Today, an agenda list, a Place picker, an attachment viewer); signals, the in-app inbox and the activity feed; the egress ledger.
- The Gardener v0: one provider with the owner's key, model grades within it and the chip's grade switch (D-74), global and per-domain chat, declared reads and the "can see" chip, budgets, the audit log, tier exclusion and scrub; no Council.
- Domains: Hearth, Toolbench, Sky.

Cut line: the notification center can ship as a plain list; the Garden edit mode can ship as reorder-only; Toolbench's Lab and Studio can ship as lists without widgets.

## Phase 2, Roots

- Almanac as a native component with the layer stack; read-only Google Calendar as the first OAuth grant (D-28); holidays; Sky's annotations.
- Grants ledger UI; full scheduler with digests and quiet hours; OS notifications on mobile.
- Today with routines and habits in full; Vigor with quick logs and the weight trend; Sanctuary with the daily line on the splash.
- The Council; local models through Ollama on desktop; several providers at once, with grade maps that may cross them.
- Vault v0 with share-sheet export and per-open audit.
- The mobile shell: Garden, Today, grocery list, stock, Capture with on-device barcode and receipt OCR, Gardener chat, Sky, the inbox and settings.

Cut line: the seasons wheel, Japanese almanac layers and astrology can slip to Phase 3; Sanctuary can ship with bundled texts only.

## Phase 3, Canopy

- Meadow with map tiles, a places provider, listings and the precise-location grant (OQ-4).
- End-to-end encrypted cloud sync with accounts, devices and the vault key (D-21, OQ-12); import from a bundle on a new device.
- Google Calendar write, per calendar, with recurrence exceptions.
- Push through a relay (OQ-3).
- One promoted candidate, likely Companions or Trails.
- One built-in domain moved out as a plugin to prove the manifest boundary.

Cut line: push and the plugin exercise can slip; sync cannot.

## After Phase 3

Orchard and Wellspring get their full specs (their stubs name the triggers). Plugins for other people, more locales, and any billing story are decided then, not before (D-3).

## Risks and external dependencies

| risk | where it bites | mitigation |
|---|---|---|
| Google OAuth app verification for calendar scopes | Phase 2 | start verification early; the owner's own project needs no verification for personal use |
| vision quality for haul capture | Phase 1 | the verification sheet is the product; a receipt or the order's confirmation read beside the photo; D-86 |
| passphrase loss with end-to-end sync | Phase 3 | recovery key shown once; local copy remains; OQ-12 |
| provider cost and terms for maps and listings | Phase 3 | OQ-4; Meadow works with saved places and no provider |
| Tauri mobile maturity and background limits | Phase 2 | mobile surfaces are few and read-heavy; background sync waits for Phase 3 |
| content licensing for bundled texts and holidays | Phase 2 | public domain only until reviewed; OQ-5, OQ-14 |
| substrate scope creep | every phase | phase tags on substrate sections; a manifest field ships only when a domain consumes it |
