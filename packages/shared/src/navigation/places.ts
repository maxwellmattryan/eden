// Where the owner is, for the shell to come back to: the last place, kept on the device so the next launch opens there,
// and each tab's scroll position for the session, so going back and forth between tabs lands where each was left.
// Neither is a setting (settings.snapshot walks its own keys only), so neither is in an export bundle. The module is
// pure: the shells hand it the pathnames and the scroll tops, and it reads localStorage with the same care the
// settings do.

/** The device's own record of the last pathname the shell was at. */
export const LAST_PLACE_KEY = 'eden:last-place'

function read(key: string): string | null {
	try {
		return typeof localStorage === 'undefined' ? null : localStorage.getItem(key)
	} catch {
		return null
	}
}

function write(key: string, value: string | null) {
	try {
		if (typeof localStorage === 'undefined') return
		if (value === null) localStorage.removeItem(key)
		else localStorage.setItem(key, value)
	} catch {
		// no storage: the next launch opens at the Garden
	}
}

/** Whether a pathname is one of the known places or a page under one (`/kitchen/recipes` under `/kitchen`). */
export function isKnownPlace(pathname: string, known: readonly string[]): boolean {
	return known.some((href) => pathname === href || pathname.startsWith(`${href}/`))
}

/** Records where the shell is, for the next launch. */
export function rememberPlace(pathname: string) {
	write(LAST_PLACE_KEY, pathname)
}

/** The remembered pathname while it is still a known place; undefined otherwise, and the shell opens at the Garden. */
export function lastPlace(known: readonly string[]): string | undefined {
	const place = read(LAST_PLACE_KEY)
	return place !== null && isKnownPlace(place, known) ? place : undefined
}

/** Where each tab was scrolled to, for this session. */
const scrolls = new Map<string, number>()

/** Keeps a tab's scroll position as the shell leaves it. */
export function rememberScroll(tab: string, top: number) {
	scrolls.set(tab, top)
}

/** The scroll position a tab was left at; the top for a tab never left. */
export function scrollOf(tab: string): number {
	return scrolls.get(tab) ?? 0
}

/** The tab a route belongs to: the first segment of its id, the Garden at the root. */
export function tabOf(route: { id: string | null } | null | undefined): string {
	return route?.id?.split('/')[1] || 'garden'
}
