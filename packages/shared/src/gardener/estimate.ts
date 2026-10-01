// What a request costs (docs/product/substrate/ai.md, "Budgets"): every estimate is made from the model's pricing
// row, USD per million tokens, before a request is sent and again from the usage the stream answered.
import type { Pricing } from './types.js'

export interface Usage {
	tokensIn: number
	tokensOut: number
	cacheRead: number
}

const MILLION = 1_000_000

/** The cost of a usage in USD: the uncached input at the input price, the cached input at the cache price. */
export function estimateCost(usage: Usage, pricing: Pricing): number {
	return (
		(usage.tokensIn * pricing.input + usage.tokensOut * pricing.output + usage.cacheRead * pricing.cacheRead) / MILLION
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
