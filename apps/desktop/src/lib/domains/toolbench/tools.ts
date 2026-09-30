// Toolbench's tool handlers (product/domains/toolbench.md, "Gardener tools"; docs/engineering/gardener.md, "Tools").
// The brainstorm's exchange is kept with the idea (D-76); a plan becomes tasks through the shell's store and next
// steps on the project; the scaffold is text to copy and never a file. `find-similar` and `estimate-parts-cost`
// are plain: they answer from rows Eden has.
import { get } from 'svelte/store'
import { newId, queryEntities } from '@eden/shared/data'
import type { DraftCard } from '@eden/shared/gardener'
import { t } from '@eden/shared/i18n'
import { int, parseJson, str, type ToolHandler } from '$lib/shell/gardener/types'
import { toolbench } from './store.svelte.js'

const JSON_ONLY = 'Answer with JSON only, no prose around it.'

const ideaUri = (id: string) => `eden://idea/${id}`
const projectUri = (id: string) => `eden://project/${id}`

/** The words of a text, lowercased, three letters or longer. */
function words(text: string): Set<string> {
	return new Set(
		text
			.toLowerCase()
			.split(/[^\p{L}\p{N}]+/u)
			.filter((word) => word.length >= 3)
	)
}

function overlap(a: Set<string>, b: Set<string>): number {
	if (!a.size || !b.size) return 0
	let shared = 0
	for (const word of a) if (b.has(word)) shared += 1
	return shared / Math.sqrt(a.size * b.size)
}

function ideaLines(id: string | undefined): string {
	const idea = id ? toolbench.ideaById(id) : undefined
	if (!idea) return ''
	const log = idea.log
		.map((entry) => entry.line ?? (entry.key ? get(t)(entry.key, { values: entry.values }) : ''))
		.filter(Boolean)
	const thread = idea.brainstorm.map((message) => `${message.owner ? 'Owner' : 'Gardener'}: ${message.text}`)
	return [
		`Idea: ${idea.title} (${idea.area}, ${idea.status})`,
		log.length ? `Log: ${log.join('; ')}` : '',
		thread.length ? `Earlier brainstorm:\n${thread.join('\n')}` : '',
	]
		.filter(Boolean)
		.join('\n')
}

function projectLines(id: string | undefined): string {
	const project = id ? toolbench.projectById(id) : undefined
	if (!project) return ''
	return [
		`Project: ${project.name} (${project.kind}${project.repo ? `, ${project.repo}` : ''})`,
		project.next.length ? `Next steps: ${project.next.join('; ')}` : 'No next steps yet.',
	].join('\n')
}

export const toolbenchTools: Record<string, ToolHandler> = {
	brainstorm: {
		delegate: {
			focus: (input) => {
				const id = str(input, 'ideaId')
				return id ? [ideaUri(id)] : []
			},
			prompt: (input) => {
				const ask = str(input, 'prompt')
				return [
					ideaLines(str(input, 'ideaId')),
					'Brainstorm with the owner about this idea, drawing on their skills, tools and hardware in the context.',
					ask ? `They ask: ${ask}` : 'Open with the two or three directions most worth exploring, briefly.',
					'Answer in plain prose, a paragraph or two.',
				]
					.filter(Boolean)
					.join('\n')
			},
			parse: (text, input) => {
				const id = str(input, 'ideaId')
				const ask = str(input, 'prompt')
				const reply = text.trim()
				if (id && reply) {
					const messages = [
						...(ask ? [{ id: newId(), owner: true, text: ask }] : []),
						{ id: newId(), owner: false, text: reply },
					]
					toolbench.appendBrainstorm(id, messages)
				}
				return { output: { reply }, touched: id ? [ideaUri(id)] : [] }
			},
			maxTokens: 1500,
		},
	},
	critique: {
		delegate: {
			focus: (input) => [
				...(str(input, 'ideaId') ? [ideaUri(str(input, 'ideaId')!)] : []),
				...(str(input, 'projectId') ? [projectUri(str(input, 'projectId')!)] : []),
			],
			prompt: (input) =>
				[
					ideaLines(str(input, 'ideaId')),
					projectLines(str(input, 'projectId')),
					'Critique it honestly: what is strong, what could sink it, what the owner has not answered yet.',
					'Answer as {"strengths":["..."],"risks":["..."],"questions":["..."]}, three to five of each, one sentence each.',
					JSON_ONLY,
				]
					.filter(Boolean)
					.join('\n'),
			parse: (text) => ({
				output: parseJson<{ strengths: string[]; risks: string[]; questions: string[] }>(text) ?? {
					critique: text.trim(),
				},
			}),
		},
	},
	'expand-to-plan': {
		delegate: {
			focus: (input) => {
				const id = str(input, 'ideaId')
				const project = str(input, 'projectId')
				return [...(id ? [ideaUri(id)] : []), ...(project ? [projectUri(project)] : [])]
			},
			prompt: (input) =>
				[
					ideaLines(str(input, 'ideaId')),
					projectLines(str(input, 'projectId')),
					'Expand this into a plan of concrete next steps the owner can do one at a time, in order, considering the tasks already in the context.',
					'Answer as {"steps":[{"title":"","due":"YYYY-MM-DD or omit","notes":""}]}, four to eight steps.',
					JSON_ONLY,
				]
					.filter(Boolean)
					.join('\n'),
			parse: (text, input) => {
				const parsed = parseJson<{ steps?: { title?: string; due?: string; notes?: string }[] }>(text)
				const steps = (parsed?.steps ?? []).flatMap((step) =>
					step.title ? [{ title: step.title, due: step.due || undefined, notes: step.notes || undefined }] : []
				)
				const projectId = str(input, 'projectId')
				const idea = str(input, 'ideaId')
				const name = (projectId && toolbench.projectById(projectId)?.name) || (idea && toolbench.ideaById(idea)?.title)
				return {
					output: { steps },
					card: {
						kind: 'plan',
						title: name
							? get(t)('domains.toolbench.plan.title', { values: { name } })
							: get(t)('domains.toolbench.plan.untitled'),
						tasks: steps,
						events: [],
						projectId,
					},
				}
			},
		},
	},
	'find-similar': {
		run: async (input) => {
			const text = str(input, 'text') ?? ''
			const limit = int(input, 'limit', 5, 1, 10)
			const query = words(text)
			await toolbench.load()
			const notes = await queryEntities<{ title?: string; body?: string }>({ type: 'note' }).catch(
				(): { uri: string; payload: { title?: string; body?: string } }[] => []
			)
			const candidates = [
				...toolbench.ideas.map((idea) => ({
					uri: ideaUri(idea.id),
					title: idea.title,
					text: `${idea.title} ${idea.area}`,
				})),
				...toolbench.projects.map((project) => ({
					uri: projectUri(project.id),
					title: project.name,
					text: `${project.name} ${project.kind} ${project.next.join(' ')}`,
				})),
				...notes.map((note) => ({
					uri: note.uri,
					title: note.payload.title ?? '',
					text: `${note.payload.title ?? ''} ${note.payload.body ?? ''}`,
				})),
			]
			const matches = candidates
				.map((candidate) => ({
					uri: candidate.uri,
					title: candidate.title,
					score: overlap(query, words(candidate.text)),
				}))
				.filter((match) => match.score > 0)
				.sort((a, b) => b.score - a.score)
				.slice(0, limit)
				.map((match) => ({ ...match, score: Math.round(match.score * 100) / 100 }))
			return { output: { matches } }
		},
	},
	'estimate-parts-cost': {
		run: async (input) => {
			await toolbench.load()
			const project = toolbench.projectById(str(input, 'projectId') ?? '')
			if (!project) return { output: { error: 'no such project' } }
			const parts = project.parts ?? []
			const total = Math.round(parts.reduce((sum, part) => sum + part.price, 0) * 100) / 100
			return { output: { total, currency: 'USD', parts }, touched: [projectUri(project.id)] }
		},
	},
	'summarize-project': {
		delegate: {
			focus: (input) => {
				const id = str(input, 'projectId')
				return id ? [projectUri(id)] : []
			},
			prompt: (input) =>
				[
					projectLines(str(input, 'projectId')),
					'Summarize where this project stands from its rows and the tasks in the context, and what comes next.',
					'Answer as {"summary":"two or three sentences","nextSteps":["..."]}.',
					JSON_ONLY,
				]
					.filter(Boolean)
					.join('\n'),
			parse: (text) => ({
				output: parseJson<{ summary: string; nextSteps: string[] }>(text) ?? { summary: text.trim(), nextSteps: [] },
			}),
		},
	},
	'draft-sketch-scaffold': {
		delegate: {
			focus: (input) => {
				const id = str(input, 'sketchId')
				return id ? [`eden://sketch/${id}`] : []
			},
			prompt: (input) => {
				const tool = str(input, 'tool') ?? 'nannou'
				return [
					`Draft a scaffold for a generative sketch in ${tool}: ${str(input, 'description') ?? 'as described in the context'}.`,
					'Use the tools the owner prefers where the context lists them. Seeded randomness, parameters at the top, comments where a choice matters.',
					'Answer as {"language":"rust","title":"","code":"..."}.',
					JSON_ONLY,
				].join('\n')
			},
			parse: (text) => {
				const parsed = parseJson<{ language?: string; title?: string; code?: string }>(text)
				const code = parsed?.code ?? text.trim()
				const language = parsed?.language ?? 'rust'
				return {
					output: { language, lines: code.split('\n').length },
					card: { kind: 'code', language, code, title: parsed?.title },
				}
			},
			maxTokens: 4000,
		},
	},
}

/** Toolbench's part of a plan's commit: the steps on the project. The tasks themselves are the shell's. */
export async function toolbenchCommitDraft(card: DraftCard): Promise<{ undo: () => void } | undefined> {
	if (card.kind !== 'plan' || !card.projectId) return undefined
	const { undo } = toolbench.addNextSteps(
		card.projectId,
		card.tasks.map((task) => task.title)
	)
	return { undo }
}

/** What Toolbench's quick action writes. */
export const toolbenchQuickActions = {
	'capture-idea': (value: string) => toolbench.capture(value),
}
