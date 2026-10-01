// One web page, or one picture, fetched by the crate (`src-tauri/src/commands/web.rs`): the webview's CSP names the
// few hosts it may reach and CORS would refuse the rest, so a link the owner gives (a recipe to import, D-88; a
// picture for a stock item, D-91; a page for the Gardener to read, D-126, which may also be one the owner confirmed on
// its card) is fetched in Rust and its HTML or its bytes handed back to be read here. The crate
// enters each request in the egress ledger itself, under `web-page` or `web-image`, so nothing is recorded on this
// side.
import { invoke } from '@tauri-apps/api/core'
import { isTauri } from './tauri.js'

export interface FetchedPage {
	/** The address the page came from, after the redirects. */
	url: string
	/** The `Content-Type` as the server sent it. */
	contentType: string
	html: string
}

/** The codes a fetch is refused with; the message goes on after the code with detail for the diagnostics log. */
export const WEB_ERROR_CODES = [
	'web:unavailable',
	'web:invalid-url',
	'web:not-https',
	'web:blocked-host',
	'web:too-large',
	'web:not-html',
	'web:not-image',
	'web:too-many-redirects',
	'web:timeout',
	'web:failed',
] as const
export type WebErrorCode = (typeof WEB_ERROR_CODES)[number]

const CODE = /^(web:[a-z]+(?:-[a-z]+)*)(?::|$)/

/**
 * The page at an `https` address. It rejects with a message that starts with one of `WEB_ERROR_CODES`; a plain
 * browser (`yarn dev:web`) has no crate to fetch with and rejects with `web:unavailable`.
 */
export async function fetchPage(url: string): Promise<FetchedPage> {
	if (!isTauri()) throw new Error('web:unavailable: a page is fetched by the app, not by a browser')
	return invoke<FetchedPage>('fetch_page', { url })
}

/**
 * The picture at an `https` address, as its bytes: a JPEG, a PNG, a WebP or a site's `.ico` of five megabytes
 * at most. It rejects as
 * `fetchPage` does, with `web:not-image` for an address that is something else.
 */
export async function fetchImage(url: string): Promise<Uint8Array> {
	if (!isTauri()) throw new Error('web:unavailable: a picture is fetched by the app, not by a browser')
	return new Uint8Array(await invoke<ArrayBuffer>('fetch_image', { url }))
}

/** The `web:*` code an error starts with, or `web:failed` when it carries none. A command rejects with its message as
 * a string, so both an `Error` and a string are read. */
export function webErrorCode(error: unknown): string {
	const message = error instanceof Error ? error.message : typeof error === 'string' ? error : ''
	return CODE.exec(message)?.[1] ?? 'web:failed'
}
