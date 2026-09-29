// ULIDs (D-24): 48 bits of time and 80 of randomness as 26 characters of Crockford base 32. Ids made here only ever
// grow, even within one millisecond, so the order of ids is the order of creation, as in the crate
// (`src-tauri/src/substrate/ids.rs`).

const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
const TIME_CHARS = 10
const RANDOM_CHARS = 16
const PATTERN = /^[0-7][0-9A-HJKMNP-TV-Z]{25}$/

/** Fills the bytes with random values; `crypto.getRandomValues` in the webview and in Node. */
export type RandomSource = (bytes: Uint8Array) => void

const secure: RandomSource = (bytes) => void crypto.getRandomValues(bytes)

function encodeTime(ms: number): string {
	let out = ''
	let rest = ms
	for (let index = 0; index < TIME_CHARS; index++) {
		out = ALPHABET[rest % 32] + out
		rest = Math.floor(rest / 32)
	}
	return out
}

function randomDigits(random: RandomSource): number[] {
	const bytes = new Uint8Array(RANDOM_CHARS)
	random(bytes)
	return Array.from(bytes, (byte) => byte % 32)
}

/** The digits plus one, or `null` when every digit is already the last. */
function increment(digits: number[]): number[] | null {
	const next = [...digits]
	for (let index = next.length - 1; index >= 0; index--) {
		const digit = next[index] ?? 0
		if (digit < 31) {
			next[index] = digit + 1
			return next
		}
		next[index] = 0
	}
	return null
}

/** A generator with its own memory of the last id, so tests can have one each. */
export function createIdGenerator(random: RandomSource = secure): (now?: number) => string {
	let lastTime = -1
	let lastDigits: number[] = []
	return (now = Date.now()) => {
		// A clock that went backwards keeps the last time, so the ids still grow.
		const time = Math.max(now, lastTime)
		const bumped = time === lastTime ? increment(lastDigits) : null
		lastDigits = bumped ?? randomDigits(random)
		// The random part overflowed within one millisecond: move to the next one.
		lastTime = time === lastTime && !bumped ? time + 1 : time
		return encodeTime(lastTime) + lastDigits.map((digit) => ALPHABET[digit]).join('')
	}
}

/** A new id. */
export const newId = createIdGenerator()

/** Whether `id` is a ULID in its canonical form. */
export function isUlid(id: string): boolean {
	return PATTERN.test(id)
}
