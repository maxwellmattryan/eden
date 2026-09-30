// Signals at work in an app (docs/engineering/signals.md, "The runtime"): the one bus, the emit that works out a
// signal's tier and the cards its rules ask for, and the start that binds the domains, declares their schedules and
// takes what is due. Due schedules are taken when the crate's alarm rings (`scheduler-due`; in a plain browser a
// timer stands in), when the shell starts, and when the window comes back, which is what catches up after a launch,
// a sleep or a spell in the background. Each taken schedule is handed to its subscribers as `scheduler.fired`, which
// is never stored, and to the refresh coordinator.
import { listen } from '@tauri-apps/api/event'
import { logError } from '../api/diagnostics.js'
import { isTauri } from '../api/tauri.js'
import type { BuiltDomainId, DomainDeclaration } from '../manifest/types.js'
import { coordinator } from '../refresh/index.js'
import type { DECLARATIONS } from '../registry/generated.js'
import { declareSchedules, takeDueSchedules } from '../scheduler/client.js'
import type { FiredSchedule } from '../scheduler/types.js'
import { createBus, type SignalHandler } from './bus.js'
import { emitSignal } from './client.js'
import { createPump } from './pump.js'
import { deliveriesFor, rulesOf, signalTier, type Rule } from './rules.js'
import type { Emitted, InboxEntry, SignalPayload } from './types.js'

/** A signal a built domain declares that it emits. */
export type DeclaredSignal = (typeof DECLARATIONS)[BuiltDomainId]['signals'][number]

/** What a taken schedule is handed on as. It is the scheduler's own, and transient: no row is kept of it. */
export const SCHEDULER_FIRED = 'scheduler.fired'
/** The crate's alarm (`services/scheduler.rs`). */
const DUE_EVENT = 'scheduler-due'
/** How often a plain browser looks, where there is no alarm. */
const PREVIEW_LOOK_MS = 30 * 1000
/** How often what is on screen is checked for being due; a hidden window slows this, and its return checks again. */
const CHECK_MS = 60 * 1000

const report = (what: string) => (error: unknown) => void logError('signals', what, String(error)).catch(() => null)

const bus = createBus((name, error) => report(`A subscriber of ${name} failed`)(error))
const delivered = new Set<(cards: InboxEntry[]) => void>()
/** The rules of the enabled domains, from the start until the stop. */
let rules: Rule[] = []

/** Hears every signal of the name from now on; the answer stops it. */
export function subscribe(name: DeclaredSignal, handler: SignalHandler): () => void {
	return bus.subscribe(name, handler)
}

/** Hears one schedule each time it is taken as due, with the instant it was due at; the answer stops it. */
export function onSchedule(name: string, handler: (fired: FiredSchedule) => void | Promise<void>): () => void {
	return bus.subscribe(SCHEDULER_FIRED, (payload) =>
		payload.name === name ? handler(payload as unknown as FiredSchedule) : undefined
	)
}

/** Hears the cards each emit makes, which is how the inbox learns of one without asking the store again. */
export function onDelivered(listener: (cards: InboxEntry[]) => void): () => void {
	delivered.add(listener)
	return () => void delivered.delete(listener)
}

/**
 * Emits a signal: the store keeps it with the cards its rules ask for, then its subscribers hear it. A signal whose
 * key was already emitted changes nothing, is heard by nobody and answers `null`.
 */
export async function emit(
	name: DeclaredSignal,
	payload: SignalPayload = {},
	options: { dedupeKey?: string } = {}
): Promise<Emitted | null> {
	const emitted = await emitSignal({
		name,
		payload,
		tier: signalTier(payload),
		dedupeKey: options.dedupeKey ?? null,
		deliveries: deliveriesFor(rules, name, payload),
	})
	if (!emitted) return null
	if (emitted.deliveries.length) {
		for (const listener of delivered) {
			try {
				listener(emitted.deliveries)
			} catch (error) {
				report(`A listener for the cards of ${name} failed`)(error)
			}
		}
	}
	await bus.dispatch(name, emitted.signal.payload)
	return emitted
}

export interface SignalsStart {
	/** The enabled domains' declarations: their rules and their schedules. */
	declarations: readonly DomainDeclaration[]
	/** Each domain's subscriptions, bound now and released at the stop. */
	bind?: readonly (() => () => void)[]
}

/** Starts signals for the life of the shell, once its settings are read. The answer stops everything it started. */
export function startSignals({ declarations, bind = [] }: SignalsStart): () => void {
	rules = rulesOf(Object.fromEntries(declarations.map((declaration) => [declaration.id, declaration])))
	const stops: (() => void)[] = bind.map((subscribe) => subscribe())
	let stopped = false
	const keep = (stop: () => void) => (stopped ? stop() : void stops.push(stop))

	const pump = createPump(
		takeDueSchedules,
		async (fired) => {
			await bus.dispatch(SCHEDULER_FIRED, { ...fired })
			await coordinator.fired(fired.name)
		},
		report('Could not take the due schedules')
	)
	const visible = () => document.visibilityState === 'visible'
	const back = () => {
		void pump()
		void coordinator.check(visible())
	}
	document.addEventListener('visibilitychange', back)
	window.addEventListener('focus', back)
	const minute = setInterval(() => void coordinator.check(visible()), CHECK_MS)
	stops.push(() => {
		document.removeEventListener('visibilitychange', back)
		window.removeEventListener('focus', back)
		clearInterval(minute)
	})

	void (async () => {
		const schedules = declarations.flatMap((declaration) =>
			declaration.schedules.map(({ name, daily, every }) =>
				daily != null ? { name, daily } : { name, every: every ?? 0 }
			)
		)
		await declareSchedules(schedules).catch(report('Could not declare the schedules'))
		if (isTauri()) keep(await listen(DUE_EVENT, () => void pump()))
		else {
			const look = setInterval(() => void pump(), PREVIEW_LOOK_MS)
			keep(() => clearInterval(look))
		}
		await pump()
	})().catch(report('Signals did not start'))

	return () => {
		stopped = true
		for (const stop of stops.splice(0)) stop()
		rules = []
	}
}
