// The splash both apps paint (docs/design/brand.md, docs/engineering/app-scaffold.md): the app mark in the brand
// colour, the wordmark in the display face and the version, on the page surface. It is drawn twice, as in Crate: the
// static copy each app's hooks.server.ts inlines into app.html, painted before any script runs, and the Svelte
// SplashScreen that takes over at mount and fades out. Both wear the classes below, and the stylesheet here is inlined
// beside the static copy, because the SPA fallback page has no render-blocking stylesheet: the kit's variables do not
// exist yet on the first frame, so every value is resolved from the tokens and keyed on the attributes the pre-paint
// script has already put on <html>.
import { accents, colors, themes, typeStyles, type Theme } from '@eden/ui-kit/tokens'

/** The id of the static copy in app.html, which the Svelte splash removes when it mounts. */
export const SPLASH_ID = 'splash'

/** The class both copies wear. */
export const SPLASH_CLASS = 'eden-splash'

/** The least time the splash stays up, counted from the page's start, so a fast boot does not flash it. */
export const MIN_SPLASH_MS = 1000

/** How long the splash takes to fade out once the app is ready. */
export const SPLASH_FADE_MS = 400

/** The URLs of the two faces the splash is set in, as the app's bundler resolves them. */
export interface SplashFonts {
	/** Newsreader, the display face of the wordmark. */
	display: string
	/** Inter, the face of the version. */
	sans: string
}

// The stacks and the metric overrides are the kit's (theme.css), so the text does not move when its stylesheet lands.
const DISPLAY_STACK = '"Newsreader", "Noto Serif JP", Georgia, serif'
const SANS_STACK = '"Inter", system-ui, "Hiragino Sans", "Noto Sans JP", sans-serif'
const DISPLAY_WEIGHT = 500
const MARK_SIZE = 120
/** Above everything the kit layers, under the crash screen. */
const SPLASH_Z = 9998

const wordmark = typeStyles['display-xl']
const caption = typeStyles.caption

function themed(theme: Theme, rule: (selector: string) => string): string {
	return rule(theme === 'light' ? '' : `[data-theme="${theme}"]`)
}

/** The stylesheet of the splash, self-contained: the faces, the page canvas and the two copies' rules. */
export function splashStyle(fonts: SplashFonts): string {
	const rules = [
		`@font-face{font-family:"Newsreader";src:url("${fonts.display}") format("woff2");font-weight:200 800;font-style:normal;font-display:block;ascent-override:98%;descent-override:26%;line-gap-override:0%}`,
		`@font-face{font-family:"Inter";src:url("${fonts.sans}") format("woff2");font-weight:100 900;font-style:normal;font-display:block}`,
	]
	for (const theme of themes) {
		const c = colors[theme]
		// The page canvas, so nothing white shows behind the splash before the kit's stylesheet paints <body>.
		rules.push(themed(theme, (root) => `html${root}{background:${c['surface-0']}}`))
		rules.push(
			themed(
				theme,
				(root) =>
					`${root} .${SPLASH_CLASS}{background:${c['surface-0']};color:${c['text-primary']};--splash-mark:${c['brand-primary']};--splash-version:${c['text-secondary']}}`
			)
		)
		for (const accent of accents) {
			rules.push(
				themed(
					theme,
					(root) => `${root}[data-accent="${accent}"] .${SPLASH_CLASS}{--splash-mark:${c[`accent-${accent}`]}}`
				)
			)
		}
	}
	rules.push(
		`.${SPLASH_CLASS}{position:fixed;inset:0;z-index:${SPLASH_Z};display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px}`,
		`.${SPLASH_CLASS} svg.ed-app-mark{display:block;flex:none;width:${MARK_SIZE}px;height:${MARK_SIZE}px}`,
		`.${SPLASH_CLASS} .ed-app-mark .ed-app-mark-ink{fill:var(--splash-mark)}`,
		`.${SPLASH_CLASS}-name{font:${DISPLAY_WEIGHT} ${wordmark.size}px/${wordmark.lineHeight} ${DISPLAY_STACK};letter-spacing:${wordmark.tracking};font-variation-settings:"opsz" ${wordmark.opsz}}`,
		`.${SPLASH_CLASS}-version{font:${caption.weight} ${caption.size}px/${caption.lineHeight}px ${SANS_STACK};letter-spacing:${caption.tracking};color:var(--splash-version)}`
	)
	return rules.map((rule) => rule.trim()).join('\n')
}

/** What the static copy is made of. */
export interface SplashParts {
	/** The kit's app-mark.svg, as markup. */
	mark: string
	fonts: SplashFonts
	/** The version under the wordmark, as each app's vite.config.ts stamps it in PUBLIC_APP_VERSION. */
	version: string
	/** The app's name as the wordmark writes it. */
	name?: string
}

/** The static copy for app.html: the stylesheet and the splash itself. */
export function splashMarkup({ mark, fonts, version, name = 'Eden' }: SplashParts): string {
	return [
		`<style>${splashStyle(fonts)}</style>`,
		`<div id="${SPLASH_ID}" class="${SPLASH_CLASS}" aria-hidden="true">`,
		mark.trim(),
		`<span class="${SPLASH_CLASS}-name">${name}</span>`,
		`<span class="${SPLASH_CLASS}-version">v${version}</span>`,
		`</div>`,
	].join('')
}
