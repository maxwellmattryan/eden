// The usage-window gate (docs/engineering/gardener.md, "Budgets"; D-180): on desktop the Gardener runs on the owner's
// Claude Code subscription, whose 5-hour and weekly windows are the budget. Every process reports where the windows
// stand (`limits`), and the latest reading of each is kept on this device: the policy row syncs, a window does not.
// Before a request the gate warns once a day at the warn threshold and declines at the stop one, or when the
// subscription says it is rejected, until the window resets. The gate holds no copy: what it answers is worded by
// the runtime and the Usage tab.
import type { GardenerEvent } from './runtime-types.js'

export const LIMITS_KEY = 'eden:gardener-limits'

type Stored = Pick<Storage, 'getItem' | 'setItem'>

/** One window as last read: its share used, when it resets in milliseconds since the epoch, and whether it refuses. */
export interface WindowReading {
	utilization: number
	resetsAt: number | null
	rejected: boolean
}

/** The latest reading of each window, by its name (`five_hour`, `seven_day`, …). */
export type Limits = Record<string, WindowReading>

/** A window as the gate names it to the owner: which, how full, and when it resets (ms). */
export interface WindowNote {
	window: string
	utilization: number
	resetsAt: number
}

export type WindowState = 'ok' | 'near' | 'paused' | 'past'

const defaultStorage = (): Stored | undefined => (typeof localStorage === 'undefined' ? undefined : localStorage)

const isReading = (value: unknown): value is WindowReading => {
	const reading = value as WindowReading | null
	return (
		typeof reading === 'object' &&
		reading !== null &&
		typeof reading.utilization === 'number' &&
		Number.isFinite(reading.utilization) &&
		(reading.resetsAt === null || typeof reading.resetsAt === 'number')
	)
}

/** The readings kept on this device; none when there are none, or the storage is missing, throws or holds nonsense. */
export function readLimits(storage: () => Stored | undefined = defaultStorage): Limits {
	try {
		const parsed: unknown = JSON.parse(storage()?.getItem(LIMITS_KEY) ?? '{}')
		if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {}
		return Object.fromEntries(
			Object.entries(parsed as Record<string, unknown>)
				.filter(([, reading]) => isReading(reading))
				.map(([name, reading]) => [
					name,
					{ ...(reading as WindowReading), rejected: !!(reading as WindowReading).rejected },
				])
		)
	} catch {
		return {}
	}
}

/**
 * Lays a process's reading over the kept ones: each window it names replaces what was kept of it, and a `rejected`
 * status marks the window it names (or, naming none, every window it carries). Answers the readings as they stand.
 */
export function recordLimits(
	event: Extract<GardenerEvent, { type: 'limits' }>,
	storage: () => Stored | undefined = defaultStorage
): Limits {
	const limits = readLimits(storage)
	const rejected = event.status === 'rejected'
	for (const [name, window] of Object.entries(event.windows ?? {})) {
		if (typeof window?.utilization !== 'number') continue
		limits[name] = {
			utilization: window.utilization,
			resetsAt: typeof window.resetsAt === 'number' ? window.resetsAt * 1000 : null,
			rejected: rejected && (!event.rateLimitType || event.rateLimitType === name),
		}
	}
	// a refusal for a window the reading does not list is kept as that window full
	if (rejected && event.rateLimitType && !limits[event.rateLimitType]) {
		limits[event.rateLimitType] = {
			utilization: 1,
			resetsAt: typeof event.resetsAt === 'number' ? event.resetsAt * 1000 : null,
			rejected: true,
		}
	}
	try {
		storage()?.setItem(LIMITS_KEY, JSON.stringify(limits))
	} catch {
		// no storage: the gate knows only what this process told it, until the next one
	}
	return limits
}

/** Where a window stands: its reset passed (no longer a reading), refusing, near its limit, or fine. */
export function windowState(window: WindowReading, warnAt: number, stopAt: number, now: number): WindowState {
	if (window.resetsAt !== null && window.resetsAt <= now) return 'past'
	if (window.rejected || window.utilization >= stopAt) return 'paused'
	if (window.utilization >= warnAt) return 'near'
	return 'ok'
}

export interface GateInput {
	limits: Limits
	warnAt: number
	stopAt: number
	/** Milliseconds since the epoch. */
	now: number
	/** The day the warning was last shown, `YYYY-MM-DD`, or null. */
	warnedOn: string | null
	today: string
}

export interface GateResult {
	allowed: boolean
	/** The window that declines, until it resets. */
	decline?: WindowNote
	/** The window to warn about, once a day. */
	warn?: WindowNote
}

/**
 * Whether a request may go (D-180). A paused window declines while its reset is ahead; the one resetting last is
 * named, since the gate holds until then. A window near its limit warns, once a day, the fullest named. A reading
 * whose reset has passed counts for nothing, and with no reading every request is allowed.
 */
export function usageGate({ limits, warnAt, stopAt, now, warnedOn, today }: GateInput): GateResult {
	const current = Object.entries(limits).map(([window, reading]) => ({
		window,
		reading,
		state: windowState(reading, warnAt, stopAt, now),
	}))
	const note = ({ window, reading }: (typeof current)[number]): WindowNote => ({
		window,
		utilization: reading.utilization,
		resetsAt: reading.resetsAt ?? now,
	})
	const paused = current
		.filter((entry) => entry.state === 'paused' && entry.reading.resetsAt !== null && entry.reading.resetsAt > now)
		.sort((a, b) => (b.reading.resetsAt ?? 0) - (a.reading.resetsAt ?? 0))
	if (paused[0]) return { allowed: false, decline: note(paused[0]) }
	if (warnedOn === today) return { allowed: true }
	const near = current
		.filter((entry) => entry.state === 'near' || entry.state === 'paused')
		.sort((a, b) => b.reading.utilization - a.reading.utilization)
	return near[0] ? { allowed: true, warn: note(near[0]) } : { allowed: true }
}
