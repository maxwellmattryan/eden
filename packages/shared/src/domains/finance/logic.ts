// Orchard's logic (product/domains/finance.md): its store, what its sample data seeds, the bill pass on its morning
// schedule, its tools (`finance.draft`, #78; `finance.read-statement`, #74) and the surface a bill's draft card opens on. What Orchard declares is
// in `./manifest.json`; its page is bound by each app (`src/lib/domains/finance/manifest.ts`). It has no quick actions
// or Garden tiles yet (#87, #90), and no `extras`, which come with the export work (#69).
import { navigation } from '../../navigation/index.js'
import { settings } from '../../settings/index.js'
import { onSchedule } from '../../signals/runtime.js'
import type { DomainLogic } from '../define.js'
import { billCapture } from './capture.svelte.js'
import { finance } from './store.svelte.js'
import { financeTools } from './tools.js'
import { FINANCE, type BillPayload } from './types.js'

/** The bill pass's morning run; the manifest declares it. */
export const BILLS_SCHEDULE = 'finance.bills'

/** Runs the bill pass when the shell starts and each morning, on both apps; the answer unbinds. */
function bindBills(): () => void {
	const stop = onSchedule(BILLS_SCHEDULE, () => finance.billPass())
	void finance.billPass()
	return stop
}

export const financeLogic: DomainLogic<'finance'> = {
	id: 'finance',
	load: () => finance.load(),
	reload: () => finance.reload(),
	seed: () => finance.seed(),
	subscribe: () => bindBills(),
	tools: financeTools({
		accounts: async () => {
			await finance.load()
			return finance.data().accounts
		},
		home: () => settings.homeCurrency,
	}),
	// a bill is called by its payee
	labels: { [FINANCE.bill]: (row) => (row.payload as BillPayload).payee || undefined },
	openDraft: (card, settle) => {
		if (card.kind !== 'bill') return false
		void navigation.open({ place: 'finance', tab: 'bills' })
		billCapture.openDraft(card.bill, settle)
		return true
	},
}
