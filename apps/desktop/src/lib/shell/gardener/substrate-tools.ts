// The substrate's tool handlers (product/substrate/ai.md, "Tools"; product/substrate/tasks.md, "Gardener tools"):
// declared in code beside their schemas in `@eden/shared/gardener`, run here. `create-task` leaves a draft card
// the owner commits; `complete-task` writes and answers with an undo; `summarize-day` is a delegated request that
// briefs a day from its tasks, its events and Sky's forecast; `what-you-know-about-me` lists the facts the grants allow and nothing more;
// `log-quick` dispatches to a domain's quick action; `propose-fact` leaves a proposal card (D-72, D-76).
import { get } from 'svelte/store'
import { newId, queryEvents } from '@eden/shared/data'
import { addDays, formatWeekdayOf, timeIn } from '@eden/shared/dates'
import { t } from '@eden/shared/i18n'
import { checkGrant } from '@eden/shared/grants'
import { formatValue, isLiveFact, queryFacts, validateValue } from '@eden/shared/profile'
import { tierOf } from '@eden/shared/registry'
import { settings } from '@eden/shared/settings'
import { temperature, weather } from '@eden/shared/weather'
import { declarations } from '$lib/domains'
import { runQuickAction } from '../quick-log.js'
import { tasks } from '../today/store.svelte.js'
import { factShapeWords, PROPOSABLE_FACTS, type DraftCard } from '@eden/shared/gardener'
import { DRAFTED, GRANT_SUBJECT, num, str, type ToolHandler } from './types.js'

const DAY = /^\d{4}-\d{2}-\d{2}$/

/** What Sky holds for a day, as lines of the briefing's prompt: nothing when Sky is off or has no reading for it. */
async function weatherLines(day: string, today: boolean): Promise<string[]> {
	if (!declarations.some((domain) => domain.id === 'weather')) return []
	try {
		await weather.load()
	} catch {
		return []
	}
	const reading = weather.forecast?.days.find((entry) => entry.date === day)
	if (!reading) return []
	const degrees = (celsius: number) =>
		`${temperature(celsius, settings.measurement)}${settings.measurement === 'imperial' ? '°F' : '°C'}`
	const rain = reading.precipChance === null ? '' : `, ${reading.precipChance} % chance of rain`
	// an alert is in force now, so it belongs to today's briefing and to no other day's
	const alerts = today ? (weather.data?.alerts ?? []).map((alert) => `${alert.event} (${alert.severity})`) : []
	return [
		`Weather: ${reading.condition}, high ${degrees(reading.hi)}, low ${degrees(reading.lo)}${rain}.`,
		alerts.length ? `Weather alerts in force: ${alerts.join('; ')}.` : '',
	]
}

export const substrateTools: Record<string, ToolHandler> = {
	'create-task': {
		run: async (input) => {
			const title = str(input, 'title')
			if (!title) return { output: { error: 'A task needs a title: pass `title`.' } }
			const priority = str(input, 'priority')
			const draft: DraftCard = {
				kind: 'task',
				title,
				due: str(input, 'due'),
				timeOfDay: str(input, 'timeOfDay'),
				priority: priority === 'low' || priority === 'high' ? priority : undefined,
				notes: str(input, 'notes'),
			}
			return {
				output: { status: 'drafted', title: draft.title, due: draft.due ?? 'today', note: DRAFTED },
				card: draft,
			}
		},
	},
	'complete-task': {
		run: async (input, ctx) => {
			const id = str(input, 'taskId')
			await tasks.load()
			const task = id ? tasks.byId(id) : undefined
			if (!task)
				return {
					output: {
						error: `No task has the id ${JSON.stringify(id ?? '')}. A task's id is the \`id\` of its row under \`task\` in the context.`,
					},
				}
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
			check: (input) => {
				const day = str(input, 'day')
				return !day || DAY.test(day)
					? undefined
					: `${JSON.stringify(day)} is not a day. Pass \`day\` as YYYY-MM-DD, or leave it out for today.`
			},
			prompt: async (input, ctx) => {
				const day = str(input, 'day') ?? ctx.today
				const today = day === ctx.today
				await tasks.load()
				const titles = (rows: { title: string }[]) => rows.map((row) => row.title).join('; ')
				const due = tasks.tasks.filter((task) => !task.done && task.due?.startsWith(day))
				const done = tasks.tasks.filter((task) => task.done && task.completedAt?.startsWith(day))
				// what was left behind counts only on the day itself: tomorrow has nothing overdue yet
				const overdue = today
					? tasks.tasks.filter((task) => !task.done && !!task.due && task.due.slice(0, 10) < day)
					: []
				const events = await queryEvents({ from: `${day}T00:00:00`, to: `${addDays(day, 1)}T00:00:00` })
					.then((rows) =>
						rows.map((row) => {
							if (row.allDay) return `${row.title} (all day)`
							const from = timeIn(Date.parse(row.startAt), ctx.zone)
							return `${row.title} (${from}${row.endAt ? ` to ${timeIn(Date.parse(row.endAt), ctx.zone)}` : ''})`
						})
					)
					.catch((): string[] => [])
				return [
					`Write the owner's briefing for ${today ? 'today, ' : ''}${formatWeekdayOf(day, 'en')} ${day}, from what Eden gathered for that day below. The rows in the context are the same things with their detail.`,
					events.length ? `In the calendar: ${events.join('; ')}.` : 'In the calendar: nothing.',
					due.length ? `Tasks due: ${titles(due)}.` : 'Tasks due: none.',
					overdue.length ? `Overdue from earlier days: ${titles(overdue)}.` : '',
					done.length ? `Already done: ${titles(done)}.` : '',
					...(await weatherLines(day, today)),
					'Write short Markdown the owner takes in at a glance, in the first person, calm and plain: one line on what kind of day it is, then the calendar in time order, then the tasks, then the weather where it bears on the day. Leave out a part with nothing in it, and add nothing that is not above.',
				]
					.filter(Boolean)
					.join('\n')
			},
			parse: (text) => ({ output: { briefing: text.trim(), note: 'Give this to the owner as it stands.' } }),
			maxTokens: 600,
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
			return { output: { facts: allowed, locked: [...locked] } }
		},
	},
	'log-quick': {
		run: async (input, ctx) => {
			const named = str(input, 'action') ?? ''
			const value = str(input, 'value')
			const dot = named.indexOf('.')
			const result =
				dot > 0 && value ? await runQuickAction(named.slice(0, dot), named.slice(dot + 1), value) : undefined
			if (!value) return { output: { error: 'Pass `value`: what is to be logged.' } }
			if (!result)
				return {
					output: {
						error: `${JSON.stringify(named)} is not a quick action. \`action\` is one of the tool's listed actions.`,
					},
				}
			ctx.undo(get(t)('gardener.toast.logged', { values: { value } }), result.undo)
			return { output: { logged: true, action: named, value, note: 'Saved. The owner can undo it from the toast.' } }
		},
	},
	'propose-fact': {
		run: async (input) => {
			const type = str(input, 'type')
			const text = str(input, 'text')
			// 0 to 1 as asked; a model that answers in percent is read as one
			const sure = num(input, 'confidence') ?? 0.6
			const confidence = Math.min(1, Math.max(0, sure > 1 ? sure / 100 : sure))
			const raw = (input as { value?: unknown })?.value
			if (!type || !isLiveFact(type) || !PROPOSABLE_FACTS.includes(type))
				return {
					output: {
						error: `${JSON.stringify(type ?? '')} is not a fact type that can be proposed. \`type\` is one of: ${PROPOSABLE_FACTS.join(', ')}.`,
					},
				}
			if (tierOf(type) === 'T3')
				return { output: { error: `${type} is never shared with a model, so it cannot be proposed here.` } }
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
			if (problem) return { output: { error: `${problem}. For ${type}, \`value\` is ${factShapeWords(type)}.` } }
			const proposal = { id: newId(), type, value, confidence, text, source: 'gardener' }
			return {
				output: {
					status: 'proposed',
					proposalId: proposal.id,
					note: 'Shown as a card. Not saved until the owner accepts it.',
				},
				proposal,
			}
		},
	},
}
