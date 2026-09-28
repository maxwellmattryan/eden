---
title: The Gardener
status: draft
summary: Eden's AI layer: one persona across every surface, bring-your-own-key providers and local models, declared reads and the context pack, typed tools with access levels, the Council, the Phase 1 privacy pipeline, hard budgets, and the audit log.
read-this-if: You are designing any feature that involves a model, or anything the Gardener can see or do.
depends-on: [privacy, registry, grants, primitives]
updated: 2026-09-27
---

## Persona and voice

One assistant, the Gardener, everywhere: the global panel, each domain's chat, inline asks, proposal cards. It speaks in the first person, briefly, and always says what it can see. It never implies it saw more than its context pack. It does not cheer, apologise in loops, or moralise. It tends; it does not own. Voice examples live in `design/brand.md`.

## Providers and models

| phase | capability |
|---|---|
| 1 | one cloud provider at a time from Anthropic, OpenAI or Google AI with the owner's key; a default model; a per-domain override |
| 2 | several providers configured at once, local models through Ollama on desktop (D-29), the Council, a model switcher in the status bar |
| 3 | plugin-provided tools under the same rules |

The provider registry records each model's capability flags (tools, vision, context size) and a pricing row the owner can edit. **Keys are T3 and per device** (D-37): a workspace can be "Gardener configured, no key on this device", shown as a grey chip with one-tap key entry.

## Surfaces

- **Global panel**: a right-side panel on desktop, a sheet on mobile, opened from the Gardener chip or ⌘K "ask". It has every enabled domain's tools.
- **Domain chat**: the same panel opened from inside a domain, with that domain's tools first and the "can see" chip pre-filled with that domain's declared reads.
- **Inline ask**: select text or an entity and ask about it; the entity's URI becomes a declared read for that request.
- **Proposal cards**: when a tool wants to store a fact or create an entity with `write-draft`, the draft appears as a card with accept and dismiss (`substrate/profile.md`).
- **Council view** (Phase 2): side-by-side columns.

Threads persist in the workspace, listed globally and filterable by domain. A thread's tier is the highest tier it read; T2 threads show the lock glyph and are excluded from any future context pack unless re-granted.

## Declared reads and the context pack (Phase 1)

There is no "current domain" for a read (D-31). Each tool and surface declares the registry ids it reads. The pack is assembled in this order, within the model's size budget: persona and rules; tool schemas; declared facts (user-asserted first); declared entities, most recent first; declared primitives in the relevant time window; the thread; the message. Trimming drops the oldest entities first and says so in the chip. Content from mirrors is marked untrusted, and the persona instructs the model to treat it as data. The **"can see" chip** on the panel lists the registry ids and counts in the pack and expands to the exact rows, so the chip is literal, never a summary.

## Tools

Tools are typed functions registered through manifests or by the substrate. Each declares `reads` (registry ids), `access` (D-8 vocabulary) and a confirm rule per `substrate/grants.md`. The shell rejects a tool that names a resource outside the registry or any T3 resource. Substrate tools in Phase 1: `create-task`, `complete-task`, `summarize-day`, `what-you-know-about-me` (lists the facts the current grants allow, nothing more), `log-quick` (dispatches to a domain's quick action). Domain tools are listed in each domain doc.

Safety filters run outside the model: allergy and medical-restriction checks on every recipe or grocery suggestion, before display (D-25).

## The Council (Phase 2)

Fan one message to two or more models with the **same context pack** under the same grants, show the answers side by side, and optionally ask a chair model to synthesise (off by default, OQ-2). Before sending, the panel shows the cost as N× the single-model estimate. The audit log writes one entry per model. Use it for decisions, comparisons and second opinions, not for routine asks.

## Privacy pipeline (Phase 1)

grants gate → fields excluded by tier → deterministic scrub of emails, phone numbers and account-like numbers → send (D-26). Images are sent only through Capture's confirm sheet (D-29). Local models skip the network but are audited and counted like any other. Pseudonymization with re-identification is a later research item (OQ-17).

## Budgets

| control | default |
|---|---|
| monthly spend cap across providers | 10 USD, editable, hard stop |
| per-provider cap | none until set |
| per-request token cap | the model's context size, editable |
| warning | at 80 % of any cap, once per day |
| pricing table | seeded per model, editable, used for every estimate |
| local models | 0 USD but tokens still count toward token caps |

The status bar shows a budget meter beside the model switcher. Council runs and Capture images preview their cost before sending. When a cap is reached the Gardener declines with the reason and a link to the budget settings.

## Audit log

One entry per request: id, time, surface, provider and model, registry ids read with row counts, entity ids touched, tools called with access and the confirm outcome, tokens in and out, cost, outcome, and the grants that allowed it. Images are logged as a hash and dimensions, never the image (OQ-11). Retention 90 days by default. The log lives in Settings → Gardener and is linked from every fact ("used by N requests") and from every "can see" chip.

## Offline and unconfigured states

Offline: cloud models are unavailable, local models work on desktop, the panel says which. No key on this device: the chip is grey and the panel offers key entry or a local model. Budget exhausted: the panel says so. In every state, nothing else in Eden depends on the Gardener.

## Non-goals

Autonomous background agents; any AI action without a rule and a grant; free-text memory beyond typed facts; writing to or reading from the Vault; acting as the owner toward other people.
