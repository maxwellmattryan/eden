// Hearth's manifest (product/domains/kitchen.md; product/substrate/domain-manifest.md, "Example: Hearth's manifest"):
// the fields the shell composes from today. Capture, the tools and the signals arrive with their substrates.
import { get } from 'svelte/store'
import { goto } from '$app/navigation'
import { resolve } from '$app/paths'
import { domainGlyph } from '@eden/ui-kit'
import { t } from '@eden/shared/i18n'
import type { DomainManifest } from '../manifest.js'
import { kitchen } from './store.svelte.js'
import CookTonight from './widgets/CookTonight.svelte'
import ExpiringSoon from './widgets/ExpiringSoon.svelte'

export const KITCHEN_TABS = ['stock', 'recipes', 'grocery', 'tips'] as const
export type KitchenTab = (typeof KITCHEN_TABS)[number]

export const kitchenManifest: DomainManifest = {
	id: 'kitchen',
	name: 'domains.kitchen.name',
	subtitle: 'domains.kitchen.subtitle',
	glyph: domainGlyph('kitchen'),
	routes: {
		path: '/kitchen/[[tab]]',
		href: resolve('/kitchen/[[tab]]', {}),
		open: () => void goto(resolve('/kitchen/[[tab]]', {})),
		tabs: KITCHEN_TABS,
	},
	widgets: [
		{
			id: 'expiring-soon',
			size: 's',
			title: 'garden.widgets.expiringSoon',
			empty: 'garden.empty.expiringSoon',
			body: ExpiringSoon,
			hasData: () => kitchen.expiring.length > 0,
		},
		{
			id: 'cook-tonight',
			size: 'm',
			title: 'garden.widgets.cookTonight',
			empty: 'garden.empty.cookTonight',
			body: CookTonight,
			hasData: () => kitchen.recipes.length > 0,
			action: {
				label: 'garden.actions.cookTonight',
				open: () => void goto(resolve('/kitchen/[[tab]]', { tab: 'recipes' })),
			},
		},
	],
	quickActions: [
		{ id: 'capture-haul', label: 'domains.kitchen.capture.action', icon: 'camera' },
		{ id: 'add-to-grocery', label: 'domains.kitchen.grocery.add', icon: 'plus' },
	],
	load: () => kitchen.load(),
	seed: () => kitchen.seed(get(t)('domains.kitchen.name')),
}
