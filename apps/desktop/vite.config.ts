import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { sveltekit } from '@sveltejs/kit/vite'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig, searchForWorkspaceRoot } from 'vite'

// `tauri dev` sets TAURI_DEV_HOST to the machine's LAN address when a device needs to reach the dev server; unset, the
// server stays on localhost. The port is fixed because src-tauri/tauri.conf.json's devUrl points at it.
const host = process.env.TAURI_DEV_HOST

// The root package.json is the version's source of truth; app.html shows it in the splash through
// %sveltekit.env.PUBLIC_APP_VERSION% and the About tab reads it when the page is not a Tauri webview. EDEN_ENV adds
// the channel suffix a dev or staging build carries.
const pkg = JSON.parse(readFileSync(fileURLToPath(new URL('../../package.json', import.meta.url)), 'utf-8'))
const env = process.env.EDEN_ENV
if (env === 'staging') {
	process.env.PUBLIC_APP_VERSION = pkg.version.includes('-staging') ? pkg.version : `${pkg.version}-staging`
} else if (!env || env === 'development') {
	process.env.PUBLIC_APP_VERSION = `${pkg.version}-dev`
} else {
	process.env.PUBLIC_APP_VERSION = pkg.version
}

export default defineConfig({
	plugins: [sveltekit(), tailwindcss()],
	clearScreen: false,
	server: {
		port: 1420,
		strictPort: true,
		host: host || false,
		hmr: host ? { protocol: 'ws', host, port: 1421 } : undefined,
		watch: { ignored: ['**/src-tauri/**'] },
		// The kit's fonts are reached through the workspace symlink; SvelteKit's own allow list stops at the app, so the
		// repo root is added or the woff2 requests come back 403 in dev.
		fs: { allow: [searchForWorkspaceRoot(process.cwd())] },
	},
})
