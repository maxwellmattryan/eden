// The refresh coordinator for the apps (docs/engineering/signals.md): the one every mirror registers with, and the
// one the signals runtime checks when the window comes back and tells when a schedule fires.
import { logError } from '../api/diagnostics.js'
import { createCoordinator } from './coordinator.js'

export { createCoordinator, type Coordinator, type Refreshable } from './coordinator.js'

export const coordinator = createCoordinator(
	(id, error) => void logError('refresh', `Could not refresh ${id}`, String(error)).catch(() => null)
)
