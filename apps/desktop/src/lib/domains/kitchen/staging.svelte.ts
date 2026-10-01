// The sources of a capture, staged (D-84, D-86): what the owner dropped, picked or pasted, each reduced to what a
// model can be given, held to the request's limits, and measured while it waits. A file is bytes from the moment it
// arrives and never a path. What is not a model's to read as it is gets reduced first: a HEIC photo is drawn again
// as a JPEG, an email and a saved page become their text. Nothing here is stored: the bytes wait in memory until the
// owner commits what was read from them, or lets them go. Hearth's haul capture and its recipe import both stage
// through this.
import {
	attachmentMime,
	isImageType,
	maxBytesFor,
	MAX_FILES,
	REQUEST_MAX_BYTES,
	sentBytes,
	TEXT_MAX_BYTES,
	type AttachmentBlock,
} from '@eden/shared/gardener'
import { emlToText, htmlToText } from '@eden/shared/domains/kitchen'
import { measure, sizeLabel, toSend } from '$lib/shell/gardener/files'
import type { ToolFiles } from '$lib/shell/gardener/types'

/** Why a file was not taken. */
export type CaptureRefusal = 'type' | 'size' | 'count' | 'total' | 'empty' | 'unreadable'

/** One source of a haul, as it will be sent. */
export interface CaptureSource {
	key: string
	name: string
	/** The type it is sent under: an image, a PDF, or text. */
	mime: string
	size: number
	/** The bytes as they are sent: a HEIC already a JPEG, an email already its text. */
	file: Blob
	/** Still being measured. */
	busy: boolean
	width?: number
	height?: number
	thumbnail?: string
	hash?: string
	/** The Attachment it already is in the workspace, when it came on a Gardener message. */
	stored?: string
}

const HEIC = /\.(heic|heif)$/i
const EMAIL = /\.eml$/i
const PAGE = /\.html?$/i
/** A HEIC photo is drawn again at no more than this on its long edge: far above what is sent, light enough to keep. */
const REDRAWN_EDGE = 3200

/** What the sheet takes, as the kit's file rules read it. */
export const CAPTURE_ACCEPT: readonly string[] = [
	'image/jpeg',
	'image/png',
	'image/webp',
	'image/gif',
	'image/heic',
	'image/heif',
	'application/pdf',
	'text/plain',
	'text/markdown',
	'text/csv',
	'text/html',
	'message/rfc822',
	'.jpg',
	'.jpeg',
	'.png',
	'.webp',
	'.gif',
	'.heic',
	'.heif',
	'.pdf',
	'.txt',
	'.md',
	'.csv',
	'.html',
	'.htm',
	'.eml',
]

async function sha256(file: Blob): Promise<string> {
	const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer())
	return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

/** A photo the engine can decode and a model cannot take (HEIC), drawn again as a JPEG. */
async function redraw(file: Blob): Promise<Blob> {
	const bitmap = await createImageBitmap(file)
	try {
		const scale = Math.min(1, REDRAWN_EDGE / Math.max(bitmap.width, bitmap.height))
		const canvas = new OffscreenCanvas(
			Math.max(1, Math.round(bitmap.width * scale)),
			Math.max(1, Math.round(bitmap.height * scale))
		)
		const context = canvas.getContext('2d')
		if (!context) throw new Error('no 2d context')
		context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
		return await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.9 })
	} finally {
		bitmap.close()
	}
}

/** An item's picture is small: it is shown at a row's height and a pane's width, and kept in its row (D-90). */
const PICTURE_EDGE = 192
/** The room left around an item when it is cut from a photo, as a share of the item's own size. */
const PICTURE_MARGIN = 0.06

async function pictureOf(bitmap: ImageBitmap, x: number, y: number, width: number, height: number): Promise<string> {
	const scale = Math.min(1, PICTURE_EDGE / Math.max(width, height))
	const canvas = new OffscreenCanvas(Math.max(1, Math.round(width * scale)), Math.max(1, Math.round(height * scale)))
	const context = canvas.getContext('2d')
	if (!context) throw new Error('no 2d context')
	context.fillStyle = '#fff'
	context.fillRect(0, 0, canvas.width, canvas.height)
	context.drawImage(bitmap, x, y, width, height, 0, 0, canvas.width, canvas.height)
	const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.8 })
	const bytes = new Uint8Array(await blob.arrayBuffer())
	let binary = ''
	for (let at = 0; at < bytes.length; at += 0x8000) binary += String.fromCharCode(...bytes.subarray(at, at + 0x8000))
	return `data:image/jpeg;base64,${btoa(binary)}`
}

/**
 * An item's picture cut from a photo: the box the model drew around it, with a little room, as a small JPEG data
 * URL. Nothing when the photo will not decode. It is a crop, not a cut-out: the background stays.
 */
export async function cutPicture(
	photo: Blob,
	box: { left: number; top: number; right: number; bottom: number }
): Promise<string | undefined> {
	let bitmap: ImageBitmap | undefined
	try {
		bitmap = await createImageBitmap(photo)
		const marginX = (box.right - box.left) * PICTURE_MARGIN
		const marginY = (box.bottom - box.top) * PICTURE_MARGIN
		const left = Math.max(0, box.left - marginX) * bitmap.width
		const top = Math.max(0, box.top - marginY) * bitmap.height
		const right = Math.min(1, box.right + marginX) * bitmap.width
		const bottom = Math.min(1, box.bottom + marginY) * bitmap.height
		if (right - left < 8 || bottom - top < 8) return undefined
		return await pictureOf(bitmap, left, top, right - left, bottom - top)
	} catch {
		return undefined
	} finally {
		bitmap?.close()
	}
}

/**
 * A picture from a grocer's page (D-91): the whole of it, on a white square, since a product shot is already framed
 * and its edges are part of it.
 */
export async function fitPicture(picture: Blob): Promise<string | undefined> {
	let bitmap: ImageBitmap | undefined
	try {
		bitmap = await createImageBitmap(picture)
		const side = Math.max(bitmap.width, bitmap.height)
		// drawn from a square around the picture: what falls outside it is the white the canvas starts with
		return await pictureOf(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side)
	} catch {
		return undefined
	} finally {
		bitmap?.close()
	}
}

/** A picture the owner chose for an item: the middle square of their photo, small. HEIC is taken like any other. */
export async function squarePicture(photo: Blob): Promise<string | undefined> {
	let bitmap: ImageBitmap | undefined
	try {
		bitmap = await createImageBitmap(photo)
		const side = Math.min(bitmap.width, bitmap.height)
		return await pictureOf(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side)
	} catch {
		return undefined
	} finally {
		bitmap?.close()
	}
}

/** A recipe's picture is shown across its page: kept at no more than this on its long edge (D-93). */
const RECIPE_EDGE = 1600

/** A recipe's picture as it is kept: the whole of it, sized for the page, and the small square its row shows. */
export interface RecipePicture {
	image: Blob
	thumbnail: string
}

/** A picture for a recipe, from a photo the owner chose or one its page showed. HEIC is taken like any other. */
export async function recipePicture(photo: Blob): Promise<RecipePicture | undefined> {
	let bitmap: ImageBitmap | undefined
	try {
		bitmap = await createImageBitmap(photo)
		const scale = Math.min(1, RECIPE_EDGE / Math.max(bitmap.width, bitmap.height))
		const canvas = new OffscreenCanvas(
			Math.max(1, Math.round(bitmap.width * scale)),
			Math.max(1, Math.round(bitmap.height * scale))
		)
		const context = canvas.getContext('2d')
		if (!context) return undefined
		context.fillStyle = '#fff'
		context.fillRect(0, 0, canvas.width, canvas.height)
		context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
		const image = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.85 })
		const side = Math.min(bitmap.width, bitmap.height)
		const thumbnail = await pictureOf(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side)
		return { image, thumbnail }
	} catch {
		return undefined
	} finally {
		bitmap?.close()
	}
}

const asText = (text: string) => new Blob([text.slice(0, TEXT_MAX_BYTES)], { type: 'text/plain' })

/** A file as it will be sent, or why it will not be. */
async function reduce(file: File): Promise<{ file: Blob; name: string; mime: string } | CaptureRefusal> {
	if (file.size === 0) return 'empty'
	try {
		if (HEIC.test(file.name) || /^image\/hei[cf]$/.test(file.type)) {
			return { file: await redraw(file), name: file.name.replace(HEIC, '.jpg'), mime: 'image/jpeg' }
		}
		if (EMAIL.test(file.name) || file.type === 'message/rfc822') {
			return { file: asText(emlToText(await file.text())), name: file.name, mime: 'text/plain' }
		}
		if (PAGE.test(file.name) || file.type === 'text/html') {
			return { file: asText(htmlToText(await file.text())), name: file.name, mime: 'text/plain' }
		}
	} catch {
		return 'unreadable'
	}
	const mime = attachmentMime(file.name, file.type)
	const known = isImageType(mime) || mime === 'application/pdf' || mime.startsWith('text/')
	if (!known) return 'type'
	if (file.size > maxBytesFor(mime)) return 'size'
	return { file, name: file.name, mime }
}

export class StagedSources {
	sources = $state<CaptureSource[]>([])
	/** The files the last add refused, for the page to say so; cleared when it has. */
	refused = $state<{ name: string; reason: CaptureRefusal }[]>([])
	/** Whether everything staged has been measured. */
	readonly settled = $derived(this.sources.every((source) => !source.busy))

	readonly #onchange: () => void

	/** `onchange` hears every change of what is staged, once it is measured: the cost is worked out again. */
	constructor(onchange: () => void = () => {}) {
		this.#onchange = onchange
	}

	/** Stages files: each is reduced to what is sent, held to the limits, then measured while it waits. */
	async add(files: File[]): Promise<void> {
		for (const file of files) {
			if (this.sources.length >= MAX_FILES) {
				this.refused.push({ name: file.name, reason: 'count' })
				continue
			}
			const reduced = await reduce(file)
			if (typeof reduced === 'string') {
				this.refused.push({ name: file.name, reason: reduced })
				continue
			}
			const weigh = (entry: { mime: string; size: number }) => sentBytes(entry as AttachmentBlock)
			const total = this.sources.reduce((sum, source) => sum + weigh(source), 0)
			if (total + weigh({ mime: reduced.mime, size: reduced.file.size }) > REQUEST_MAX_BYTES) {
				this.refused.push({ name: file.name, reason: 'total' })
				continue
			}
			const source: CaptureSource = {
				key: crypto.randomUUID(),
				name: reduced.name,
				mime: reduced.mime,
				size: reduced.file.size,
				file: reduced.file,
				busy: true,
			}
			this.sources.push(source)
			void this.#measure(source.key)
		}
		this.#onchange()
	}

	/** Stages text the owner pasted: a list, an order's lines, an email's body. */
	addText(text: string, name: string): void {
		const body = text.trim()
		if (body) void this.add([new File([body], name, { type: 'text/plain' })])
	}

	async #measure(key: string): Promise<void> {
		const source = this.sources.find((entry) => entry.key === key)
		if (!source) return
		const [meta, hash] = await Promise.all([
			measure(source.file, source.mime).catch(() => ({})),
			sha256(source.file).catch(() => ''),
		])
		const found = this.sources.find((entry) => entry.key === key)
		if (!found) return
		Object.assign(found, meta, { hash, busy: false })
		this.#onchange()
	}

	remove(key: string): void {
		this.sources = this.sources.filter((source) => source.key !== key)
		this.#onchange()
	}

	clear(): void {
		this.sources = []
		this.refused = []
	}

	/** The sources as a tool is given them: counted by their blocks, each read and scaled when it is sent. */
	files(): ToolFiles {
		const bytes: Record<string, Blob> = Object.fromEntries(
			this.sources.map((source) => [source.stored ?? source.key, source.file])
		)
		const blocks: AttachmentBlock[] = this.sources.map((source) => ({
			kind: 'attachment',
			id: source.stored ?? source.key,
			name: source.name,
			mime: source.mime,
			size: source.size,
			hash: source.hash ?? '',
			...(source.width && source.height ? { width: source.width, height: source.height } : {}),
		}))
		return {
			blocks,
			read: async (block) => {
				const file = bytes[block.id]
				return file ? toSend(new Uint8Array(await file.arrayBuffer()), block) : undefined
			},
		}
	}
}

/** The caption beside a source's name on a sheet. */
export const sourceDetail = (source: CaptureSource) => (source.size ? sizeLabel(source.size) : undefined)

/** A model's name as the owner would say it, from its id: `claude-haiku-4-5-20251001` is "Haiku 4.5". */
export function modelLabel(id: string): string {
	const match = /^claude-([a-z]+)-(\d+)(?:-(\d{1,2}))?(?:-\d{8})?$/.exec(id)
	if (!match) return id
	const [, family, major, minor] = match
	return `${family![0]!.toUpperCase()}${family!.slice(1)} ${major}${minor ? `.${minor}` : ''}`
}
