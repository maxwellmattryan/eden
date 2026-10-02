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
import {
	cropDataUrl,
	fetchImage,
	fetchPage,
	logError,
	sizedPicture,
	webErrorCode,
	type SizedPicture,
} from '@eden/shared/api'
import {
	emlToText,
	guessedIcons,
	htmlToText,
	iconAddresses,
	pageImage,
	storeDetails,
	type StoreDetails,
	pictureAddress,
	siteAddress,
	wwwAddress,
} from '@eden/shared/domains/kitchen'
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

/** The room left around an item when it is cut from a photo, as a share of the item's own size. */
const PICTURE_MARGIN = 0.06

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
		return await cropDataUrl(bitmap, left, top, right - left, bottom - top)
	} catch {
		return undefined
	} finally {
		bitmap?.close()
	}
}

/**
 * A picture the webview will show but not decode from its bytes alone, a site's `.ico` in some webviews (D-103):
 * read as an image element first, from a data URL, which the app's CSP allows.
 */
async function drawn(picture: Blob): Promise<ImageBitmap> {
	const reader = new FileReader()
	const address = await new Promise<string>((resolve, reject) => {
		reader.onload = () => resolve(String(reader.result))
		reader.onerror = () => reject(reader.error ?? new Error('unreadable'))
		reader.readAsDataURL(picture.type ? picture : new Blob([picture], { type: 'image/x-icon' }))
	})
	const image = new Image()
	image.src = address
	await image.decode()
	return createImageBitmap(image)
}

/**
 * A picture from a grocer's page (D-91): the whole of it, on a white square, since a product shot is already framed
 * and its edges are part of it. One smaller than `least` on its longer edge is not taken.
 */
export async function fitPicture(picture: Blob, least = 0): Promise<string | undefined> {
	let bitmap: ImageBitmap | undefined
	try {
		bitmap = await createImageBitmap(picture).catch(() => drawn(picture))
		const side = Math.max(bitmap.width, bitmap.height)
		if (side < least) return undefined
		// drawn from a square around the picture: what falls outside it is the white the canvas starts with
		return await cropDataUrl(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side)
	} catch {
		return undefined
	} finally {
		bitmap?.close()
	}
}

/**
 * The picture a pasted link means (D-91), fetched by the app and fitted whole: a grocer's product page gives its own
 * picture of the product, any other link is taken as the address of a picture.
 */
export async function linkedPicture(link: string): Promise<string | undefined> {
	const address = pictureAddress(link)
	if (!address) return undefined
	try {
		const bytes = await fetchImage(address)
		return await fitPicture(new Blob([bytes as Uint8Array<ArrayBuffer>]))
	} catch (error) {
		void logError('web', 'A picture could not be fetched', webErrorCode(error)).catch(() => null)
		return undefined
	}
}

/** A store's icon of this size or more is taken as soon as it is found. */
const LOGO_GOOD = 48
/** A smaller one is kept only when the site has none better; under this it is a blur, and the glyph reads better. */
const LOGO_LEAST = 32
/** How many of the icons a page names are tried before the ones at the usual addresses. */
const LOGO_TRIES = 3

/**
 * What a store's own website gives of it: its picture (D-103), the icon its page names for a home screen or the
 * one at a usual address when the page will not be read or names none, fetched by the app and fitted whole; and
 * what the page says of where the store is and how to call it, read on the device. The site is asked as the owner
 * typed it and, when that will not be read, under `www.`, since many sites live only there. A site that gives no
 * picture worth showing answers none; the store keeps its glyph and the owner is not told.
 */
export async function storeSite(url: string): Promise<{ image?: string; details: StoreDetails }> {
	const site = siteAddress(url)
	if (!site) return { details: {} }
	const sites = [site, wwwAddress(site)].filter((entry): entry is string => !!entry)
	let named: string[] = []
	let details: StoreDetails = {}
	// where the site answered from, after its redirects: the usual addresses are asked there
	let home: string[] = sites
	for (const entry of sites) {
		try {
			const page = await fetchPage(entry)
			named = iconAddresses(page.html, page.url)
			details = storeDetails(page.html)
			home = [page.url]
			break
		} catch (error) {
			void logError('web', "A store's page could not be fetched", webErrorCode(error)).catch(() => null)
		}
	}
	const addresses = [...named.slice(0, LOGO_TRIES), ...home.flatMap(guessedIcons)].filter(
		(address, at, all) => all.indexOf(address) === at
	)
	let small: string | undefined
	for (const address of addresses) {
		try {
			const picture = new Blob([(await fetchImage(address)) as Uint8Array<ArrayBuffer>])
			const image = await fitPicture(picture, LOGO_GOOD)
			if (image) return { image, details }
			small ??= await fitPicture(picture, LOGO_LEAST)
		} catch (error) {
			void logError('web', "A store's picture could not be fetched", webErrorCode(error)).catch(() => null)
		}
	}
	return { ...(small ? { image: small } : {}), details }
}

/** A store's picture from its website (D-103); nothing when the site gives none worth showing. */
export async function storeLogo(url: string): Promise<string | undefined> {
	return (await storeSite(url)).image
}

/** The pictures an owner may choose for an item or a store: what the webview decodes, HEIC included. */
export const PICTURE_ACCEPT = [
	'image/jpeg',
	'image/png',
	'image/webp',
	'image/heic',
	'image/heif',
	'.jpg',
	'.jpeg',
	'.png',
	'.webp',
	'.heic',
	'.heif',
]

/** A picture the owner chose for an item: the middle square of their photo, small. HEIC is taken like any other. */
export async function squarePicture(photo: Blob): Promise<string | undefined> {
	let bitmap: ImageBitmap | undefined
	try {
		bitmap = await createImageBitmap(photo)
		const side = Math.min(bitmap.width, bitmap.height)
		return await cropDataUrl(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side)
	} catch {
		return undefined
	} finally {
		bitmap?.close()
	}
}

/** A recipe's picture as it is kept (D-93): the whole of it, sized for the page, and the small square its row shows. */
export type RecipePicture = SizedPicture

/** A picture for a recipe, from a photo the owner chose or one its page showed. HEIC is taken like any other. */
export const recipePicture = (photo: Blob): Promise<RecipePicture | undefined> => sizedPicture(photo)

/**
 * The picture a link the owner pasted means for a recipe (D-110), fetched by the app: the picture at the address,
 * or, when the address is a page instead, the picture that page names as its own. Nothing when neither gives one.
 */
export async function linkedRecipePicture(link: string): Promise<RecipePicture | undefined> {
	const address = pictureAddress(link)
	if (!address) return undefined
	const fetched = async (url: string) => recipePicture(new Blob([(await fetchImage(url)) as Uint8Array<ArrayBuffer>]))
	try {
		return await fetched(address)
	} catch (error) {
		if (webErrorCode(error) !== 'web:not-image') {
			void logError('web', 'A picture could not be fetched', webErrorCode(error)).catch(() => null)
			return undefined
		}
	}
	try {
		const page = await fetchPage(address)
		const named = pageImage(page.html, page.url)
		return named ? await fetched(named) : undefined
	} catch (error) {
		void logError('web', "A page's picture could not be fetched", webErrorCode(error)).catch(() => null)
		return undefined
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
