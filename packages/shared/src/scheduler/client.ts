// The scheduler as the apps call it: the crate's commands under Tauri, the engine in a plain browser. The shell
// declares the manifests' schedules when it starts and takes what is due; a domain sets and cancels its one-shots.
import { call } from '../data/call.js'
import { DataError } from '../data/errors.js'
import { checkName, validateDeclared, type Refusal } from './rules.js'
import type { DeclaredSchedule, FiredSchedule } from './types.js'

function refuse(refusal: Refusal | undefined): void {
	if (refusal) throw new DataError(refusal[0], refusal[1])
}

/** Makes the repeating schedules what the manifests declare. One that stands as declared keeps its next instant. */
export function declareSchedules(schedules: DeclaredSchedule[]): Promise<void> {
	refuse(validateDeclared(schedules))
	return call('declare_schedules', { schedules }, (engine) => engine.declareSchedules(schedules))
}

/** Sets a one-shot for an instant (milliseconds since the epoch), or moves it. A past instant is due at once. */
export function setSchedule(name: string, at: number): Promise<void> {
	refuse(checkName(name))
	const instant = Math.round(at)
	return call('set_schedule', { name, at: instant }, (engine) => engine.setSchedule(name, instant))
}

/** Takes a one-shot back before it is due. Answers whether there was one. */
export function cancelSchedule(name: string): Promise<boolean> {
	refuse(checkName(name))
	return call('cancel_schedule', { name }, (engine) => engine.cancelSchedule(name))
}

/** What is due now, each moved on as it is taken: a schedule is answered once however long it was missed. */
export function takeDueSchedules(): Promise<FiredSchedule[]> {
	return call('take_due_schedules', {}, (engine) => engine.takeDueSchedules())
}
