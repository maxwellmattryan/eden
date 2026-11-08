// How Orchard writes its lines: a day ("Sun 27 Sep"), how fresh a link is, what the totals leave out, an account's
// detail line, a share, the field errors of an amount, and a bill row's cadence, secondary line and chip (#78). Pure:
// the translator, the language and the clock arrive as parameters.
import { formatDateOf, formatTime, formatWeekdayOf, type DateFormat } from '../../dates/index.js'
import { currencyUnitName, decimalsOf, type Money, type MoneyParseError } from '../../money/index.js'
import { dayOfInstant } from './accounts.js'
import { isStatement, overpaidOf, remainingOf, type BillState } from './bills.js'
import {
	WHOLE,
	type Account,
	type AccountKind,
	type AssetKind,
	type Bill,
	type BillSource,
	type FileImportPayload,
	type LinkState,
	type ProviderLink,
} from './types.js'

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

/** A bill's cadence: "One-off", "Monthly", "Every 2 months"…, "Yearly". */
export const cadenceLabel = (repeat: Bill['repeat'], tr: Translate) =>
	tr(`domains.finance.bills.cadence.${repeat ? `m${repeat.months}` : 'once'}`)

export const billSourceLabel = (source: BillSource, tr: Translate) => tr(`domains.finance.bills.source.${source}`)

export interface BillWords {
	tr: Translate
	/** A day as the row writes it. */
	day: (iso: string) => string
	/** An amount as the row writes it, masked while amounts are hidden. */
	money: (amount: Money) => string
	accounts: readonly Account[]
	/** The day a stale card's link is as of, for a card statement. */
	asOf?: string
}

/**
 * A bill row's secondary line. Open: the cadence, Estimate or Actual, the source, a statement's minimum and interest,
 * what is still due or was paid beyond it, and a stale card's "as of". Paid: the payment that paid it ("Paid Tue 22
 * Sep from Chase ••4417" or "Marked paid Tue 22 Sep"), or a statement's minimum paid with the rest carried.
 */
export function billSecondary(bill: Bill, state: BillState, words: BillWords): string {
	const { tr, day, money } = words
	const parts: string[] = []
	const over = overpaidOf(bill)
	const left = remainingOf(bill)
	if (state === 'paid') {
		if (isStatement(bill) && left)
			parts.push(tr('domains.finance.bills.line.minimumPaid', { values: { amount: money(left) } }))
		else {
			const last = [...(bill.payments ?? [])].sort((a, b) => (a.day < b.day ? 1 : a.day > b.day ? -1 : 0))[0]
			const account = last?.accountId ? words.accounts.find((entry) => entry.id === last.accountId) : undefined
			if (last?.transactionId && account) {
				const bank = account.institution || account.name
				parts.push(
					account.last4
						? tr('domains.finance.bills.line.paidFrom', { values: { day: day(last.day), bank, last4: account.last4 } })
						: tr('domains.finance.bills.line.paidFromBank', { values: { day: day(last.day), bank } })
				)
			} else if (last?.transactionId)
				parts.push(tr('domains.finance.bills.line.paidOn', { values: { day: day(last.day) } }))
			else if (last) parts.push(tr('domains.finance.bills.line.markedPaid', { values: { day: day(last.day) } }))
		}
		if (over) parts.push(tr('domains.finance.bills.line.over', { values: { amount: money(over) } }))
		return parts.join(' · ')
	}
	parts.push(cadenceLabel(bill.repeat, tr))
	parts.push(tr(bill.estimate ? 'domains.finance.bills.line.estimate' : 'domains.finance.bills.line.actual'))
	parts.push(billSourceLabel(bill.source, tr))
	if (bill.minimum) parts.push(tr('domains.finance.bills.line.minimum', { values: { amount: money(bill.minimum) } }))
	if (bill.interest && bill.interest.minor > 0)
		parts.push(tr('domains.finance.bills.line.interest', { values: { amount: money(bill.interest) } }))
	if (bill.payments?.length && left)
		parts.push(tr('domains.finance.bills.line.stillDue', { values: { amount: money(left) } }))
	if (over) parts.push(tr('domains.finance.bills.line.over', { values: { amount: money(over) } }))
	if (words.asOf) parts.push(tr('domains.finance.groups.asOf', { values: { day: words.asOf } }))
	return parts.join(' · ')
}

/** A bill row's chip: the amount, or "about $64.00" for an estimate. */
export function billChip(bill: Bill, words: Pick<BillWords, 'tr' | 'money'>): string {
	const amount = words.money(bill.amount)
	return bill.estimate ? words.tr('domains.finance.bills.line.about', { values: { amount } }) : amount
}

/**
 * A statement's period (#74), its days as `dayLine` writes them with the year after the last, and after the first
 * too when the two differ, since a statement is often from a year before: "Wed 1 Jan to Tue 14 Jan 2025".
 */
export function periodLine(from: string, to: string, lang: string, tr: Translate): string {
	const year = (day: string) => day.slice(0, 4)
	const first = year(from) === year(to) ? dayLine(from, lang) : `${dayLine(from, lang)} ${year(from)}`
	return tr('domains.finance.import.periodValue', { values: { from: first, to: `${dayLine(to, lang)} ${year(to)}` } })
}

/** An account as an import names it: "Everyday checking ••4821". */
export function importAccountName(account: Pick<Account, 'name' | 'last4'>, tr: Translate): string {
	return account.last4
		? `${account.name} ${tr('domains.finance.row.last4', { values: { last4: account.last4 } })}`
		: account.name
}

/** The detail of a file imported before (#74): "42 rows into Everyday checking ••4821". */
export function importDetail(
	row: Pick<FileImportPayload, 'rows' | 'accountId'>,
	accounts: readonly Account[],
	tr: Translate
): string {
	const account = accounts.find((entry) => entry.id === row.accountId)
	const name = account ? importAccountName(account, tr) : tr('domains.finance.import.unknownAccount')
	return tr('domains.finance.import.knownDetail', { values: { count: row.rows, account: name } })
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
