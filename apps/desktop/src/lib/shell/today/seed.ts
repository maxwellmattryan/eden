// The sample dataset (design/sample-data.md, "Today") as task rows: the two todos on their days, the routine done
// this morning and the habit with its days, every date shifted onto the real calendar so Wednesday's picture holds
// whenever the seed runs. Written as one batch with an undo; a batch emits no signal (D-75).
import { todayDues, todayHabit, todayRoutine, todayTasks } from '@eden/ui-kit/sample-data'
import type { TaskInput } from '@eden/shared/data'
import { shiftSampleDate, shiftSampleDateTime } from '@eden/shared/dates'
import type { TaskProgress } from '@eden/shared/tasks'
import { tasks, type Undo } from './store.svelte.js'

/** The sample as inputs, the routine's and the habit's progress included. */
export function sampleTasks(): TaskInput[] {
	const todos = todayTasks
		.filter((task) => !task.routine)
		.map((task): TaskInput => ({
			kind: 'todo',
			title: task.title,
			due: shiftSampleDate(todayDues[task.id] ?? '09-30'),
		}))
	const today = shiftSampleDate('09-30')
	const routineProgress: TaskProgress = {
		days: { [today]: { done: new Date(shiftSampleDateTime(`09-30 ${todayRoutine.doneAt}`)).toISOString() } },
	}
	const habitProgress: TaskProgress = {
		days: Object.fromEntries(todayHabit.days.map((day) => [shiftSampleDate(day), { count: 1 }])),
	}
	return [
		...todos,
		{
			kind: 'routine',
			title: todayRoutine.title,
			timeOfDay: todayRoutine.timeOfDay,
			recurrence: { freq: todayRoutine.freq, start: shiftSampleDate(todayRoutine.start) },
			progress: routineProgress,
		},
		{
			kind: 'habit',
			title: todayHabit.title,
			target: todayHabit.target,
			streak: todayHabit.streak,
			progress: habitProgress,
		},
	]
}

/** Seeds Today from the sample, under the surface's name for the feed; the undo takes the sample back. */
export function seedTasks(name: string): Undo {
	return tasks.seed(sampleTasks(), name)
}
