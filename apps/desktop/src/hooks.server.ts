// The pre-paint script is inlined into app.html's <head> here, from the kit's generated file, so it can never drift
// from the generator; the app mark is inlined into the splash the same way, from the kit's drawing. With `ssr = false`
// the SPA fallback page is still rendered through this hook, in dev and when adapter-static writes build/index.html,
// which is the one document the shell ever loads.
import type { Handle } from '@sveltejs/kit'
import appMark from '@eden/ui-kit/app-mark.svg?raw'
import prepaint from '@eden/ui-kit/prepaint.js?raw'

export const handle: Handle = ({ event, resolve }) =>
	resolve(event, {
		transformPageChunk: ({ html }) => html.replace('%eden.prepaint%', prepaint).replace('%eden.mark%', appMark),
	})
