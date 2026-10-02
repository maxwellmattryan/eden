// Toolbench's tool handlers (product/domains/toolbench.md, "Gardener tools"; docs/engineering/gardener.md, "Tools").
// The brainstorm's exchange is kept with the idea (D-76); a plan becomes tasks through the shell's store and next
// steps on the project; the scaffold is text to copy and never a file. `find-similar` and `estimate-parts-cost`
// are plain: they answer from rows Eden has.
import { get } from 'svelte/store'
import { newId, queryEntities } from '@eden/shared/data'
import { answer, type DraftCard } from '@eden/shared/gardener'
import { t } from '@eden/shared/i18n'
import { DRAFTED, int, parseJson, str, type ToolHandler } from '$lib/shell/gardener/types'
import { toolbench } from './store.svelte.js'

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

/** Why an idea id cannot be worked on, or nothing. */
function ideaProblem(input: unknown, required: boolean): string | undefined {
	const id = str(input, 'ideaId')
	if (!id) return required ? 'Pass `ideaId`: the `id` of a row under `idea`, from `read-rows`.' : undefined
	return toolbench.ideaById(id)
		? undefined
		: `No idea has the id ${JSON.stringify(id)}. An idea's id is the \`id\` of its row under \`idea\`, from \`read-rows\`.`
}

/** Why a project id cannot be worked on, or nothing. */
function projectProblem(input: unknown, required: boolean): string | undefined {
	const id = str(input, 'projectId')
	if (!id) return required ? 'Pass `projectId`: the `id` of a row under `project`, from `read-rows`.' : undefined
	return toolbench.projectById(id)
		? undefined
		: `No project has the id ${JSON.stringify(id)}. A project's id is the \`id\` of its row under \`project\`, from \`read-rows\`.`
}

export const toolbenchTools: Record<string, ToolHandler> = {
	brainstorm: {
		delegate: {
			check: (input) => ideaProblem(input, true),
			focus: (input) => {
				const id = str(input, 'ideaId')
				return id ? [ideaUri(id)] : []
			},
			prompt: (input) => {
				const ask = str(input, 'prompt')
				return [
					ideaLines(str(input, 'ideaId')),
					'Think this idea through with the owner. Draw on the skills, tools and hardware the context lists for them, so the directions are ones they could take.',
					ask ? `They ask: ${ask}` : 'Open with the two or three directions most worth exploring, briefly.',
					'Reply in prose, a paragraph or two, in the first person, calm and plain. Your reply is shown to the owner as it stands and kept with the idea.',
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
			check: (input) =>
				str(input, 'ideaId') || str(input, 'projectId')
					? (ideaProblem(input, false) ?? projectProblem(input, false))
					: 'Pass `ideaId` or `projectId`: what is to be critiqued.',
			focus: (input) => [
				...(str(input, 'ideaId') ? [ideaUri(str(input, 'ideaId')!)] : []),
				...(str(input, 'projectId') ? [projectUri(str(input, 'projectId')!)] : []),
			],
			schema: answer.object({
				strengths: answer.list(answer.text(), 'What is strong about it: three to five, one sentence each.'),
				risks: answer.list(answer.text(), 'What could sink it: three to five, one sentence each, the worst first.'),
				questions: answer.list(
					answer.text(),
					'What the owner has not answered yet and should before going further: three to five, one sentence each.'
				),
			}),
			prompt: (input) =>
				[
					ideaLines(str(input, 'ideaId')),
					projectLines(str(input, 'projectId')),
					'Critique this honestly. The owner wants to know what could sink it before they spend time on it, so do not soften what you find.',
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
			check: (input) => ideaProblem(input, true) ?? projectProblem(input, false),
			focus: (input) => {
				const id = str(input, 'ideaId')
				const project = str(input, 'projectId')
				return [...(id ? [ideaUri(id)] : []), ...(project ? [projectUri(project)] : [])]
			},
			schema: answer.object({
				steps: answer.list(
					answer.object({
						title: answer.text('The step, as a task the owner can tick off.'),
						due: answer.text(
							'The day to do it by, as YYYY-MM-DD, only when the order or a deadline calls for one; an empty string otherwise.'
						),
						notes: answer.text('What the step needs that its title does not say; an empty string otherwise.'),
					}),
					'Four to eight steps, in the order to do them.'
				),
			}),
			prompt: (input) =>
				[
					ideaLines(str(input, 'ideaId')),
					projectLines(str(input, 'projectId')),
					'Turn this into concrete next steps, each small enough to finish in one sitting. The tasks already in the context are what the owner has taken on: do not repeat one of them, and do not crowd a day that is already full.',
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
				if (!steps.length)
					return { output: { error: 'The plan came back empty. Tell the owner it could not be drafted.' } }
				return {
					output: { status: 'drafted', steps, note: DRAFTED },
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
					// `eden://<type>/<id>`: the type and the id the other tools take
					type: candidate.uri.split('/')[2] ?? '',
					id: candidate.uri.split('/')[3] ?? '',
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
			if (!project) return { output: { error: projectProblem(input, true) ?? 'No such project.' } }
			const parts = project.parts ?? []
			const total = Math.round(parts.reduce((sum, part) => sum + part.price, 0) * 100) / 100
			return { output: { total, currency: 'USD', parts }, touched: [projectUri(project.id)] }
		},
	},
	'summarize-project': {
		delegate: {
			check: (input) => projectProblem(input, true),
			focus: (input) => {
				const id = str(input, 'projectId')
				return id ? [projectUri(id)] : []
			},
			schema: answer.object({
				summary: answer.text(
					'Where the project stands, in two or three sentences: what is done, what is under way, what is stuck.'
				),
				nextSteps: answer.list(answer.text(), 'What comes next, the nearest first, a short line each.'),
			}),
			prompt: (input) =>
				[
					projectLines(str(input, 'projectId')),
					'Say where this project stands, for an owner picking it back up: work from its row and from the tasks in the context that belong to it.',
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
			schema: answer.object({
				language: answer.text(
					'The language of the code, lowercase, as a code block would name it: rust, javascript, glsl.'
				),
				title: answer.text('A short name for the sketch.'),
				code: answer.text('The whole scaffold, as one file.'),
			}),
			focus: (input) => {
				const id = str(input, 'sketchId')
				return id ? [`eden://sketch/${id}`] : []
			},
			prompt: (input) => {
				const tool = str(input, 'tool')
				return [
					`Draft a scaffold for a creative-coding sketch: ${str(input, 'description') ?? 'as described in the context'}.`,
					tool
						? `Write it in ${tool}.`
						: 'Write it in the tool the owner prefers: their preferred-tool facts are in the context. When none is listed, choose a common one for the job and name it in the title.',
					'A starting point the owner can run and change: seeded randomness, parameters at the top, comments where a choice matters.',
				].join('\n')
			},
			parse: (text) => {
				const parsed = parseJson<{ language?: string; title?: string; code?: string }>(text)
				const code = parsed?.code ?? text.trim()
				const language = parsed?.language ?? 'text'
				return {
					output: { status: 'drafted', language, lines: code.split('\n').length, note: DRAFTED },
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
