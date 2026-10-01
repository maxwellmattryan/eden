// Hearth's bindings (product/domains/kitchen.md): the page and its tabs, the bodies of its two built Garden tiles,
// its store, what it does on its schedules, and its tool handlers. What Hearth declares is in
// `@eden/shared/domains/kitchen/manifest.json`.
import { bindKitchenSignals, kitchenExtras } from '@eden/shared/domains/kitchen'
import { get } from 'svelte/store'
import { goto } from '$app/navigation'
import { resolve } from '$app/paths'
import { t } from '@eden/shared/i18n'
import { declarationOf, type TabId } from '@eden/shared/manifest'
import { defineDomain } from '../manifest.js'
import { kitchen } from './store.svelte.js'
import { kitchenCommitDraft, kitchenQuickActions, kitchenTools } from './tools.js'
import CookTonight from './widgets/CookTonight.svelte'
import ExpiringSoon from './widgets/ExpiringSoon.svelte'

export type KitchenTab = TabId<'kitchen'>
export const KITCHEN_TABS: readonly KitchenTab[] = declarationOf('kitchen').tabs.map((tab) => tab.id)

export const kitchenManifest = defineDomain('kitchen', {
	routes: {
		path: '/kitchen/[[tab]]',
		href: resolve('/kitchen/[[tab]]', {}),
		open: () => void goto(resolve('/kitchen/[[tab]]', {})),
		openTab: (tab) => void goto(resolve('/kitchen/[[tab]]', { tab })),
	},
	widgets: {
		'expiring-soon': { body: ExpiringSoon, hasData: () => kitchen.expiring.length > 0 },
		'cook-tonight': {
			body: CookTonight,
			hasData: () => kitchen.recipes.length > 0,
			action: {
				label: 'garden.actions.cookTonight',
				open: () => void goto(resolve('/kitchen/[[tab]]', { tab: 'recipes' })),
			},
		},
	},
	load: () => kitchen.load(),
	reload: () => kitchen.reload(),
	extras: async () => {
		await kitchen.load()
		return kitchenExtras(kitchen.data())
	},
	seed: () => kitchen.seed(get(t)('domains.kitchen.name')),
	subscribe: () => bindKitchenSignals(),
	tools: kitchenTools,
	quickActionHandlers: kitchenQuickActions,
	commitDraft: kitchenCommitDraft,
})
