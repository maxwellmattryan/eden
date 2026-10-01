---
title: Brand
status: draft
summary: The name and what it means, the metaphor policy, voice and tone with examples, motifs and their limits, the app icon, the domain glyph family with a concept per domain, and the splash screen.
read-this-if: You are making any visual or copy decision, or naming anything the owner will see.
depends-on: [product/glossary]
updated: 2026-09-30
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

Leaf and vine linework, weathered stone, a single unfurling frond, paper grain, the light of morning and the dark of a forest at night. Used only in empty states, the splash, onboarding and the app icon. Never as wallpaper, never behind text, never animated in loops. Two exceptions (D-42): paper grain overlays the whole page at the `lush` brand level (D-61), at an opacity that never competes with text, and flickers as film grain does (D-63), still under reduced motion, and the Breeze specks play once on an accepted proposal or a settled action and never loop. A third (D-62): a domain's page header may carry a live motif in the room beside its name, drawn from the domain's own readings. A fourth (D-80): a sprout grows in the Gardener's bubble, again and again, while a reply is awaited. No florals, no pastel pink, no cursive.

## App icon and logo

A doorway into the garden (D-65): a trilithon of weathered stone overgrown by two vines. The vines are near mirrors, never exact ones, and the stone is cracked and chipped a little; the imperfection is the point, so neither is tidied. The app icon sets it in a rounded square, paper ink on moss green, at nine tenths of the size that would fill the square, so it has room at the edges; the staging and dev channels keep the drawing and change the ground, to ochre and to rust. In the app the mark stands alone, with no square and no ground: the drawing in the brand colour, following the theme and the accent, with the surface behind it showing through the joints and the cracks.

The wordmark is the name as it is written, "Eden" with its capital (D-66), in the display face, Newsreader (D-39). It is never set in lowercase. The mark and the wordmark appear together on the splash, in About, and at the head of the desktop sidebar (D-55), and nowhere else in the chrome.

The drawing is `app-mark.svg` beside the kit's `AppMark`, which draws the same paths; a test holds the two together. The 1024-pixel masters in `src-tauri/icons/src` are that drawing set in the square on each channel's ground, and the icon sets beside them come from `tauri icon`, with the ground as `--ios-color` so the iOS icon fills its square. Changing the mark means changing the drawing, the component, the masters and the sets in one change.

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

The app mark above the wordmark, one daily line in the display serif with its source in small text, and nothing else. Shown for at most 1.2 seconds or until the workspace opens. The line comes from Sanctuary when it is enabled; otherwise from a neutral bundled set, such as "Tend what you can reach." and "Small, daily, enough." The splash never shows a spinner.

## Named things

Gardener, Council, Garden, Today, Vault, Quick Log, Capture, the daily line, "What Eden knows about me", the "can see" chip. Everything else takes its plain name from the glossary.
