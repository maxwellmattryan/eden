import { describe, expect, it } from 'vitest'
import { toolbenchExtras } from './formats.js'
import type { ToolbenchData } from './types.js'

const data: ToolbenchData = {
	ideas: [
		{
			id: '1',
			title: 'Flow field',
			status: 'building',
			area: 'art',
			touchedAt: '2026-09-20T12:00:00',
			log: [
				{ id: 'a', at: '2026-09-18T12:00:00', line: 'Ported the *sketch*' },
				{
					id: 'b',
					at: '2026-09-20T12:00:00',
					key: 'domains.toolbench.ideas.log.moved',
					values: { status: 'Building' },
				},
			],
			brainstorm: [
				{ id: 'c', owner: true, text: 'Seeded noise?' },
				{ id: 'd', owner: false, text: 'Yes, one seed a day.' },
			],
			projectId: '3',
		},
		{
			id: '2',
			title: 'Solar logger',
			status: 'idea',
			area: 'homelab',
			touchedAt: '2026-08-19T12:00:00',
			log: [],
			brainstorm: [],
		},
	],
	projects: [
		{ id: '3', name: 'nannou flow field', kind: 'art', repo: 'eden-sketches', next: ['Tune the step'] },
		{ id: '4', name: 'Rack shelf', kind: 'hardware', next: [], parts: [{ name: 'Rails', price: 38 }], estimate: 38 },
	],
}

describe('toolbenchExtras', () => {
	const files = Object.fromEntries(toolbenchExtras(data).map((file) => [file.path, file.content]))

	it('writes the ideas with their log, their thread and their project', () => {
		expect(files['friendly/ideas.md']).toBe(
			[
				'# Ideas',
				'',
				'## Flow field',
				'',
				'- Status: building',
				'- Area: art',
				'- Last touched: 2026-09-20',
				'- Project: nannou flow field',
				'',
				'### Log',
				'',
				'- 2026-09-18: Ported the \\*sketch\\*',
				'- 2026-09-20: moved Building',
				'',
				'### Brainstorm',
				'',
				'- Me: Seeded noise?',
				'- Gardener: Yes, one seed a day.',
				'',
				'## Solar logger',
				'',
				'- Status: idea',
				'- Area: homelab',
				'- Last touched: 2026-08-19',
				'',
			].join('\n')
		)
	})

	it('writes the projects with their steps and parts', () => {
		expect(files['friendly/projects.md']).toBe(
			[
				'# Projects',
				'',
				'## nannou flow field',
				'',
				'- Kind: art',
				'- Repository: eden-sketches',
				'',
				'### Next steps',
				'',
				'- Tune the step',
				'',
				'## Rack shelf',
				'',
				'- Kind: hardware',
				'- Estimate: 38',
				'',
				'### Parts',
				'',
				'- Rails: 38',
				'',
			].join('\n')
		)
	})
})
