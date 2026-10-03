// The files the owner attaches to a message (docs/engineering/gardener.md, "Attachments"; D-82 to D-84): held to the
// limits before they are staged, measured and given a thumbnail while they wait in the composer, written into the
// workspace when the message is sent, and read back and scaled for the model when the pack is built. A file is
// bytes from the moment it arrives (a drop, the picker, a paste) and never a path. Images are decoded with
// `createImageBitmap` and drawn off-screen: the page's CSP has no `blob:` to load one through.
import { checkFiles, formatBytes, type FileRefusal, type FileRules } from '@eden/ui-kit'
import { attachBytes, deleteRows, readAttachment } from '../../data/index.js'
import {
	ACCEPT,
	attachmentForm,
	attachmentKind,
	attachmentMime,
	IMAGE_MAX_BYTES,
	IMAGE_SENT_EDGE,
	IMAGE_SENT_MAX_BYTES,
	MAX_FILES,
	maxBytesFor,
	MESSAGE_MAX_BYTES,
	sentSize,
	THUMB_EDGE,
	type AttachmentBlock,
	type PackAttachment,
} from '../../gardener/index.js'

/** What is known of an image once it has been decoded. */
export interface FileMeta {
	width?: number
	height?: number
	/** A small JPEG of the image, as a data URL. */
	thumbnail?: string
}

/** A file waiting in the composer. `busy` until it has been measured. */
export interface StagedFile extends FileMeta {
	key: string
	file: File
	name: string
	/** The type it is stored and sent under: by its extension first, as the crate names it. */
	mime: string
	size: number
	busy: boolean
}

/** Why a file was not staged: the kit's reasons, and a file with nothing in it. */
export type StageRefusal = FileRefusal | 'empty'
export interface StageCheck {
	accepted: File[]
	rejected: { file: File; reason: StageRefusal }[]
}

/** The rules for the next files, given what is already staged: for the drop zone, the picker and a paste alike. */
export function stagedRules(staged: readonly { size: number }[]): FileRules {
	return {
		accept: ACCEPT,
		maxFiles: MAX_FILES,
		// the largest any type may be; each type's own cap is held in `capByType`
		maxSize: IMAGE_MAX_BYTES,
		maxTotalSize: MESSAGE_MAX_BYTES,
		count: staged.length,
		totalSize: staged.reduce((sum, entry) => sum + entry.size, 0),
	}
}

/** Holds files the kit's rules took to what the rules cannot say: each type's own size, and that a file has bytes. */
export function capByType(files: File[]): StageCheck {
	const check: StageCheck = { accepted: [], rejected: [] }
	for (const file of files) {
		if (file.size === 0) check.rejected.push({ file, reason: 'empty' })
		else if (file.size > maxBytesFor(attachmentMime(file.name, file.type)))
			check.rejected.push({ file, reason: 'size' })
		else check.accepted.push(file)
	}
	return check
}

/** The whole check, for files that did not come through the drop zone. */
export function checkStaged(files: File[], staged: readonly { size: number }[]): StageCheck {
	const ruled = checkFiles(files, stagedRules(staged))
	const capped = capByType(ruled.accepted)
	return { accepted: capped.accepted, rejected: [...ruled.rejected, ...capped.rejected] }
}

/** A file as it is first staged: named and typed, not yet measured. */
export function stagedOf(file: File): StagedFile {
	return {
		key: crypto.randomUUID(),
		file,
		name: file.name,
		mime: attachmentMime(file.name, file.type),
		size: file.size,
		busy: true,
	}
}

/** The caption beside a staged or sent file's name. */
export const sizeLabel = (size: number) => formatBytes(size)

function toBase64(bytes: Uint8Array): string {
	let binary = ''
	const CHUNK = 0x8000
	for (let at = 0; at < bytes.length; at += CHUNK) {
		binary += String.fromCharCode(...bytes.subarray(at, at + CHUNK))
	}
	return btoa(binary)
}

/** A bitmap drawn at a size and encoded as a JPEG, on white: a JPEG has no transparency. */
async function drawJpeg(bitmap: ImageBitmap, width: number, height: number, quality: number): Promise<Uint8Array> {
	const canvas = new OffscreenCanvas(width, height)
	const context = canvas.getContext('2d')
	if (!context) throw new Error('no 2d context')
	context.fillStyle = '#fff'
	context.fillRect(0, 0, width, height)
	context.drawImage(bitmap, 0, 0, width, height)
	const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality })
	return new Uint8Array(await blob.arrayBuffer())
}

/** An image's size and a thumbnail of it; nothing for a file that is not an image, or one that will not decode. */
export async function measure(file: Blob, mime: string): Promise<FileMeta> {
	if (attachmentForm(mime) !== 'image') return {}
	let bitmap: ImageBitmap | undefined
	try {
		bitmap = await createImageBitmap(file)
		const { width, height } = bitmap
		const scale = Math.min(1, THUMB_EDGE / Math.max(width, height))
		const jpeg = await drawJpeg(
			bitmap,
			Math.max(1, Math.round(width * scale)),
			Math.max(1, Math.round(height * scale)),
			0.7
		)
		return { width, height, thumbnail: `data:image/jpeg;base64,${toBase64(jpeg)}` }
	} catch {
		// not an image the engine reads: it is stored and sent as it is, without a picture
		return bitmap ? { width: bitmap.width, height: bitmap.height } : {}
	} finally {
		bitmap?.close()
	}
}

// The measurements under way, by a staged file's key, so a send can wait for the ones it carries.
const underWay = new Map<string, Promise<void>>()
export const measuring = {
	track(key: string, work: Promise<void>): void {
		underWay.set(
			key,
			work.finally(() => underWay.delete(key))
		)
	},
	/** Resolves once every one of the files has been measured. */
	async settled(keys: string[]): Promise<void> {
		await Promise.all(keys.map((key) => underWay.get(key)))
	},
}

/**
 * Writes the staged files into the workspace, each as an Attachment that is part of the thread, and answers the
 * blocks the message carries. All or none: if one cannot be written, the ones before it are deleted again.
 */
export async function storeFiles(staged: readonly StagedFile[], threadUri: string): Promise<AttachmentBlock[]> {
	const blocks: AttachmentBlock[] = []
	const written: string[] = []
	try {
		for (const entry of staged) {
			const bytes = new Uint8Array(await entry.file.arrayBuffer())
			const sized = entry.width && entry.height ? { width: entry.width, height: entry.height } : {}
			const row = await attachBytes(
				{
					kind: attachmentKind(entry.mime),
					fileName: entry.name,
					mime: entry.mime,
					...(entry.thumbnail ? { thumbnail: entry.thumbnail } : {}),
					captured: { ...sized, via: 'gardener' },
					links: [{ uri: threadUri, relation: 'part-of' }],
				},
				bytes
			)
			written.push(row.uri)
			blocks.push({
				kind: 'attachment',
				id: row.id,
				name: row.fileName,
				mime: row.mime,
				size: row.size,
				hash: row.hash,
				...sized,
			})
		}
	} catch (error) {
		if (written.length) await deleteRows(written).catch(() => undefined)
		throw error
	}
	return blocks
}

/** What is sent of an image: itself when it is within the sent size, else a JPEG scaled down to it. */
async function imageToSend(bytes: Uint8Array, block: AttachmentBlock): Promise<PackAttachment> {
	const asIs: PackAttachment = { kind: 'image', mediaType: block.mime, data: '' }
	const within =
		bytes.length <= IMAGE_SENT_MAX_BYTES &&
		(!block.width || !block.height || Math.max(block.width, block.height) <= IMAGE_SENT_EDGE)
	if (within) return { ...asIs, data: toBase64(bytes) }
	let bitmap: ImageBitmap | undefined
	try {
		bitmap = await createImageBitmap(new Blob([bytes as Uint8Array<ArrayBuffer>], { type: block.mime }))
		const size = sentSize(bitmap.width, bitmap.height)
		const jpeg = await drawJpeg(bitmap, size.width, size.height, 0.85)
		return { kind: 'image', mediaType: 'image/jpeg', data: toBase64(jpeg) }
	} catch {
		// it would not decode here: the provider is given the original and says what it makes of it
		return { ...asIs, data: toBase64(bytes) }
	} finally {
		bitmap?.close()
	}
}

/** What the pack sends of a stored file, from its bytes. */
export async function toSend(bytes: Uint8Array, block: AttachmentBlock): Promise<PackAttachment> {
	const form = attachmentForm(block.mime)
	if (form === 'image') return imageToSend(bytes, block)
	if (form === 'pdf') return { kind: 'pdf', data: toBase64(bytes) }
	return { kind: 'text', text: new TextDecoder().decode(bytes) }
}

// What was sent of a file is kept while the app is open, so a conversation's next turn does not read and scale its
// images again. The oldest go once the whole is past the cap.
const SENT_CACHE_CHARS = 64 * 1024 * 1024
const sentCache = new Map<string, PackAttachment>()
const weigh = (sent: PackAttachment) => (sent.kind === 'text' ? sent.text.length : sent.data.length)

/** The pack's reader for an attached file: nothing when its bytes are not on this device. */
export async function readForPack(block: AttachmentBlock): Promise<PackAttachment | undefined> {
	const kept = sentCache.get(block.id)
	if (kept) return kept
	const bytes = await readAttachment(block.id).catch(() => null)
	if (!bytes) return undefined
	const sent = await toSend(bytes, block)
	sentCache.set(block.id, sent)
	let total = [...sentCache.values()].reduce((sum, entry) => sum + weigh(entry), 0)
	for (const [id, entry] of sentCache) {
		if (total <= SENT_CACHE_CHARS || id === block.id) break
		sentCache.delete(id)
		total -= weigh(entry)
	}
	return sent
}
