---
title: Domain template
status: draft
summary: The ten-section template every full domain doc follows, plus the shorter stub and candidate templates. Copy it verbatim.
read-this-if: You are writing or restructuring a domain doc.
depends-on: [substrate/registry, substrate/domain-manifest]
updated: 2026-09-30
---

## How to use

Copy the ten headings below in order. Keep each section to what the domain adds; link substrate docs instead of restating them. Append the domain's registry rows to `substrate/registry.md` in the same change, and make sure sections 3, 4 and 7 match those rows exactly. Cite `D-n` and `OQ-n` ids; never restate them.

## Full domain: the ten sections

1. **Purpose**: three lines, then "the one thing it must do well".
2. **User stories**: five to ten, each tagged MVP or later.
3. **Entities**: a table of entity type, key fields, tier, links out. Only this domain's entities; primitives are used, not redefined.
4. **Facts**: written (type, tier, how produced) and read (type, owner, used for).
5. **Gardener tools and guardrails**: a table of tool, declared reads, access, confirm, grade (`light`, `standard`, `deep` with what it needs of a model, or plain; D-74); then the never-do list.
6. **Surfaces**: desktop views, mobile views and phase, Garden widgets with sizes, palette entries, quick actions, capture sources.
7. **Kinds, signals, notifications, intents**: kinds registered with primitive and tier; signals emitted; notification kinds with default channel and cadence; intents handled and sent; day annotations if any.
8. **Integrations**: now and later, with default access and what is sent and received.
9. **Settings**: the domain's settings page.
10. **Non-goals and open questions**: what it will not do; `OQ-n` ids only.

## Stub domain (Orchard, Wellspring)

Purpose · Scope sketch · Why deferred · Entities and facts, best guess · Sensitivity notes · Integration candidates · Substrate dependencies · When to spec.

## Candidate domain (one page)

Purpose · Why it might earn its place · Entity sketch · Facts · Overlaps · Trigger to promote.
