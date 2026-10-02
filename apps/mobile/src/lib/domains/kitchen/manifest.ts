// Hearth's surface on the phone (product/domains/kitchen.md, "Mobile"): the page and its tabs, and the bodies of
// its Garden tiles, which are the ones the desktop mounts. What Hearth declares is in
// `@eden/shared/domains/kitchen/manifest.json`; what it does (its store, its tools, its drafts) is its `logic.ts`
// there, which `defineDomain` joins to this. Its capture sheet is bound when the phone's Hearth is built (#19).
import { goto } from '$app/navigation'
import { resolve } from '$app/paths'
import { defineDomain } from '@eden/shared/domains'
import { kitchen } from '@eden/shared/domains/kitchen'
import CookTonight from '@eden/shared/domains/kitchen/widgets/CookTonight.svelte'
import ExpiringSoon from '@eden/shared/domains/kitchen/widgets/ExpiringSoon.svelte'
import GroceryQuickAdd from '@eden/shared/domains/kitchen/widgets/GroceryQuickAdd.svelte'

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
		'grocery-quick-add': {
			body: GroceryQuickAdd,
			hasData: () => true,
			action: {
				label: 'garden.actions.groceryQuickAdd',
				open: () => void goto(resolve('/kitchen/[[tab]]', { tab: 'grocery' })),
			},
		},
	},
})
