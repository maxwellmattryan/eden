---
title: Data
status: draft
summary: How the workspace is stored and encrypted, how tiers apply to storage, sync, export and sharing, the Vault and its three doors out, export and import formats, backup, end-to-end encrypted sync, purge and retention, and the one-user-per-workspace model.
read-this-if: You are designing anything that stores, syncs, exports, shares or deletes the owner's data.
depends-on: [privacy, primitives]
updated: 2026-09-27
---

## Principles

- The local workspace is the source of truth; every device holds a full copy of what it is allowed to hold.
- The owner owns the bytes: full export at any time in formats a person can read.
- Sync is opt-in, and the server never sees plaintext (D-21).
- The Vault is a different thing from the workspace, with different keys and different doors (D-14).

## Storage model (Phase 1)

- One encrypted SQLCipher database per workspace, as in Crate. The key lives in the OS keychain (a key file on desktop until the keychain path is ported, Keychain on iOS, Keystore on Android).
- Tables: the four primitive tables, one table per domain entity type, facts, grants, settings, signals (for the activity feed), audit, and a registry table generated from manifests.
- Every row carries hybrid logical clock stamps and a tombstone on delete, so sync can be added without a migration.
- Mirrors sit in the same tables with `mirror: true` and are skipped by sync and export (D-32).

## Tiers applied

| tier | store | sync | export bundle | share sheet |
|---|---|---|---|---|
| T0–T1 | workspace | yes | yes | yes |
| T2 | workspace | yes (end-to-end encrypted like everything else) | yes | yes, with a confirm |
| T3 | Vault or keychain | Phase 3, with the vault key | separately encrypted vault section, optional | after biometric auth, with a warning |

## The Vault (Phase 2 v0, sync in Phase 3)

- A separate encrypted store, not tables in the workspace database. Each item has its own data key, wrapped by a vault key held in the OS keychain and backed by the Secure Enclave or hardware keystore where available.
- Opening the Vault needs biometrics or the device passcode. The session times out after five minutes by default. The Vault tile shows only a count until opened; titles and kinds appear after auth.
- No thumbnails, no previews outside the Vault view, no indexing into any search the Gardener can reach. On-device OCR text is stored inside the Vault and serves the Vault's own search only.
- **Structural AI isolation**: Vault kinds export no facts, the manifest validator rejects a tool naming a Vault resource, the context-pack assembler has no Vault reader, and the redaction step drops T3 fields.
- **Three doors out**, each user-initiated, each after auth, each audited: the OS share sheet (AirDrop a passport scan to a laptop, with a warning that the copy outside Eden is unprotected); the export bundle's vault section, encrypted with a passphrase the owner types at export time; end-to-end encrypted vault sync between the owner's devices from Phase 3 (OQ-12).
- **Derived facts are typed by hand.** "Passport expires 2028-03" is a T2 fact the owner enters; the Gardener reads the fact, never the document.
- **Verification**: the egress ledger's Vault → AI row is always zero; every open writes an audit entry naming the actor; engineering ships a test suite that fails if a T3 resource crosses the AI boundary.

## Export (Phase 1)

- **Full bundle**: an archive with a `manifest.json` (version, counts, hashes), one JSONL file per entity type and per primitive, `facts.jsonl` with provenance, `grants.json`, `settings.json`, an `attachments/` folder for T0–T2 files, an optional `vault/` section encrypted with its own passphrase, and a generated `README.md` that indexes the bundle in plain language.
- **Per-domain export**: the same layout for one domain, plus friendlier formats where they fit (CSV for stock and grocery lists, Markdown for recipes, ideas and notes).
- Mirrors are excluded; overlays are included with their `source` + `externalId` so they reattach after import.
- Export never includes secrets, device grants or diagnostics.

## Import

- From a full or per-domain bundle, with a choice of **merge** (rows win by stamp, duplicates by id are skipped) or **replace** (the domain's rows are cleared first, after a backup).
- Import is how a new device is seeded before sync exists, and how a workspace moves between machines.
- CSV import for stock and recipes is a later convenience.

## Backup

Automatic local backups on a schedule (daily by default) to a folder the owner picks, keeping the last N (default 7), using the full-bundle format. Manual backup and restore live in Settings → Sync & Data, following Crate's backup service.

## Sync (Phase 3)

- Opt-in, off by default. An account exists only to identify the workspace on the server (Google sign-in first, Apple later, as in Crate).
- **Client-merged, end-to-end encrypted blobs.** Rows are grouped into per-entity buckets, serialised as JSONL, compressed, and encrypted with a workspace sync key derived from a passphrase (Argon2id) before upload. The server stores blobs and a manifest of sizes and hashes behind Crate's vendor-agnostic backend trait.
- Merge runs on the client with hybrid logical clocks: entities delete-wins on ties, link tables add-wins, settings last-writer-wins per key. An overridden local edit emits `sync.override`, which the activity feed shows.
- What syncs: T0–T2 rows, overlays, facts, grants (D-37), a settings subset. What never syncs: mirrors, secrets, device-capability grants, diagnostics. The Vault syncs only when separately enabled, with the vault key wrapped by the passphrase-derived key.
- Cadence: desktop pulls periodically and pushes shortly after the last change; mobile syncs on launch, on foreground and through OS background tasks.
- A device registry lets the owner revoke a device; revocation rotates the sync key on the next session.

## Deletion and purge

- Deleting an entity writes a tombstone; the row is gone from every view at once and from storage after all devices acknowledge.
- Disconnecting an integration deletes its mirrors. Overlays are the owner's data; the disconnect sheet asks whether to keep them (default keep).
- Removing a domain follows `substrate/domain-manifest.md`.
- Deleting the account removes server data only; the local workspace stays. Wiping the workspace requires typing the workspace name and produces a final export first.

## Retention

| what | default |
|---|---|
| audit log | 90 days, adjustable |
| activity feed | 30 days |
| fact edit history | 30 days |
| diagnostics | last 100 entries |
| tombstones | until every device acknowledges, plus 30 days |
| forecasts and other mirrors | until refreshed, or 7 days |

## One user per workspace

There is no user id on rows because a workspace has exactly one owner (D-22). Another person runs their own Eden. Household sharing, if it ever comes, is a shared collection (one grocery list, one calendar source) with its own keys, never a shared workspace.
