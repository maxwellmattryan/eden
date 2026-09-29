/// <reference types="vite/client" />

interface ImportMetaEnv {
	/** Stamped by each app's vite.config.ts from the root package.json and EDEN_ENV. */
	readonly PUBLIC_APP_VERSION?: string
}
