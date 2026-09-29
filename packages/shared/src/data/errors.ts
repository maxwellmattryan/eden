// An error of the data layer crosses the IPC boundary as its message. The ones the interface tells apart start with
// a stable code, lowercase and followed by a colon (`not-found: eden://recipe/…`, `bundle:hash-mismatch: …`); the
// rest of the message is detail for the diagnostics log.

const CODED = /^([a-z]+(?:-[a-z]+)*(?::[a-z]+(?:-[a-z]+)*)?): /

/** The error a write or a read of the data layer rejects with, here and in the crate. */
export class DataError extends Error {
	constructor(
		readonly code: string,
		detail: string
	) {
		super(`${code}: ${detail}`)
		this.name = 'DataError'
	}
}

/** The code an error starts with, or `undefined` when it carries none. */
export function dataErrorCode(error: unknown): string | undefined {
	const message = error instanceof Error ? error.message : typeof error === 'string' ? error : ''
	return CODED.exec(message)?.[1]
}
