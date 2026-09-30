---
title: Engineering
status: draft
summary: Where engineering stands. It started with the UI kit ahead of the rest reaching review; this page lists what is answered so far and the questions the remaining engineering docs must answer.
read-this-if: You are starting engineering work and want to know what is decided and what has to be decided first.
depends-on: [product/roadmap, product/substrate/domain-manifest, product/substrate/data]
updated: 2026-09-30
---

## When

Engineering started with the UI kit (D-43) ahead of the rest of the docs reaching `review`, because the kit only depends on the design docs. The remaining topics below still wait until every non-stub product and design doc is at `review` and the Phase 1 screens are mocked (`product/roadmap.md`, Phase 0).

## Answered so far

- The UI kit: location, exports, tokens pipeline, conventions, Storybook, gates (`engineering/ui-kit.md`).
- The per-component contract: props, bindables, callbacks, snippets, stories (`engineering/ui-kit-components.md`).
- The monorepo layout: `apps/desktop`, `apps/mobile`, `packages/ui-kit`, `packages/shared` and the one crate at `src-tauri` with the `desktop` and `mobile` features, plus where a domain's code goes on each side (D-51, D-53, `engineering/app-scaffold.md`).
- The domain module: the manifest as data, the bindings an app adds, the registry generated from the manifests and checked at build time, the functions the shell composes itself with, and isolation by lint (D-68, `engineering/domain-module.md`).
- Release channels, updater signing, CI and CD, following Crate's release strategy (D-52, `engineering/release.md`).
- The database: one SQLCipher file with its key per platform, the primitive tables and one table for every domain entity (D-67), tombstones and hybrid logical clocks from day one, mirrors flagged, migrations append-only as in Crate (`engineering/data-layer.md`).
- The IPC boundary: the substrate API as commands, and the module the apps call them through (`engineering/data-layer.md`, "The IPC boundary").
- Export and import: the bundle's layout, merge and replace (`engineering/data-layer.md`, "The bundle").
- The grant store and the egress ledger: the check every read and confirm asks, what stays on a device, what Eden counts as bytes out (D-70, D-71, `engineering/data-layer.md`, "Grants", "The egress ledger").
- The scheduler on desktop, signals, rules and the inbox: the alarm in the crate and the take in the webview, rules from the manifests, the refresh coordinator (D-73, `engineering/signals.md`).

## Questions the engineering docs must answer

- The Vault: separate store, per-item keys, keychain and Secure Enclave, biometric session, the tests that prove T3 never crosses the AI boundary.
- The AI runtime: provider adapters, the sidecar pattern from Forge for the Claude Agent SDK, the context-pack assembler with declared reads, the scrub step, budgets, the audit log. Model grades are answered (D-74); the runtime consumes `@eden/shared/gardener` (`engineering/domain-module.md`, "Model grades").
- Sync: Crate's client-side merge over blobs, extended with end-to-end encryption and a passphrase-derived key; the vendor-agnostic backend trait.
- The scheduler within mobile background limits, and how punctual the desktop alarm is in a hidden window, which is not measured yet (`engineering/signals.md`, "Testing").
- The mobile native surface: the Android half of the database key, which is written and not yet run (`engineering/data-layer.md`, "The Android checklist"), the Secure Enclave, biometrics, camera, on-device OCR through Vision and ML Kit, HealthKit and Health Connect, local notifications, the share sheet, background sync.
- Plugin sandboxing for Phase 3.
