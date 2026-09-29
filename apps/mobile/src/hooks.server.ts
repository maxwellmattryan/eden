// The pre-paint script is inlined into app.html's <head> here, from the kit's generated file, so it can never drift
// from the generator; the splash is inlined the same way, from @eden/shared/splash: its own stylesheet, the kit's
// drawing of the app mark and the two faces it is set in, which Vite resolves to the URLs the app serves. With
// `ssr = false` the SPA fallback page is still rendered through this hook, in dev and when adapter-static writes
// build/index.html, which is the one document the shell ever loads.
import type { Handle } from '@sveltejs/kit'
import { env } from '$env/dynamic/public'
import appMark from '@eden/ui-kit/app-mark.svg?raw'
import sans from '@eden/ui-kit/fonts/Inter-Variable.woff2?url'
import display from '@eden/ui-kit/fonts/Newsreader-Variable.woff2?url'
import prepaint from '@eden/ui-kit/prepaint.js?raw'
import { splashMarkup } from '@eden/shared/splash'

export const handle: Handle = ({ event, resolve }) => {
	const splash = splashMarkup({
		mark: appMark,
		fonts: { display, sans },
		version: env.PUBLIC_APP_VERSION ?? '',
	})
	return resolve(event, {
		transformPageChunk: ({ html }) =>
			html.replace('%eden.prepaint%', () => prepaint).replace('%eden.splash%', () => splash),
	})
}
