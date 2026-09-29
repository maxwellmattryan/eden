import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { sveltekit } from '@sveltejs/kit/vite'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig, searchForWorkspaceRoot } from 'vite'

// `tauri ios|android dev` sets TAURI_DEV_HOST to the Mac's LAN address so a device can reach the dev server; on a
// simulator it is unset and Tauri forwards localhost. The port is fixed (1421, apart from desktop's 1420) because
// src-tauri/tauri.ios.conf.json and tauri.android.conf.json point their devUrl at it.
const host = process.env.TAURI_DEV_HOST

// The root package.json is the version's source of truth; About reads PUBLIC_APP_VERSION when the page is not a Tauri
// webview. EDEN_ENV adds the channel suffix a dev or staging build carries. Mirrors apps/desktop/vite.config.ts.
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
		port: 1421,
		strictPort: true,
		host: host || false,
		hmr: host ? { protocol: 'ws', host, port: 1430 } : undefined,
		watch: { ignored: ['**/src-tauri/**'] },
		// The kit's fonts are reached through the workspace symlink; SvelteKit's own allow list stops at the app.
		fs: { allow: [searchForWorkspaceRoot(process.cwd())] },
	},
})
