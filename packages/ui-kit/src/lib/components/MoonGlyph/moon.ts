// The moon's lit face as an SVG path, from where it is in its cycle. Pure, so the geometry is tested on its own.

/** The share of the disc that is lit, 0 to 1, at a point of the cycle (0 new, 0.5 full). */
export function litShare(cycle: number): number {
	return (1 - Math.cos(2 * Math.PI * wrap(cycle))) / 2
}

const wrap = (cycle: number) => (((Number.isFinite(cycle) ? cycle : 0) % 1) + 1) % 1
const round = (value: number) => Math.round(value * 100) / 100

/**
 * The lit region of a disc of radius `r` centred on (`c`, `c`): the limb's half circle on the lit side, closed by the
 * terminator, a half ellipse whose width follows the phase. Waxing, the right side is lit, as seen from the northern
 * hemisphere; waning, the left. Empty at the new moon.
 */
export function litPath(cycle: number, r: number, c: number): string {
	const at = wrap(cycle)
	const share = litShare(at)
	if (share < 0.005) return ''
	const waxing = at <= 0.5
	const rx = round(r * Math.abs(Math.cos(2 * Math.PI * at)))
	const top = `${c},${round(c - r)}`
	const bottom = `${c},${round(c + r)}`
	// the limb runs top to bottom on the lit side; the terminator returns bottom to top, bulging towards the lit side
	// for a crescent and away from it for a gibbous moon
	const limb = waxing ? 1 : 0
	const gibbous = share > 0.5
	const terminator = waxing === gibbous ? 1 : 0
	return `M${top} A${r},${r} 0 0 ${limb} ${bottom} A${rx},${r} 0 0 ${terminator} ${top} Z`
}
