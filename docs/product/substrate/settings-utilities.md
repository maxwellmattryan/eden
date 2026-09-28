---
title: Settings and utilities
status: draft
summary: The settings modal and its tabs, appearance, language, the updater, diagnostics and crash handling, data actions, keyboard shortcuts, the Domains tab, and what each reuses from Crate.
read-this-if: You are designing a settings screen or a utility every app needs.
depends-on: [shell, data, ai, grants]
updated: 2026-09-27
---

## Settings modal

Desktop: a modal with a left tab rail, deep-linkable to a tab, following Crate's SettingsModal. Mobile: a drawer with grouped rows and two-level navigation, following Crate's SettingsDrawer.

| tab | contents | phase |
|---|---|---|
| General | language, date and time formats, timezone, work hours, units (D-27), run setup again | 1 |
| Appearance | theme light, dark or system; accent; font; zoom; reduced motion; sidebar density and subtitles | 1 |
| Domains | enable, disable, reorder, hide; an experimental section for candidates and plugins (OQ-13) | 1 |
| Gardener | providers and keys on this device, default model, per-domain override, budgets and the pricing table, the audit log, Council defaults | 1 (Council 2) |
| Privacy & Grants | the tiers in plain words, the grants ledger (UI in Phase 2), the egress ledger, the never-automated list, redaction settings, "What Eden knows about me" link | 1 |
| Notifications | rule toggles, digest time, quiet hours, channels per rule | 1 (editing 2) |
| Integrations | the catalog with states, connect, reconnect, disconnect | 1 |
| Shortcuts | rebind, chords, conflicts, reset | 2 |
| Sync & Data | account, sync on or off, devices, export and import, backup schedule, Vault settings, purge and wipe | 1 (sync 3) |
| Diagnostics | system info, the log, export as JSON or text, copy | 1 |
| About | version, channel, check for updates, data directory, licences | 1 |

## Appearance

Reuses Crate's token architecture: `data-theme`, `data-accent` and `data-font` on the root, a pre-paint script reading local storage so there is no theme flash, and zoom handled by the backend. Eden's palettes and accent set are in `design/visual-language.md`. System theme follows the OS.

## Language

English and Japanese at launch (D-20). `en.json` is the source of truth; every locale file changes together; ICU plurals; the app name is a variable, never hard-coded. Domain display names are locale strings (`product/glossary.md`). Date, number and unit formats follow the General tab, not the locale alone.

## Updater

Desktop uses the Tauri updater with a minisign key and Crate's channel guard, so a staging build never takes a production update. A silent check runs at startup and hourly; About has a manual check. Mobile updates through the stores.

## Diagnostics and crashes

Three layers as in Crate: a pre-load error hook, a global error handler that logs to diagnostics and sets the crash store, and a crash screen. Diagnostics keep the last hundred entries and system info, redact registry-tagged fields, and export on request. Nothing is sent anywhere (OQ-10).

## Data actions

Export, import, backup, restore, purge and wipe are entry points into `substrate/data.md`. Each destructive action names what it will delete, offers an export first, and asks for the workspace name to wipe.

## Keyboard shortcuts (Phase 2)

Defaults are listed in `substrate/shell.md`. The Shortcuts tab shows every command grouped by area, allows rebinding and two-key chords, flags conflicts inline, differs per platform, and resets per command or all.

## Domains tab

A list of every domain with glyph, name, subtitle, a toggle and a drag handle. Disabled domains keep their data (`substrate/domain-manifest.md`). Removing a domain is a separate, explicit action inside the domain's row with an export step first. The experimental section is where candidate domains and, later, plugins are tried before being placed in the sidebar (OQ-13).

## Plugins (later)

A plugin appears in the Domains tab like any domain, with the additional display of what its manifest declares it reads and which grants it holds.
