// Hearth's surface on the desktop (product/domains/kitchen.md): the page and its tabs, the bodies of its Garden
// tiles and the capture sheet it shows over any page. What Hearth declares is in
// `@eden/shared/domains/kitchen/manifest.json`; what it does (its store, its tools, its drafts) is its `logic.ts`
// there, which `defineDomain` joins to this.
import { goto } from '$app/navigation'
import { resolve } from '$app/paths'
import { defineDomain } from '@eden/shared/domains'
import { kitchen } from '@eden/shared/domains/kitchen'
import { declarationOf, type TabId } from '@eden/shared/manifest'
import HaulCapture from './views/HaulCapture.svelte'
import CookTonight from '@eden/shared/domains/kitchen/widgets/CookTonight.svelte'
import ExpiringSoon from '@eden/shared/domains/kitchen/widgets/ExpiringSoon.svelte'
import GroceryQuickAdd from '@eden/shared/domains/kitchen/widgets/GroceryQuickAdd.svelte'

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
		'grocery-quick-add': {
			body: GroceryQuickAdd,
			hasData: () => true,
			action: {
				label: 'garden.actions.groceryQuickAdd',
				open: () => void goto(resolve('/kitchen/[[tab]]', { tab: 'grocery' })),
			},
		},
	},
	overlay: HaulCapture,
})
