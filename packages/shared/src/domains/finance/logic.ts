// Orchard's logic (product/domains/finance.md): its store, its tool handlers and what its sample data seeds. What
// Orchard declares is in `./manifest.json`; its page is bound by each app (`src/lib/domains/finance/manifest.ts`). Its
// one tool so far is `read-statement` (#74), a page's own run; it has no quick actions or Garden tiles yet (#87,
// #90), and no `extras`, which come with the export work (#69).
import type { DomainLogic } from '../define.js'
import { finance } from './store.svelte.js'
import { financeTools } from './tools.js'

export const financeLogic: DomainLogic<'finance'> = {
	id: 'finance',
	load: () => finance.load(),
	reload: () => finance.reload(),
	seed: () => finance.seed(),
	tools: financeTools,
}
