// How Orchard writes its lines: a day ("Sun 27 Sep"), how fresh a link is, what the totals leave out, an account's
// detail line, a share, an income source's lines (#80) and the field errors of an amount. Pure: the translator, the language and the clock arrive as
// parameters.
import { formatDateOf, formatTime, formatWeekdayOf, type DateFormat } from '../../dates/index.js'
import { currencyUnitName, decimalsOf, formatMoney, type Money, type MoneyParseError } from '../../money/index.js'
import { dayOfInstant } from './accounts.js'
import {
	WHOLE,
	type Account,
	type AccountKind,
	type AssetKind,
	type FileImportPayload,
	type IncomeSource,
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

/** "1 account in JPY is left out of totals", "2 accounts in JPY and EUR are left out of totals". */
export function leftOutLine(left: readonly { currency: string; count: number }[], tr: Translate, lang: string) {
	if (!left.length) return undefined
	const count = left.reduce((sum, entry) => sum + entry.count, 0)
	const currencies = new Intl.ListFormat(lang, { type: 'conjunction' }).format(left.map((entry) => entry.currency))
	return tr('domains.finance.totals.leftOut', { values: { count, currencies } })
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

const monthFormats = new Map<string, Intl.DateTimeFormat>()
/** A day's month in words, "October", or with its year, "January 2027". */
export function monthLine(day: string, lang: string, withYear = false): string {
	const key = `${lang}:${withYear}`
	let format = monthFormats.get(key)
	if (!format) {
		format = new Intl.DateTimeFormat(lang, { month: 'long', timeZone: 'UTC', ...(withYear ? { year: 'numeric' } : {}) })
		monthFormats.set(key, format)
	}
	return format.format(new Date(`${day.slice(0, 7)}-01T00:00:00Z`))
}

/** The parts of an income source's second line (#80): cadence, account, third paychecks, state, other currency. */
export interface IncomeLineInput {
	source: IncomeSource
	/** The account its latest row came into. */
	account?: Account
	/** The expected pay day that passed with no paycheck. */
	missed?: string
	/** `YYYY-MM` months with three biweekly paychecks. */
	thirdChecks: readonly string[]
	home: string
}

/**
 * An income source's second line: "Twice a month · into Chase Total Checking ••4417 · Late, due Thu 15 Oct", "Every
 * two weeks · into … · 3 paychecks in January and July · Next about Fri 30 Oct", "Tax refund · around April".
 */
export function incomeLine(input: IncomeLineInput, tr: Translate, lang: string): string {
	const { source, account, missed, thirdChecks } = input
	const parts: string[] = []
	const income = source.kind === 'income'
	const cadenced = income && source.cadence !== 'irregular' && source.cadence !== 'yearly'
	if (cadenced) parts.push(tr(`domains.finance.income.cadence.${source.cadence}`))
	if (account) parts.push(tr('domains.finance.income.into', { values: { account: importAccountName(account, tr) } }))
	if (cadenced && !source.endedOn && thirdChecks.length) {
		const months = new Intl.ListFormat(lang, { type: 'conjunction' }).format(
			thirdChecks.map((month) => monthLine(`${month}-01`, lang, month.slice(0, 4) !== thirdChecks[0]!.slice(0, 4)))
		)
		parts.push(tr('domains.finance.income.thirdChecks', { values: { months } }))
	}
	const day = (iso: string) => dayLine(iso, lang)
	const around = source.nextDay ? monthLine(source.nextDay, lang) : undefined
	if (source.kind === 'tax-refund')
		parts.push(tr('domains.finance.income.state.taxRefund', { values: { month: around ?? '' } }))
	else if (source.kind === 'tax-payment')
		parts.push(tr('domains.finance.income.state.taxPayment', { values: { month: around ?? '' } }))
	else if (source.endedOn)
		parts.push(tr('domains.finance.income.state.ended', { values: { day: day(source.endedOn) } }))
	else if (missed) parts.push(tr('domains.finance.income.state.late', { values: { day: day(missed) } }))
	else if (source.cadence === 'irregular') parts.push(tr('domains.finance.income.state.irregular'))
	else if (source.nextDay) parts.push(tr('domains.finance.income.state.next', { values: { day: day(source.nextDay) } }))
	if (source.expected.currency !== input.home) parts.push(tr('domains.finance.row.notInTotals'))
	return parts.join(' · ')
}

/** An income source's amount: the expected paycheck, "about … a month" when irregular, "about …" for a tax one. */
export function incomeMeta(source: IncomeSource, monthly: Money, tr: Translate, lang: string): string {
	if (source.kind !== 'income')
		return tr('domains.finance.income.about', {
			values: { amount: formatMoney(source.expected, lang, { sign: 'never' }) },
		})
	if (source.cadence === 'irregular')
		return tr('domains.finance.income.perMonth', { values: { amount: formatMoney(monthly, lang) } })
	return formatMoney(source.expected, lang)
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
