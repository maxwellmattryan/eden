// Vigor's units (D-58, D-177): every measure is stored metric, weight in kg and waist in cm, and shown in the owner's
// system, lb and in when it is imperial. Body fat is a share and the same in both. What is shown is rounded to one
// decimal; what is typed is kept to two, so a weight typed in lb reads back as it was typed. Pure.
import type { MeasurementSystem } from '../../types/index.js'
import type { MetricKind } from './types.js'

export const LB_PER_KG = 2.20462262
export const CM_PER_IN = 2.54

/** One decimal, the way the page shows a measure. */
export const round1 = (value: number): number => Math.round(value * 10) / 10
const round2 = (value: number): number => Math.round(value * 100) / 100

/** The unit a measure is shown in. */
export function unitOf(kind: MetricKind, system: MeasurementSystem): string {
	if (kind === 'body-fat') return '%'
	if (kind === 'weight') return system === 'imperial' ? 'lb' : 'kg'
	return system === 'imperial' ? 'in' : 'cm'
}

/** A stored (metric) value in the owner's system, rounded to one decimal. */
export function toDisplay(kind: MetricKind, value: number, system: MeasurementSystem): number {
	if (system === 'metric' || kind === 'body-fat') return round1(value)
	return round1(kind === 'weight' ? value * LB_PER_KG : value / CM_PER_IN)
}

/** A value typed in the owner's system, as it is stored (metric). */
export function fromDisplay(kind: MetricKind, value: number, system: MeasurementSystem): number {
	if (system === 'metric' || kind === 'body-fat') return round2(value)
	return round2(kind === 'weight' ? value / LB_PER_KG : value * CM_PER_IN)
}
