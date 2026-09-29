---
title: Engineering
status: draft
summary: Where engineering stands. It started with the UI kit ahead of the rest reaching review; this page lists what is answered so far and the questions the remaining engineering docs must answer.
read-this-if: You are starting engineering work and want to know what is decided and what has to be decided first.
depends-on: [product/roadmap, product/substrate/domain-manifest, product/substrate/data]
updated: 2026-09-28
---

## When

Engineering started with the UI kit (D-43) ahead of the rest of the docs reaching `review`, because the kit only depends on the design docs. The remaining topics below still wait until every non-stub product and design doc is at `review` and the Phase 1 screens are mocked (`product/roadmap.md`, Phase 0).

## Answered so far

- The UI kit: location, exports, tokens pipeline, conventions, Storybook, gates (`engineering/ui-kit.md`).
- The per-component contract: props, bindables, callbacks, snippets, stories (`engineering/ui-kit-components.md`).
- The monorepo layout: `apps/desktop`, `apps/mobile`, `packages/ui-kit`, `packages/shared` and the one crate at `src-tauri` with the `desktop` and `mobile` features, plus where a domain's code goes on each side (D-51, D-53, `engineering/app-scaffold.md`).
- Release channels, updater signing, CI and CD, following Crate's release strategy (D-52, `engineering/release.md`).

## Questions the engineering docs must answer

- The domain module structure: how a manifest is expressed in code, how a domain's Svelte views, stores, Rust models, services and commands are laid out, and how the shell composes them.
- The resource registry as code: generated from manifests, validated at build time, the source for grant and audit checks.
- The IPC boundary: which operations cross into Rust, the substrate API surface (`createTask`, `createEvent`, `createPlace`, `attach`, `query`, `link`).
- The database: per-domain schema, primitive tables, tombstones and hybrid logical clocks from day one, mirrors flagged, migrations append-only as in Crate.
- The Vault: separate store, per-item keys, keychain and Secure Enclave, biometric session, the tests that prove T3 never crosses the AI boundary.
- The AI runtime: provider adapters, the sidecar pattern from Forge for the Claude Agent SDK, the context-pack assembler with declared reads, the scrub step, budgets, the audit log.
- Sync: Crate's client-side merge over blobs, extended with end-to-end encryption and a passphrase-derived key; the vendor-agnostic backend trait.
- The scheduler on desktop and within mobile background limits.
- The mobile native surface: SQLCipher, Keychain and Keystore with Secure Enclave, biometrics, camera, on-device OCR through Vision and ML Kit, HealthKit and Health Connect, local notifications, the share sheet, background sync.
- Plugin sandboxing for Phase 3.
