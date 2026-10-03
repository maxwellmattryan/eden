// Hearth's logic (product/domains/kitchen.md): its store, what it does on its schedules, its tool handlers, and the
// surfaces it opens a draft on. What Hearth declares is in `./manifest.json`; where its page lives and what draws
// its Garden tiles is each app's (`src/lib/domains/kitchen/manifest.ts`).
import { get } from 'svelte/store'
import { getRow, toUri } from '../../data/index.js'
import { t } from '../../i18n/index.js'
import { navigation } from '../../navigation/index.js'
import type { DomainLogic } from '../define.js'
import { capture } from './capture.svelte.js'
import { storeForPack } from './filing.js'
import { kitchenExtras } from './formats.js'
import { bindKitchenSignals } from './signals.js'
import { kitchen } from './store.svelte.js'
import { kitchenCommitDraft, kitchenOpenDraft, kitchenQuickActions, kitchenTools } from './tools.js'
import { KITCHEN, type GroceryListPayload } from './types.js'

const openRecipes = () => void navigation.open({ place: 'kitchen', tab: 'recipes' })

/** A list is called by its store, and the one of what is not filed by the page's name for it (D-96). */
async function listLabel(row: { payload: object }): Promise<string | undefined> {
	const { storeId } = row.payload as GroceryListPayload
	if (!storeId) return get(t)('domains.kitchen.gardener.preview.unfiled')
	const store = await getRow(toUri(KITCHEN.store, storeId)).catch(() => null)
	const name = store && 'payload' in store ? (store.payload as { name?: unknown }).name : undefined
	return typeof name === 'string' && name.trim() ? name : undefined
}

export const kitchenLogic: DomainLogic<'kitchen'> = {
	id: 'kitchen',
	load: () => kitchen.load(),
	reload: () => kitchen.reload(),
	extras: async () => {
		await kitchen.load()
		return kitchenExtras(kitchen.data())
	},
	seed: () => kitchen.seed(get(t)('domains.kitchen.name')),
	subscribe: () => bindKitchenSignals(),
	tools: kitchenTools,
	// a store goes to a model without what it remembers, its picture or its address (D-101, D-105)
	pack: { [KITCHEN.store]: storeForPack },
	labels: { [KITCHEN.list]: listLabel },
	quickActionHandlers: kitchenQuickActions,
	quickActionLaunchers: { 'capture-haul': () => capture.start() },
	commitDraft: kitchenCommitDraft,
	openDraft: (card, settle) => kitchenOpenDraft(card, settle, { recipes: openRecipes }),
}
