// How bytes out are counted (D-71): the encoded address and the body of a request, which is what Eden hands over;
// the headers the platform adds are not visible from here and are not counted. Requests are counted apart.

const encoder = new TextEncoder()

/** The bytes a request hands over: its URL, and its body when it has one. */
export function requestBytes(url: string, body?: string | ArrayBuffer | ArrayBufferView): number {
	let bytes = encoder.encode(url).byteLength
	if (typeof body === 'string') bytes += encoder.encode(body).byteLength
	else if (body) bytes += body.byteLength
	return bytes
}

const UNITS = ['B', 'kB', 'MB', 'GB']

/** A byte count for reading: `0 B`, `812 B`, `1.2 kB`, `3.4 MB`. */
export function formatBytes(bytes: number): string {
	let value = Math.max(0, bytes)
	let unit = 0
	while (value >= 1000 && unit < UNITS.length - 1) {
		value /= 1000
		unit += 1
	}
	return unit === 0 ? `${Math.round(value)} ${UNITS[unit]}` : `${value.toFixed(1)} ${UNITS[unit]}`
}
