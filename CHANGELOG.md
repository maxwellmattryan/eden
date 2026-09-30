# Changelog

All notable changes to Eden will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- The data layer: the workspace is one encrypted database (SQLCipher) with its key in a file on desktop, the Keychain on iOS and the Keystore on Android; tasks, events, places, attachments, domain entities and typed links as rows with hybrid logical clock stamps and tombstones; the substrate API as commands behind `@eden/shared/data`, with the same API over localStorage in the browser
- Export and import in Settings, Sync and data: the whole workspace or one domain as a zip archive of plain files with a manifest of hashes and a README, the domain's data as CSV and Markdown beside the rows; import by merge (the newer row stays) or by replace (after a backup of the workspace)

- Toolbench on desktop: Ideas (status chips with counts, quick-add that files a trailing area, the list with the days an idea has rested, the detail pane with the log and the stored brainstorm thread); Projects, Lab, Studio and Notes show their empty states
- Sky on desktop: the current reading, a scrolling strip of the next twelve hours, the week, sun and moon computed on-device, active NWS alerts and the home chip, live from Open-Meteo for the home place (a setting until Places exist); offline shows the last good forecast with the time it is from and the status-bar banner. Temperature units are a General setting
- Hearth on desktop: Stock (the four locations sorted by expiry, the Expiring and Low stock filters, quick-add, the detail pane with the storage tip, select mode) and Grocery (grouped by store, check off, origin badges, quick-add, Clear checked); Recipes and Tips show their empty states. Every write has an undo toast and lands in the Garden feed
- The Garden on desktop, from the approved mockup: the quick-navigation row and the widget grid composed from the domain manifests, the activity feed, the neutral daily line; "Edit layout" waits for edit mode. Widgets no longer clip their titles at 1×1
- The interim domain document store: one JSON document per domain under the app data directory through `load_domain_document` and `save_domain_document`, localStorage in the browser, behind `@eden/shared/persistence`; the domain manifest seed the shell composes from
- The desktop and mobile app scaffolds on the UI kit: the sidebar shell with the five Phase 1 routes, the settings sheet with General, Appearance and About, the bottom tab bar on mobile, English and Japanese, the channel-guarded updater, diagnostics and the crash screen

### Changed

- The bundle identifier is `com.palekodama.eden` (`.dev` and `.staging` for the channels) and the download page is `eden.palekodama.studio`, now that the studio has a name (D-69)
- Hearth and Toolbench keep their data in the workspace database, one row for each record. What they held before is brought over once on first launch and the old document is removed. A write that fails is held and sent again on retry, with the writes behind it in order
