// Settings that changed shape. Pure, so the rules are tested without a store or a browser.
import { measurementSystems, type MeasurementSystem } from '../types/index.js'

/**
 * The measurement system from what is stored: the owner's choice when there is one, else what the temperature-only
 * setting it replaced (`eden:units`) implies, else metric (D-58).
 */
export function measurementFrom(stored: string | null, legacyUnits: string | null): MeasurementSystem {
	if (stored !== null && (measurementSystems as readonly string[]).includes(stored)) return stored as MeasurementSystem
	return legacyUnits === 'fahrenheit' ? 'imperial' : 'metric'
}
