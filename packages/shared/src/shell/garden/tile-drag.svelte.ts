// Dragging a Garden tile to another place, in edit mode (D-155): the pointer's alone, on desktop, and never the only
// way, since the tile's menu and its grip move it too (D-106). The HTML5 drag, as the kit's rows use between lists:
// the tile under the pointer says which edge the held one would take, by the half the pointer is over, and the grid's
// own ground means the end. The window's file guard lets it pass, since it carries no files (D-84).
import type { Attachment } from 'svelte/attachments'

/** The type a drag of a tile carries, so nothing else on the page mistakes it for rows, files or text. */
const TILE_DRAG_TYPE = 'application/x-eden-tiles'

export type DropSide = 'before' | 'after'

export interface TileDragOptions {
	/** Whether tiles can be dragged: while the Garden is being edited. */
	enabled: () => boolean
	/** A tile was dropped beside another, or on the grid's ground (`null`): the end. */
	ondrop: (id: string, target: { id: string; side: DropSide } | null) => void
}

export class TileDrag {
	/** The tile that is held. */
	held = $state<string>()
	/** The tile the held one is over, and the edge it would take. */
	over = $state<{ id: string; side: DropSide }>()

	#options: TileDragOptions

	constructor(options: TileDragOptions) {
		this.#options = options
	}

	#end() {
		this.held = undefined
		this.over = undefined
	}

	/** Makes a tile something to hold and something to drop beside. */
	tile(id: string): Attachment<HTMLElement> {
		return (el) => {
			if (!this.#options.enabled()) return
			let timer: ReturnType<typeof setTimeout> | undefined

			const onDragStart = (e: DragEvent) => {
				if (!e.dataTransfer) return
				// the corner resizes; it does not pick the tile up
				if (e.target instanceof Element && e.target.closest('.ed-widget-corner')) {
					e.preventDefault()
					return
				}
				e.dataTransfer.effectAllowed = 'move'
				e.dataTransfer.setData(TILE_DRAG_TYPE, id)
				const rect = el.getBoundingClientRect()
				e.dataTransfer.setDragImage(el, e.clientX - rect.left, e.clientY - rect.top)
				// a task on, so the engine has taken its picture of the tile before it dims
				timer = setTimeout(() => {
					timer = undefined
					this.held = id
				})
			}
			const onDragEnd = () => {
				if (timer !== undefined) clearTimeout(timer)
				timer = undefined
				this.#end()
			}
			const onDragOver = (e: DragEvent) => {
				if (!this.held || !e.dataTransfer?.types.includes(TILE_DRAG_TYPE)) return
				e.preventDefault()
				e.stopPropagation()
				e.dataTransfer.dropEffect = 'move'
				if (this.held === id) {
					this.over = undefined
					return
				}
				const rect = el.getBoundingClientRect()
				const side: DropSide = e.clientX < rect.left + rect.width / 2 ? 'before' : 'after'
				if (this.over?.id !== id || this.over.side !== side) this.over = { id, side }
			}
			const onDragLeave = (e: DragEvent) => {
				if (e.relatedTarget instanceof Node && el.contains(e.relatedTarget)) return
				if (this.over?.id === id) this.over = undefined
			}
			const onDrop = (e: DragEvent) => {
				if (!this.held || !e.dataTransfer?.types.includes(TILE_DRAG_TYPE)) return
				e.preventDefault()
				e.stopPropagation()
				const held = this.held
				const target = this.over
				this.#end()
				if (target && held !== id) this.#options.ondrop(held, target)
			}

			el.draggable = true
			el.addEventListener('dragstart', onDragStart)
			el.addEventListener('dragend', onDragEnd)
			el.addEventListener('dragover', onDragOver)
			el.addEventListener('dragleave', onDragLeave)
			el.addEventListener('drop', onDrop)
			return () => {
				onDragEnd()
				el.removeAttribute('draggable')
				el.removeEventListener('dragstart', onDragStart)
				el.removeEventListener('dragend', onDragEnd)
				el.removeEventListener('dragover', onDragOver)
				el.removeEventListener('dragleave', onDragLeave)
				el.removeEventListener('drop', onDrop)
			}
		}
	}

	/** The grid's own ground: a tile dropped on it, beside no tile, goes to the end. */
	ground(): Attachment<HTMLElement> {
		return (el) => {
			const onDragOver = (e: DragEvent) => {
				if (!this.held || !e.dataTransfer?.types.includes(TILE_DRAG_TYPE)) return
				e.preventDefault()
				e.dataTransfer.dropEffect = 'move'
				this.over = undefined
			}
			const onDrop = (e: DragEvent) => {
				if (!this.held || !e.dataTransfer?.types.includes(TILE_DRAG_TYPE)) return
				e.preventDefault()
				const held = this.held
				this.#end()
				this.#options.ondrop(held, null)
			}
			el.addEventListener('dragover', onDragOver)
			el.addEventListener('drop', onDrop)
			return () => {
				el.removeEventListener('dragover', onDragOver)
				el.removeEventListener('drop', onDrop)
			}
		}
	}
}
