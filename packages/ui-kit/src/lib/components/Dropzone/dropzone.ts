import type { Attachment } from 'svelte/attachments'

export interface DropzoneOptions {
	/** True while the zone takes nothing: no hover, no drop, the drag left to whatever is beneath. Read on every event. */
	disabled: () => boolean
	/**
	 * A drag of files is over the zone (what the engine tells of each before the drop: its MIME type, or an empty
	 * string), or has left it (`undefined`).
	 */
	onHover(items: { type: string }[] | undefined): void
	/** The files were dropped on the zone. */
	onDrop(files: File[]): void
}

/** True for a drag that carries files, as against text, a link or an element of the page. */
function carriesFiles(e: DragEvent): boolean {
	return e.dataTransfer?.types.includes('Files') ?? false
}

/**
 * The file-drop gesture for Dropzone, on its root. Enter and leave fire for every descendant the pointer crosses, so
 * a depth count tells the zone's own edge from a child's; nothing listens on window or document. A drag is claimed
 * (its default prevented, the copy cursor shown) only while it carries files and the zone is on, so text dragged
 * into a field inside the zone still lands there, and an app's guard on window can tell a drop no zone took.
 */
export function dropzone(get: () => DropzoneOptions): Attachment<HTMLElement> {
	return (el) => {
		const options = get()
		let depth = 0
		let over = false

		const leave = () => {
			depth = 0
			if (!over) return
			over = false
			options.onHover(undefined)
		}
		const enter = (e: DragEvent) => {
			if (over) return
			over = true
			const items = Array.from(e.dataTransfer?.items ?? []).filter((item) => item.kind === 'file')
			options.onHover(items.map((item) => ({ type: item.type })))
		}
		const onDragEnter = (e: DragEvent) => {
			if (!carriesFiles(e)) return
			if (options.disabled()) return leave()
			e.preventDefault()
			depth++
			enter(e)
		}
		const onDragOver = (e: DragEvent) => {
			if (!carriesFiles(e)) return
			if (options.disabled()) return leave()
			e.preventDefault()
			if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'
			// the zone came on while the drag was already inside it
			depth = Math.max(depth, 1)
			enter(e)
		}
		const onDragLeave = (e: DragEvent) => {
			if (!carriesFiles(e) || !over) return
			depth--
			if (depth <= 0) leave()
		}
		const onDrop = (e: DragEvent) => {
			if (!carriesFiles(e)) return
			const taking = over && !options.disabled()
			leave()
			if (!taking) return
			e.preventDefault()
			options.onDrop(Array.from(e.dataTransfer?.files ?? []))
		}

		el.addEventListener('dragenter', onDragEnter)
		el.addEventListener('dragover', onDragOver)
		el.addEventListener('dragleave', onDragLeave)
		el.addEventListener('drop', onDrop)
		return () => {
			el.removeEventListener('dragenter', onDragEnter)
			el.removeEventListener('dragover', onDragOver)
			el.removeEventListener('dragleave', onDragLeave)
			el.removeEventListener('drop', onDrop)
		}
	}
}
