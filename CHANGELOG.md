# Changelog

All notable changes to Eden will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- The Garden on desktop, from the approved mockup: the quick-navigation row and the widget grid composed from the domain manifests, the activity feed, the neutral daily line; "Edit layout" waits for edit mode. Widgets no longer clip their titles at 1×1
- The interim domain document store: one JSON document per domain under the app data directory through `load_domain_document` and `save_domain_document`, localStorage in the browser, behind `@eden/shared/persistence`; the domain manifest seed the shell composes from
- The desktop and mobile app scaffolds on the UI kit: the sidebar shell with the five Phase 1 routes, the settings sheet with General, Appearance and About, the bottom tab bar on mobile, English and Japanese, the channel-guarded updater, diagnostics and the crash screen
