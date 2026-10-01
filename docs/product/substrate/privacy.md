---
title: Privacy
status: draft
summary: The sensitivity tiers T0–T3 and what each allows for storage, sync, AI and export; what never leaves the device; what third parties receive; the owner's controls; a one-screen threat model.
read-this-if: Anything you are designing touches personal data, an external service, or the Gardener.
depends-on: [decisions]
updated: 2026-10-01
---

## Principles (Phase 1)

- Data minimization is structural, not a prompt instruction. The Gardener can only receive what a tool declares it reads (D-31), and readers for restricted data do not exist (D-14).
- Every byte that leaves the device has a destination the owner can see afterwards, in the egress ledger.
- Sensitivity is decided once, in the resource registry, and enforced by tier everywhere: storage, sync, export, AI, share.
- The owner can always answer "what does Eden know about me, who wrote it, and who has seen it".

## Sensitivity tiers (Phase 1)

| tier | meaning | examples | storage | sync (all sync is end-to-end encrypted, D-21) | AI | export |
|---|---|---|---|---|---|---|
| **T0** | harmless preference or public fact | favorite vibes, cuisine preferences, recipes, stock, holidays, forecasts | encrypted workspace | yes | in the context pack when declared | yes |
| **T1** | personal | ideas, notes, workout logs, gym preference, `home-area`, calendar events by default, skills | encrypted workspace | yes | in the context pack when declared | yes |
| **T2** | sensitive | allergies, training limitations, body metrics, medical appointments, the home Place, birth data, device hostnames, relationship notes, everything in Orchard and Wellspring | encrypted workspace | yes | only under an explicit per-resource grant | yes |
| **T3** | restricted | API keys, tokens, identity documents, insurance cards, account numbers | Vault or OS keychain, separate keys | not before Phase 3, then with the vault key | never, structurally | only by user-authenticated export; the vault section carries its own passphrase |

Tiers attach to resources in `substrate/registry.md`:

- **facts**: per fact type;
- **domain entities**: per entity type, with per-field overrides where a type mixes tiers (a Person is T1, its notes are T2);
- **primitives**: per kind (`workout-session` T1, `medical-appointment` T2); a mirrored Event inherits the tier of its CalendarSource, default T1;
- **attachments**: per kind; T3 kinds live in the Vault and nowhere else.

## What never leaves the device

- T3 content, except through the three audited doors in `substrate/data.md`: share-sheet export after biometric auth, the passphrase-encrypted export bundle, and end-to-end encrypted vault sync from Phase 3.
- Precise coordinates. AI and weather providers receive city-level coordinates (D-60) unless a precise-location grant exists for that subject.
- The workspace database itself.
- A source brought to Capture or to a recipe's import (a photo, a receipt, an order's PDF, an email, pasted text), until the sheet has named the provider that will receive it and the owner has pressed Read (D-86).

## What the Gardener may never see

- Anything T3, including that Vault items exist. The AI subsystem has no vault reader, the manifest validator rejects a tool naming a vault resource, and the redaction step drops T3 fields as a third line of defense.
- Any resource outside a tool's declared reads.
- T2 resources without a standing or per-request grant.
- Raw location beyond `home-area`.
- Content from mirrors is marked untrusted in the context pack, and tools with `act-external` always confirm, so a Google event title cannot instruct the Gardener into an action (D-8).

## Third parties and what each receives

| party | receives | never receives |
|---|---|---|
| AI provider (your key) | the context pack after tier exclusion and scrub; the files the owner attached to a message (D-82); Capture's sources after its Read (D-86) | T3, undeclared resources, precise location, the audit log |
| sync backend | opaque encrypted blobs, a manifest of sizes and hashes, an account id | plaintext of any tier, mirrors |
| an integration | the OAuth scopes granted and the request parameters the connector needs (rounded coordinates for weather, a calendar id for Google) | anything from another domain |
| a web page the owner gave the address of | one request for that page, made by the crate, with no cookie, credential or referrer (D-88); counted in the egress ledger under `web-page` | anything from the workspace |
| a picture the owner linked for a stock item | one request for that picture, made by the crate under the same checks (D-91); a grocer's product page is never requested, only the picture its address names; counted under `web-image` | anything from the workspace |
| a store's website, which the owner gave | up to two requests for its page (as typed, then under `www.`) and up to five for its icon (those the page names, then the site's usual addresses), made by the crate under the same checks (D-103); counted under `web-page` and `web-image` | anything from the workspace; no third-party icon service is asked |
| a plugin (later) | exactly what its manifest declares under the same grants | anything undeclared |
| crash reporting | nothing; logs stay local and are exported by hand (OQ-10) | |

## Redaction pipeline (Phase 1)

Grants gate → fields excluded by tier → deterministic scrub of emails, phone numbers and account-like numbers → send. No pseudonymization, no re-identification (D-26, OQ-17). The full pipeline is in `substrate/ai.md`.

## The owner's controls

| control | where | phase |
|---|---|---|
| What Eden knows about me: every fact, its provenance, who wrote it, which AI requests used it; edit and delete | Garden → profile | 1 |
| Audit log: every AI request with registry ids read, tools run, tokens and cost | Settings → Gardener | 1 |
| Egress ledger: requests and bytes out by destination and day, the bytes being what Eden hands over (D-71); the Vault → AI row is always zero | Settings → Privacy | 1 |
| Grants ledger: list, revoke, history | Settings → Privacy & Grants | store 1, UI 2 |
| Purge: one integration, one domain, or the whole workspace, with export first | Settings → Sync & Data | 1 |
| Per-open Vault audit naming the actor | Vault | 2 |

## Telemetry and crash logs

There is no telemetry. Diagnostics keep the last hundred entries and system info locally, redact registry-tagged fields, and export to JSON or text on request, following Crate.

## Threat model in one screen

| threat | mitigation |
|---|---|
| lost or stolen device | encrypted workspace with a keychain-bound key; Vault behind biometrics with its own key; short Vault session timeout |
| AI provider retention or misuse | declared reads, tier exclusion, scrub, bring-your-own-key so the contract is the owner's, local models on desktop |
| compromised sync server | end-to-end encrypted blobs; the manifest reveals sizes and hashes only |
| over-broad OAuth | narrowest scopes, read-only default, ledger, per-calendar write grants (OQ-6) |
| prompt injection through mirrored or fetched content | untrusted marking in the context pack, `act-external` always confirms, never-automated list |
| malicious plugin (later) | manifest-declared reads, identical grants, sandbox defined in engineering |
| accidental share of a T3 item | share sheet warns that the copy is unprotected; audit entry |
| passphrase loss | recovery key shown once (OQ-12); the local workspace remains |
