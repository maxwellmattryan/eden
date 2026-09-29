// What leaves the device is rounded to two decimals, about one kilometre (D-60), for every provider.

/** A coordinate as it is sent: two decimals. */
export function rounded(value: number): string {
	return (Math.round(value * 100) / 100).toFixed(2)
}
