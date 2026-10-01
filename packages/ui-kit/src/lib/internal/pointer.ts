/**
 * Where a pointer is over the element that hears it, in that element's own layout pixels from its top left. A chart
 * turns this into the point being read. The rect is scaled back to layout pixels, so a chart inside a scaled
 * ancestor still finds the point under the pointer.
 */
export function pointerAt(event: PointerEvent & { currentTarget: EventTarget & HTMLElement }): {
	x: number
	y: number
} {
	const el = event.currentTarget
	const rect = el.getBoundingClientRect()
	const scaleX = rect.width ? el.offsetWidth / rect.width : 1
	const scaleY = rect.height ? el.offsetHeight / rect.height : 1
	return { x: (event.clientX - rect.left) * scaleX, y: (event.clientY - rect.top) * scaleY }
}
