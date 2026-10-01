---
title: The Gardener
status: draft
summary: Eden's AI layer: one persona across every surface, bring-your-own-key providers and local models, model grades, declared reads and the context pack, typed tools with access levels, the Council, the Phase 1 privacy pipeline, hard budgets, and the audit log.
read-this-if: You are designing any feature that involves a model, or anything the Gardener can see or do.
depends-on: [privacy, registry, grants, primitives]
updated: 2026-10-01
---

## Persona and voice

One assistant, the Gardener, everywhere: the global panel, each domain's chat, inline asks, proposal cards. It speaks in the first person, briefly, and always says what it can see. It never implies it saw more than its context pack. It does not cheer, apologise in loops, or moralise. It tends; it does not own. In a conversation it always writes Markdown, which the panel draws, and never raw HTML. It knows the grades exist and never changes its own: where a request needs more than its grade, or would do as well on a lower one and save the owner money, it proposes the other grade as a proposal card with both estimates, and the owner decides (D-74). The system prompt tells it so; the card is not built yet, so it proposes the grade in words. The prompt itself is a briefing addressed to the model, in the second person, and it names each enabled domain by its display name and its id (`engineering/gardener.md`, "The system prompt"). Voice examples live in `design/brand.md`.

## Providers and models

| phase | capability |
|---|---|
| 1 | one cloud provider at a time from Anthropic, OpenAI or Google AI with the owner's key; a model for each grade from that provider's map; per-tool and per-domain overrides (D-74) |
| 2 | several providers at once, a map that may cross them, local models through Ollama on desktop (D-29), the Council |
| 3 | plugin-provided tools under the same rules |

The provider registry holds each provider's models, each with its flags (`tools`, `vision`), its context size and a pricing row, and the provider's map from grade to model. Both are seeded and the owner's to edit. The seed is Anthropic's alone: OpenAI and Google AI each get one, with its price rows and dated model ids wherever the provider has them, when their adapters are built, and until then a request to either resolves to no provider. The seed and the resolution are `@eden/shared/gardener` (`engineering/domain-module.md`, "Model grades"). The owner's edits to a map and the overrides are kept as a sparse overlay on the seed, synced as workspace policy like grants (D-37), so a new seed reaches an owner who never edited it: the `gardener` row of the policy table (D-76). In a development build the light and the standard grade run on the light model and the deep grade on the standard one (D-81). The runtime is `engineering/gardener.md`. A model the seed lists and maps to no grade may come with terms of its own, which the request handles: Anthropic's Fable needs 30-day data retention on the owner's organization and answers 400 without it, and it can stop with a refusal. **Keys are T3 and per device** (D-37): a workspace can be "Gardener configured, no key on this device", shown as a grey chip with one-tap key entry.

## Surfaces

- **Global panel**: a right-side panel on desktop, a sheet on mobile, opened from the Gardener chip or ⌘K "ask". It has every enabled domain's tools.
- **Domain chat**: the same panel opened from inside a domain, with that domain's tools first and the "can see" chip pre-filled with that domain's declared reads.
- **Inline ask**: select text or an entity and ask about it; the entity's URI becomes a declared read for that request.
- **Proposal cards**: when a tool wants to store a fact or create an entity with `write-draft`, the draft appears as a card with accept and dismiss (`substrate/profile.md`).
- **Council view** (Phase 2): side-by-side columns.

Threads persist in the workspace, listed globally and filterable by domain. A thread's tier is the highest tier it read; T2 threads show the lock glyph and are excluded from any future context pack unless re-granted.

## Declared reads and the context pack (Phase 1)

There is no "current domain" for a read (D-31). Each tool and surface declares the registry ids it reads. The pack is assembled in this order, within the model's size budget: the tool schemas; the system prompt; the thread; then, with the message and ahead of it, declared facts (user-asserted first), declared entities, most recent first, and declared primitives in the relevant time window. Trimming drops the oldest entities first and says so in the chip. Content from mirrors is marked untrusted, and the persona instructs the model to treat it as data. The **"can see" chip** on the panel carries the row count and opens to the registry ids in the pack, named as the owner knows them, each with its exact rows, so the chip is literal, never a summary (D-78). It shows what the owner's next message will carry, read afresh each time it opens, not what the last request read: that is the audit log's (D-120). A T2 id a tool declared and no grant allows is listed as not shared, with why and a one-tap standing grant.

**Files on a message.** Beside the declared reads, a request carries what the owner attached to their message: images, PDFs and text files, under the consent of attaching and sending, listed in the "can see" chip (D-82). They stay on the device as Attachments (D-83).

## Tools

Tools are typed functions registered through manifests or by the substrate. Each declares `reads` (registry ids), `access` (D-8 vocabulary) and a confirm rule per `substrate/grants.md`. The shell rejects a tool that names a resource outside the registry or any T3 resource. A model-backed tool also declares a grade and what it needs; a plain tool declares neither (D-74). Substrate tools in Phase 1: `draft-tasks` and `update-tasks` (D-124), `agenda` (what a day or a run of days holds, D-125), `what-you-know-about-me` (lists the facts the current grants allow, nothing more), `usage-summary` (sums the Gardener's own usage on this device, read-only, D-121), `log-quick` (dispatches to a domain's quick action that no tool of its own does), `propose-fact` (the `write-draft` behind every proposal card, D-76) and `forget-fact` (D-127), and `read-page` (one web page the owner pointed to, D-126). All of them are plain: none makes a model request of its own, so a day's briefing is written by the conversation's model from what `agenda` answers, and it takes each new source as its domain is built. No manifest holds them, so the Gardener's runtime declares them in code (`SUBSTRATE_TOOLS`); the table in `substrate/tasks.md` lists them. Domain tools are listed in each domain doc. A page may run a model-backed `read` or `write-draft` tool itself, with no conversation, as Hearth's capture sheet does (D-86); the request is resolved, budgeted and audited as a delegated one is.

Safety filters run outside the model: allergy and medical-restriction checks on every recipe or grocery suggestion, before display (D-25).

## The Council (Phase 2)

Fan one message to two or more models with the **same context pack** under the same grants, show the answers side by side, and optionally ask a chair model to synthesise (off by default, OQ-2). Before sending, the panel shows the cost as N× the single-model estimate. The audit log writes one entry per model. Use it for decisions, comparisons and second opinions, not for routine asks.

## Privacy pipeline (Phase 1)

grants gate → fields excluded by tier → deterministic scrub of emails, phone numbers and account-like numbers, over the rows, the thread and the owner's message → send (D-26). An image, a PDF or a text file leaves only as a file the owner attached to a message (D-82) or as a source of Capture or of a recipe's import, after the sheet has named the provider and the owner has pressed Read (D-86). A web page comes in only from an address the owner wrote in the conversation or confirmed on the card that shows it whole, its text is marked untrusted, and from then on every write in that conversation is confirmed (D-126). Local models skip the network but are audited and counted like any other. Pseudonymization with re-identification is a later research item (OQ-17).

## Budgets

| control | default |
|---|---|
| monthly spend cap across providers | 10 USD, editable, hard stop |
| per-provider cap | none until set |
| per-request token cap | the model's context size, editable |
| warning | at 80 % of any cap, once per day |
| pricing table | seeded per model, editable, used for every estimate |
| local models | 0 USD but tokens still count toward token caps |

Before a request is sent its tool is resolved to a provider and a model (`resolveTool`, and `resolveGrade` for the conversation), and its estimate comes from that model's pricing row. A tool request that resolves to `deep`, and any request that would run above its declared grade, shows its estimate and waits for the owner's confirm, and nothing is sent while that confirm is owed (D-74). The status bar's Gardener chip names the conversation's grade and model, switches the grade, and shows the budget meter. A Council run previews its cost before sending, and Capture's sheet names the provider, the model and the estimate beside its Read (D-86). When a cap is reached the Gardener declines with the reason and a link to the budget settings.

## Audit log

One entry per request, a delegated one included: id, time, surface, the thread, the request that called it (for a delegated one), the tool, the declared and the resolved grade, how the model was chosen (tool override, domain override or map), provider and model, registry ids read with row counts, entity ids touched, tools called with access and the confirm outcome, the outcome of a deep or escalation confirm, tokens in and out, cost, outcome, and the grants that allowed it. From any entry the owner can walk to the chat, the tool call, the provider and the model behind it (D-74). A file the owner attached to a message is logged by hash, type and size, and an image's pixels, never its bytes or its name (D-83). Capture's sources are logged the same way, on an entry with no thread (D-86). Tokens written to the provider's cache are kept beside the ones read from it, each priced at its own rate (D-116). Retention 90 days by default. The log is a tab of the Gardener's page (D-113), a table sorted, filtered and paged in the address (D-114), linked from Settings → Gardener and from the profile; the link from every fact ("used by N requests") and from every "can see" chip is not built yet (`engineering/gardener.md`, handoffs). What the entries came to is rolled up by day and kept past the log's ninety days, which is what the page's Usage tab shows (D-115).

## Offline and unconfigured states

Offline: cloud models are unavailable, local models work on desktop, the panel says which. No key on this device: the chip is grey and the panel offers key entry or a local model. Budget exhausted: the panel says so. In every state, nothing else in Eden depends on the Gardener.

## Non-goals

Autonomous background agents; any AI action without a rule and a grant; free-text memory beyond typed facts; writing to or reading from the Vault; acting as the owner toward other people.
