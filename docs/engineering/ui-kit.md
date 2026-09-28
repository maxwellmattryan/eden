---
title: UI kit
status: draft
summary: "`@eden/ui-kit` in `packages/ui-kit`: how it is built and consumed, the token pipeline and its generated files, the root attributes, fonts, icons, component conventions and internal primitives, the strings boundary, Storybook as the acceptance surface, and the gates CI runs."
read-this-if: You are adding or changing a component, a token or an icon, or wiring an app to the kit.
depends-on: [design/visual-language, design/ux-patterns, design/brand]
updated: 2026-09-28
---

## Where it lives

The kit is the workspace package `@eden/ui-kit` at `packages/ui-kit` (D-43). Apps in `apps/*` depend on it by exact version (Yarn 1 has no `workspace:` protocol) and consume it from source: `exports` point at `src/lib`, so Vite compiles the kit with the app and HMR crosses the package boundary. `svelte-package` plus `publint` run as a build gate so the package would also stand alone. The toolchain is pinned in D-44.

The package is SvelteKit-shaped because `svelte-package`, `svelte-check` and the Storybook framework expect it; the one route only points at Storybook. The kit never imports `$app/*` or `svelte/store` (ESLint forbids both).

## What an app imports

```css
@import 'tailwindcss';
@import '@eden/ui-kit/theme.css';
@import '@eden/ui-kit/base.css';
@import '@eden/ui-kit/tailwind.css';
```

Plus, once each: the pre-paint script `@eden/ui-kit/prepaint.js` as a blocking `<script>` in `<head>`, `UiKitProvider` around the root with the app's translations, and `ToastHost` near the root. Components come from the barrel (`import { Button } from '@eden/ui-kit'`), which has no side effects. `faces.css` and the alternate fonts are not exported: they exist only for Storybook (D-39).

The Tailwind mapping uses `@theme inline`, so a utility such as `bg-brand` compiles to `background-color: var(--brand-primary)` and follows the accent at runtime. The Tailwind palette is wiped (`--color-*: initial`): there is no `bg-red-500`, only token names. `dark`, `mobile` and `compact` are custom variants keyed on the root attributes.

## Root attributes

All set on `<html>` (D-47); every selector in the stylesheets is element-scoped, so a subtree (a Storybook frame, a plain audit-log surface) can carry its own value.

| attribute | values | set by |
|---|---|---|
| `data-theme` | `light`, `dark` | the pre-paint script, which resolves "system" in JS; the stylesheet has no `prefers-color-scheme` block |
| `data-accent` | the ten accents; absent means moss | pre-paint script, settings |
| `data-brand` | `plain`, `tended`, `lush`; absent means lush | pre-paint script; a screen may set a plainer level on its own subtree |
| `data-font` | Crate's body-font setting; reserved | settings |
| `data-platform` | `desktop`, `mobile` | each app, once, statically |
| `data-density` | `comfortable`, `compact`; desktop only | settings |
| `data-face` | the display face | Storybook only, never the app |

The pre-paint script reads the localStorage keys in `storageKeys` (`eden:theme`, `eden:accent`, `eden:brand`, `eden:font`, `eden:density`). It sets attributes only; the stylesheets are blocking, so the first frame is already themed without inline colours.

## Tokens

`src/lib/tokens/tokens.json` is the single source (D-46). `scripts/build-tokens.mjs` generates, and CI checks with `tokens:check` that nothing drifted:

| file | holds |
|---|---|
| `styles/theme.css` | `@font-face` for the shipped fonts; the light and dark token blocks; scales, motion, z-order; the composed focus ring; families and the type styles; the accent blocks; `.ed-t-*` classes |
| `styles/base.css` | reduced-motion overrides; the brand dial; the platform and density blocks; body defaults, selection colour, the paper grain, `.ed-sr-only` |
| `styles/tailwind.css` | the `@theme inline` mapping and the custom variants |
| `styles/faces.css` | the alternate faces and `[data-face]` blocks, gallery only |
| `styles/prepaint.js`, `.storybook/preview-head.html` | the pre-paint script, standalone and inlined |
| `tokens/tokens.ts` | unions (`Theme`, `Accent`, `BrandLevel`, `Face`, `Platform`, `Density`, `TypeStyle`, `ColorToken`), resolved values, `defaults`, `storageKeys` |
| `tokens/tokens-report.md`, `tokens/tokens-report.json` | WCAG ratios for every documented pair and every accent, with the derived values; the JSON feeds the Foundations pages |

Rules the generator enforces: every type size is on the scale 12, 13, 14, 15, 16, 18, 22, 28, 36; every `{reference}` names an emitted variable; token names are unique.

**Accents.** The root carries the hand-tuned moss tokens. `[data-accent="moss"]` repeats them, so the attribute and its absence are identical. Every other accent sets `--brand-primary` and a computed `--on-brand`, and derives `--brand-hover` as `color-mix(in srgb, accent 85%, var(--ed-hover-ink))` and `--brand-muted` as `color-mix(in srgb, accent 18%, white)` in light or `surface-1` in dark. `--on-brand` is whichever of white or the ink clears the higher contrast on the accent; the report flags any pair under 4.5:1 (OQ-18). The focus ring is composed from `--focus-ring-offset`, `--focus-ring-width`, `--surface-0` and `--brand-primary`, so it follows the accent without per-accent rules.

**Type.** Each style is a `font` shorthand variable, `--ed-t-<style>` (for example `--ed-t-body: 400 14px/21px var(--ed-font-sans)`), with `--ed-t-<style>-opsz` and `--ed-t-<style>-tracking` beside it. Components write `font: var(--ed-t-voice)` and never a pixel size. Display styles take their weight, tracking and italic from `--ed-display-weight`, `--ed-display-tracking` and `--ed-display-italic`, which the face dial sets.

**The brand dial** redefines `--ed-t-button`, `--ed-t-title`, `--ed-t-title-sm` and `--ed-t-voice` per level, which is how the display face says things at `tended` and `lush` and Inter says them at `plain`. It also sets `--ed-radius-control`, `--ed-radius-card`, `--ed-radius-sheet`, `--ed-btn-pad`, the fill sheen, edge, highlight and shadow, the secondary button ground, the chip edge, the sidebar's current-item colours and bar, the grain and its opacity, the motif size and the page-name rule. Components read these, never `--radius-*` directly.

**The platform block** sets `--ed-control`, `--ed-row`, `--ed-t-text`, `--ed-t-text-sm`, `--ed-sheet-pad`, `--ed-gutter`, `--ed-tab-bar` and the four `--ed-safe-*` insets. Behavioural differences (a sheet's placement, a menu as an action sheet, the sidebar against the tab bar) are explicit props with an `auto` default that reads the nearest `data-platform` through `platformOf()`. The kit never uses `matchMedia` or a media query.

## Fonts

Newsreader (upright and italic), Inter and Geist Mono ship from `src/lib/fonts`, each with its OFL text (D-48). Newsreader is declared with `ascent-override: 98%; descent-override: 26%; line-gap-override: 0%` so its baseline sits where Inter's does. `scripts/check-fonts.mjs` prints axes and coverage and fails if a shipped file loses Latin-1 or its axes. The shipped files are Latin-1 subsets; Latin Extended-A is reported, not required, until a locale needs it. Fraunces, Instrument Serif and Bricolage Grotesque live under `fonts/alternates` for the face dial only.

## Icons

`src/lib/tokens/icon-list.json` names the Lucide subset and the stand-in per domain and shell surface. `scripts/build-icons.mjs` reads `lucide-static`, computes each glyph's drawn box and writes `src/lib/icons/icons.ts` (`ICONS`, `IconName`); `icons:check` guards drift. `Icon` normalises every glyph so its larger side fills 20 of the 24 grid units (scale 1 to 1.25, stroke unscaled) and renders the nodes as elements, not HTML. `domainGlyph(id)` in `domain-glyphs.ts` is the single place the Lucide stand-ins are swapped for the glyph family when it exists (D-17); ids are the plain domain ids, never display names.

## Component conventions

```svelte
<script lang="ts">
	import type { HTMLButtonAttributes } from 'svelte/elements'
	import type { IconName } from '$lib/icons/icons.js'
	import Icon from '$lib/icons/Icon.svelte'

	type Props = HTMLButtonAttributes & {
		/** Sentence-case verb. Omit only for an icon-only button, which then needs `aria-label`. */
		label?: string
		variant?: 'primary' | 'secondary' | 'quiet' | 'danger' | 'ai' | 'honey'
		/** lg is the 44 px mobile target; auto follows data-platform. */
		size?: 'md' | 'lg' | 'auto'
		icon?: IconName
	}
	let { label, variant = 'secondary', size = 'auto', icon, type = 'button', class: className = '', ...rest }: Props = $props()
</script>

<button class="ed-btn ed-btn-{variant} ed-btn-{size} {className}" {type} {...rest}>
	{#if icon}<Icon name={icon} size="sm" />{/if}{#if label}<span>{label}</span>{/if}
</button>

<style>
	.ed-btn { font: var(--ed-t-button); height: var(--ed-control); border-radius: var(--ed-radius-control); }
	.ed-btn:focus-visible { outline: 2px solid transparent; box-shadow: var(--focus-ring); }
</style>
```

| rule | why | enforced by |
|---|---|---|
| `<script lang="ts">`, `type Props` with a JSDoc line per prop, `class: className`, `...rest` typed from `svelte/elements` when the root is a native element | attachments and `aria-*` pass through; consumers get types | svelte-check, review |
| callback props and snippets; `$bindable` only where `ui-kit-components.md` says so | one data-flow convention | review |
| keyed `{#each}`; list props carry an `id` | stable identity, no duplicate-key crashes | ESLint `svelte/require-each-key` |
| `$derived` for derived state; `$effect` only to drive an imperative DOM API, tagged `// effect: imperative DOM` | no state syncing in effects | review |
| DOM measurement and window or document listeners only through `src/lib/internal` | one implementation of each behaviour | ESLint restricted syntax |
| scoped CSS naming only tokens and `--ed-*`; no pixel font sizes; no raw `--radius-*`; no `html[data-…]` | dials and themes reach every component | `scripts/lint-css.mjs` |
| no visible copy in a component except through `useStrings()`; no literal `aria-label` | translations stay outside the kit | `lint-css.mjs`, review |
| icon-only controls need an accessible name at the type level | never an icon name read aloud | TypeScript |
| module helpers in `<script module>`; ids from `$props.id()` | no instance exports, no randomness | svelte-check, ESLint |
| one `Icon` for every glyph; never an inline SVG for a utility icon | the normalised box | review |

## Internal primitives

`src/lib/internal` is not exported from the barrel.

| primitive | does |
|---|---|
| `anchor(get)` | positions a `position: fixed` element against an element or a pointer rect, flips when there is no room, clamps to the viewport, sets `data-side` |
| `dismiss(get)` | Escape, pointer outside, optional focus-out; keeps a stack of open layers so Escape closes the innermost and a click inside a layer above does not count as outside |
| `trapFocus(get)` | Tab cycling inside a layer and focus return; a `<dialog>` opened with `showModal()` makes the page inert and returns focus natively but does not cycle Tab, so `Sheet` uses the trap for the cycling only |
| `roving(get)` | one tab stop per group, arrows, Home and End, optional first-letter typeahead |
| `measure(cb)` | rect now, on resize and after fonts load |
| `portal(target)` | fallback for a WebView without the popover API, behind `hasTopLayer()` |
| `PausableTimer` | the toast's eight seconds, paused while hovered or focused |
| `platformOf(el)` | the nearest `data-platform`, desktop by default |

Overlays use the browser's top layer: `Sheet` is a `<dialog>` opened with `showModal()` (native inertness, focus return, `::backdrop` scrim; Escape is handled on keydown, with the dialog's `cancel` event as the fallback for other close requests); `Popover` is `popover="manual"` placed by `anchor`. The floor is WebKit 17 for `popover` and 17.5 for `@starting-style`; the enter animation degrades to a class toggle below that.

## Strings

`src/lib/i18n/strings.ts` holds every string the kit produces on its own, in English, typed as `UiStrings`. Components call `useStrings()`; an app wraps its root in `UiKitProvider` and passes translations (functions where a number or a name is interpolated), a new object on each locale change. Domain names, glyphs and content always arrive as props, and the app name is never in the kit (D-20).

## Storybook

Storybook (10.x, Svelte CSF) is the acceptance surface (D-45): `yarn storybook` from the root. Stories sit next to their component as `<Name>.stories.svelte`, one `<Story>` per state named after the state, args from `src/stories/sample-data.ts` (the typed mirror of `design/sample-data.md`), every callback a `fn()`.

The toolbar carries Theme, Accent, Brand, Face, Platform and Density. Platform defaults to "side by side": the `PlatformFrame` decorator renders the story twice, in a 1280-wide desktop canvas zoomed to fit and a 390 by 844 phone canvas with safe-area insets, each with its own `data-platform`. A story sets `parameters.platforms` to `['desktop']` or `['mobile']` to opt out of a frame, and `parameters.platformFrame: 'inline'` when it renders a top-layer overlay, which no frame can contain; those are compared across platforms with the toolbar and the phone viewport. Docs pages render inline.

Foundations pages render the tokens, the type specimens, the icon grid, the dials and the Tailwind mapping from the generated data, so they cannot drift from the code.

## Tests and gates

| command | runs | gate |
|---|---|---|
| `yarn format:check` | Prettier | no diff |
| `yarn lint` | ESLint 10 | zero warnings |
| `yarn check` | `svelte-check` and `lint-css` | zero errors |
| `tokens:check`, `icons:check`, `fonts:check` | the generators in check mode, the font coverage | no drift, no missing coverage |
| `yarn test` | Vitest: `unit` (node) plus `sb-desktop` and `sb-mobile`, which run every story as a browser test with its `play` function and an axe scan at `error` | all green |
| `yarn build` | `svelte-package` and `publint` | the package builds standalone |
| `yarn storybook:build` | the static gallery | builds |

CI (`.github/workflows/ci.yml`) runs them on every push. Visual baselines (`scripts/vrt.mjs`, `{light, dark} × {desktop, mobile}` per story) are generated on the owner's machine and committed; running them in CI is OQ-20.

Known tension: `text-tertiary` at 12 or 13 px in light sits at 3.3:1 and fails axe's colour-contrast rule. Components use it only where `design/visual-language.md` allows (metadata a reader can do without) and mark that element with `data-tertiary`, the one attribute the a11y config exempts from the contrast rule; nothing else is exempted.

## Not in the kit

Page-level compositions belong to the app scaffold: the settings modal and its tab rail, the command palette, onboarding pages, the Gardener composer and thread list, Council columns, the activity feed, the Garden's edit mode, the accent picker (OQ-18). The domain glyph family, the app icon and the splash art are design deliverables; `domainGlyph()` isolates the swap.
