// The Tasks substrate on the frontend (docs/product/substrate/tasks.md; D-75): the typed task, the rules of due and
// overdue, what each owner action changes, routines' and habits' progress, the Today view, snooze targets and the
// quick-add parser. Every function is pure and takes the instant and the zone; the store in the app keeps the clock.
export {
	describeRecurrence,
	isWorkdays,
	taskChips,
	WORKDAYS,
	type RepeatDescription,
	type TaskChip,
} from './describe.js'
export { REPEAT_EVERY, repeatOf, taskFromDraft, type DraftTask } from './draft.js'
export { parseTask, type ParseContext, type ParsedTask } from './parse.js'
export {
	addTally,
	markDone,
	markSkipped,
	occurrenceOn,
	periodStart,
	reopenDay,
	streakOn,
	tallyOn,
	type OccurrenceState,
} from './progress.js'
export {
	addedToday,
	completion,
	dueDay,
	dueTime,
	edited,
	inverseOf,
	isDateOnly,
	isOverdue,
	moveDue,
	reopened,
	SIGNAL_TITLE_CHARS,
	skip,
	tallied,
	targetMet,
	taskSignal,
	type TaskChange,
	type TaskEdit,
	type TaskSignal,
} from './rules.js'
export { emitTaskCompleted, emitTaskCreated } from './signals.js'
export { snoozeTargets, type SnoozeTargets } from './snooze.js'
export { TODAY_SECTIONS, todayView, type TodayItem, type TodaySection, type TodayView } from './today.js'
export {
	isTime,
	parseProgress,
	parseTarget,
	toTask,
	type DayProgress,
	type HabitTarget,
	type Task,
	type TaskProgress,
} from './types.js'
export { vocabulary, type Language } from './vocabulary.js'
