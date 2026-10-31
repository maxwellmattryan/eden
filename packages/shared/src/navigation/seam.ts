// The navigation seam: shared code never imports `$app/*`, so each app binds its own `goto`, `resolve` and `page`
// once (src/lib/navigation.ts, imported first by the root layout) and shared views and stores go through
// `navigation`. Plain TypeScript, so the barrel stays loadable by a test in Node. Unbound (a test, a module read
// before the layout), every read answers quietly: no href, no tab, an empty search, the Garden.
import type { BuiltDomainId } from '../manifest/types.js'
import { tabOf } from './places.js'

/** A place the shell can go to: its own, or a built domain's. */
export type PlaceId = 'garden' | 'today' | 'profile' | 'gardener' | 'more' | BuiltDomainId

export interface NavTarget {
	place: PlaceId
	/** The place's tab, where its route takes one. */
	tab?: string
	/** A query string as `auditSearch()` returns it, with or without its leading `?`. */
	search?: string
}

export interface NavOptions {
	replace?: boolean
	noScroll?: boolean
	keepFocus?: boolean
}

/** What the seam reads of SvelteKit's `page`. */
export interface NavPage {
	url: URL
	params: Record<string, string | undefined>
	route: { id: string | null }
}

export interface NavigationBinding {
	/** The app's `resolve()` over its own route tree, without the search; undefined for a place the app has not. */
	resolve(target: NavTarget): string | undefined
	goto(href: string, options?: NavOptions): Promise<void>
	/** `page` from `$app/state`; read inside a `$derived` it stays reactive. */
	page(): NavPage
}

let bound: NavigationBinding | undefined

/** Binds the app's router; the return value unbinds it (a test's cleanup). */
export function bindNavigation(binding: NavigationBinding): () => void {
	bound = binding
	return () => {
		if (bound === binding) bound = undefined
	}
}

function withSearch(path: string, search: string | undefined): string {
	const query = search?.replace(/^\?/, '')
	return query ? `${path}?${query}` : path
}

export const navigation = {
	/** The address of a target, search included; undefined while unbound or for a place the app has not. */
	href(target: NavTarget): string | undefined {
		const path = bound?.resolve(target)
		return path === undefined ? undefined : withSearch(path, target.search)
	},
	/** Goes to a target; does nothing while unbound or for a place the app has not. */
	async open(target: NavTarget, options?: NavOptions): Promise<void> {
		const href = navigation.href(target)
		if (href !== undefined) await bound?.goto(href, options)
	},
	/** The current route's `tab` parameter. */
	get tab(): string | undefined {
		return bound?.page().params.tab
	},
	/** The current address's query. */
	get search(): URLSearchParams {
		return bound?.page().url.searchParams ?? new URLSearchParams()
	},
	/** The tab the current route belongs to (`tabOf`). */
	get place(): string {
		return tabOf(bound?.page().route)
	},
}
