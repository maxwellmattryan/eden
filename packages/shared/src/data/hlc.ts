// The hybrid logical clock that stamps every row, as in the crate (`src-tauri/src/substrate/hlc.rs`). A stamp is
// `{wallMs:016x}-{counter:08x}-{node:08x}`: fixed-width lowercase hex, so comparing two stamps as text compares them
// as clocks. The wall part is where a row's human times come from.

export interface Hlc {
	wallMs: number
	counter: number
	node: number
}

const PATTERN = /^[0-9a-f]{16}-[0-9a-f]{8}-[0-9a-f]{8}$/
const COUNTER_MAX = 0xffffffff

/** The stamp of the rows every workspace is seeded with; any real stamp is greater. */
export const MIN_STAMP = '0000000000000000-00000000-00000000'

const hex = (value: number, width: number) => value.toString(16).padStart(width, '0')

export function formatStamp(clock: Hlc): string {
	return `${hex(clock.wallMs, 16)}-${hex(clock.counter, 8)}-${hex(clock.node, 8)}`
}

export function parseStamp(stamp: string): Hlc | null {
	if (!PATTERN.test(stamp)) return null
	const [wallMs = 0, counter = 0, node = 0] = stamp.split('-').map((part) => parseInt(part, 16))
	if (!Number.isSafeInteger(wallMs)) return null
	return { wallMs, counter, node }
}

/** The clock after a local write at `nowMs`. */
export function tick(clock: Hlc, nowMs: number): Hlc {
	if (nowMs > clock.wallMs) return { ...clock, wallMs: nowMs, counter: 0 }
	return { ...clock, counter: Math.min(clock.counter + 1, COUNTER_MAX) }
}

/** The clock after it has seen a stamp from elsewhere: later than both, whatever the wall clock says. */
export function receive(clock: Hlc, remote: Hlc, nowMs: number): Hlc {
	const wallMs = Math.max(clock.wallMs, remote.wallMs, nowMs)
	let counter = 0
	if (wallMs === clock.wallMs && wallMs === remote.wallMs) counter = Math.max(clock.counter, remote.counter) + 1
	else if (wallMs === clock.wallMs) counter = clock.counter + 1
	else if (wallMs === remote.wallMs) counter = remote.counter + 1
	return { ...clock, wallMs, counter: Math.min(counter, COUNTER_MAX) }
}

/** When a stamp was made, or `null` for what is not a stamp. The seeded rows answer the epoch. */
export function stampToDate(stamp: string): Date | null {
	const clock = parseStamp(stamp)
	return clock ? new Date(clock.wallMs) : null
}
