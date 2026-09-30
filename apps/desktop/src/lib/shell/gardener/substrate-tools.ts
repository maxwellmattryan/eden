// The substrate's tool handlers (product/substrate/ai.md, "Tools"; product/substrate/tasks.md, "Gardener tools"):
// declared in code beside their schemas in `@eden/shared/gardener`, run here. `create-task` leaves a draft card
// the owner commits; `complete-task` writes and answers with an undo; `summarize-day` is a delegated request over
// the day's tasks and events; `what-you-know-about-me` lists the facts the grants allow and nothing more;
// `log-quick` dispatches to a domain's quick action; `propose-fact` leaves a proposal card (D-72, D-76).
import { get } from 'svelte/store'
import { newId, queryEvents } from '@eden/shared/data'
import { addDays } from '@eden/shared/dates'
import { t } from '@eden/shared/i18n'
import { checkGrant } from '@eden/shared/grants'
import { formatValue, isLiveFact, queryFacts, validateValue } from '@eden/shared/profile'
import { tierOf } from '@eden/shared/registry'
import { runQuickAction } from '../quick-log.js'
import { tasks } from '../today/store.svelte.js'
import type { DraftCard } from '@eden/shared/gardener'
import { GRANT_SUBJECT, int, str, type ToolHandler } from './types.js'

export const substrateTools: Record<string, ToolHandler> = {
	'create-task': {
		run: async (input) => {
			const title = str(input, 'title')
			if (!title) return { output: { error: 'a task needs a title' } }
			const priority = str(input, 'priority')
			const draft: DraftCard = {
				kind: 'task',
				title,
				due: str(input, 'due'),
				timeOfDay: str(input, 'timeOfDay'),
				priority: priority === 'low' || priority === 'high' ? priority : undefined,
				notes: str(input, 'notes'),
			}
			return { output: { draft: true, title: draft.title, due: draft.due ?? null }, card: draft }
		},
	},
	'complete-task': {
		run: async (input, ctx) => {
			const id = str(input, 'taskId')
			await tasks.load()
			const task = id ? tasks.byId(id) : undefined
			if (!task) return { output: { error: 'no such task' } }
			const { undo } = tasks.complete(task.id)
			ctx.undo(get(t)('today.toast.done', { values: { title: task.title } }), undo)
			return {
				output: { uri: `eden://task/${task.id}`, title: task.title, done: true },
				touched: [`eden://task/${task.id}`],
			}
		},
	},
	'summarize-day': {
		delegate: {
			prompt: async (input, ctx) => {
				const day = str(input, 'day') ?? ctx.today
				await tasks.load()
				const due = tasks.tasks.filter(
					(task) => task.due?.startsWith(day) || (task.done && task.completedAt?.startsWith(day))
				)
				const events = await queryEvents({ from: `${day}T00:00:00`, to: `${addDays(day, 1)}T00:00:00` })
					.then((rows) => rows.map((row) => `${row.title} (${row.allDay ? 'all day' : row.startAt})`))
					.catch((): string[] => [])
				return [
					`Summarize ${day === ctx.today ? 'today' : day} for the owner from the tasks and events in the context.`,
					due.length
						? `Tasks that day: ${due.map((task) => `${task.title}${task.done ? ' (done)' : ''}`).join('; ')}`
						: 'No tasks that day.',
					events.length ? `Events: ${events.join('; ')}` : 'No events that day.',
					'Two or three sentences, plain, first person, no cheer.',
				].join('\n')
			},
			parse: (text) => ({ output: { summary: text.trim() } }),
			maxTokens: 400,
		},
	},
	'what-you-know-about-me': {
		run: async () => {
			const facts = await queryFacts({})
			const allowed: { type: string; value: string; provenance: string; validUntil: string | null }[] = []
			const locked = new Set<string>()
			for (const fact of facts) {
				const tier = tierOf(fact.type)
				if (tier === 'T3') continue
				if (tier === 'T2') {
					const decision = await checkGrant({
						subject: GRANT_SUBJECT,
						resource: fact.type,
						resourceType: 'registry',
						access: 'read',
					})
					if (!decision.allowed) {
						locked.add(fact.type)
						continue
					}
				}
				allowed.push({
					type: fact.type,
					value: formatValue(fact.type, fact.value, (key) => get(t)(key)),
					provenance: fact.provenance,
					validUntil: fact.validUntil,
				})
			}
			return { output: { facts: allowed, locked: [...locked] }, touched: allowed.map(() => '').filter(Boolean) }
		},
	},
	'log-quick': {
		run: async (input, ctx) => {
			const domain = str(input, 'domain')
			const action = str(input, 'action')
			const value = str(input, 'value')
			if (!domain || !action || !value) return { output: { error: 'a domain, an action and a value are needed' } }
			const result = await runQuickAction(domain, action, value)
			if (!result) return { output: { error: `no such action: ${domain}.${action}` } }
			ctx.undo(get(t)('gardener.toast.logged', { values: { value } }), result.undo)
			return { output: { ok: true, undoable: true } }
		},
	},
	'propose-fact': {
		run: async (input) => {
			const type = str(input, 'type')
			const text = str(input, 'text')
			const confidence = Math.min(
				1,
				Math.max(0, int(input, 'confidence', 60, 0, 100) / (int(input, 'confidence', 60, 0, 100) > 1 ? 100 : 1))
			)
			const raw = (input as { value?: unknown })?.value
			if (!type || !isLiveFact(type)) return { output: { error: 'not a fact type Eden keeps' } }
			if (tierOf(type) === 'T3') return { output: { error: 'never' } }
			// a value the model wrote as text may be JSON for a structured fact
			let value: unknown = raw
			if (typeof raw === 'string') {
				try {
					value = JSON.parse(raw)
				} catch {
					value = raw
				}
			}
			const problem = validateValue(type, value)
			if (problem) return { output: { error: problem } }
			const proposal = { id: newId(), type, value, confidence, text, source: 'gardener' }
			return { output: { proposalId: proposal.id }, proposal }
		},
	},
}
