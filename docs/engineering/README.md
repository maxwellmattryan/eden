---
title: Engineering
status: planned
summary: Not written yet. Engineering docs follow once product and design reach review; this page lists the questions they must answer.
read-this-if: You are starting engineering and want to know what has to be decided first.
depends-on: [product/roadmap, product/substrate/domain-manifest, product/substrate/data]
updated: 2026-09-27
---

## When

After every non-stub product and design doc is at `review` and the Phase 1 screens are mocked (`product/roadmap.md`, Phase 0).

## Questions the engineering docs must answer

- The monorepo layout ported from Crate: `apps/desktop`, `apps/mobile`, `shared/`, `src-tauri/`, and where domains live in each.
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
- Release channels, updater signing and CI, following Crate's release strategy.
