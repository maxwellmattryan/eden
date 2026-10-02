// Toolbench's surface on the desktop (product/domains/toolbench.md): the page and its five tabs, and the bodies of
// its two built Garden tiles. What Toolbench declares is in `@eden/shared/domains/toolbench/manifest.json`; what it
// does is its `logic.ts` there, which `defineDomain` joins to this.
import { goto } from '$app/navigation'
import { resolve } from '$app/paths'
import { defineDomain } from '@eden/shared/domains'
import { toolbench } from '@eden/shared/domains/toolbench'
import { declarationOf, type TabId } from '@eden/shared/manifest'
import ActiveProjects from './widgets/ActiveProjects.svelte'
import ResurfacedIdea from './widgets/ResurfacedIdea.svelte'

export type ToolbenchTab = TabId<'toolbench'>
export const TOOLBENCH_TABS: readonly ToolbenchTab[] = declarationOf('toolbench').tabs.map((tab) => tab.id)

export const toolbenchManifest = defineDomain('toolbench', {
	routes: {
		path: '/toolbench/[[tab]]',
		href: resolve('/toolbench/[[tab]]', {}),
		open: () => void goto(resolve('/toolbench/[[tab]]', {})),
		openTab: (tab) => void goto(resolve('/toolbench/[[tab]]', { tab })),
	},
	widgets: {
		'resurfaced-idea': {
			body: ResurfacedIdea,
			hasData: () => toolbench.resurfaced !== undefined,
			action: {
				label: 'garden.actions.resurfacedIdea',
				open: () => {
					toolbench.reveal = toolbench.resurfaced?.id
					void goto(resolve('/toolbench/[[tab]]', { tab: 'ideas' }))
				},
			},
		},
		'active-projects': {
			body: ActiveProjects,
			hasData: () => toolbench.projects.length > 0,
			action: {
				label: 'garden.actions.activeProjects',
				open: () => void goto(resolve('/toolbench/[[tab]]', { tab: 'projects' })),
			},
		},
	},
})
