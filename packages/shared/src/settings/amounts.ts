// Hide amounts (Settings → Privacy): a money amount written while the owner shares their screen. The mask has one
// length whatever the amount, so it does not tell how big the number is. Every Orchard amount is written through
// `amountText(text, settings.hideAmounts)`.

/** Five bullets (U+2022), for any amount. */
export const AMOUNT_MASK = '•••••'

/** The amount as written, or the mask while amounts are hidden. */
export function amountText(text: string, hidden: boolean): string {
	return hidden ? AMOUNT_MASK : text
}
