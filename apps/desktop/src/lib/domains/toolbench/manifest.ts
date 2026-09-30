// Toolbench's bindings (product/domains/toolbench.md): the page and its five tabs, the bodies of its two built
// Garden tiles, its store. What Toolbench declares is in `@eden/shared/domains/toolbench/manifest.json`.
import { toolbenchExtras } from '@eden/shared/domains/toolbench'
import { get } from 'svelte/store'
import { goto } from '$app/navigation'
import { resolve } from '$app/paths'
import { t } from '@eden/shared/i18n'
import { declarationOf, type TabId } from '@eden/shared/manifest'
import { defineDomain } from '../manifest.js'
import { toolbench } from './store.svelte.js'
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
	load: () => toolbench.load(),
	reload: () => toolbench.reload(),
	extras: async () => {
		await toolbench.load()
		return toolbenchExtras(toolbench.data())
	},
	seed: () => toolbench.seed(get(t)('domains.toolbench.name')),
})
