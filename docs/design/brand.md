---
title: Brand
status: draft
summary: The name and what it means, the metaphor policy, voice and tone with examples, motifs and their limits, the app icon direction, the domain glyph family with a concept per domain, and the splash screen.
read-this-if: You are making any visual or copy decision, or naming anything the owner will see.
depends-on: [product/glossary]
updated: 2026-09-29
---

## Name and meaning

Eden: a garden that is tended, not wild, where things grow because someone looks after them. A digital garden in the older sense of the phrase as well: a personal space that grows over time and is never finished. The name promises calm, abundance and care, and warns against neglect. It does not promise paradise.

## Metaphor policy

Themed: the app name, the domain display names, Gardener, Council, Garden, the daily line, and the visual language. Everything else is plain (D-2, `product/glossary.md`). Never use a garden word for a state, an error, a setting or a data term. The test: if a sentence would be clearer with the plain word, use the plain word.

## Voice and tone

Calm, plain, warm, brief. Second person for the app, first person for the Gardener. No exclamation marks in system copy. No cheer, no apology loops, no moralising. The Gardener says what it can see and what it did.

| instead of | write |
|---|---|
| "Oops! Something went wrong 😔" | "Couldn't reach Open-Meteo. Showing the forecast from 09:40." |
| "Great job logging your weight! 🎉" | "82.4 kg logged. Undo" |
| "Your seedling failed to sprout" | "The capture found nothing. Try a closer photo." |
| "I've analysed all your data and…" | "From your stock and three recipes, here are two you can cook tonight." |
| "Are you sure you want to delete this?" | "Delete the recipe 'Miso salmon'? Its stock links will become text." |
| "AI may make mistakes" | "I can see: 14 stock items, 3 recipes, your allergies." |

The Gardener never refers to itself as an AI model in conversation, never claims feelings, and answers in the owner's language.

## Motifs and their limits

Leaf and vine linework, a single unfurling frond, paper grain, the light of morning and the dark of a forest at night. Used only in empty states, the splash, onboarding and the app icon. Never as wallpaper, never behind text, never animated in loops. Two exceptions (D-42): paper grain overlays the whole page at the `lush` brand level (D-61), at an opacity that never competes with text, and flickers as film grain does (D-63), still under reduced motion, and the Breeze specks play once on an accepted proposal or a settled action and never loop. A third (D-62): a domain's page header may carry a live motif in the room beside its name, drawn from the domain's own readings. No florals, no pastel pink, no cursive.

## App icon and logo

A single fern frond unfurling inside a rounded square: moss green on warm paper for light, fern green on night forest for dark, with a small firefly point of gold near the tip in the dark variant. The wordmark is the display face, Newsreader (D-39), lowercase "eden", used only on the splash, in About, and beside the mark at the head of the desktop sidebar (D-55). Until the icon is drawn the kit's `AppMark` traces the placeholder in `src-tauri/icons/src`, the one place to swap.

## The domain glyph family (D-17)

One family, drawn on Lucide's 24-pixel grid with a 2-pixel stroke, round caps and joins, so the glyphs sit beside Lucide's utility icons without looking imported. Each ships as SVG at 16, 24 and 32 pixels, in a mono variant and an accent-tinted variant for tiles. Until the family exists the kit maps each plain domain id to a Lucide stand-in through `domainGlyph()`, the one place to swap when a glyph is drawn; a stand-in is never presented as the family. Concepts to iterate on in Claude Design:

| name | glyph concept |
|---|---|
| Hearth | a pot over a small flame |
| Toolbench | a trowel standing in a pot |
| Sky | a sun peeking from behind a cloud |
| Almanac | a sun and a moon above a page |
| Vigor | a fern frond unfurling |
| Sanctuary | a lantern |
| Meadow | a map pin sprouting a flower |
| Orchard | a tree with fruit |
| Wellspring | a droplet with ripples |
| Companions | two intertwined sprouts |
| Rings | a tree-ring cross-section |
| Trails | a winding path between two trees |
| Leaves | a leaf that is also a page |
| Garden | a plot grid with three sprouts |
| Today | a sunrise over a line |
| Gardener | a watering can |
| Council | a ring of stones |
| Vault | a seed in a shell |
| Settings | Lucide's settings icon, unchanged |

## Splash screen

The wordmark, one daily line in the display serif with its source in small text, and nothing else. Shown for at most 1.2 seconds or until the workspace opens. The line comes from Sanctuary when it is enabled; otherwise from a neutral bundled set, such as "Tend what you can reach." and "Small, daily, enough." The splash never shows a spinner.

## Named things

Gardener, Council, Garden, Today, Vault, Quick Log, Capture, the daily line, "What Eden knows about me", the "can see" chip. Everything else takes its plain name from the glossary.
