// Toolbench's data in formats made for reading, for its bundle (product/substrate/data.md, "Export"): the ideas and
// the projects as Markdown. The headings are part of the format and are not translated. A log line the app wrote is
// kept as a locale key in the data; here it is written as the key's last word and its values.
import type { BundleExtra } from '../../data/bundle.js'
import { inline, toMarkdown } from '../../data/text.js'
import type { LogEntry, ToolbenchData } from './types.js'

function logLine(entry: LogEntry): string {
	const written = entry.line ?? [entry.key?.split('.').at(-1), ...Object.values(entry.values ?? {})].join(' ')
	return `- ${entry.at.slice(0, 10)}: ${inline(written)}`
}

export function toolbenchExtras(data: ToolbenchData): BundleExtra[] {
	const projectName = (id: string | undefined) => data.projects.find((project) => project.id === id)?.name
	const ideas = toMarkdown(
		'Ideas',
		data.ideas.map((idea) => {
			const project = projectName(idea.projectId)
			return {
				heading: idea.title,
				lines: [
					`- Status: ${idea.status}`,
					`- Area: ${inline(idea.area)}`,
					`- Last touched: ${idea.touchedAt.slice(0, 10)}`,
					project ? `- Project: ${inline(project)}` : undefined,
					...(idea.log.length ? ['', '### Log', '', ...idea.log.map(logLine)] : []),
					...(idea.brainstorm.length
						? [
								'',
								'### Brainstorm',
								'',
								...idea.brainstorm.map((message) => `- ${message.owner ? 'Me' : 'Gardener'}: ${inline(message.text)}`),
							]
						: []),
				],
			}
		})
	)
	const projects = toMarkdown(
		'Projects',
		data.projects.map((project) => ({
			heading: project.name,
			lines: [
				`- Kind: ${inline(project.kind)}`,
				project.repo ? `- Repository: ${inline(project.repo)}` : undefined,
				project.estimate !== undefined ? `- Estimate: ${project.estimate}` : undefined,
				...(project.next.length ? ['', '### Next steps', '', ...project.next.map((step) => `- ${inline(step)}`)] : []),
				...(project.parts?.length
					? ['', '### Parts', '', ...project.parts.map((part) => `- ${inline(part.name)}: ${part.price}`)]
					: []),
			],
		}))
	)
	return [
		{ path: 'friendly/ideas.md', content: ideas },
		{ path: 'friendly/projects.md', content: projects },
	]
}
