// Toolbench's manifest (product/domains/toolbench.md): the page with its five tabs, the two default Garden tiles, the
// capture-idea quick action.
import { get } from 'svelte/store'
import { goto } from '$app/navigation'
import { resolve } from '$app/paths'
import { domainGlyph } from '@eden/ui-kit'
import { t } from '@eden/shared/i18n'
import type { DomainManifest } from '../manifest.js'
import { toolbench } from './store.svelte.js'
import ActiveProjects from './widgets/ActiveProjects.svelte'
import ResurfacedIdea from './widgets/ResurfacedIdea.svelte'

export const TOOLBENCH_TABS = ['ideas', 'projects', 'lab', 'studio', 'notes'] as const
export type ToolbenchTab = (typeof TOOLBENCH_TABS)[number]

export const toolbenchManifest: DomainManifest = {
	id: 'toolbench',
	name: 'domains.toolbench.name',
	subtitle: 'domains.toolbench.subtitle',
	glyph: domainGlyph('toolbench'),
	routes: {
		path: '/toolbench/[[tab]]',
		href: resolve('/toolbench/[[tab]]', {}),
		open: () => void goto(resolve('/toolbench/[[tab]]', {})),
		tabs: TOOLBENCH_TABS,
	},
	widgets: [
		{
			id: 'resurfaced-idea',
			size: 's',
			title: 'garden.widgets.resurfacedIdea',
			empty: 'garden.empty.resurfacedIdea',
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
		{
			id: 'active-projects',
			size: 'm',
			title: 'garden.widgets.activeProjects',
			empty: 'garden.empty.activeProjects',
			body: ActiveProjects,
			hasData: () => toolbench.projects.length > 0,
			action: {
				label: 'garden.actions.activeProjects',
				open: () => void goto(resolve('/toolbench/[[tab]]', { tab: 'projects' })),
			},
		},
	],
	quickActions: [{ id: 'capture-idea', label: 'domains.toolbench.ideas.capture', icon: 'lightbulb' }],
	load: () => toolbench.load(),
	seed: () => toolbench.seed(get(t)('domains.toolbench.name')),
}
