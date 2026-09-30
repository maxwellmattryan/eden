// The rules of signals. Two kinds live here. The store's, which the crate enforces too
// (`src-tauri/src/substrate/signals.rs`): what a signal may be named and carry, and how long it is kept. And the
// manifests', which only the frontend knows (D-73, as D-72 for the shape of a fact): which notification kinds answer
// a signal, and the tier of what it names. An emit works both out and hands the store a signal with its cards.
import { parseUri } from '../data/uri.js'
import type { NotificationChannel } from '../manifest/types.js'
import { resource } from '../registry/index.js'
import {
	MAX_KEY_CHARS,
	MAX_PAYLOAD_BYTES,
	SIGNAL_RETENTION_DAYS,
	SIGNAL_TIERS,
	type Delivery,
	type SignalInput,
	type SignalPayload,
	type SignalTier,
} from './types.js'

/** The refusal's code (`signal:invalid`) and why. */
export type Refusal = [code: string, detail: string]

const ID = '[a-z][a-z0-9]*(?:-[a-z0-9]+)*'
const PAIR = new RegExp(`^${ID}\\.${ID}$`)

const invalid = (detail: string): Refusal => ['signal:invalid', detail]
const isObject = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null && !Array.isArray(value)

/** Why the store would not keep the signal, or nothing. */
export function validateSignal(input: SignalInput): Refusal | undefined {
	if (!PAIR.test(input.name)) return invalid(`not a signal name: ${JSON.stringify(input.name)}`)
	if (!SIGNAL_TIERS.includes(input.tier)) return invalid(`not a tier: ${JSON.stringify(input.tier)}`)
	if (input.payload !== undefined) {
		if (!isObject(input.payload)) return invalid('a payload is an object')
		const bytes = new TextEncoder().encode(JSON.stringify(input.payload)).length
		if (bytes > MAX_PAYLOAD_BYTES) return invalid(`a payload of ${bytes} bytes; the most is ${MAX_PAYLOAD_BYTES}`)
	}
	const key = input.dedupeKey
	if (key != null && (key.length === 0 || [...key].length > MAX_KEY_CHARS)) return invalid('not a key')
	const seen = new Set<string>()
	for (const delivery of input.deliveries ?? []) {
		if (!PAIR.test(delivery.rule)) return invalid(`not a rule: ${JSON.stringify(delivery.rule)}`)
		if (seen.has(delivery.rule)) return invalid(`the rule ${JSON.stringify(delivery.rule)} delivers once`)
		seen.add(delivery.rule)
	}
	return undefined
}

/** The stamp a signal must be later than to be kept: thirty days before now. */
export function signalCutoff(nowMs: number): string {
	const cutoff = Math.max(0, nowMs - SIGNAL_RETENTION_DAYS * 24 * 60 * 60 * 1000)
	return `${cutoff.toString(16).padStart(16, '0')}-00000000-00000000`
}

/**
 * The tier of what a payload names under `uris`: the highest among them, T0 when it names nothing. A primitive's
 * tier is its kind's or its source's, which the URI does not say, so it counts as T2; so does a URI the registry
 * does not know. T2 and above keep an OS notification from saying what the signal is about.
 */
export function signalTier(payload: SignalPayload | undefined): SignalTier {
	const uris = Array.isArray(payload?.uris) ? payload.uris : []
	let rank = 0
	for (const uri of uris) {
		const tier = (typeof uri === 'string' ? resource(parseUri(uri)?.type ?? '') : undefined)?.tier
		const known = SIGNAL_TIERS.indexOf(tier as SignalTier)
		rank = Math.max(rank, known === -1 ? 2 : known)
	}
	return SIGNAL_TIERS[rank] ?? 'T2'
}

/** What a rule is made from: a domain's notification kinds, those with a signal to answer. */
export interface RuleSource {
	readonly notificationKinds: readonly {
		readonly id: string
		readonly channel: NotificationChannel
		readonly default: boolean
		readonly signal?: string | null
		readonly when?: Readonly<Record<string, readonly string[]>> | null
	}[]
}

/** Trigger, condition, action: the signal a notification kind answers, what its payload must say, and the channel. */
export interface Rule {
	/** The domain and the kind: `weather.severe-alert`. */
	id: string
	domain: string
	kind: string
	signal: string
	channel: NotificationChannel
	/** Each field named must be one of the values listed. */
	when: Readonly<Record<string, readonly string[]>> | null
}

/** The rules the manifests ship that are on: the kinds with a signal, less those off by default. */
export function rulesOf(declarations: Readonly<Record<string, RuleSource>>): Rule[] {
	return Object.entries(declarations).flatMap(([domain, declaration]) =>
		declaration.notificationKinds.flatMap((kind) =>
			kind.signal && kind.default
				? [
						{
							id: `${domain}.${kind.id}`,
							domain,
							kind: kind.id,
							signal: kind.signal,
							channel: kind.channel,
							when: kind.when ?? null,
						},
					]
				: []
		)
	)
}

/** Whether a rule's condition holds for a payload. */
export function holds(rule: Rule, payload: SignalPayload): boolean {
	return Object.entries(rule.when ?? {}).every(([field, allowed]) => {
		const value = payload[field]
		return typeof value === 'string' && allowed.includes(value)
	})
}

/** The cards a signal asks for: one for each rule it triggers whose condition holds. */
export function deliveriesFor(rules: readonly Rule[], name: string, payload: SignalPayload = {}): Delivery[] {
	return rules
		.filter((rule) => rule.signal === name && holds(rule, payload))
		.map((rule) => ({ rule: rule.id, channel: rule.channel }))
}
