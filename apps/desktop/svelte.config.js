// Tauri has no Node server for SSR, so adapter-static with an index.html fallback puts the app in SPA mode
// (https://v2.tauri.app/start/frontend/sveltekit/). The kit and the shared package arrive as workspace packages,
// consumed from source, so there is no alias to declare.
import adapter from '@sveltejs/adapter-static'
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte'

/** @type {import('@sveltejs/kit').Config} */
const config = {
	preprocess: vitePreprocess(),
	kit: {
		adapter: adapter({ fallback: 'index.html' }),
	},
}

export default config
