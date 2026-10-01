// What the pack and the runtime work out about a message's files without their bytes (D-82, D-83): the size an image
// is sent at, what a file costs in tokens and bytes, the Attachment kind it is stored as, and what the audit keeps.
// The token figures are estimates for the budget, on the generous side; the provider's count is what is billed.
import { attachmentForm, IMAGE_SENT_EDGE, IMAGE_SENT_MAX_BYTES, isImageType } from './attachment-limits.js'
import type { AttachmentBlock, AuditAttachment, Message, MessageBlock } from './runtime-types.js'

/** The pixels an image is sent at: scaled so its long edge is at most `IMAGE_SENT_EDGE`, never up. */
export function sentSize(width: number, height: number): { width: number; height: number } {
	const edge = Math.max(width, height)
	if (edge <= IMAGE_SENT_EDGE) return { width, height }
	const scale = IMAGE_SENT_EDGE / edge
	return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) }
}

/** An image's tokens at the size it is sent: its pixels over 750; one of unknown size counts as the largest sent. */
export function imageTokens(width: number | undefined, height: number | undefined): number {
	if (!width || !height) return Math.ceil((IMAGE_SENT_EDGE * IMAGE_SENT_EDGE) / 750)
	const sent = sentSize(width, height)
	return Math.ceil((sent.width * sent.height) / 750)
}

/** A PDF costs its text and a picture of each page; without the pages, its bytes stand in, never under one page. */
const PDF_BYTES_PER_TOKEN = 40
const PDF_FLOOR = 1500

export function attachmentTokens(block: AttachmentBlock): number {
	const form = attachmentForm(block.mime)
	if (form === 'image') return imageTokens(block.width, block.height)
	if (form === 'pdf') return Math.max(PDF_FLOOR, Math.ceil(block.size / PDF_BYTES_PER_TOKEN))
	return Math.ceil(block.size / 4)
}

/** The bytes a file adds to a request, before base64: an image is scaled down to its cap, the rest go whole. */
export function sentBytes(block: AttachmentBlock): number {
	return attachmentForm(block.mime) === 'image' ? Math.min(block.size, IMAGE_SENT_MAX_BYTES) : block.size
}

/** The Attachment kind a file is stored as: an image is a `photo` (T1), anything else a `document` (T2). */
export function attachmentKind(mime: string): 'photo' | 'document' {
	return isImageType(mime) ? 'photo' : 'document'
}

export function attachmentsOf(blocks: unknown): AttachmentBlock[] {
	return (Array.isArray(blocks) ? (blocks as MessageBlock[]) : []).filter(
		(block): block is AttachmentBlock => block?.kind === 'attachment'
	)
}

/** Whether a request needs a model that sees: an image or a PDF in the message, or in a message before it. */
export function hasVisual(thread: Message[], current: AttachmentBlock[] = []): boolean {
	const visual = (block: AttachmentBlock) => attachmentForm(block.mime) !== 'text'
	return current.some(visual) || thread.some((message) => attachmentsOf(message.blocks).some(visual))
}

/** What the audit log keeps of a file: never its bytes, nor its name. */
export function auditOf(block: AttachmentBlock): AuditAttachment {
	const entry: AuditAttachment = { hash: block.hash, mime: block.mime, size: block.size }
	if (block.width && block.height) Object.assign(entry, { width: block.width, height: block.height })
	return entry
}
