---
title: Vision
status: draft
summary: What Eden is, why it exists, the principles it will not trade away, who it is for, what it is not, and what "done" means per phase.
read-this-if: You are new to Eden, or you need to settle a scope or priority argument.
depends-on: []
updated: 2026-09-27
---

## One paragraph

Eden is a personal digital garden: one desktop and mobile application that helps its owner run the parts of life that benefit from a little structure. The kitchen. Ideas and projects. The calendar. Movement. Reflection. Places to go. The weather. Later, money and health. Each of those is a **domain**. Domains are standalone, but they share a small **substrate**: facts about you, a permission model, four common primitives (tasks, events, places, attachments), signals, and an AI assistant called the Gardener. That is how the kitchen can respect what health knows without the two ever touching. Eden is local-first, private by default, and assists without creating dependence.

## Why a digital twin, and why not a pile of tabs

Life-management apps fail in two ways. Single-purpose apps never know enough about you: the recipe app does not know your allergies, the calendar does not know the weather, the workout app does not know you are travelling. "Everything" apps know too much and organise it badly: twenty sidebar tabs, each a feature, none aware of the others, and every one a fresh way to leak personal data.

Eden's bet is that the value is not in the features but in a **shared model of you** that every feature reads from and writes to under rules. A fact like "dietary restriction: low sodium, medical" is written once, by the domain that owns it, and read by whichever domain needs it, under a sensitivity tier and a grant. The AI assistant sees exactly what a request declares it reads and nothing more, and you can inspect that at any time.

The assistant tends; it does not own. Eden should make the owner more capable and more informed, never more dependent. If Eden vanished tomorrow, everything in it exports to files a person can read.

## Principles

1. **Local-first, private by default.** The encrypted local workspace is the source of truth. Sync is opt-in and end-to-end encrypted. No telemetry, ever.
2. **Read-only by default, confirm before acting.** Integrations connect read-only unless you grant more. The Gardener drafts; you commit. Some things are never automated: sending messages, moving money, deleting external data.
3. **Your word beats inference.** A fact you assert outranks a fact a domain derived or the AI inferred. AI-inferred facts are never stored without your confirmation.
4. **Calm by default.** Few notifications, sensible digests, quiet hours. Success toasts are rare; errors are shown.
5. **Everything exportable, nothing hostage.** Full and per-domain export in readable formats, at any time, from any device.
6. **Small substrate, many domains.** The substrate earns every addition. Domains never import each other; they communicate through facts, primitives, signals, intents and typed links.
7. **Assist, do not replace.** Eden helps you cook, plan, move, reflect and decide. It does not cook, plan, move, reflect or decide for you.
8. **One person, one workspace.** Eden is built for its owner first. Others can run their own Eden. Sharing between people is not a v1 goal.

## Personas

- **The owner.** A developer and maker who cooks, trains, reads, tinkers with hardware and generative art, studies Japanese, and wants one calm place that knows enough to help. Primary and only Phase 1 persona.
- **A household member (future).** Someone who might one day share a grocery list or a calendar. Not designed for in v1, but the data model must not make it impossible (D-22).
- **Not "the public."** Eden may be opened to others later. Until then, no feature is justified by an imagined market.

## Non-goals

- Social features, feeds, or sharing between people.
- Project management, issue tracking, or an IDE. Toolbench links to those; it does not become them.
- Medical, financial or legal advice. Domains hold your records and surface facts; they do not diagnose or prescribe.
- Billing, subscriptions, entitlements or a plugin marketplace in v1.
- Telemetry, analytics or crash reports sent without explicit opt-in.
- Acting on the world as you: sending email or messages, payments, bookings.
- Being a general note-taking app. Notes exist where a domain needs them.

## Single-user first, multi-user capable

Means exactly this: one workspace per user, designed so another person can run their own Eden with their own workspace, enabled domains, grants and keys. It does not mean multi-tenant infrastructure, billing, or shared data. The extension points that would make Eden a product later (enabled-domain selection, the domain manifest, grants, export) exist because they make the single-user product better, not because a market is assumed.

## Success criteria

- **Phase 1**: the owner runs groceries and ideas in Eden every day, the Garden dashboard shows today's weather and moon, and a full export round-trips through import.
- **Phase 2**: the calendar shows Google events read-only under a grant, a rule fires a morning digest, a Council run shows its cost before spending it, and the phone handles the grocery list and captures a haul.
- **Phase 3**: places and listings render on a map, two devices sync end-to-end encrypted, and one candidate domain has been promoted.

## Relationship to Crate

Crate is the owner's DJ library application. Eden reuses its scaffold: monorepo layout, settings modal, theme tokens, i18n, updater, diagnostics, backup, and the local-first sync pipeline. DJ features stay in Crate. Nothing else is shared.
