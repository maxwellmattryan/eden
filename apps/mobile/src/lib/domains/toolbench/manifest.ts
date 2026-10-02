// Toolbench's surface on the phone (product/domains/toolbench.md, "Mobile"): the page and its tabs. What Toolbench
// declares is in `@eden/shared/domains/toolbench/manifest.json`; what it does is its `logic.ts` there, which
// `defineDomain` joins to this. Its two built Garden tiles are the bodies the desktop mounts.
import { goto } from '$app/navigation'
import { resolve } from '$app/paths'
import { defineDomain } from '@eden/shared/domains'
import { toolbench } from '@eden/shared/domains/toolbench'
import ActiveProjects from '@eden/shared/domains/toolbench/widgets/ActiveProjects.svelte'
import ResurfacedIdea from '@eden/shared/domains/toolbench/widgets/ResurfacedIdea.svelte'

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
