// The seam a bank provider plugs into (#73 binds Plaid here). Nothing binds it yet, so the page offers neither "Link a
// bank" nor "Reconnect". `link()` opens the provider's own flow and writes the `provider-link` row it makes;
// `reconnect()` signs a stale link in again and updates that same row, never a new one; `revoke()` tells the provider
// a link is gone, after the page has tombstoned it. Held in a rune so the page follows a bind.

export interface FinanceProvider {
	link(): void
	reconnect(linkId: string): void
	revoke(linkId: string): Promise<void>
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
