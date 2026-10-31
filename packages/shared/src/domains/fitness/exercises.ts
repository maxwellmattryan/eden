// The bundled exercise library (product/domains/fitness.md, "Entities": `exercise`, T0): common lifts and moves as
// constants, never rows. A template that names one keeps its id (`x-<kebab>`); a move typed by the owner that is not
// here becomes a custom `exercise` row (D-177). The names are the library's own, in English, as a gym says them.
import type { Exercise } from './types.js'

const lift = (name: string, muscles: string[], equipment: string[]): Exercise => ({
	id: `x-${name
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-|-$/g, '')}`,
	name,
	muscles,
	equipment,
})

export const EXERCISES: readonly Exercise[] = [
	lift('Bench press', ['chest', 'triceps'], ['barbell', 'bench']),
	lift('Incline dumbbell press', ['chest'], ['dumbbells', 'bench']),
	lift('Dumbbell bench press', ['chest', 'triceps'], ['dumbbells', 'bench']),
	lift('Cable fly', ['chest'], ['cable']),
	lift('Push-up', ['chest', 'triceps'], []),
	lift('Dip', ['chest', 'triceps'], ['dip station']),
	lift('Triceps pushdown', ['triceps'], ['cable']),
	lift('Skull crusher', ['triceps'], ['barbell', 'bench']),
	lift('Overhead press', ['shoulders', 'triceps'], ['barbell']),
	lift('Lateral raise', ['shoulders'], ['dumbbells']),
	lift('Face pull', ['shoulders', 'back'], ['cable']),
	lift('Deadlift', ['back', 'hamstrings'], ['barbell']),
	lift('Pull-up', ['back', 'biceps'], ['pull-up bar']),
	lift('Chin-up', ['back', 'biceps'], ['pull-up bar']),
	lift('Lat pulldown', ['back', 'biceps'], ['cable']),
	lift('Barbell row', ['back'], ['barbell']),
	lift('Seated cable row', ['back'], ['cable']),
	lift('One-arm dumbbell row', ['back'], ['dumbbells', 'bench']),
	lift('Biceps curl', ['biceps'], ['dumbbells']),
	lift('Hammer curl', ['biceps', 'forearms'], ['dumbbells']),
	lift('Back squat', ['quads', 'glutes'], ['barbell', 'rack']),
	lift('Front squat', ['quads', 'glutes'], ['barbell', 'rack']),
	lift('Goblet squat', ['quads', 'glutes'], ['dumbbells']),
	lift('Romanian deadlift', ['hamstrings', 'glutes'], ['barbell']),
	lift('Hip thrust', ['glutes'], ['barbell', 'bench']),
	lift('Walking lunge', ['quads', 'glutes'], ['dumbbells']),
	lift('Bulgarian split squat', ['quads', 'glutes'], ['dumbbells', 'bench']),
	lift('Leg press', ['quads', 'glutes'], ['machine']),
	lift('Leg curl', ['hamstrings'], ['machine']),
	lift('Calf raise', ['calves'], ['machine']),
	lift('Plank', ['core'], []),
	lift('Hanging leg raise', ['core'], ['pull-up bar']),
]

/** A bundled exercise by its id. */
export function bundledExercise(id: string): Exercise | undefined {
	return EXERCISES.find((exercise) => exercise.id === id)
}

/** Whether an id names a bundled exercise rather than a custom row. */
export const isBundled = (id: string): boolean => id.startsWith('x-')
