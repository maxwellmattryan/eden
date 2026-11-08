// The default budget categories and what a provider's category means (product/domains/finance.md §6, D-193): a kind,
// the key of a default category, and whether the row looks like a move of the owner's own money. The defaults are
// seeded once, by the first pass, when no `budget-category` row has ever existed; a deleted one is never seeded again.
// Pure.
import type { BatchOp } from '../../data/index.js'
import { FINANCE, type Category, type CategoryPayload, type TxKind } from './types.js'

export interface DefaultCategory {
	key: string
	group: CategoryPayload['group']
	essential: boolean
}

const fixed = (key: string, essential = true): DefaultCategory => ({ key, group: 'fixed', essential })
const variable = (key: string, essential = false): DefaultCategory => ({ key, group: 'variable', essential })

export const DEFAULT_CATEGORIES: readonly DefaultCategory[] = [
	fixed('rent'),
	fixed('utilities'),
	fixed('phone'),
	fixed('insurance'),
	fixed('subscriptions', false),
	fixed('debt'),
	variable('groceries', true),
	variable('dining'),
	variable('transport', true),
	variable('shopping'),
	variable('health', true),
	variable('personal-care'),
	variable('home'),
	variable('entertainment'),
	variable('travel'),
	variable('gifts'),
	variable('services'),
	variable('taxes', true),
	variable('fees'),
	variable('other'),
	{ key: 'income', group: 'income', essential: false },
]

export interface ProviderMeaning {
	kind?: TxKind
	/** A default category's key. */
	key?: string
	/** A move between accounts: one side of a transfer pair may be this. */
	transferLike: boolean
}

const spend = (key: string): ProviderMeaning => ({ kind: 'purchase', key, transferLike: false })

/** Detailed codes first; then the primary's, matched as a prefix. */
const DETAILED: Record<string, ProviderMeaning> = {
	FOOD_AND_DRINK_GROCERIES: spend('groceries'),
	RENT_AND_UTILITIES_RENT: spend('rent'),
	RENT_AND_UTILITIES_TELEPHONE: spend('phone'),
	GENERAL_SERVICES_INSURANCE: spend('insurance'),
	GOVERNMENT_AND_NON_PROFIT_DONATIONS: spend('gifts'),
	GOVERNMENT_AND_NON_PROFIT_TAX_PAYMENT: spend('taxes'),
	BANK_FEES_INTEREST_CHARGE: { kind: 'interest-charged', key: 'fees', transferLike: false },
	INCOME_DIVIDENDS: { kind: 'dividend', key: 'income', transferLike: false },
	INCOME_INTEREST_EARNED: { kind: 'interest-earned', key: 'income', transferLike: false },
	LOAN_PAYMENTS_CREDIT_CARD_PAYMENT: { kind: 'card-payment', transferLike: true },
}

const PRIMARY: [string, ProviderMeaning][] = [
	['FOOD_AND_DRINK', spend('dining')],
	['GENERAL_MERCHANDISE', spend('shopping')],
	['TRANSPORTATION', spend('transport')],
	['TRAVEL', spend('travel')],
	['RENT_AND_UTILITIES', spend('utilities')],
	['ENTERTAINMENT', spend('entertainment')],
	['MEDICAL', spend('health')],
	['PERSONAL_CARE', spend('personal-care')],
	['HOME_IMPROVEMENT', spend('home')],
	['GENERAL_SERVICES', spend('services')],
	['GOVERNMENT_AND_NON_PROFIT', spend('services')],
	['BANK_FEES', { kind: 'fee', key: 'fees', transferLike: false }],
	['INCOME', { kind: 'income', key: 'income', transferLike: false }],
	['LOAN_PAYMENTS', { kind: 'transfer', key: 'debt', transferLike: true }],
	['TRANSFER_IN', { kind: 'transfer', transferLike: true }],
	['TRANSFER_OUT', { kind: 'transfer', transferLike: true }],
]

/** What a provider's `personal_finance_category.detailed` means; unknown or absent means nothing. */
export function providerCategoryOf(detailed: string | undefined): ProviderMeaning {
	if (!detailed) return { transferLike: false }
	const exact = DETAILED[detailed]
	if (exact) return exact
	const found = PRIMARY.find(([primary]) => detailed === primary || detailed.startsWith(`${primary}_`))
	return found ? found[1] : { transferLike: false }
}

const MOVE: ProviderMeaning = { kind: 'transfer', transferLike: true }
/** Cash subtypes that move money in or out of the account, so they pair with the other side (D-193). */
const CASH_MOVES = new Set(['deposit', 'withdrawal', 'contribution', 'distribution'])

/**
 * What an investment transaction's type and subtype mean (D-197): a buy or a sell, a dividend or capital gain, interest,
 * a fee, or a move of cash in or out; anything else is a transfer that pairs with nothing.
 */
export function investmentMeaningOf(type: string, subtype: string | undefined): ProviderMeaning {
	const sub = (subtype ?? '').toLowerCase()
	switch (type.toLowerCase()) {
		case 'buy':
			return { kind: 'investment-buy', transferLike: false }
		case 'sell':
			return { kind: 'investment-sell', transferLike: false }
		case 'fee':
			return { kind: 'fee', key: 'fees', transferLike: false }
		case 'transfer':
			return MOVE
		case 'cash':
			if (sub.includes('dividend') || sub.includes('capital gain'))
				return { kind: 'dividend', key: 'income', transferLike: false }
			if (sub === 'interest') return { kind: 'interest-earned', key: 'income', transferLike: false }
			if (CASH_MOVES.has(sub)) return MOVE
			return { kind: 'transfer', transferLike: false }
		default:
			return { kind: 'transfer', transferLike: false }
	}
}

/**
 * The default categories as writes when none has ever existed, named in the current language; nothing otherwise.
 */
export function ensureCategoryOps(
	everExisted: boolean,
	name: (key: string) => string,
	newId: () => string
): { ops: BatchOp[]; categories: Category[] } {
	if (everExisted) return { ops: [], categories: [] }
	const categories = DEFAULT_CATEGORIES.map((entry): Category => ({
		id: newId(),
		key: entry.key,
		name: name(entry.key),
		group: entry.group,
		essential: entry.essential,
	}))
	const ops: BatchOp[] = categories.map(({ id, ...payload }) => ({
		op: 'createEntity',
		input: { id, type: FINANCE.category, payload },
	}))
	return { ops, categories }
}
