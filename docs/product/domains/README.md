---
title: Domains
status: draft
summary: Every domain with its id, themed name in English and Japanese, subtitle, depth, phase and parent; what the statuses mean; how to add a domain.
read-this-if: You are orienting on which domains exist or adding one.
depends-on: [glossary, substrate/domain-manifest]
updated: 2026-10-01
---

## The table

| id | name | 日本語 | subtitle | status | phase | parent |
|---|---|---|---|---|---|---|
| `kitchen` | Hearth | 台所 | Food, recipes, pantry, groceries | full | 1 | |
| `toolbench` | Toolbench | 工房 | Ideas, projects, homelab, generative art | full | 1 | |
| `weather` | Sky | 空 | Weather, forecasts, sun and moon | full | 1 | |
| `calendar` | Almanac | 暦 | Calendar and scheduling | full | 2 | |
| `fitness` | Vigor | 活力 | Workouts, gyms, body metrics | full | 2 | (health, later) |
| `spirit` | Sanctuary | 聖域 | Reflection, readings, values | full | 2 | |
| `places` | Meadow | 野原 | Places and events near you | full | 3, built ahead of it | |
| `finance` | Orchard | 果樹園 | Money, budgets, assets | stub | after 2 | |
| `health` | Wellspring | 泉 | Medical, meds, care | stub | after 2 | |
| `people` | Companions | 仲間 | Relationships | candidate | 3+ | |
| `journal` | Rings | 年輪 | Daily reflection and mood | candidate | 3+ | |
| `travel` | Trails | 旅路 | Trips and itineraries | candidate | 3+ | |
| `library` | Leaves | 書庫 | Reading and articles | candidate | 3+ | |

Display names are locale strings; ids are permanent. The glossary holds the same table and wins on conflict.

The phase is where a domain sits in the roadmap, not whether it is built: Meadow keeps Phase 3 in its manifest and is built now, and D-130 is why its rows are live.

## Status meaning

- **full**: specced with the ten-section template; ready to mock up and build in its phase.
- **stub**: deliberately shallow; the doc says when it will be specced (D-4).
- **candidate**: a one-pager; may never be built; promoted by the trigger it names.

## How to add a domain

1. Pick a plain id and a themed name with a plain subtitle; add both to `product/glossary.md` and this table.
2. Copy `_template.md` and write the doc.
3. Append the domain's registry rows to `substrate/registry.md`.
4. Add the doc to `docs/INDEX.md` and a decision to `product/decisions.md` if a choice was made.
5. Add an icon concept to `design/brand.md` and screens to `design/screens.md`.
