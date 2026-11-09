// Orchard's surface on the phone (product/domains/finance.md, "Mobile"): the page and its one tab, reached from More.
// What Orchard declares is in `@eden/shared/domains/finance/manifest.json`; what it does is its `logic.ts` there,
// which `defineDomain` joins to this. The page is the one the desktop mounts; on iOS the phone links its own banks
// through Plaid's sheet once the layout's `bindPlaid()` binds the provider (#89, D-206), and on Android it stays manual.
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
