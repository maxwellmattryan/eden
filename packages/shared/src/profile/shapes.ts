// The shape of each fact type's value (docs/product/substrate/profile.md, "Phase 1 fact types"). The registry names
// the type, its owner and its tier; this table says what its value looks like, so the editor can offer the right
// fields and the store can refuse a value that does not fit. It is the frontend's alone (D-72): the crate holds any
// JSON that is not nothing, and this check runs before a write is sent, under Tauri and in the browser alike.
import { RESOURCES } from '../registry/index.js'

type Row = (typeof RESOURCES)[number]
/** The fact types the owner may assert: those of Phase 1, their domain built or not. */
export type LiveFactId = Extract<Row, { category: 'fact'; live: true }>['id']

export const LIVE_FACT_TYPES: readonly LiveFactId[] = RESOURCES.filter(
	(row): row is Extract<Row, { category: 'fact'; live: true }> => row.category === 'fact' && row.live
).map((row) => row.id)

export type ValueShape =
	| { kind: 'string'; max?: number }
	| { kind: 'integer'; min?: number; max?: number }
	/** One of the options; with `custom`, any other word the owner types. */
	| { kind: 'enum'; options: readonly string[]; custom?: boolean }
	/** `{ name, weight }`: a word and how much it counts, 0 to 1. */
	| { kind: 'weighted' }
	| { kind: 'object'; fields: readonly ObjectField[]; join?: string }

export interface ObjectField {
	key: string
	shape: ValueShape
	required?: boolean
}

export interface FactShape {
	shape: ValueShape
	/** One row per value, as for `allergy`; a single-valued type is edited rather than added to. */
	multi: boolean
	/** The substrate writes it; the owner reads it and may assert their own beside it. */
	derived?: true
}

const string = (max = 200): ValueShape => ({ kind: 'string', max })
const options = (...options: string[]): ValueShape => ({ kind: 'enum', options })

export const DIETARY_PREFERENCES = [
	'vegetarian',
	'vegan',
	'pescatarian',
	'halal',
	'kosher',
	'low-sodium',
	'low-sugar',
	'gluten-free',
	'alcohol-free',
] as const
export const ALLERGY_KINDS = ['food', 'drug', 'environmental'] as const
export const ALLERGY_SEVERITIES = ['mild', 'moderate', 'severe'] as const
export const SKILL_LEVELS = ['beginner', 'intermediate', 'advanced', 'expert'] as const

export const FACT_SHAPES: Record<LiveFactId, FactShape> = {
	'preferred-name': { shape: string(80), multi: false },
	'home-area': {
		shape: {
			kind: 'object',
			join: ', ',
			fields: [
				{ key: 'city', shape: string(120), required: true },
				{ key: 'region', shape: string(120) },
				{ key: 'country', shape: string(120) },
			],
		},
		multi: false,
		derived: true,
	},
	allergy: {
		shape: {
			kind: 'object',
			fields: [
				{ key: 'substance', shape: string(120), required: true },
				{ key: 'kind', shape: options(...ALLERGY_KINDS), required: true },
				{ key: 'severity', shape: options(...ALLERGY_SEVERITIES), required: true },
			],
		},
		multi: true,
	},
	'dietary-preference': { shape: { kind: 'enum', options: DIETARY_PREFERENCES, custom: true }, multi: true },
	'disliked-ingredient': { shape: string(120), multi: true },
	'cuisine-preference': { shape: { kind: 'weighted' }, multi: true },
	'household-size': { shape: { kind: 'integer', min: 1, max: 20 }, multi: false },
	skill: {
		shape: {
			kind: 'object',
			fields: [
				{ key: 'name', shape: string(120), required: true },
				{ key: 'level', shape: options(...SKILL_LEVELS), required: true },
			],
		},
		multi: true,
	},
	'owned-hardware': { shape: string(120), multi: true },
	'preferred-tool': { shape: string(120), multi: true },
	'medical-dietary-restriction': { shape: string(200), multi: true },
}

export function isLiveFact(id: string): id is LiveFactId {
	return Object.hasOwn(FACT_SHAPES, id)
}

/** The shape of a type's value, or nothing for a type the owner cannot assert. */
export function shapeOf(type: string): FactShape | undefined {
	return isLiveFact(type) ? FACT_SHAPES[type] : undefined
}

const isObject = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null && !Array.isArray(value)
const isWord = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0

function check(shape: ValueShape, value: unknown, at: string): string | undefined {
	switch (shape.kind) {
		case 'string':
			if (!isWord(value)) return `${at} is a word`
			if (value.length > (shape.max ?? 200)) return `${at} is too long`
			return undefined
		case 'integer':
			if (!Number.isInteger(value)) return `${at} is a whole number`
			if (shape.min !== undefined && (value as number) < shape.min) return `${at} is at least ${shape.min}`
			if (shape.max !== undefined && (value as number) > shape.max) return `${at} is at most ${shape.max}`
			return undefined
		case 'enum':
			if (!isWord(value)) return `${at} is a word`
			if (!shape.options.includes(value) && !shape.custom) return `${at} is one of ${shape.options.join(', ')}`
			return value.length > 120 ? `${at} is too long` : undefined
		case 'weighted': {
			if (!isObject(value)) return `${at} is a name with a weight`
			const strange = Object.keys(value).find((key) => key !== 'name' && key !== 'weight')
			if (strange) return `${at} has no ${strange}`
			if (!isWord(value.name) || value.name.length > 120) return `${at}.name is a word`
			const weight = value.weight
			if (typeof weight !== 'number' || !(weight >= 0 && weight <= 1)) return `${at}.weight is between 0 and 1`
			return undefined
		}
		case 'object': {
			if (!isObject(value)) return `${at} is an object`
			const strange = Object.keys(value).find((key) => !shape.fields.some((field) => field.key === key))
			if (strange) return `${at} has no ${strange}`
			for (const field of shape.fields) {
				const present = value[field.key] !== undefined && value[field.key] !== null && value[field.key] !== ''
				if (!present) {
					if (field.required) return `${at}.${field.key} is needed`
					continue
				}
				const detail = check(field.shape, value[field.key], `${at}.${field.key}`)
				if (detail) return detail
			}
			return undefined
		}
	}
}

/** Why the value does not fit the type's shape, or nothing when it does. A type without a shape fits nothing. */
export function validateValue(type: string, value: unknown): string | undefined {
	const shape = shapeOf(type)
	if (!shape) return `not a fact type the owner can assert: ${type}`
	return check(shape.shape, value, 'value')
}

/** The locale key of an option's word: `profile.values.<type>.<option>`, or `.<field>.<option>` inside an object. */
export function optionKey(type: string, option: string, field?: string): string {
	return field ? `profile.values.${type}.${field}.${option}` : `profile.values.${type}.${option}`
}

/**
 * The value as one line: a word as itself, a number as itself, an option as its translated word (`label` turns a
 * locale key into it), a weighted name as the name, an object as its fields in order.
 */
export function formatValue(type: string, value: unknown, label: (key: string) => string): string {
	const shape = shapeOf(type)
	if (!shape) return typeof value === 'string' ? value : JSON.stringify(value)
	return format(shape.shape, value, (option, field) =>
		typeof option === 'string' ? label(optionKey(type, option, field)) : String(option)
	)
}

function format(
	shape: ValueShape,
	value: unknown,
	option: (option: unknown, field?: string) => string,
	field?: string
): string {
	switch (shape.kind) {
		case 'string':
			return typeof value === 'string' ? value : ''
		case 'integer':
			return typeof value === 'number' ? String(value) : ''
		case 'enum':
			return typeof value === 'string' && shape.options.includes(value) ? option(value, field) : String(value ?? '')
		case 'weighted':
			return isObject(value) && typeof value.name === 'string' ? value.name : ''
		case 'object':
			if (!isObject(value)) return ''
			return shape.fields
				.map((entry) => format(entry.shape, value[entry.key], option, entry.key))
				.filter((part) => part.length > 0)
				.join(shape.join ?? ' · ')
	}
}

/** The weight of a weighted value, or nothing. */
export function weightOf(value: unknown): number | undefined {
	return isObject(value) && typeof value.weight === 'number' ? value.weight : undefined
}
