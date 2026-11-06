// Orchard's surface on the desktop (product/domains/finance.md): the page and its one tab, Accounts. What Orchard
// declares is in `@eden/shared/domains/finance/manifest.json`; what it does is its `logic.ts` there, which
// `defineDomain` joins to this. It has no Garden tiles yet (#87). The page is shared; the phone mounts it.
import { goto } from '$app/navigation'
import { resolve } from '$app/paths'
import { defineDomain } from '@eden/shared/domains'

export const financeManifest = defineDomain('finance', {
	routes: {
		path: '/finance/[[tab]]',
		href: resolve('/finance/[[tab]]', {}),
		open: () => void goto(resolve('/finance/[[tab]]', {})),
		openTab: (tab) => void goto(resolve('/finance/[[tab]]', { tab })),
	},
	widgets: {},
})
