// Which point of a chart a pointer is reading: the one whose place across the chart is nearest the pointer's.

/** The index of the place nearest `x`, the first of two equally near; -1 when there are none. */
export function nearestIndex(places: readonly number[], x: number): number {
	let nearest = -1
	let least = Infinity
	places.forEach((place, i) => {
		const away = Math.abs(place - x)
		if (away < least) {
			least = away
			nearest = i
		}
	})
	return nearest
}
