// tokens.json → theme.css, base.css, tailwind.css, faces.css, prepaint.js, preview-head.html, tokens.ts, tokens-report.md.
// `--check` regenerates in memory and fails if any output on disk differs, so tokens change only through tokens.json.
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { contrast, grade, mix } from './lib/color.mjs'

const pkg = join(dirname(fileURLToPath(import.meta.url)), '..')
const check = process.argv.includes('--check')
const T = JSON.parse(readFileSync(join(pkg, 'src/lib/tokens/tokens.json'), 'utf8'))
const THEMES = T.color.themes.map((t) => t.id)

// ---------------------------------------------------------------- helpers
const isThemed = (v) => v !== null && typeof v === 'object' && !Array.isArray(v) && THEMES.some((t) => t in v)
const isRole = (v) => v !== null && typeof v === 'object' && 'family' in v
const refRe = /\{([a-z0-9-]+)\}/g
/** `{name}` → `var(--name)` */
const css = (v) => (typeof v === 'string' ? v.replace(refRe, (_, n) => `var(--${n})`) : String(v))
const tracking = (v) => (v === '0' || v === 0 ? '0em' : css(v))
const fail = (msg) => {
	console.error(`build-tokens: ${msg}`)
	process.exit(1)
}

// Every custom property the outputs define, so references can be validated.
const known = new Set()
const knownRefs = new Set()
const noteRefs = (v) => {
	if (typeof v === 'string') for (const m of v.matchAll(refRe)) knownRefs.add(m[1])
	else if (v && typeof v === 'object') Object.values(v).forEach(noteRefs)
}

// Colour lookup that resolves aliases per theme, for the report and for build-time decisions.
const colorByName = new Map()
for (const c of T.color.tokens) colorByName.set(c.name, { ...c, prefix: '' })
for (const c of T.color.helpers) colorByName.set('ed-' + c.name, { ...c, prefix: 'ed-' })
function resolveColor(nameOrValue, theme) {
	let v = nameOrValue
	for (let i = 0; i < 10; i++) {
		if (typeof v === 'string') {
			const m = v.match(/^\{([a-z0-9-]+)\}$/)
			if (m) {
				const t = colorByName.get(m[1])
				if (!t) fail(`unknown colour reference ${v}`)
				v = t.value
				continue
			}
			if (v.startsWith('#') || v.startsWith('rgb')) return v
			if (colorByName.has(v)) {
				v = colorByName.get(v).value
				continue
			}
			fail(`cannot resolve colour value "${v}"`)
		}
		if (isThemed(v)) {
			v = v[theme]
			continue
		}
		if (colorByName.has(v)) {
			v = colorByName.get(v).value
			continue
		}
		fail(`cannot resolve colour ${JSON.stringify(nameOrValue)}`)
	}
	fail(`alias loop at ${JSON.stringify(nameOrValue)}`)
}

// ---------------------------------------------------------------- validation
const names = new Set()
const unique = (n, where) => {
	if (names.has(n)) fail(`duplicate token name "${n}" (${where})`)
	names.add(n)
}
T.color.tokens.forEach((c) => (unique(c.name, 'color'), known.add(c.name)))
T.color.helpers.forEach((c) => (unique('ed-' + c.name, 'color.helpers'), known.add('ed-' + c.name)))
for (const section of ['spacing', 'radius', 'size', 'shadow'])
	T[section].tokens.forEach((t) => (unique(t.name, section), known.add(t.name)))
T.motion.tokens.forEach((t) => (unique('ed-' + t.name, 'motion'), known.add('ed-' + t.name)))
T.z.tokens.forEach((t) => (unique('ed-z-' + t.name, 'z'), known.add('ed-z-' + t.name)))
;[
	'ed-font-display',
	'ed-font-sans',
	'ed-font-mono',
	'ed-display-weight',
	'ed-display-tracking',
	'ed-display-italic',
	'focus-ring',
].forEach((n) => known.add(n))

const scale = new Set(T.type.scale)
const styles = T.type.groups.flatMap((g) => g.styles.map((s) => ({ ...s, family: g.family })))
for (const s of styles) {
	unique('ed-t-' + s.name, 'type')
	known.add('ed-t-' + s.name)
	if (!scale.has(parseFloat(s.fontSize)))
		fail(`type style "${s.name}" uses ${s.fontSize}, which is off the scale ${[...scale].join(', ')}`)
}
for (const [level, vars] of Object.entries(T.dials.brand.levels))
	for (const [k, v] of Object.entries(vars)) {
		known.add('ed-' + k)
		if (isRole(v) && !scale.has(parseFloat(v.size)))
			fail(`brand level "${level}" role "${k}" uses ${v.size}, off the scale`)
	}
for (const vars of Object.values(T.platform.vars)) for (const k of Object.keys(vars)) known.add('ed-' + k)
;['ed-safe-top', 'ed-safe-right', 'ed-safe-bottom', 'ed-safe-left'].forEach((n) => known.add(n))
noteRefs(T)
for (const r of knownRefs) if (!known.has(r)) fail(`reference {${r}} does not name any emitted variable`)

// ---------------------------------------------------------------- accents
const accents = T.color.tokens
	.filter((c) => c.name.startsWith('accent-'))
	.map((c) => ({ id: c.name.slice(7), token: c }))
const defaultAccent = accents.find((a) =>
	THEMES.every((th) => resolveColor(a.token.value, th) === resolveColor('brand-primary', th))
)
if (!defaultAccent)
	fail('no accent-* token equals brand-primary in both themes; the default accent must be one of the ten')
const derivation = T.color.derivation
const onBrandFor = (accentHex, theme) => {
	const candidates = derivation.onBrand[theme].map((c) => resolveColor(c, theme))
	return candidates.map((c) => ({ c, r: contrast(c, accentHex) })).sort((a, b) => b.r - a.r)[0]
}
const derivedHover = (accentHex, theme) =>
	mix(accentHex, resolveColor(derivation.hover.mixWith, theme), derivation.hover.accentShare)
const derivedMuted = (accentHex, theme) => {
	const base = isThemed(derivation.muted.mixWith) ? derivation.muted.mixWith[theme] : derivation.muted.mixWith
	return mix(accentHex, resolveColor(base, theme), derivation.muted.accentShare)
}

// ---------------------------------------------------------------- emitters
const banner = (what) =>
	`/* GENERATED by scripts/build-tokens.mjs from src/lib/tokens/tokens.json: ${what}. Do not edit; change tokens.json and run \`yarn tokens\`. */\n`
const block = (selector, decls) => `${selector} {\n${decls.map((d) => `\t${d};`).join('\n')}\n}\n`
const fontFace = (f, dir) => {
	const d = [
		`font-family: "${f.family}"`,
		`src: url("${dir}${f.file}") format("woff2")`,
		`font-weight: ${f.weight}`,
		`font-style: ${f.style}`,
		'font-display: swap',
	]
	if (f.metrics)
		d.push(
			`ascent-override: ${f.metrics.ascentOverride}`,
			`descent-override: ${f.metrics.descentOverride}`,
			`line-gap-override: ${f.metrics.lineGapOverride}`
		)
	return block('@font-face', d)
}
const themeValue = (v, theme) => css(isThemed(v) ? v[theme] : v)

/** A type role or style as the declarations for --ed-t-<name>, --ed-t-<name>-opsz and --ed-t-<name>-tracking. */
function typeDecls(name, s) {
	const family = `var(--ed-font-${s.family})`
	const weight = css(s.weight ?? s.fontWeight)
	const style = s.fontStyle ? css(s.fontStyle) + ' ' : ''
	const size = s.size ?? s.fontSize
	const line = s.lineHeight
	const decls = [`--ed-t-${name}: ${style}${weight} ${size}/${line} ${family}`]
	const opsz = s.opsz ?? s.opticalSize
	decls.push(`--ed-t-${name}-opsz: ${opsz ? `"opsz" ${opsz}` : 'normal'}`)
	let track = s.tracking ?? s.letterSpacing
	if (s.family === 'display' && (track === undefined || track === '0' || track === 0 || track === '0em'))
		track = '{ed-display-tracking}'
	if (
		s.family === 'display' &&
		track !== undefined &&
		track !== '{ed-display-tracking}' &&
		!/\{ed-display-tracking\}/.test(String(track))
	)
		track = `calc(${tracking(track)} + var(--ed-display-tracking))`
	decls.push(`--ed-t-${name}-tracking: ${track === undefined ? 'normal' : tracking(track)}`)
	return decls
}
const typeClass = (name) =>
	block(`.ed-t-${name}`, [
		`font: var(--ed-t-${name})`,
		`letter-spacing: var(--ed-t-${name}-tracking, normal)`,
		`font-variation-settings: var(--ed-t-${name}-opsz, normal)`,
	])

// ---- theme.css
function themeCss() {
	let out = banner('themes, accents, fonts and the type scale')
	out +=
		'\n/* Fonts: self-hosted, OFL. Newsreader carries the metric overrides that put its baseline where Inter sits. */\n'
	for (const f of T.type.fonts.shipped) out += fontFace(f, '../fonts/')
	for (const theme of THEMES) {
		const decls = []
		for (const c of T.color.tokens) decls.push(`--${c.name}: ${themeValue(c.value, theme)}`)
		for (const c of T.color.helpers) decls.push(`--ed-${c.name}: ${themeValue(c.value, theme)}`)
		for (const s of T.shadow.tokens) decls.push(`--${s.name}: ${themeValue(s.value, theme)}`)
		decls.push(`color-scheme: ${theme}`)
		const selector = theme === THEMES[0] ? `:root, [data-theme="${theme}"]` : `[data-theme="${theme}"]`
		out += `\n/* ${T.color.themes.find((t) => t.id === theme).name} */\n` + block(selector, decls)
	}
	const root = []
	for (const s of T.spacing.tokens) root.push(`--${s.name}: ${s.value}`)
	for (const s of T.radius.tokens) root.push(`--${s.name}: ${s.value}`)
	for (const s of T.size.tokens) root.push(`--${s.name}: ${s.value}`)
	root.push(
		`--focus-ring: 0 0 0 var(--focus-ring-offset) var(--surface-0), 0 0 0 calc(var(--focus-ring-offset) + var(--focus-ring-width)) var(--brand-primary)`
	)
	for (const m of T.motion.tokens) root.push(`--ed-${m.name}: ${m.value}`)
	for (const z of T.z.tokens) root.push(`--ed-z-${z.name}: ${z.value}`)
	for (const [k, v] of Object.entries(T.type.families)) root.push(`--ed-font-${k}: ${v}`)
	const face = T.dials.face.faces[T.dials.face.default]
	root.push(
		`--ed-display-weight: ${face.weight}`,
		`--ed-display-tracking: ${tracking(face.tracking)}`,
		`--ed-display-italic: ${face.italic}`
	)
	for (const s of styles) root.push(...typeDecls(s.name, s))
	out +=
		'\n/* Scales, motion, the focus ring (composed, so it follows the accent), families and the type styles */\n' +
		block(':root', root)

	out +=
		'\n/* Accents: data-accent replaces the brand triplet. Moss repeats the hand-tuned tokens; the others derive hover, muted and on-brand by the rule in tokens.json. */\n'
	for (const a of accents) {
		for (const theme of THEMES) {
			const accentHex = resolveColor(a.token.value, theme)
			const decls = [`--brand-primary: ${accentHex}`]
			if (a === defaultAccent) {
				decls.push(
					`--brand-hover: ${resolveColor('brand-hover', theme)}`,
					`--brand-muted: ${resolveColor('brand-muted', theme)}`,
					`--on-brand: ${resolveColor('on-brand', theme)}`
				)
			} else {
				const mutedBase = isThemed(derivation.muted.mixWith)
					? derivation.muted.mixWith[theme]
					: derivation.muted.mixWith
				decls.push(
					`--brand-hover: color-mix(in srgb, ${accentHex} ${derivation.hover.accentShare * 100}%, ${css(derivation.hover.mixWith)})`,
					`--brand-muted: color-mix(in srgb, ${accentHex} ${derivation.muted.accentShare * 100}%, ${css(mutedBase)})`,
					`--on-brand: ${onBrandFor(accentHex, theme).c}`
				)
			}
			const selector =
				theme === THEMES[0]
					? `[data-accent="${a.id}"]`
					: `[data-theme="${theme}"][data-accent="${a.id}"], [data-theme="${theme}"] [data-accent="${a.id}"]`
			out += block(selector, decls)
		}
	}
	out +=
		'\n/* One class per type style, for app markup and the specimen page. Components use the variables directly. */\n'
	for (const s of styles) out += typeClass(s.name)
	out += typeClass('button') + typeClass('title-sm')
	return out
}

// ---- base.css
function baseCss() {
	let out = banner('the brand, platform and density dials, and the rules every surface shares')
	out += '\n/* Reduced motion: colour fades stay, movement goes. */\n'
	out += `@media (prefers-reduced-motion: reduce) {\n${block(
		'\t:root',
		T.motion.reducedMotion.map((n) => `--ed-${n}: 0ms`)
	)
		.replace(/\n\t/g, '\n\t\t')
		.replace(/\n}/, '\n\t}')}}\n`

	out += `\n/* Brand presence (data-brand): ${T.dials.brand.levels ? Object.keys(T.dials.brand.levels).join(', ') : ''}; default ${T.dials.brand.default}. Components read only these --ed-* variables. */\n`
	const levelDecls = (vars, theme) => {
		const decls = []
		for (const [k, v] of Object.entries(vars)) {
			if (isRole(v)) {
				if (theme === THEMES[0]) decls.push(...typeDecls(k.replace(/^t-/, ''), v))
			} else if (isThemed(v)) decls.push(`--ed-${k}: ${css(v[theme])}`)
			else if (theme === THEMES[0]) decls.push(`--ed-${k}: ${css(v)}`)
		}
		return decls
	}
	const order = [T.dials.brand.default, ...Object.keys(T.dials.brand.levels).filter((l) => l !== T.dials.brand.default)]
	for (const level of order) {
		const vars = T.dials.brand.levels[level]
		const isDefault = level === T.dials.brand.default
		out += block(isDefault ? `:root, [data-brand="${level}"]` : `[data-brand="${level}"]`, levelDecls(vars, THEMES[0]))
		for (const theme of THEMES.slice(1)) {
			const dark = levelDecls(vars, theme)
			if (!dark.length) continue
			const own = `[data-theme="${theme}"][data-brand="${level}"], [data-theme="${theme}"] [data-brand="${level}"]`
			out += block(isDefault ? `[data-theme="${theme}"], ${own}` : own, dark)
		}
	}

	out += `\n/* Platform (data-platform): ${Object.keys(T.platform.vars).join(', ')}; default ${T.platform.default}. Safe-area insets are read once here. */\n`
	out += block(
		':root',
		['top', 'right', 'bottom', 'left'].map((s) => `--ed-safe-${s}: env(safe-area-inset-${s}, 0px)`)
	)
	for (const [p, vars] of Object.entries(T.platform.vars)) {
		const decls = Object.entries(vars).map(([k, v]) => `--ed-${k}: ${css(v)}`)
		out += block(p === T.platform.default ? `:root, [data-platform="${p}"]` : `[data-platform="${p}"]`, decls)
	}
	out += `\n/* Density (data-density), desktop only */\n`
	for (const [d, vars] of Object.entries(T.density.vars)) {
		if (d === T.density.default) continue
		out += block(
			`[data-density="${d}"]:not([data-platform="mobile"])`,
			Object.entries(vars).map(([k, v]) => `--ed-${k}: ${css(v)}`)
		)
	}

	out += '\n/* Base rules */\n'
	out += block('body', [
		'margin: 0',
		'background: var(--surface-0)',
		'color: var(--text-primary)',
		'font: var(--ed-t-text)',
		'-webkit-font-smoothing: antialiased',
		'position: relative',
		'isolation: isolate',
	])
	out += block('::selection', ['background: var(--brand-muted)', 'color: var(--text-primary)'])
	out +=
		'\n/* Paper grain at lush (D-42): a fixed layer between the page colour and the content, never over text at a legible opacity. .ed-canvas frames paint their own. */\n'
	out += block('body::before, .ed-canvas::before', [
		'content: ""',
		'position: fixed',
		'inset: 0',
		'z-index: -1',
		'pointer-events: none',
		'background-image: var(--ed-grain)',
		'opacity: var(--ed-grain-opacity)',
		'mix-blend-mode: multiply',
	])
	out += block('.ed-canvas', [
		'position: relative',
		'isolation: isolate',
		'background: var(--surface-0)',
		'color: var(--text-primary)',
	])
	out += block('.ed-canvas::before', ['position: absolute'])
	out += block(
		'[data-theme="dark"] body::before, [data-theme="dark"] .ed-canvas::before, [data-theme="dark"].ed-canvas::before',
		['mix-blend-mode: screen']
	)
	out += '\n/* Visually hidden, for text that only assistive technology needs */\n'
	out += block('.ed-sr-only', [
		'position: absolute',
		'width: 1px',
		'height: 1px',
		'padding: 0',
		'margin: -1px',
		'overflow: hidden',
		'clip-path: inset(50%)',
		'white-space: nowrap',
		'border: 0',
	])
	return out
}

// ---- tailwind.css
function tailwindCss() {
	const decls = ['--color-*: initial']
	for (const c of T.color.tokens) decls.push(`--color-${c.name}: var(--${c.name})`)
	decls.push('--color-brand: var(--brand-primary)')
	for (const k of Object.keys(T.type.families)) decls.push(`--font-${k}: var(--ed-font-${k})`)
	for (const s of styles) {
		decls.push(
			`--text-${s.name}: ${s.fontSize}`,
			`--text-${s.name}--line-height: ${typeof s.lineHeight === 'number' ? s.lineHeight : s.lineHeight}`
		)
		const w = css(s.fontWeight)
		decls.push(`--text-${s.name}--font-weight: ${w}`)
		if (s.letterSpacing) decls.push(`--text-${s.name}--letter-spacing: ${s.letterSpacing}`)
	}
	decls.push('--radius-*: initial')
	for (const r of T.radius.tokens) {
		const short = r.name.replace(/^radius-/, '')
		decls.push(`--radius-${short}: ${short === 'full' ? r.value : `var(--ed-radius-${short})`}`)
	}
	decls.push('--shadow-*: initial')
	for (const s of T.shadow.tokens) decls.push(`--${s.name}: var(--${s.name})`)
	decls.push(`--spacing: ${T.spacing.tokens[0].value}`)
	decls.push('--breakpoint-*: initial')
	for (const b of T.breakpoints.tokens) decls.push(`--breakpoint-${b.name}: ${b.value}px`)
	decls.push('--ease-eden: var(--ed-ease-out)')
	let out = banner('the Tailwind 4 mapping; apps import it after `@import "tailwindcss"` and the kit CSS')
	out +=
		'\n/* `inline` makes utilities reference the runtime variables (bg-brand → background-color: var(--brand-primary)), so accents switch without recompiling. The Tailwind palette is wiped: there is no bg-red-500. */\n'
	out += block('@theme inline', decls)
	out += '\n@custom-variant dark (&:where([data-theme="dark"], [data-theme="dark"] *));\n'
	out += '@custom-variant mobile (&:where([data-platform="mobile"], [data-platform="mobile"] *));\n'
	out += '@custom-variant compact (&:where([data-density="compact"], [data-density="compact"] *));\n'
	return out
}

// ---- faces.css (gallery only)
function facesCss() {
	let out = banner('the display-face dial (data-face), for Storybook only; the app ships Newsreader alone (D-39)')
	for (const f of T.type.fonts.gallery) out += fontFace(f, '../fonts/')
	for (const [id, f] of Object.entries(T.dials.face.faces))
		out += block(`[data-face="${id}"]`, [
			`--ed-font-display: ${f.family}`,
			`--ed-display-weight: ${f.weight}`,
			`--ed-display-tracking: ${tracking(f.tracking)}`,
			`--ed-display-italic: ${f.italic}`,
		])
	return out
}

// ---- prepaint.js
function prepaintJs() {
	const ids = JSON.stringify(accents.map((a) => a.id))
	const brands = JSON.stringify(Object.keys(T.dials.brand.levels))
	return `// GENERATED by scripts/build-tokens.mjs. The pre-paint script: run it as a blocking <script> in <head>, before the stylesheets
// are applied, so the first frame already carries the owner's theme, accent, brand level and font. It reads the eden:* keys the
// settings store writes and never sets data-face (a gallery-only dial). "system" resolves here; the app re-resolves on change.
;(function () {
	try {
		var root = document.documentElement
		var store = window.localStorage
		var theme = store.getItem('eden:theme') || 'system'
		if (theme !== 'light' && theme !== 'dark')
			theme = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
		root.setAttribute('data-theme', theme)
		var accent = store.getItem('eden:accent')
		if (accent && ${ids}.indexOf(accent) !== -1) root.setAttribute('data-accent', accent)
		var brand = store.getItem('eden:brand')
		if (brand && ${brands}.indexOf(brand) !== -1) root.setAttribute('data-brand', brand)
		var font = store.getItem('eden:font')
		if (font) root.setAttribute('data-font', font)
		if (store.getItem('eden:density') === 'compact') root.setAttribute('data-density', 'compact')
	} catch (e) {
		/* no storage, no attributes: the stylesheet defaults are light, moss, lush */
	}
})()
`
}

const previewHead = () =>
	`<!-- GENERATED by scripts/build-tokens.mjs: the same pre-paint script the apps run, inlined for Storybook. -->\n<script>\n${prepaintJs().replace(/^\/\/.*\n/gm, '')}</script>\n`

// ---- tokens.ts
function tokensTs() {
	const lit = (arr) => `[${arr.map((v) => JSON.stringify(v)).join(', ')}] as const`
	const colors = Object.fromEntries(
		THEMES.map((th) => [th, Object.fromEntries(T.color.tokens.map((c) => [c.name, resolveColor(c.value, th)]))])
	)
	const typeStyles = Object.fromEntries(
		styles.map((s) => [
			s.name,
			{
				family: s.family,
				size: parseFloat(s.fontSize),
				lineHeight: typeof s.lineHeight === 'number' ? s.lineHeight : parseFloat(s.lineHeight),
				weight: typeof s.fontWeight === 'number' ? s.fontWeight : 'display',
				...(s.opticalSize ? { opsz: s.opticalSize } : {}),
				...(s.letterSpacing ? { tracking: s.letterSpacing } : {}),
				...(s.fontStyle ? { italic: true } : {}),
				sample: s.sample ?? '',
				usage: s.usage ?? '',
			},
		])
	)
	const px = (arr) => Object.fromEntries(arr.map((t) => [t.name, t.value]))
	return `// GENERATED by scripts/build-tokens.mjs from tokens.json. Do not edit; run \`yarn tokens\`.

export const themes = ${lit(THEMES)}
export type Theme = (typeof themes)[number]

export const accents = ${lit(accents.map((a) => a.id))}
export type Accent = (typeof accents)[number]

export const brandLevels = ${lit(Object.keys(T.dials.brand.levels))}
export type BrandLevel = (typeof brandLevels)[number]

export const faces = ${lit(Object.keys(T.dials.face.faces))}
export type Face = (typeof faces)[number]

export const platforms = ${lit(Object.keys(T.platform.vars))}
export type Platform = (typeof platforms)[number]

export const densities = ${lit(Object.keys(T.density.vars))}
export type Density = (typeof densities)[number]

export const typeStyleNames = ${lit(styles.map((s) => s.name))}
export type TypeStyle = (typeof typeStyleNames)[number]

export const colorTokenNames = ${lit(T.color.tokens.map((c) => c.name))}
export type ColorToken = (typeof colorTokenNames)[number]

export const defaults = {
	theme: ${JSON.stringify(THEMES[0])},
	accent: ${JSON.stringify(defaultAccent.id)},
	brand: ${JSON.stringify(T.dials.brand.default)},
	face: ${JSON.stringify(T.dials.face.default)},
	platform: ${JSON.stringify(T.platform.default)},
	density: ${JSON.stringify(T.density.default)},
} as const

/** Resolved colour values per theme (aliases followed), for swatches and tests. The CSS is the runtime source. */
export const colors = ${JSON.stringify(colors, null, '\t')} as const satisfies Record<Theme, Record<ColorToken, string>>

export const typeStyles = ${JSON.stringify(typeStyles, null, '\t')} as const

export const spacing = ${JSON.stringify(px(T.spacing.tokens), null, '\t')} as const
export const radius = ${JSON.stringify(px(T.radius.tokens), null, '\t')} as const
export const sizes = ${JSON.stringify(px(T.size.tokens), null, '\t')} as const
export const motion = ${JSON.stringify(px(T.motion.tokens), null, '\t')} as const
export const zIndex = ${JSON.stringify(px(T.z.tokens), null, '\t')} as const
export const breakpoints = ${JSON.stringify(px(T.breakpoints.tokens), null, '\t')} as const

/** localStorage keys the pre-paint script and the settings store share. */
export const storageKeys = {
	theme: 'eden:theme',
	accent: 'eden:accent',
	brand: 'eden:brand',
	font: 'eden:font',
	density: 'eden:density',
} as const
`
}

// ---- tokens-report.md
function report() {
	const fmt = (r) => `${r.toFixed(2)}:1`
	const line = (label, fg, bg, size = 'text') => {
		const r = contrast(fg, bg)
		const g = grade(r)
		const ok = size === 'text' ? r >= 4.5 : r >= 3
		return `| ${label} | \`${fg}\` on \`${bg}\` | ${fmt(r)} | ${g}${ok ? '' : ' ⚠'} |`
	}
	let out = `<!-- GENERATED by scripts/build-tokens.mjs from tokens.json. Do not edit. -->\n\n# Contrast report\n\nWCAG 2 ratios measured on the token values. "text" needs 4.5:1, "large" and "non-text" need 3:1; ⚠ marks a miss. Derived values (hover, muted, on-brand for the non-default accents) are computed with the same sRGB mix the CSS uses.\n`
	for (const theme of THEMES) {
		out += `\n## ${T.color.themes.find((t) => t.id === theme).name} (\`${theme}\`)\n\n### Documented pairs\n\n| pair | values | ratio | grade |\n|---|---|---|---|\n`
		for (const p of T.contrast.pairs) {
			const size = p.size === 'small' ? 'text' : p.size === 'large' || p.size === 'non-text' ? 'large' : 'text'
			out +=
				line(
					`${p.fg} on ${p.bg}${p.size ? ` (${p.size})` : ''}`,
					resolveColor(p.fg, theme),
					resolveColor(p.bg, theme),
					size
				) + '\n'
		}
		out += `\n### Accents\n\n| accent | as text on surface-0 | as text on surface-1 | fill under on-brand | hover on surface-0 | text-primary on muted |\n|---|---|---|---|---|---|\n`
		for (const a of accents) {
			const hexA = resolveColor(a.token.value, theme)
			const isDef = a === defaultAccent
			const hover = isDef ? resolveColor('brand-hover', theme) : derivedHover(hexA, theme)
			const muted = isDef ? resolveColor('brand-muted', theme) : derivedMuted(hexA, theme)
			const onb = isDef
				? { c: resolveColor('on-brand', theme), r: contrast(resolveColor('on-brand', theme), hexA) }
				: onBrandFor(hexA, theme)
			const cell = (r, need = 4.5) => `${fmt(r)}${r < need ? ' ⚠' : ''}`
			const s0 = resolveColor('surface-0', theme)
			const s1 = resolveColor('surface-1', theme)
			const tp = resolveColor('text-primary', theme)
			out += `| ${a.id}${isDef ? ' (default)' : ''} \`${hexA}\` | ${cell(contrast(hexA, s0))} | ${cell(contrast(hexA, s1))} | \`${onb.c}\` ${cell(onb.r)} | \`${hover}\` ${cell(contrast(hover, s0))} | \`${muted}\` ${cell(contrast(tp, muted))} |\n`
		}
		const hexM = resolveColor(defaultAccent.token.value, theme)
		out += `\nIf moss followed the derivation rule instead of its hand-tuned tokens it would get hover \`${derivedHover(hexM, theme)}\` (tuned \`${resolveColor('brand-hover', theme)}\`) and muted \`${derivedMuted(hexM, theme)}\` (tuned \`${resolveColor('brand-muted', theme)}\`).\n`
	}
	return out
}

// ---------------------------------------------------------------- write or check
const outputs = {
	'src/lib/styles/theme.css': themeCss(),
	'src/lib/styles/base.css': baseCss(),
	'src/lib/styles/tailwind.css': tailwindCss(),
	'src/lib/styles/faces.css': facesCss(),
	'src/lib/styles/prepaint.js': prepaintJs(),
	'.storybook/preview-head.html': previewHead(),
	'src/lib/tokens/tokens.ts': tokensTs(),
	'src/lib/tokens/tokens-report.md': report(),
}
let drift = 0
for (const [rel, content] of Object.entries(outputs)) {
	const path = join(pkg, rel)
	if (check) {
		if (!existsSync(path) || readFileSync(path, 'utf8') !== content) {
			drift++
			console.error(`build-tokens --check: ${rel} is out of date`)
		}
	} else {
		writeFileSync(path, content)
		console.log(`wrote ${relative(process.cwd(), path)} (${content.length} bytes)`)
	}
}
if (check) {
	if (drift) process.exit(1)
	console.log(`build-tokens --check: ${Object.keys(outputs).length} outputs up to date.`)
}
