import type { Attachment } from 'svelte/attachments'

/** A widget's sizes as the grid spans them: s is one cell, m two across, l two by two. */
type Size = 's' | 'm' | 'l'

const SPANS: Record<Size, { columns: number; rows: number }> = {
	s: { columns: 1, rows: 1 },
	m: { columns: 2, rows: 1 },
	l: { columns: 2, rows: 2 },
}
const ORDER: readonly Size[] = ['s', 'm', 'l']

/** A tile as the drag found it: its box, and the grid's gutter. */
export interface CornerStart {
	size: Size
	width: number
	height: number
	gap: number
}

/**
 * The declared size nearest to where the corner was dragged: the tile's box plus the drag, counted in cells, then the
 * size whose spans are closest to that. The size it began at wins a tie, so a small drag changes nothing.
 */
export function sizeAt(sizes: readonly Size[], start: CornerStart, dx: number, dy: number): Size {
	const from = SPANS[start.size]
	const cellWidth = (start.width - (from.columns - 1) * start.gap) / from.columns
	const cellHeight = (start.height - (from.rows - 1) * start.gap) / from.rows
	const columns = (start.width + dx + start.gap) / (cellWidth + start.gap)
	const rows = (start.height + dy + start.gap) / (cellHeight + start.gap)
	let best = start.size
	let least = Infinity
	for (const size of [start.size, ...sizes]) {
		const distance = Math.abs(SPANS[size].columns - columns) + Math.abs(SPANS[size].rows - rows)
		if (distance < least) {
			least = distance
			best = size
		}
	}
	return best
}

/** The declared size one step smaller or larger, or nothing at the end. */
export function stepSize(sizes: readonly Size[], size: Size, delta: -1 | 1): Size | undefined {
	const declared = ORDER.filter((candidate) => sizes.includes(candidate))
	return declared[declared.indexOf(size) + delta]
}

export interface ResizeCornerOptions {
	/** The sizes the tile declares. */
	sizes: () => readonly Size[]
	/** The size it has. */
	size: () => Size
	/** The tile the corner belongs to, which is what is measured. */
	tile: () => HTMLElement | undefined
	/** The size the drag is at, while it lasts; nothing once it ends. */
	onpreview(size: Size | undefined): void
	/** The drag ended on another size, or an arrow key stepped to one. */
	onresize(size: Size): void
}

/**
 * The resize corner of a Garden tile: dragged with the pointer, which it captures, it snaps among the declared sizes;
 * the arrow keys step them. Nothing listens on window or document.
 */
export function resizeCorner(get: () => ResizeCornerOptions): Attachment<HTMLElement> {
	return (el) => {
		let start: (CornerStart & { x: number; y: number }) | undefined
		let at: Size | undefined

		const down = (e: PointerEvent) => {
			const tile = get().tile()
			if (e.button !== 0 || !tile) return
			e.preventDefault()
			const rect = tile.getBoundingClientRect()
			const grid = tile.parentElement
			const gap = grid ? Number.parseFloat(getComputedStyle(grid).columnGap) || 0 : 0
			start = { size: get().size(), width: rect.width, height: rect.height, gap, x: e.clientX, y: e.clientY }
			at = start.size
			try {
				el.setPointerCapture(e.pointerId)
			} catch {
				// a pointer that is already gone: the drag ends with the next event
			}
		}
		const move = (e: PointerEvent) => {
			if (!start) return
			const next = sizeAt(get().sizes(), start, e.clientX - start.x, e.clientY - start.y)
			if (next === at) return
			at = next
			get().onpreview(next)
		}
		const end = (commit: boolean) => (e: PointerEvent) => {
			if (!start) return
			const from = start.size
			start = undefined
			if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId)
			get().onpreview(undefined)
			if (commit && at && at !== from) get().onresize(at)
		}
		const up = end(true)
		const cancel = end(false)
		const key = (e: KeyboardEvent) => {
			const delta =
				e.key === 'ArrowRight' || e.key === 'ArrowDown'
					? 1
					: e.key === 'ArrowLeft' || e.key === 'ArrowUp'
						? -1
						: undefined
			if (!delta) return
			e.preventDefault()
			const next = stepSize(get().sizes(), get().size(), delta)
			if (next) get().onresize(next)
		}

		el.addEventListener('pointerdown', down)
		el.addEventListener('pointermove', move)
		el.addEventListener('pointerup', up)
		el.addEventListener('pointercancel', cancel)
		el.addEventListener('keydown', key)
		return () => {
			el.removeEventListener('pointerdown', down)
			el.removeEventListener('pointermove', move)
			el.removeEventListener('pointerup', up)
			el.removeEventListener('pointercancel', cancel)
			el.removeEventListener('keydown', key)
		}
	}
}
