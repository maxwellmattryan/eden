// How Orchard writes its lines: a day ("Sun 27 Sep"), how fresh a link is, what the totals leave out, an account's
// detail line, a share and the field errors of an amount. Pure: the translator, the language and the clock arrive as
// parameters.
import { formatDateOf, formatTime, formatWeekdayOf, type DateFormat } from '../../dates/index.js'
import { currencyUnitName, decimalsOf, type MoneyParseError } from '../../money/index.js'
import { dayOfInstant } from './accounts.js'
import { WHOLE, type Account, type AccountKind, type AssetKind, type LinkState, type ProviderLink } from './types.js'

export type Translate = (key: string, options?: { values?: Record<string, string | number> }) => string

/** A calendar day (`YYYY-MM-DD`) with its weekday: "Sun 27 Sep". */
export function dayLine(day: string, lang: string): string {
	return `${formatWeekdayOf(day, lang, 'short')} ${formatDateOf(day, lang)}`
}

export const kindLabel = (kind: AccountKind, tr: Translate) => tr(`domains.finance.kinds.${kind}`)
export const assetKindLabel = (kind: AssetKind, tr: Translate) => tr(`domains.finance.assetKinds.${kind}`)

/** The end of a link's heading: "Updated 07:12" today, "Updated Sun 27 Sep" before, "as of Sun 27 Sep" when stale. */
export function freshnessLine(
	link: ProviderLink,
	state: LinkState,
	now: number,
	tr: Translate,
	format: DateFormat
): string | undefined {
	if (!link.lastSyncedAt) return undefined
	const day = dayLine(dayOfInstant(link.lastSyncedAt), format.lang)
	if (state === 'stale') return tr('domains.finance.groups.asOf', { values: { day } })
	if (dayOfInstant(link.lastSyncedAt) === dayOfInstant(new Date(now).toISOString()))
		return tr('domains.finance.groups.updatedAt', { values: { time: formatTime(link.lastSyncedAt, format) } })
	return tr('domains.finance.groups.updatedOn', { values: { day } })
}

/**
 * "1 account in JPY is left out of totals", "2 accounts in JPY and EUR are left out of totals"; with `key`, the same
 * line in other words ("1 holding in JPY…").
 */
export function leftOutLine(
	left: readonly { currency: string; count: number }[],
	tr: Translate,
	lang: string,
	key = 'domains.finance.totals.leftOut'
) {
	if (!left.length) return undefined
	const count = left.reduce((sum, entry) => sum + entry.count, 0)
	const currencies = new Intl.ListFormat(lang, { type: 'conjunction' }).format(left.map((entry) => entry.currency))
	return tr(key, { values: { count, currencies } })
}

/** A share in basis points as the owner writes it, a percent with at most two decimals: "50", "33.33". */
export function shareText(basisPoints: number): string {
	const whole = Math.trunc(basisPoints / 100)
	const rest = String(basisPoints % 100)
		.padStart(2, '0')
		.replace(/0+$/, '')
	return rest ? `${whole}.${rest}` : String(whole)
}

/** A percent from 0.01 to 100 with at most two decimals, as basis points; nothing for anything else. */
export function parseShare(text: string): number | undefined {
	const match = /^(\d{1,3})(?:[.,](\d{1,2}))?$/.exec(text.trim())
	if (!match) return undefined
	const points = Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0'))
	return points >= 1 && points <= WHOLE ? points : undefined
}

/** An account's detail line: "Credit card · ••8823 · Your share 50% · Replaces ••4417". */
export function accountDetail(account: Account, accounts: readonly Account[], tr: Translate): string {
	const parts = [kindLabel(account.kind, tr)]
	if (account.last4) parts.push(tr('domains.finance.row.last4', { values: { last4: account.last4 } }))
	if (account.share < WHOLE)
		parts.push(tr('domains.finance.row.share', { values: { share: shareText(account.share) } }))
	const old = account.replaces ? accounts.find((entry) => entry.id === account.replaces) : undefined
	if (old) {
		const name = old.last4 ? tr('domains.finance.row.last4', { values: { last4: old.last4 } }) : old.name
		parts.push(tr('domains.finance.row.replaces', { values: { name } }))
	}
	return parts.join(' · ')
}

/** What a field says of an amount it could not read in the currency. */
export function moneyError(error: MoneyParseError, currency: string, tr: Translate, lang: string): string {
	if (error === 'too-large') return tr('domains.finance.errors.tooLarge')
	if (error === 'too-many-decimals') {
		const decimals = decimalsOf(currency)
		return decimals === 0
			? tr('domains.finance.errors.whole', { values: { name: currencyUnitName(currency, lang), code: currency } })
			: tr('domains.finance.errors.decimals', { values: { decimals, code: currency } })
	}
	return tr('domains.finance.errors.amount')
}
