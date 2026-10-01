---
title: Visual language
status: draft
summary: The token architecture extended from Crate, the light "morning garden" and dark "night forest" themes with their values, the accent set, semantic colours and the Gardener's two colours, typography, iconography, spacing, radius, elevation, motion, chart colours and accessibility targets.
read-this-if: You are styling anything, building the theme, or drawing a mockup.
depends-on: [brand]
updated: 2026-09-30
---

## Token architecture

Eden extends Crate's `theme.css`: plain CSS variables keyed off `data-theme` (light, dark), `data-accent`, `data-font`, `data-brand` (plain, tended, lush), `data-platform` (desktop, mobile) and `data-density` (comfortable, compact) on the root or any subtree (D-47), mapped into Tailwind through `@theme inline` so utilities follow the runtime variables, with a pre-paint script so the first frame is already themed. The stylesheets are generated from the kit's `tokens.json` (D-46, `engineering/ui-kit.md`). Eden adds a third surface level, two Gardener tints and the accent set below. The values here mirror the source; change both together. The names are fixed.

## Light: morning garden

Warm paper, not white. Moss for the brand, ink-green for text, clay as the warm counterpoint, spruce and honey for the Gardener.

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
| `--stroke-hover` | `#C4C1B1` |
| `--brand-primary` | `#4F7A5A` moss, `--on-brand` `#FFFFFF` |
| `--brand-hover` | `#43684D` |
| `--brand-muted` | `#DCE8DD` |
| `--ai` | `#1E6E5C` on `--ai-muted` `#D9EFE6` spruce; the Gardener when it speaks |
| `--honey` | `#7A5D1C` on `--honey-muted` `#F1E6C4` honey; the Gardener when it acts |

## Dark: night forest

Deep blue-green blacks, not pure black. Desaturated fern for the brand, sea-glass for the Gardener's voice, a firefly gold for its actions.

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
| `--stroke-hover` | `#364840` |
| `--brand-primary` | `#7FB58A` fern, `--on-brand` `#0F1512` |
| `--brand-hover` | `#93C49D` |
| `--brand-muted` | `#24382C` |
| `--ai` | `#86D6BF` on `--ai-muted` `#163329` sea-glass; the Gardener when it speaks |
| `--honey` | `#F2D27A` on `--honey-muted` `#2E2A18` firefly; the Gardener when it acts |

## Accent set

Ten accents the owner can pick, replacing `--brand-*` at runtime as in Crate. Light and dark values are tuned separately for contrast. Moss keeps hand-tuned hover and muted values; the others derive them from the base colour, and every accent's `--on-brand` is computed at build time by contrast (OQ-18).

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
| success | `#28794A` | `#86D9A2` |
| info | `#4A82A6` | `#7FB2D6` |
| Gardener surfaces | `--ai` on `--ai-muted` when it speaks, `--honey` on `--honey-muted` when it acts | same |

The Gardener's colours are distinct from the accent so an AI surface is always recognisable whatever accent is chosen: green when it speaks, honey when it acts (D-40). Success is its own green too, never the accent, so a done check or an ok outcome reads as success under every accent (D-78); it stays beside a check or a word.

## Typography

| role | face | notes |
|---|---|---|
| display | Newsreader (variable serif) | headings, the daily line, the Gardener's voice, empty-state titles; optical size on; metric overrides ascent 98%, descent 26%, line gap 0% (D-39). Fraunces, Instrument Serif and Bricolage exist only behind the Storybook face dial and never ship |
| body | Inter | everything else |
| data | Geist Mono | numbers in tables, quantities, code in Toolbench |

Scale: 12, 13, 14 (body), 15 (voice), 16, 18, 22, 28, 36 and nothing between (D-46). Body line-height 1.5, display 1.15. Crate's font setting stays, with the serif display paired to whichever body face is chosen. Japanese falls back to the system sans (Hiragino Sans, Noto Sans JP) for body and to Noto Serif JP for display.

## Iconography

Lucide for utility icons at 16 and 20 pixels with a 1.75-pixel stroke in dense UI, 24 pixels elsewhere. The domain glyph family (`design/brand.md`) shares Lucide's grid and stroke. Icons never carry meaning alone in dense lists; a label or tooltip accompanies them.

## Spacing, radius, elevation

Four-pixel base; component padding 8, 12, 16; section gaps 24, 32. Radius: 6 for controls, 10 for cards, 16 for sheets, full for chips. Elevation in light is a soft shadow (`0 1px 2px rgba(31,42,34,.08)`, `0 8px 24px rgba(31,42,34,.10)` for sheets); in dark, elevation is a lighter surface plus a subtle stroke, never a shadow.

## Motion

Micro-interactions 150 ms, panels and sheets 220 ms, ease-out (`cubic-bezier(0.22, 1, 0.36, 1)`). Panels "unfurl": scale from 0.98 and fade. Whatever appears over the page (a sheet and its scrim, a popover, a menu, a tooltip, a toast) leaves by the same transition played backwards, never by vanishing. Growth is the only metaphorical motion: a completed task or a committed capture settles rather than pops. With reduced motion on, only opacity animates. The Breeze specks are an exception to the no-loops rule (D-42): they play once, 700 ms, on an accepted proposal or a settled action, and render nothing under reduced motion; on a tool card they play on the success check that replaces the spinner, and never on a failure, which only fades to a danger x. A page header's motif is another (D-62): it loops, at no more than thirty frames a second, and is a single still under reduced motion. The spinner is another (D-79): the refresh arrows, turning only while a tool call or a refresh runs, still under reduced motion, never a page's loading state. The sprout is the last (D-80): it grows once every 2.4 s in the Gardener's bubble while a reply is awaited, and stands fully grown under reduced motion. Hover on a filled control is an ink wash, never a new hue. A press compresses the control from the top with its bottom edge fixed, as if it sank into its hole (D-49); reduced motion removes the movement.

## Charts

Numeric widgets (weight trend, later Orchard) use the accent for the primary series, `--text-tertiary` for averages and goal lines, and at most three categorical series from the accent set (Clay, Sky, Marigold). Axes in `--stroke`, labels in `--text-secondary`, no gridlines heavier than `--stroke-subtle`.

Figures are set in the data styles: `data-lg` (28) for a widget's headline, `data-md` (18) for one figure among several in a card, `data` (14) and `data-sm` (13) in rows.

A reading on a scale from fine to hazardous (the air quality index, pollen, the UV index) uses the six level colours, `level-1` to `level-6`: green, amber, orange, red, purple, maroon, each with a light and a dark value in `tokens.json`. They are graphic colours for bands, dots and markers, never text, and the word for the level is always beside them. The moon glyph has its own pair, `moon-lit` and `moon-shade`, so its lit face is the bright one in both themes.

## Accessibility targets

Body text contrast 4.5:1, large text 3:1, checked for every accent on both themes. Visible focus rings, 2 pixels, offset 2, composed from tokens (`--focus-ring-width`, `--focus-ring-offset`, `--surface-0`, `--brand-primary`) so they follow the accent and the theme. Touch targets 44 by 44 on mobile. Everything reachable by keyboard; the palette is the escape hatch. Reduced motion and system theme respected. Colour is never the only carrier of state.

## Density

Desktop defaults to comfortable; a compact setting tightens list rows to 32 pixels. Mobile uses the same tokens with larger type (16 body) and 44-pixel targets.
