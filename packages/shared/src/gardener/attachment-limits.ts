// What a message to the Gardener may carry (D-82, D-83): which files, how many, how large. One module, so the drop
// zone, the picker, a paste, the pack and the estimate all hold a file to the same numbers. The crate keeps a hard
// cap of its own per file (`MAX_ATTACH_BYTES`), above every number here.

const MB = 1024 * 1024

/** Files per message. */
export const MAX_FILES = 10
/** An image as it is stored: the original. */
export const IMAGE_MAX_BYTES = 20 * MB
/** An image as it is sent: its long edge, in px, and its weight. Larger ones are scaled down first. */
export const IMAGE_SENT_EDGE = 1568
export const IMAGE_SENT_MAX_BYTES = 5 * MB
export const PDF_MAX_BYTES = 10 * MB
/** A text file is sent whole, as text: at four characters a token this is some 64 000 tokens. */
export const TEXT_MAX_BYTES = 256 * 1024
/** Everything staged on one message, as stored. */
export const MESSAGE_MAX_BYTES = 50 * MB
/** Everything one request carries as sent, the conversation's earlier files included: base64 adds a third. */
export const REQUEST_MAX_BYTES = 20 * MB
/** A paste of more characters than this becomes a text file. */
export const LONG_PASTE_CHARS = 4000
/** A thumbnail's long edge, in px. */
export const THUMB_EDGE = 256

/** The images a vision model takes. */
export const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const
export type ImageType = (typeof IMAGE_TYPES)[number]

const BY_EXTENSION: Record<string, string> = {
	jpg: 'image/jpeg',
	jpeg: 'image/jpeg',
	png: 'image/png',
	webp: 'image/webp',
	gif: 'image/gif',
	pdf: 'application/pdf',
	txt: 'text/plain',
	md: 'text/markdown',
	csv: 'text/csv',
	json: 'application/json',
}

/**
 * What a message takes, as the kit's file rules read it: MIME types, and the extensions beside them because an engine
 * leaves `type` empty for a file it does not know (`.md`).
 */
export const ACCEPT: readonly string[] = [
	...new Set(Object.values(BY_EXTENSION)),
	...Object.keys(BY_EXTENSION).map((extension) => `.${extension}`),
]

/** The MIME type an attachment is stored and sent under: by its extension first, as the crate does, else as given. */
export function attachmentMime(name: string, type: string): string {
	const dot = name.lastIndexOf('.')
	const extension = dot > 0 ? name.slice(dot + 1).toLowerCase() : ''
	return BY_EXTENSION[extension] ?? (type || 'application/octet-stream')
}

export function isImageType(mime: string): mime is ImageType {
	return (IMAGE_TYPES as readonly string[]).includes(mime)
}

/** How an attachment goes to the model: an image, a PDF, or text sent as text. */
export function attachmentForm(mime: string): 'image' | 'pdf' | 'text' {
	if (isImageType(mime)) return 'image'
	return mime === 'application/pdf' ? 'pdf' : 'text'
}

/** The largest a file of this type may be, as stored. */
export function maxBytesFor(mime: string): number {
	const form = attachmentForm(mime)
	return form === 'image' ? IMAGE_MAX_BYTES : form === 'pdf' ? PDF_MAX_BYTES : TEXT_MAX_BYTES
}
