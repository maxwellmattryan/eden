// A task for the tests beside this module: the fields a test names over an empty todo.
import type { Task } from './types.js'

let next = 0

/** A task with the fields given; ids count up, as ULIDs made in one process do. */
export function task(fields: Partial<Task> & Pick<Task, 'kind' | 'title'>): Task {
	next += 1
	const id = String(next).padStart(4, '0')
	return {
		id,
		uri: `eden://task/${id}`,
		notes: null,
		due: null,
		priority: 'none',
		timeOfDay: null,
		recurrence: null,
		items: [],
		target: null,
		grace: 0,
		streak: 0,
		progress: { days: {} },
		done: false,
		completedAt: null,
		...fields,
	}
}
