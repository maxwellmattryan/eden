// The development clamp (D-81): in a development build and in a browser the light and the standard grade run on the
// provider's light model and the deep grade on its standard one, so a session of testing never spends what a deep
// request would, and a model that reasons can still be reached by asking for deep. The overrides are left out with
// it, since one could name a dearer model.
import type { GradeMap, ProviderRow } from './types.js'

/** Whether the build is one to clamp: `development` (the dev channel) or `web` (a plain browser). */
export function isDevEnvironment(env: string): boolean {
	return env === 'development' || env === 'web'
}

/** Light and standard on the provider's light model, deep on its standard one: never its deep model. */
export function clampForDevelopment(_map: GradeMap, provider: ProviderRow): GradeMap {
	const light = { provider: provider.id, model: provider.grades.light }
	return {
		light: { ...light },
		standard: { ...light },
		deep: { provider: provider.id, model: provider.grades.standard },
	}
}
