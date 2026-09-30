// The development clamp: in a development build and in a browser, every grade runs on the provider's light model,
// so a session of testing never spends what a deep request would. The overrides are left out with it, since one
// could name a dearer model.
import type { GradeMap, ProviderRow } from './types.js'

/** Whether the build is one to clamp: `development` (the dev channel) or `web` (a plain browser). */
export function isDevEnvironment(env: string): boolean {
	return env === 'development' || env === 'web'
}

/** Every grade on the provider's light model. */
export function clampToLight(_map: GradeMap, provider: ProviderRow): GradeMap {
	const light = { provider: provider.id, model: provider.grades.light }
	return { light: { ...light }, standard: { ...light }, deep: { ...light } }
}
