// Colour math for the token pipeline: hex parsing, sRGB mixing (what `color-mix(in srgb, …)` does), WCAG 2 contrast.

/** @returns {[number, number, number, number]} r, g, b in 0–255 and alpha in 0–1 */
export function parse(color) {
	const c = color.trim()
	let m = c.match(/^#([0-9a-f]{6})([0-9a-f]{2})?$/i)
	if (m) {
		const n = parseInt(m[1], 16)
		return [n >> 16, (n >> 8) & 255, n & 255, m[2] ? parseInt(m[2], 16) / 255 : 1]
	}
	m = c.match(/^#([0-9a-f]{3})$/i)
	if (m) return [...m[1]].map((h) => parseInt(h + h, 16)).concat(1)
	m = c.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/i)
	if (m) return [+m[1], +m[2], +m[3], m[4] === undefined ? 1 : +m[4]]
	throw new Error(`Cannot parse colour "${color}"`)
}

export function hex([r, g, b]) {
	return (
		'#' +
		[r, g, b]
			.map((v) =>
				Math.round(Math.max(0, Math.min(255, v)))
					.toString(16)
					.padStart(2, '0')
			)
			.join('')
	)
}

/** `color-mix(in srgb, a p%, b)`: linear interpolation of the gamma-encoded channels. */
export function mix(a, b, p) {
	const [ar, ag, ab] = parse(a)
	const [br, bg, bb] = parse(b)
	return hex([ar * p + br * (1 - p), ag * p + bg * (1 - p), ab * p + bb * (1 - p)])
}

/** Composites `fg` (with alpha) over an opaque `bg`. */
export function over(fg, bg) {
	const [r, g, b, a] = parse(fg)
	const [br, bg2, bb] = parse(bg)
	return hex([r * a + br * (1 - a), g * a + bg2 * (1 - a), b * a + bb * (1 - a)])
}

export function luminance(color) {
	const [r, g, b] = parse(color)
		.slice(0, 3)
		.map((v) => {
			const s = v / 255
			return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
		})
	return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** WCAG 2 contrast ratio, rounded to two decimals. */
export function contrast(fg, bg) {
	const l1 = luminance(fg)
	const l2 = luminance(bg)
	const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)
	return Math.round(ratio * 100) / 100
}

/** 'AA' at 4.5, 'AA-large' at 3 (also the non-text threshold), otherwise 'fail'. */
export function grade(ratio) {
	return ratio >= 4.5 ? 'AA' : ratio >= 3 ? 'AA-large' : 'fail'
}
