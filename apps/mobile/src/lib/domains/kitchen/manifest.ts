// Hearth's surface on the phone (product/domains/kitchen.md, "Mobile"): the page and its tabs. What Hearth declares
// is in `@eden/shared/domains/kitchen/manifest.json`; what it does (its store, its tools, its drafts) is its
// `logic.ts` there, which `defineDomain` joins to this. The bodies of its Garden tiles and its capture sheet are
// bound when the phone's Garden and Hearth are built (#19).
import { goto } from '$app/navigation'
import { resolve } from '$app/paths'
import { defineDomain, widgetsPending } from '@eden/shared/domains'

export const kitchenManifest = defineDomain('kitchen', {
	routes: {
		path: '/kitchen/[[tab]]',
		href: resolve('/kitchen/[[tab]]', {}),
		open: () => void goto(resolve('/kitchen/[[tab]]', {})),
		openTab: (tab) => void goto(resolve('/kitchen/[[tab]]', { tab })),
	},
	widgets: widgetsPending('kitchen'),
})
