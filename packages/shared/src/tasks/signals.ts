// The task signals, emitted by the frontend (D-75; docs/engineering/signals.md, "The first consumers"): the data
// layer emits nothing for a task, because the crate cannot see a routine's or a habit's completion, which lives in
// `progress`, opaque to it. Whatever creates or completes a task for the owner calls these after its write lands:
// the Today store, the palette's verb, a domain that makes a task, a Gardener tool. A batch (the seed) and an import
// call nothing. A failed emit is logged and never fails the write that came before it. The pure half, `taskSignal`,
// is in `rules.ts`.
import { logError } from '../api/diagnostics.js'
import { emit } from '../signals/runtime.js'
import type { WeekStart } from '../types/index.js'
import { targetMet, taskSignal } from './rules.js'
import type { Task } from './types.js'

async function send(signal: ReturnType<typeof taskSignal>): Promise<void> {
	try {
		await emit(signal.name, signal.payload, { dedupeKey: signal.dedupeKey })
	} catch (error) {
		await logError('signals', `Could not emit ${signal.name}`, String(error)).catch(() => null)
	}
}

/** `task.created` for a task the owner made, on the day it was made. */
export function emitTaskCreated(task: Task, day: string, weekStart: WeekStart): Promise<void> {
	return send(taskSignal('task.created', task, day, weekStart))
}

/**
 * `task.completed` for a todo, a checklist or a routine done on the day, and for a habit whose tally on the day meets
 * its target; a habit short of it emits nothing.
 */
export function emitTaskCompleted(task: Task, day: string, weekStart: WeekStart): Promise<void> {
	if (task.kind === 'habit' && !targetMet(task, day, weekStart)) return Promise.resolve()
	return send(taskSignal('task.completed', task, day, weekStart))
}
