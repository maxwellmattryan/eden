---
title: Engineering
status: draft
summary: Where engineering stands. It started with the UI kit ahead of the rest reaching review; this page lists what is answered so far and the questions the remaining engineering docs must answer.
read-this-if: You are starting engineering work and want to know what is decided and what has to be decided first.
depends-on: [product/roadmap, product/substrate/domain-manifest, product/substrate/data]
updated: 2026-10-02
---

## When

Engineering started with the UI kit (D-43) ahead of the rest of the docs reaching `review`, because the kit only depends on the design docs. The remaining topics below still wait until every non-stub product and design doc is at `review` and the Phase 1 screens are mocked (`product/roadmap.md`, Phase 0).

## Answered so far

- The UI kit: location, exports, tokens pipeline, conventions, Storybook, gates (`engineering/ui-kit.md`).
- The per-component contract: props, bindables, callbacks, snippets, stories (`engineering/ui-kit-components.md`).
- The monorepo layout: `apps/desktop`, `apps/mobile`, `packages/ui-kit`, `packages/shared` and the one crate at `src-tauri` with the `desktop` and `mobile` features, plus where a domain's code goes on each side: its logic and the views both apps mount in `@eden/shared`, its surface in each app (D-51, D-53, D-157, `engineering/app-scaffold.md`).
- The domain module: the manifest as data, the bindings an app adds, the registry generated from the manifests and checked at build time, the functions the shell composes itself with, and isolation by lint (D-68, `engineering/domain-module.md`).
- Release channels, updater signing, CI and CD, following Crate's release strategy (D-52, `engineering/release.md`).
- The database: one SQLCipher file with its key per platform, the primitive tables and one table for every domain entity (D-67), tombstones and hybrid logical clocks from day one, mirrors flagged, migrations append-only as in Crate (`engineering/data-layer.md`).
- The IPC boundary: the substrate API as commands, and the module the apps call them through (`engineering/data-layer.md`, "The IPC boundary").
- Export and import: the bundle's layout, merge and replace (`engineering/data-layer.md`, "The bundle").
- The grant store and the egress ledger: the check every read and confirm asks, what stays on a device, what Eden counts as bytes out (D-70, D-71, `engineering/data-layer.md`, "Grants", "The egress ledger").
- The scheduler on desktop, signals, rules and the inbox on both apps: the alarm in the crate and the take in the webview, rules from the manifests, the refresh coordinator (D-73, D-158, `engineering/signals.md`).
- The Gardener v0: the key in the keychain, the request sent from the crate and streamed back, the context pack from declared reads, every declared tool with a handler, budgets, the audit log, threads as rows, the development clamp, the chat and the page on the phone (D-74, D-76, D-163, D-164, `engineering/gardener.md`).
- Meadow ahead of its phase (D-128 to D-136): the map behind a seam, discovery and listings through the Gardener's web search, details slots, import, the phone's page with every write (D-173, `engineering/meadow.md`).
- The phone's frame and its native reach so far (D-158): the top bar, More, the floating +, Android's back (`core:app:allow-exit` in `capabilities/mobile.json` lets it leave the app at the root), haptics; the camera and the photo library through a file input (`FileButton`'s `camera`, D-170), with the usage strings in `src-tauri/Info.ios.plist`, which Tauri merges into the generated plist; the notification permission (`request_notification_permission` in `src-tauri/src/commands/signals.rs`) (`engineering/app-scaffold.md`, "Platform features").

## Questions the engineering docs must answer

- The Vault: separate store, per-item keys, keychain and Secure Enclave, biometric session, the tests that prove T3 never crosses the AI boundary.
- The AI runtime beyond v0: OpenAI and Google adapters, local models, the Council (`engineering/gardener.md`, "Where it stands").
- Sync: Crate's client-side merge over blobs, extended with end-to-end encryption and a passphrase-derived key; the vendor-agnostic backend trait.
- The scheduler within mobile background limits, and how punctual the desktop alarm is in a hidden window, which is not measured yet (`engineering/signals.md`, "Testing").
- The mobile native surface: the Android half of the database key, which is written and not yet run (`engineering/data-layer.md`, "The Android checklist"), the Secure Enclave, biometrics, barcode scanning, on-device OCR through Vision and ML Kit, HealthKit and Health Connect, local notifications scheduled ahead (`engineering/signals.md`, "The inbox"), the share sheet, background sync. Handoff, for issue 20: `src-tauri/gen/android` does not exist yet, so the Android camera permission and the manifest entries the file input and the notification prompt need are not set; add them when the project is generated.
- Plugin sandboxing for Phase 3.
