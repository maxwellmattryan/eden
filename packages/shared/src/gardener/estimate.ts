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
	/** The web searches the provider ran for the request, each with a fee of its own (D-132); none when left out. */
	searches?: number
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
			MILLION +
		(usage.searches ?? 0) * (pricing.search ?? 0)
	)
}

/**
 * What one web search is allowed to put into a request's input, in tokens, when its cost is estimated before it is
 * sent: the results come back as text the model reads, and they are counted as input. A round figure until it has
 * been measured against real searches (`engineering/gardener.md`, "Budgets").
 */
export const SEARCH_RESULT_TOKENS = 6000

/**
 * The most a request may cost before it is sent: its estimated input and the whole of its output budget, and for a
 * request that may search, the fee of every search it is allowed and what their results would add to the input.
 */
export function estimateBefore(
	estimatedInputTokens: number,
	maxTokens: number,
	pricing: Pricing,
	searches = 0
): number {
	return estimateCost(
		{
			tokensIn: estimatedInputTokens + searches * SEARCH_RESULT_TOKENS,
			tokensOut: maxTokens,
			cacheRead: 0,
			searches,
		},
		pricing
	)
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
