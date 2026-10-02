// A picture as it is kept (D-90, D-93): the whole of it at a size worth showing across a page, and a small square for
// a row, drawn in the webview from the bytes the owner chose or the crate fetched. Nothing here reaches out to
// anything and nothing is stored: the caller keeps the image as an Attachment and the square on its row. Hearth's
// recipes and Meadow's places share it.

/** The pictures an owner may choose: what the webview decodes, HEIC included. */
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

/** A row's picture is small: it is shown at a row's height and kept in its row. */
const THUMB_EDGE = 192

/**
 * A part of a decoded picture as a small JPEG data URL, on white: the square a row shows, or a crop around one thing
 * in a photo.
 */
export async function cropDataUrl(
	bitmap: ImageBitmap,
	x: number,
	y: number,
	width: number,
	height: number,
	edge = THUMB_EDGE
): Promise<string> {
	const scale = Math.min(1, edge / Math.max(width, height))
	const canvas = new OffscreenCanvas(Math.max(1, Math.round(width * scale)), Math.max(1, Math.round(height * scale)))
	const context = canvas.getContext('2d')
	if (!context) throw new Error('no 2d context')
	context.fillStyle = '#fff'
	context.fillRect(0, 0, canvas.width, canvas.height)
	// Only the part of the rectangle that lies on the picture is drawn, where it falls on the canvas: WebKit draws
	// nothing at all from a source rectangle that reaches past the picture's edge, and the rest is the white above.
	const left = Math.max(0, x)
	const top = Math.max(0, y)
	const right = Math.min(bitmap.width, x + width)
	const bottom = Math.min(bitmap.height, y + height)
	if (right > left && bottom > top) {
		const across = canvas.width / width
		const down = canvas.height / height
		context.drawImage(
			bitmap,
			left,
			top,
			right - left,
			bottom - top,
			(left - x) * across,
			(top - y) * down,
			(right - left) * across,
			(bottom - top) * down
		)
	}
	const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.8 })
	const bytes = new Uint8Array(await blob.arrayBuffer())
	let binary = ''
	for (let at = 0; at < bytes.length; at += 0x8000) binary += String.fromCharCode(...bytes.subarray(at, at + 0x8000))
	return `data:image/jpeg;base64,${btoa(binary)}`
}

/** A picture as it is kept: the whole of it, sized for the page, and the small square its row shows. */
export interface SizedPicture {
	image: Blob
	thumbnail: string
}

/**
 * A picture sized for keeping, from a photo the owner chose or one a page showed: a JPEG at no more than `edge` on
 * its long side, and the square cut from its middle. Nothing when the bytes will not decode. HEIC is taken like any
 * other where the engine decodes it.
 */
export async function sizedPicture(photo: Blob, edge = 1600): Promise<SizedPicture | undefined> {
	let bitmap: ImageBitmap | undefined
	try {
		bitmap = await createImageBitmap(photo)
		const scale = Math.min(1, edge / Math.max(bitmap.width, bitmap.height))
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
		const thumbnail = await cropDataUrl(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side)
		return { image, thumbnail }
	} catch {
		return undefined
	} finally {
		bitmap?.close()
	}
}
