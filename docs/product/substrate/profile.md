---
title: Profile
status: draft
summary: The facts store that makes Eden a digital twin: the fact model, provenance, who may write and read each type, the "What Eden knows about me" surface, and the fact lifecycle.
read-this-if: A domain needs to know something another domain learned, or you are designing anything that shows or edits facts about the owner.
depends-on: [privacy, registry]
updated: 2026-10-02
---

## Purpose

The profile is the one place Eden keeps typed statements about the owner. Domains write the facts they own and read the facts they need by type. No domain imports another; the profile is the only shared memory. It is small and structured on purpose: it is not a knowledge graph and not a transcript of what the Gardener was told.

## Fact model (Phase 1)

| field | meaning |
|---|---|
| `type` | a registry id with `category: fact` |
| `value` | shaped by the type's value schema in the registry |
| `tier` | from the registry, never per row |
| `provenance` | `user-asserted`, `domain-derived`, `system-derived`, `integration`, `ai-inferred` |
| `confidence` | 0–1, present only for derived and inferred facts |
| `validFrom` / `validUntil` | optional window for temporal facts ("training for a 10k until November") |
| `source` | optional entity link or integration id that produced the fact |
| `createdAt` / `updatedAt` | hybrid logical clock stamps, following Crate's sync |
| `note` | optional owner note |

Multi-valued types (`allergy`) hold one row per value. Each row is independently editable and deletable.

## Phase 1 fact types

The registry is the source of truth; this table shows the value schemas the first domains rely on.

| type | value schema | owner | tier |
|---|---|---|---|
| `preferred-name` | string | substrate | T1 |
| `home-area` | `{street, city, region, postalCode, country}`; the street has no house number or unit (D-152) | substrate | T1 |
| `allergy` | `{kind: food \| drug \| environmental, substance, severity: mild \| moderate \| severe}` | kitchen | T2 |
| `dietary-preference` | enum list (vegetarian, vegan, pescatarian, halal, kosher, low-sodium, low-sugar, gluten-free, alcohol-free, custom) | kitchen | T1 |
| `disliked-ingredient` | string | kitchen | T0 |
| `cuisine-preference` | `{name, weight}`, the weight 0–1 | kitchen | T0 |
| `household-size` | integer | kitchen | T1 |
| `skill` | `{name, level}` | toolbench | T1 |
| `owned-hardware` | string | toolbench | T1 |
| `preferred-tool` | string | toolbench | T1 |
| `favorite-vibe` | `{name, weight}`, the weight 0–1; live ahead of its phase (D-130) | places | T0 |

Fact types owned by Phase 2 and Phase 3 domains (`gym-preference`, `training-limitation`, `value`, …) are listed in the registry with their phase. The value schemas live in code as `FACT_SHAPES` in `@eden/shared/profile`, not in the registry (D-72); a new fact type adds its row to the registry and its shape there.

## Write rules (Phase 1)

- The owning domain writes its types through its own editors.
- **The owner may assert any registered fact type** from "What Eden knows about me", even when the owning domain is not installed. A `medical-dietary-restriction` can be entered in Phase 1 although Wellspring arrives later; Hearth reads it immediately.
- A domain may derive its facts from its own rows: Meadow writes `favorite-vibe` as `domain-derived`, worked out from the saved places and the visits each time a place is saved or a visit is logged, with the weight as its confidence, and never touches a row of the type the owner asserted (`domains/places.md`, Facts).
- The substrate writes `system-derived` facts (`home-area` from the `home` Place's address, D-141, D-152).
- Integrations write with provenance `integration` and a source, only for types their grant names.
- **AI-inferred facts pass a confirm gate.** The Gardener proposes; nothing is stored until the owner accepts, at which point provenance stays `ai-inferred` with confidence. A proposal may name the fact it takes the place of and the last day it holds; accepting then removes the old row and stores the new one under one undo (D-127).
- **The Gardener forgets a fact only on the owner's confirm**, each time, with an undo, and never a fact the substrate derives (D-127).
- Conflicts: a user-asserted row always wins. Otherwise, the latest stamp per type and value wins. A row outside its validity window is ignored by readers and shown greyed in the profile.

## Read rules (Phase 1)

- Any domain reads any type by id. Tier is enforced at the AI boundary, not between domains, because domains run locally under the owner's control.
- The Gardener reads a fact only when a tool or surface declares the type and the tier grant allows it (D-31).
- Readers receive the effective set: user-asserted rows first, valid rows only, deleted rows never.

## Surfaces (Phase 1)

- **What Eden knows about me** (Garden → profile; mocked as `Domains/Garden/Profile`, built in `apps/desktop`, `shell/profile/`): every fact grouped by domain, with value, provenance, source, dates, and "used by N Gardener requests" linking into the audit log (the count waits on the audit log). Edit, delete, add, set a validity window, renew what expired. T2 rows show a lock glyph; the Vault is not listed here because it holds no facts.
- **Why am I seeing this**: any suggestion that used a fact shows the fact by name on hover or long press and links to it.
- **Gardener proposals**: an inline card "I noticed you avoid cilantro. Save as a dislike?" with accept and dismiss, and a quiet line when it replaces a fact or holds until a day.

## Lifecycle

- Edit in place; every edit keeps the old value in history for thirty days, on the device that made it (the history is never exported or synced).
- Expire by validity window; expired rows are hidden from readers and can be renewed.
- Delete removes the row from readers immediately; the row stays as its tombstone, for undo and for sync, as every row does.
- Export includes every fact with provenance; import restores them.
- When a domain is removed, its `domain-derived` and `integration` rows are retracted; user-asserted rows stay (`substrate/domain-manifest.md`).

## Non-goals

- Free-text memory. The Gardener does not get a scratchpad of things it remembers about you; it gets typed facts.
- A knowledge graph. Facts are flat rows with optional entity links.
- Cross-user facts. One workspace, one owner (D-22).
