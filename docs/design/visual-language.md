---
title: Visual language
status: draft
summary: The token architecture extended from Crate, the light "morning garden" and dark "night forest" themes with candidate values, the accent set, semantic colours and the Gardener tint, typography, iconography, spacing, radius, elevation, motion, chart colours and accessibility targets.
read-this-if: You are styling anything, building the theme, or drawing a mockup.
depends-on: [brand]
updated: 2026-09-27
---

## Token architecture

Eden extends Crate's `theme.css`: plain CSS variables keyed off `data-theme` (light, dark), `data-accent` and `data-font` on the root, mapped into Tailwind's `@theme` for utilities, with a pre-paint script so the first frame is already themed. Eden adds a third surface level, an AI tint, and the accent set below. Every value here is a candidate for Claude Design to iterate on; the names are fixed.

## Light: morning garden

Warm paper, not white. Moss for the brand, ink-green for text, clay as the warm counterpoint.

| token | value |
|---|---|
| `--surface-0` | `#F6F4EC` page |
| `--surface-1` | `#EFEDE3` cards, sidebar |
| `--surface-2` | `#E6E3D6` inputs, hover |
| `--surface-3` | `#DCD8C8` pressed, selected |
| `--text-primary` | `#1F2A22` |
| `--text-secondary` | `#4C5A50` |
| `--text-tertiary` | `#7C8A7F` |
| `--stroke` | `#D9D6C8` |
| `--stroke-subtle` | `#E8E5D9` |
| `--brand-primary` | `#4F7A5A` moss |
| `--brand-hover` | `#43684D` |
| `--brand-muted` | `#DCE8DD` |
| `--ai` | `#8A6A1E` on `--ai-muted` `#F1E6C4` honey |

## Dark: night forest

Deep blue-green blacks, not pure black. Desaturated fern for the brand, a firefly gold for the Gardener.

| token | value |
|---|---|
| `--surface-0` | `#0F1512` |
| `--surface-1` | `#16201B` |
| `--surface-2` | `#1E2A24` |
| `--surface-3` | `#26332C` |
| `--text-primary` | `#E6EBE4` |
| `--text-secondary` | `#A9B5AC` |
| `--text-tertiary` | `#75837A` |
| `--stroke` | `#2A3730` |
| `--stroke-subtle` | `#1F2A24` |
| `--brand-primary` | `#7FB58A` fern |
| `--brand-hover` | `#93C49D` |
| `--brand-muted` | `#24382C` |
| `--ai` | `#F2D27A` on `--ai-muted` `#2E2A18` firefly |

## Accent set

Ten accents the owner can pick, replacing `--brand-*` at runtime as in Crate. Light and dark values are tuned separately for contrast.

| accent | light | dark |
|---|---|---|
| Moss (default) | `#4F7A5A` | `#7FB58A` |
| Fern | `#3E8E5E` | `#8CD3A0` |
| Sage | `#6F8F7C` | `#A3C4B1` |
| Clay | `#B5644A` | `#D98B6E` |
| Marigold | `#C98A2E` | `#E8B45A` |
| Lavender | `#7B6FAE` | `#A9A0D8` |
| Plum | `#7A4B72` | `#B07AA6` |
| Sky | `#4A82A6` | `#7FB2D6` |
| Slate | `#5B6B78` | `#93A3B0` |
| Rose | `#B3606F` | `#D9899A` |

## Semantic colours

| role | light | dark |
|---|---|---|
| danger | `#B0413E` | `#E0706C` |
| warning | `#B8821F` | `#E3B24F` |
| success | the accent | the accent |
| info | `#4A82A6` | `#7FB2D6` |
| Gardener surfaces | `--ai` on `--ai-muted` | same |

The Gardener tint is distinct from the accent so an AI surface is always recognisable whatever accent is chosen.

## Typography

| role | face | notes |
|---|---|---|
| display | Fraunces (variable serif) | headings, the daily line, empty-state titles; optical size on |
| body | Inter | everything else |
| data | Geist Mono | numbers in tables, quantities, code in Toolbench |

Scale: 12, 13, 14 (body), 16, 18, 22, 28, 36. Body line-height 1.5, display 1.15. Crate's font setting stays, with the serif display paired to whichever body face is chosen. Japanese falls back to the system sans (Hiragino Sans, Noto Sans JP) for body and to Noto Serif JP for display.

## Iconography

Lucide for utility icons at 16 and 20 pixels with a 1.75-pixel stroke in dense UI, 24 pixels elsewhere. The domain glyph family (`design/brand.md`) shares Lucide's grid and stroke. Icons never carry meaning alone in dense lists; a label or tooltip accompanies them.

## Spacing, radius, elevation

Four-pixel base; component padding 8, 12, 16; section gaps 24, 32. Radius: 6 for controls, 10 for cards, 16 for sheets, full for chips. Elevation in light is a soft shadow (`0 1px 2px rgba(31,42,34,.08)`, `0 8px 24px rgba(31,42,34,.10)` for sheets); in dark, elevation is a lighter surface plus a subtle stroke, never a shadow.

## Motion

Micro-interactions 150 ms, panels and sheets 220 ms, ease-out (`cubic-bezier(0.22, 1, 0.36, 1)`). Panels "unfurl": scale from 0.98 and fade. Growth is the only metaphorical motion: a completed task or a committed capture settles rather than pops. With reduced motion on, only opacity animates.

## Charts

Numeric widgets (weight trend, later Orchard) use the accent for the primary series, `--text-tertiary` for averages and goal lines, and at most three categorical series from the accent set (Clay, Sky, Marigold). Axes in `--stroke`, labels in `--text-secondary`, no gridlines heavier than `--stroke-subtle`.

## Accessibility targets

Body text contrast 4.5:1, large text 3:1, checked for every accent on both themes. Visible focus rings in the accent, 2 pixels, offset 2. Touch targets 44 by 44 on mobile. Everything reachable by keyboard; the palette is the escape hatch. Reduced motion and system theme respected. Colour is never the only carrier of state.

## Density

Desktop defaults to comfortable; a compact setting tightens list rows to 32 pixels. Mobile uses the same tokens with larger type (16 body) and 44-pixel targets.
