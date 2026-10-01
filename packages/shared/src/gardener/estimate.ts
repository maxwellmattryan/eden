// What a request costs (docs/product/substrate/ai.md, "Budgets"): every estimate is made from the model's pricing
// row, USD per million tokens, before a request is sent and again from the usage the stream answered.
import type { Pricing } from './types.js'

export interface Usage {
	/** The input the provider neither read from its cache nor wrote to it. */
	tokensIn: number
	tokensOut: number
	cacheRead: number
	/** The input the provider wrote to its cache; none when it is left out. */
	cacheWrite?: number
}

const MILLION = 1_000_000
/** What a five-minute cache write costs over the input price, where a pricing row names no price of its own (D-116). */
export const CACHE_WRITE_RATIO = 1.25

/** The price of a million tokens written to the cache: the row's own, or a quarter over its input price. */
export function cacheWritePrice(pricing: Pricing): number {
	return pricing.cacheWrite ?? pricing.input * CACHE_WRITE_RATIO
}

/**
 * The cost of a usage in USD: the uncached input at the input price, the input read from the cache and the input
 * written to it each at its own.
 */
export function estimateCost(usage: Usage, pricing: Pricing): number {
	return (
		(usage.tokensIn * pricing.input +
			usage.tokensOut * pricing.output +
			usage.cacheRead * pricing.cacheRead +
			(usage.cacheWrite ?? 0) * cacheWritePrice(pricing)) /
		MILLION
	)
}

/** The most a request may cost before it is sent: its estimated input and the whole of its output budget. */
export function estimateBefore(estimatedInputTokens: number, maxTokens: number, pricing: Pricing): number {
	return estimateCost({ tokensIn: estimatedInputTokens, tokensOut: maxTokens, cacheRead: 0 }, pricing)
}

/** USD to two decimals, no sign: `2.84`. */
export function formatUsd(usd: number): string {
	return usd.toFixed(2)
}

/** Cents for what is under a dollar (`1.1 ¢`), USD otherwise (`$2.84`). */
export function formatCost(usd: number): string {
	if (usd < 1) {
		const cents = usd * 100
		return `${cents < 10 ? cents.toFixed(1) : cents.toFixed(0)} ¢`
	}
	return `$${formatUsd(usd)}`
}
