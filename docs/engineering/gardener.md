---
title: The Gardener's runtime
status: draft
summary: The Gardener v0 as code: the key in the OS keychain, the Anthropic adapter in the crate and the events it streams, the context pack and its order, the scrub, the tool registry and the handlers an app binds, estimates and budgets, the audit log, threads as rows, the policy row, the development clamp to the light model, the browser fallback, and how it is tested.
read-this-if: You are sending a request to a model, adding or changing a tool or its handler, touching the panel, the audit log, budgets, the key, or a thread.
depends-on: [product/substrate/ai.md, product/substrate/grants, engineering/domain-module, engineering/data-layer]
updated: 2026-09-30
---

## Where it stands

| built | not yet |
|---|---|
| one provider, Anthropic, with the owner's key in the OS keychain; the request sent from the crate and streamed back; the conversation at its grade with the chip's switch; the context pack from declared reads, gated by tier, scrubbed, trimmed to the budget; the literal "can see" chip; every declared tool with a handler, plain ones inline, write ones behind a tool card, model-backed ones as delegated requests; draft cards, the capture sheet and proposal cards; the monthly cap, the per-request token cap and the 80 % warning; the audit log with its page; threads as rows; the Gardener tab; the development clamp | the grade-proposal card (the persona proposes a grade in words); the Council; the chat on mobile (Phase 2, #19); OpenAI and Google adapters; local models (D-29); `find-similar` as a graded tool (OQ-22); the Keychain on Windows and Linux and the Android secret path run on a device; `effort` per grade; a measurement of prompt-cache hits; the Quick Log sheet and mobile Capture (#27); the grants ledger; reads of `workout-session` and `outing` once they are live |

D-74 decided the grades and D-76 the runtime's shape; this page is how they work.

## The pieces

| piece | where | holds |
|---|---|---|
| secret store | `src-tauri/src/db/secret_store.rs` | the key, per platform (below) |
| adapter | `src-tauri/src/gardener/anthropic.rs` | the request to the Messages API, the SSE parser, the events |
| audit, threads, policy | `src-tauri/src/substrate/{audit,threads,policy}.rs` | the tables (below) |
| commands | `src-tauri/src/commands/gardener.rs` | the IPC boundary |
| browser engine | `packages/shared/src/data/engine.ts` | the same stores over localStorage; no key and no request |
| `@eden/shared/gardener` | `packages/shared/src/gardener/` | the seed and the resolution (`engineering/domain-module.md`), the tool registry, the pack, the scrub, the persona, estimates, budgets, the policy, the clamp, the client |
| runtime | `apps/desktop/src/lib/shell/gardener/` | the setup, the threads, the loop, the panel in its dock (slides open and shut, drags between a quarter and a half of the room beside the nav, the width kept per device), the handlers of the substrate's tools |
| handlers | `apps/desktop/src/lib/domains/<id>/tools.ts` | a domain's tool handlers, bound in its manifest |
| pages | `apps/desktop/src/routes/gardener/audit/`, `lib/settings/tabs/GardenerTab.svelte` | the audit log, the Gardener tab |

## The key

Keys are T3 and per device (`product/substrate/integrations.md`, "Secrets"): they live in the OS keychain, never in the Vault, which the AI subsystem structurally cannot read, and never in the workspace database. `SecretStore` follows the DB key provider's split by target system:

| platform | store |
|---|---|
| macOS, iOS | the Keychain, service `eden.secrets`, account = the secret's name, this device only, readable after the first unlock. The unsigned development build on macOS uses the file store instead: a rebuilt unsigned binary cannot read what the last one wrote to the Keychain |
| Android | the Keystore through `EdenSecrets.kt`, the same wrapping pattern as the DB key; written and unrun (the checklist in `engineering/data-layer.md`) |
| Windows, Linux | `<app data dir>/secrets/<name>`, mode 0600, until their keychain paths are ported |

The Anthropic key is `anthropic-api-key`. Three commands touch the store (`set_secret`, `has_secret`, `delete_secret`) and none answers a value: the adapter reads it inside the crate, and the webview only ever learns "present" or "absent". A key never appears in an export, a diagnostic, an audit entry or an error message; the adapter strips URLs and headers from a network error before it is emitted.

## The request

The webview builds the whole request and the crate adds only the key. `gardener_send(request, onEvent)` takes `{ id, model, maxTokens, system, messages, tools }`, records the egress (`anthropic`, the URL and the body's bytes; D-71) and POSTs to the Messages API with `stream: true`. The stream comes back over a Tauri channel as events:

| event | carries |
|---|---|
| `start` | the message id and the model that answered |
| `text_delta` | a piece of the reply |
| `tool_use` | one complete tool call: id, wire name, parsed input |
| `usage` | tokens in, out, cache read and cache written; once at the start, once at the end |
| `stop` | the reason (`end_turn`, `tool_use`, `max_tokens`, `refusal`, `cancelled`) and the refusal's category |
| `error` | the provider's status and message, or a network failure mid-stream |

`gardener_cancel(requestId)` aborts a stream. The adapter never sends `thinking` (the current models decide for themselves) nor `tool_choice` (a forced choice is refused by the current models); a 400 is shown as the provider wrote it, which is how Fable's retention requirement reaches the owner. No key on this device is `gardener:no-key` before anything is sent.

## The loop

One owner message is one request, and one request is one audit entry. In order:

1. No key: the grey chip and the notice. Budget: this month's spend plus the estimate over the cap declines with a link to the Gardener tab (D-7).
2. `resolveGrade` at the conversation's grade (`settings.gardenerGrade`, the chip's switch); unavailable says why; a move above the grade for a need is confirmed with its estimate first (D-74).
3. `buildPack` (below). Over the per-request token cap declines.
4. The owner's message and an empty reply are rows of the thread; the can-see block is written from the pack.
5. The request streams. Text lands in the reply's text block. A `tool_use` runs its handler:
   - a **plain** tool, and a `write-draft` one, runs inline; its card settles `done` and its answer becomes the `tool_result`;
   - a **write** tool asks the grant store (`subject` the model id, `resourceType: 'tool'`); a standing grant runs it with an undo toast; otherwise the tool card waits `pending` with its confirm and the request pauses. Confirm records a `per-request` grant (`origin: 'confirm'`; `log-quick` a `standing` one, the Quick Log's first-use pattern) and runs it; cancel answers the model with an error result;
   - an **act-external** tool always takes the confirm path; no Phase 1 tool declares it;
   - a **model-backed** tool is a delegated request: `resolveTool` with the policy's overrides, a confirm when it runs at `deep` or above its declared grade, its own pack from its declared reads alone with the tool's prompt as the message and no tools (bounded, never a loop), its own audit entry with `parentRequestId`, and its parsed answer as the `tool_result` and, for `write-draft`, a draft card.
6. `stop: tool_use` continues the same request with the assistant's blocks and every tool result, six rounds at most. `end_turn` settles. `max_tokens` marks the reply cut short with a Continue. `refusal` shows the category. An error shows the message; 429 and 529 offer a retry.
7. The audit entry is written with the usage, the cost from the pricing row, the reads with their row ids, the entities, the tools with their confirm outcome, the grants, and the outcome. The thread's tier rises to the highest tier read. The profile's usage counts are read again. At 80 % of the cap the warning shows once a day.

Draft cards are the runtime's: a task, a plan (tasks and a `shop-day` Event through a batch), a grocery list, code (copied, never written to a file), the capture sheet (stock rows and the `haul-photo` attachment), and the proposal card (`profile.propose`, D-72). A commit is an ordinary store write with an undo toast and a feed entry; the card's state is settled on the message row.

## The context pack

`buildPack` is pure over readers the app injects (facts, entities, primitives, the grant check), tested in Node. The order is fixed (`product/substrate/ai.md`): the persona and its rules; the tool schemas; the declared facts, the owner's own word first; the declared entities, newest first; the declared primitives by kind in the window from seven days back to fourteen ahead (tasks without a window, since a routine has no due); the thread; the message. Each row is one compact JSON line under its registry id; every string passes the scrub; a mirror row is wrapped as untrusted, and the persona says what that means.

Tiering is the registry's: a T3 read cannot be built (`gardener:never`; the builder refuses it first), a T2 read is included under a live grant and otherwise listed as `locked`, T0 and T1 are the default. The budget is `ceil(chars / 4)` against the model's context less the output reserve, and the per-request cap: over it, the oldest entity rows go first, round-robin across ids, then the oldest thread turns; facts, the focus rows and the message never go, and each trimmed id is named in the chip. The "can see" chip is literal: one chip with the row count, opening the kit's `CanSee` popover with every id after trimming, zero included behind a fold, and the rows behind each named (`labels.ts`: a fact by its value, an entity or a primitive by its name). A locked id is a T2 read no grant allows; its row says so and offers a standing read grant through a confirm sheet. The tool card's info button and an audit row open the same kind of popover (`DetailPopover`).

The persona is two system blocks: the stable one, cached, and the volatile one with the date, the zone and the can-see list, so a thread's follow-ups hit the cache.

## The scrub

`scrub(text)` replaces emails, phone numbers and account-like numbers (eight or more digits, spaces or dashes between groups) with `[email]`, `[phone]` and `[number]`, leaves dates, times, ULIDs and stamps alone, and is idempotent (D-26). It runs on every row string and on the owner's message, never on the persona.

## Tools

`toolIndex(declarations)` is the substrate's tools declared in code (`SUBSTRATE_TOOLS`: `create-task`, `complete-task`, `summarize-day`, `what-you-know-about-me`, `log-quick`, `propose-fact`) and every enabled domain's tools from its manifest, each joined to its input schema and description. Anthropic's tool names take no dot, so a domain tool is `<domain>_<id>` on the wire; overrides stay `<domain>.<tool>` and grants stay bare tool ids. Schemas carry `additionalProperties: false` on every object and no numeric or string constraints; the tools that write or draft are marked `strict` (the API holds their input to the schema) and the read tools are not, since the API takes twenty strict tools at most and a request carries the whole index. `validateTools` refuses a read outside the registry, a T3 read, a duplicate or malformed wire name and a schema the API would not take, and the test runs it over the manifests.

Handlers are the app's. `DomainBindings.tools` maps a tool id to a handler, `run(input, ctx)` for a plain or write tool and `delegate` (a prompt, a parser, a card) for a model-backed one; `DomainBindings.quickActionHandlers` maps a quick action id to its store write, which `log-quick` dispatches to and the Quick Log sheet (#27) reuses. The substrate's handlers live in `shell/gardener/substrate-tools.ts`. A declared tool with no handler answers "unavailable", and the shell logs the list of them when it starts (`missingHandlers`). A domain's `tools.ts` imports only its own store and the shell, as the isolation lint requires.

## Budgets and estimates

The policy row holds the monthly cap (10 USD by default) and the per-request token cap (the model's context when unset). An estimate before sending assumes the pack's tokens in and `maxTokens` out at the resolved model's pricing row; the entry after records the usage the provider reported, cache reads priced at their own rate. This month's spend is the sum of the audit's `costUsd` since the first of the month in the owner's zone.

## The audit log

`audit_entries` is this device's: 90 days, never exported, never synced, never cleared by a replace, swept when the workspace opens. An entry holds what `product/substrate/ai.md` lists; `reads` carries the row ids read, which is what "used by N requests" on the profile counts (`audit_usage`). The page at `/gardener/audit` lists the entries and opens one to its reads, tools, grants and thread; the Gardener tab and every "can see" chip link to it.

## Threads and policy

`threads` and `messages` are rows of the workspace: stamped, tombstoned, exported in the full bundle and merged by stamp. A message's `blocks` is JSON the frontend shapes, as a fact's value is: text, tool cards with their state, proposal and draft cards, the can-see snapshot, an error. A thread's tier is the highest tier it read; a T2 thread shows the lock and stays out of future packs unless the owner includes it, which records a per-request grant on the T2 id that made it so.

`policy` is a generic key-value table of workspace policy (D-37). The row `gardener` holds the owner's sparse edits over the seed, the overrides, and the two caps. The conversation's grade is a per-device setting.

## The development clamp

In `development` (`yarn dev`) and in the browser (`web`) every grade and every override resolves to the seed's light model, so developing never spends on the standard or the deep model; staging and production use the real map. The audit entry records the model that ran. A `deep` tool still confirms under the clamp, since the confirm is about the tool's cost class; the sheet shows the light model and its estimate, and the Gardener tab says the clamp is on.

## The browser fallback

`yarn dev:web` has no crate: `hasSecret` is false, `gardenerSend` rejects `unavailable`, and the panel says the Gardener runs in the installed app. Threads, messages, the policy and the audit log work in the engine, so the panel is developed against `FakeTransport`, a scripted stream.

## Testing

| command | runs |
|---|---|
| `yarn test:rust` | the secret store's file provider; the audit store and its sweep; threads, messages and the policy in the bundle round-trips; `the_audit_never_leaves` and `a_secret_never_leaves`; the SSE parser over `gardener/fixtures/stream.sse`, fed byte by byte and whole |
| `yarn workspace @eden/shared test` | `tools.test.ts` (every declared tool has a strict schema, reads inside the registry, unique wire names), `pack.test.ts` (the order, tiering, trimming, the untrusted wrapping, the row ids), `scrub.test.ts`, `persona.test.ts`, `estimate.test.ts`, `budget.test.ts`, `dev.test.ts` (the clamp never answers a non-light model), `policy.test.ts`, and the engine's threads, policy and audit cases |

The one thing a test cannot pin is the schema shape the provider accepts under `strict`: a live request against the light model before a release settles it.
