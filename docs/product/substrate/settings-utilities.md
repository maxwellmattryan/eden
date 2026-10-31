---
title: Settings and utilities
status: draft
summary: The settings modal and its tabs, appearance, language, the updater, diagnostics and crash handling, data actions, keyboard shortcuts, the Domains tab, and what each reuses from Crate.
read-this-if: You are designing a settings screen or a utility every app needs.
depends-on: [shell, data, ai, grants]
updated: 2026-10-02
---

## Settings modal

Desktop: a modal with a left tab rail, deep-linkable to a tab, following Crate's SettingsModal. Mobile: a drawer with grouped rows and two-level navigation, following Crate's SettingsDrawer; built as D-159 describes, over the same tab bodies desktop mounts (`packages/shared/src/shell/settings/tabs/`), opened from More. On the phone, Appearance has no density and no sidebar subtitles, About has no update check, and the Domains tab is the picker of the two pinned tabs, kept per device and never in a bundle (D-160); enabling, disabling and reordering come with the rest of that tab on both apps.

| tab | contents | phase |
|---|---|---|
| General | language, the home (a row that opens the change-home sheet, D-143), measurement system, week start and clock (D-58), date formats, timezone, work hours (D-27), run setup again | 1 |
| Appearance | theme light, dark or system; accent; font; zoom; reduced motion; sidebar density and subtitles | 1 |
| Domains | enable, disable, reorder, hide; an experimental section for candidates and plugins (OQ-13) | 1 |
| Gardener | providers and keys on this device; each provider's models and its map from grade to model (D-74), edited over the seed (`effectiveProvider`, `validateProvider` in `@eden/shared/gardener`); the conversation's default grade; per-domain and per-tool overrides, each naming a model; choosing a model dearer than the seeded one for its grade says by how much (`priceRatio`) and asks first; budgets and the pricing table, the audit log, Council defaults | 1 (Council 2) |
| Privacy & Grants | the tiers in plain words, the egress ledger of the last seven days, the never-automated list and the count of standing grants (built); the grants ledger (UI in Phase 2), redaction settings, "What Eden knows about me" link (built) | 1 |
| Notifications | rule toggles, digest time, quiet hours, channels per rule | 1 (editing 2) |
| Integrations | the catalog with states, connect, reconnect, disconnect; the weather provider (D-56) | 1 |
| Shortcuts | rebind, chords, conflicts, reset | 2 |
| Sync & Data | account, sync on or off, devices, export and import, backup schedule, Vault settings, purge and wipe | 1 (sync 3) |
| Diagnostics | system info, the log, export as JSON or text, copy | 1 |
| About | version, channel, check for updates, data directory, licences | 1 |

## Appearance

Reuses Crate's token architecture as the kit extends it: `data-theme`, `data-accent`, `data-font`, `data-brand`, `data-platform` and `data-density` on the root (D-47), the kit's pre-paint script reading local storage so there is no theme flash (it resolves the system theme in JS and the app re-resolves on change), and zoom handled by the backend. Eden's palettes and accent set are in `design/visual-language.md`.

## Language

English and Japanese at launch (D-20). `en.json` is the source of truth; every locale file changes together; ICU plurals; the app name is a variable, never hard-coded. Domain display names are locale strings (`product/glossary.md`). Date, number and unit formats follow the General tab, not the locale alone.

## Updater

Desktop uses the Tauri updater with a minisign key and Crate's channel guard, so a staging build never takes a production update. A silent check runs at startup and hourly; About has a manual check. Mobile updates through the stores.

## Diagnostics and crashes

Three layers as in Crate: a pre-load error hook, a global error handler that logs to diagnostics and sets the crash store, and a crash screen. Diagnostics keep the last hundred entries and system info, redact registry-tagged fields, and export on request. Nothing is sent anywhere (OQ-10).

## Data actions

Export, import, backup, restore, purge and wipe are entry points into `substrate/data.md`. Each destructive action names what it will delete, offers an export first, and asks for the workspace name to wipe. On the phone an archive goes out and comes in through Eden's own folder (D-161; `engineering/data-layer.md`, "Settings → Sync and data").

Handoff: an export on the iPhone is kept in Eden's `exports/` folder, which the Files app does not show; making the app's documents visible there (`UIFileSharingEnabled`, `LSSupportsOpeningDocumentsInPlace`) would let the owner reach an export the save dialog did not copy (D-161).

## Keyboard shortcuts (Phase 2)

Defaults are listed in `substrate/shell.md`. The Shortcuts tab shows every command grouped by area, allows rebinding and two-key chords, flags conflicts inline, differs per platform, and resets per command or all.

## Domains tab

A list of every domain with glyph, name, subtitle, a toggle and a drag handle. Disabled domains keep their data (`substrate/domain-manifest.md`). Removing a domain is a separate, explicit action inside the domain's row with an export step first. The experimental section is where candidate domains and, later, plugins are tried before being placed in the sidebar (OQ-13).

## Plugins (later)

A plugin appears in the Domains tab like any domain, with the additional display of what its manifest declares it reads and which grants it holds.
