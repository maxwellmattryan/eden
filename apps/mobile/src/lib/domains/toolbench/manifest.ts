// Toolbench's surface on the phone (product/domains/toolbench.md, "Mobile"): the page and its tabs. What Toolbench
// declares is in `@eden/shared/domains/toolbench/manifest.json`; what it does is its `logic.ts` there, which
// `defineDomain` joins to this. The bodies of its Garden tiles are bound when the phone's Garden is built (#19).
import { goto } from '$app/navigation'
import { resolve } from '$app/paths'
import { defineDomain, widgetsPending } from '@eden/shared/domains'

export const toolbenchManifest = defineDomain('toolbench', {
	routes: {
		path: '/toolbench/[[tab]]',
		href: resolve('/toolbench/[[tab]]', {}),
		open: () => void goto(resolve('/toolbench/[[tab]]', {})),
		openTab: (tab) => void goto(resolve('/toolbench/[[tab]]', { tab })),
	},
	widgets: widgetsPending('toolbench'),
})
