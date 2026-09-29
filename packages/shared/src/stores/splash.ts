import { writable } from 'svelte/store'
import { MIN_SPLASH_MS } from '../splash/index.js'

/**
 * Whether the splash is showing. It starts true, so the Svelte splash is up the moment the layout mounts and takes
 * over from the static copy in app.html.
 */
export const splashVisible = writable(true)

/** The app is ready: the splash fades out, once it has been up for its minimum time. */
export async function dismissSplash(): Promise<void> {
	const remaining = MIN_SPLASH_MS - performance.now()
	if (remaining > 0) await new Promise((resolve) => setTimeout(resolve, remaining))
	splashVisible.set(false)
}
