// Orchard's logic (product/domains/finance.md): its store, and what its sample data seeds. What Orchard declares is in
// `./manifest.json`; its page is bound by each app (`src/lib/domains/finance/manifest.ts`). It has no tools, quick
// actions or Garden tiles yet (#87, #90), and no `extras`, which come with the export work (#69).
import type { DomainLogic } from '../define.js'
import { finance } from './store.svelte.js'

export const financeLogic: DomainLogic<'finance'> = {
	id: 'finance',
	load: () => finance.load(),
	reload: () => finance.reload(),
	seed: () => finance.seed(),
}
