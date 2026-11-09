// The seam a bank provider plugs into: the desktop and iOS bind Plaid here (`plaid.svelte.ts`, D-203); Android and a
// plain browser bind nothing, so their page offers neither "Link a bank" nor "Reconnect". `link()` opens the provider's own flow
// and writes the `provider-link` row it makes; `reconnect()` signs a stale link in again and updates that same row,
// never a new one; `revoke()` tells the provider a link is gone, after the page has tombstoned it; `credentials()`
// opens the provider's keys. Held in a rune so the page follows a bind.

export interface FinanceProvider {
	/** The provider's name, for its keys button: "Plaid". */
	readonly name: string
	/** A test environment: the page offers `resetLogin` on each link. */
	readonly sandbox: boolean
	/** A bank's flow, or with `brokerage` one that asks for investments first, so an investments-only one links. */
	link(kind?: 'bank' | 'brokerage'): void
	reconnect(linkId: string): void
	revoke(linkId: string): Promise<void>
	credentials(): void
	/** Sandbox only: the link asks for a sign-in again, which proves the reconnect path. */
	resetLogin(linkId: string): Promise<void>
}

class ProviderSeam {
	bound = $state<FinanceProvider | undefined>(undefined)
}

const seam = new ProviderSeam()

/** The provider the page offers, if any. */
export const provider: { readonly bound: FinanceProvider | undefined } = seam

/** Binds a provider; the answer unbinds it, if it is still the one bound. */
export function bindProvider(next: FinanceProvider): () => void {
	seam.bound = next
	return () => {
		if (seam.bound === next) seam.bound = undefined
	}
}
