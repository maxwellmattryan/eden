// The sample dataset (design/sample-data.md, "Toolbench") mapped into the store's shapes: the six ideas with the
// solar logger untouched for 41 days, the log and the brainstorm on the nannou flow field, and its project.
import { ideaLog, ideas, projects } from '@eden/ui-kit/sample-data'
import { daysFromToday, shiftSampleDate } from '@eden/shared/dates'
import type { Idea, Project, ToolbenchData } from './store.svelte.js'

export function seedData(): ToolbenchData {
	return {
		ideas: ideas.map((idea): Idea => {
			const untouched = 'untouchedDays' in idea ? idea.untouchedDays : 0
			const linked = idea.id === ideaLog.ideaId
			return {
				id: idea.id,
				title: idea.title,
				status: idea.status,
				area: idea.area,
				touchedAt: `${daysFromToday(-untouched)}T12:00:00`,
				log: linked
					? ideaLog.entries.map((entry) => ({
							id: entry.id,
							at: `${shiftSampleDate(entry.when)}T12:00:00`,
							line: entry.line,
						}))
					: [],
				brainstorm: linked ? ideaLog.brainstorm.map((message) => ({ ...message })) : [],
				projectId: linked ? 'p-01' : undefined,
			}
		}),
		projects: projects.map((project): Project => ({
			id: project.id,
			name: project.name,
			kind: project.kind,
			repo: 'repo' in project ? project.repo : undefined,
			next: 'next' in project ? [...project.next] : [],
			parts: 'parts' in project ? project.parts.map(([name, price]) => ({ name, price })) : undefined,
			estimate: 'estimate' in project ? project.estimate : undefined,
		})),
	}
}
