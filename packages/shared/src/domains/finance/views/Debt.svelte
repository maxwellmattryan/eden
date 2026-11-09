<script lang="ts">
	// Orchard's Debt tab (product/domains/finance.md, "Debt (#86)", D-201): what the open debts owe in the home currency
	// and the cards' usage against their limits, with a thin bar under the overall percent; then a row per open card and
	// per open loan in the Accounts tab's order; then the payoff plan both ways for the extra the owner types, kept for
	// the session only. Rows do not act (D-118): "Add its rate" and "Add its limit" are text, and the row's menu is the
	// way to fix them. Every money figure goes through `formatMoney` and `amountText`, so hide-amounts covers it; rates,
	// percents, months and days stay.
	import { EmptyState, Field, List, Segmented, Skeleton, Stat, type ListRowData, type MenuItem } from '@eden/ui-kit'
	import { dateIn } from '../../../dates/index.js'
	import { t } from '../../../i18n/index.js'
	import { formatMoney, money as moneyOf, parseMoney, type Money } from '../../../money/index.js'
	import { amountText, settings } from '../../../settings/index.js'
	import { undoToast } from '../../../shell/index.js'
	import { owedOf, payoffPlans, rateText, STRATEGIES, type CardLine, type LoanLine, type PayoffPlan } from '../debt.js'
	import { debtSession } from '../debt.svelte.js'
	import { finance } from '../store.svelte.js'
	import type { Account } from '../types.js'
	import { dayLine, leftOutLine, moneyError, monthYearLine } from '../words.js'

	type Props = {
		onterms: (account: Account) => void
		onpromo: (account: Account) => void
		onaddloan: () => void
	}
	let { onterms, onpromo, onaddloan }: Props = $props()

	const uid = $props.id()
	const lang = $derived(settings.language)
	const home = $derived(settings.homeCurrency)
	const money = (amount: Money) => amountText(formatMoney(amount, lang), settings.hideAmounts)
	const day = (iso: string) => dayLine(iso, lang)
	const month = (period: string) => monthYearLine(`${period}-01`, lang, true)
	const rate = (points: number) => rateText(points, lang)
	/** Basis points as a percent with one decimal: "18.4%". */
	const percent = (points: number) =>
		new Intl.NumberFormat(lang, { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(
			points / 10000
		)

	const summary = $derived(finance.debt)
	const today = $derived(dateIn(undefined, finance.clock))
	const leftOut = $derived(leftOutLine(summary.left, $t, lang, 'domains.finance.debt.leftOut'))
	const overall = $derived(summary.usage.overall)

	// ---- rows ----

	const join = (parts: (string | undefined)[]) => parts.filter(Boolean).join(' · ')
	const where = (account: Account) =>
		join([
			account.institution,
			account.last4 ? $t('domains.finance.row.last4', { values: { last4: account.last4 } }) : undefined,
		])

	function cardRate(line: CardLine): string {
		const promo = finance.liabilityOf(line.account.id)?.promo
		if (line.promoEnding && promo)
			return $t('domains.finance.debt.introEnds', { values: { intro: rate(promo.rate), day: day(promo.ends) } })
		if (line.terms.promo) {
			const values = { intro: rate(line.terms.promo.rate), day: day(line.terms.promo.ends) }
			return line.terms.rate !== undefined
				? $t('domains.finance.debt.introUntil', { values: { ...values, rate: rate(line.terms.rate) } })
				: $t('domains.finance.debt.introUntilNoRate', { values })
		}
		return line.terms.rate !== undefined
			? $t('domains.finance.debt.apr', { values: { rate: rate(line.terms.rate) } })
			: $t('domains.finance.debt.addRate')
	}

	function cardRow(line: CardLine): ListRowData {
		const { account, usage } = line
		const promo = finance.liabilityOf(account.id)?.promo
		return {
			id: account.id,
			primary: account.name,
			secondary: join([
				where(account),
				cardRate(line),
				usage.limit && usage.usage !== undefined
					? $t('domains.finance.debt.used', { values: { percent: percent(usage.usage), limit: money(usage.limit) } })
					: $t('domains.finance.debt.addLimit'),
				line.statement
					? line.statement.due
						? $t('domains.finance.debt.minimumDue', {
								values: { amount: money(line.statement.minimum), day: day(line.statement.due) },
							})
						: $t('domains.finance.debt.minimum', { values: { amount: money(line.statement.minimum) } })
					: undefined,
				line.home ? undefined : $t('domains.finance.row.notInTotals'),
			]),
			meta: money(usage.owed),
			metaWarn: line.warn,
			actions: [
				{ id: 'terms', label: $t('domains.finance.debt.menu.editTerms'), icon: 'pencil' },
				{
					id: 'promo',
					label: $t(promo ? 'domains.finance.debt.menu.editIntro' : 'domains.finance.debt.menu.addIntro'),
					icon: 'percent',
				},
				...(promo
					? [{ id: 'clear-promo', label: $t('domains.finance.debt.menu.clearIntro'), icon: 'undo-2' as const }]
					: []),
			] satisfies MenuItem[],
		}
	}

	function paymentLine(line: LoanLine): string | undefined {
		const minimum = line.terms.minimum
		if (!minimum) return undefined
		const due = line.liability?.dueDay ?? (line.liability?.loan?.due ? Number(line.liability.loan.due.slice(8)) : 0)
		const amount = money(minimum)
		if (!due) return $t('domains.finance.debt.paymentOnly', { values: { amount } })
		if (due >= 31) return $t('domains.finance.debt.paymentLastDay', { values: { amount } })
		return $t('domains.finance.debt.payment', { values: { amount, day: due } })
	}

	function loanRow(line: LoanLine): ListRowData {
		const { account } = line
		return {
			id: account.id,
			primary: account.name,
			secondary: join([
				where(account),
				line.terms.rate !== undefined
					? $t('domains.finance.debt.apr', { values: { rate: rate(line.terms.rate) } })
					: $t('domains.finance.debt.addRate'),
				paymentLine(line),
				line.paidOff === 'none'
					? $t('domains.finance.debt.notPaidOff')
					: line.paidOff
						? $t('domains.finance.debt.paidOffAround', { values: { month: month(line.paidOff) } })
						: undefined,
				line.home ? undefined : $t('domains.finance.row.notInTotals'),
			]),
			meta: money(owedOf(account)),
			actions: [{ id: 'terms', label: $t('domains.finance.debt.menu.editTerms'), icon: 'pencil' }],
		}
	}

	const cardRows = $derived(summary.cards.map(cardRow))
	const loanRows = $derived(summary.loans.map(loanRow))

	// ---- the plan ----

	const strategyItems = $derived(STRATEGIES.map((id) => $t(`domains.finance.debt.plan.${id}`)))
	const parse = (text: string) => (text.trim() ? parseMoney(text, home, lang) : moneyOf(0, home))
	const first = parse(debtSession.extra)
	/** The last extra that parsed: an invalid one keeps the plan it had. */
	// svelte-ignore state_referenced_locally
	let goodExtra = $state<Money>('error' in first ? moneyOf(0, home) : first)
	let extraError = $state<string>()
	function typed() {
		const parsed = parse(debtSession.extra)
		if ('error' in parsed) {
			extraError = moneyError(parsed.error, home, $t, lang)
			return
		}
		extraError = undefined
		goodExtra = parsed
	}
	const extra = $derived(goodExtra.currency === home ? goodExtra : moneyOf(0, home))

	const plans = $derived(payoffPlans({ debts: summary.debts, extra, today }))
	const plan = $derived<PayoffPlan>(plans[debtSession.strategy])
	const nameOf = (id: string) => finance.accountById(id)?.name ?? ''
	const comparison = $derived.by(() => {
		const gap = plans.balance.interest.minor - plans.interest.interest.minor
		if (gap === 0) return $t('domains.finance.debt.plan.same')
		const amount = money(moneyOf(Math.abs(gap), home))
		return $t(gap > 0 ? 'domains.finance.debt.plan.interestSaves' : 'domains.finance.debt.plan.balanceSaves', {
			values: { amount },
		})
	})
	const orderRows = $derived(
		plan.order.map((entry): ListRowData => ({
			id: entry.accountId,
			primary: nameOf(entry.accountId),
			secondary: entry.paidOff
				? $t('domains.finance.debt.plan.paidOff', { values: { month: month(entry.paidOff) } })
				: $t('domains.finance.debt.plan.notPaid'),
			meta: money(entry.interest),
		}))
	)
	const missingRows = $derived(
		plan.missing.map((entry): ListRowData => ({
			id: entry.accountId,
			primary: nameOf(entry.accountId),
			secondary: $t(
				entry.need === 'rate' ? 'domains.finance.debt.plan.needRate' : 'domains.finance.debt.plan.needMinimum'
			),
			actions: [{ id: 'terms', label: $t('domains.finance.debt.menu.editTerms'), icon: 'pencil' }],
		}))
	)

	function act(id: string | undefined, rowId: string) {
		const account = finance.accountById(rowId)
		if (!account) return
		if (id === 'terms') onterms(account)
		else if (id === 'promo') onpromo(account)
		else if (id === 'clear-promo') {
			const undo = finance.setPromo(account.id, undefined)
			if (undo) undoToast($t('domains.finance.debt.toasts.introCleared', { values: { name: account.name } }), undo)
		}
	}
</script>

{#if !finance.ready}
	<div class="body" aria-busy="true">
		<div class="figures-loading"><Skeleton rows={1} icon={false} /></div>
		<Skeleton rows={3} />
		<Skeleton rows={3} />
	</div>
{:else if !summary.any}
	<EmptyState
		title={$t('domains.finance.debt.empty.title')}
		text={$t('domains.finance.debt.empty.text')}
		action={{ label: $t('domains.finance.actions.addLoan'), icon: 'plus', onclick: onaddloan }}
	/>
{:else}
	<div class="body">
		<section class="totals" aria-labelledby="{uid}-totals">
			<h2 class="ed-sr-only" id="{uid}-totals">{$t('domains.finance.debt.label')}</h2>
			<dl class="figures">
				<div class="figure">
					<dt>{$t('domains.finance.debt.owed')}</dt>
					<dd><Stat value={money(summary.owed)} size="md" /></dd>
				</div>
				{#if overall}
					<div class="figure">
						<dt>{$t('domains.finance.debt.usage')}</dt>
						<dd>
							<Stat value={percent(overall.usage)} size="md" />
							<div class="bar" aria-hidden="true">
								<div class="fill" class:warn={overall.warn} style:width="{Math.min(overall.usage / 100, 100)}%"></div>
							</div>
							<p class="caption">{$t('domains.finance.debt.ofLimit', { values: { limit: money(overall.limit) } })}</p>
						</dd>
					</div>
				{/if}
			</dl>
			{#if leftOut}<p class="caption">{leftOut}</p>{/if}
		</section>

		{#if cardRows.length}
			<section class="group" aria-labelledby="{uid}-cards">
				<div class="heading">
					<h2 class="title" id="{uid}-cards">{$t('domains.finance.debt.cards')}</h2>
				</div>
				<List labelledby="{uid}-cards" rows={cardRows} onaction={(item, row) => act(item.id, row.id)} />
			</section>
		{/if}

		{#if loanRows.length}
			<section class="group" aria-labelledby="{uid}-loans">
				<div class="heading">
					<h2 class="title" id="{uid}-loans">{$t('domains.finance.debt.loans')}</h2>
				</div>
				<List labelledby="{uid}-loans" rows={loanRows} onaction={(item, row) => act(item.id, row.id)} />
			</section>
		{/if}

		{#if plan.order.length}
			<section class="group" aria-labelledby="{uid}-plan">
				<div class="heading">
					<h2 class="title" id="{uid}-plan">{$t('domains.finance.debt.plan.title')}</h2>
				</div>
				<div class="controls">
					<Segmented
						items={strategyItems}
						selected={STRATEGIES.indexOf(debtSession.strategy)}
						label={$t('domains.finance.debt.plan.strategyLabel')}
						onchange={(index) => (debtSession.strategy = STRATEGIES[index] ?? 'interest')}
					/>
					<Field
						label={$t('domains.finance.debt.plan.extra')}
						unit={home}
						bind:value={debtSession.extra}
						oninput={typed}
						error={extraError}
						mono
						inputmode="decimal"
					/>
				</div>
				<dl class="figures">
					<div class="figure">
						<dt>{$t('domains.finance.debt.plan.debtFree')}</dt>
						<dd>
							{#if plan.debtFree}
								<Stat value={month(plan.debtFree)} size="md" />
							{:else}
								<p class="caption">{$t('domains.finance.debt.plan.never')}</p>
							{/if}
						</dd>
					</div>
					<div class="figure">
						<dt>{$t('domains.finance.debt.plan.interestTotal')}</dt>
						<dd><Stat value={money(plan.interest)} size="md" /></dd>
					</div>
				</dl>
				<p class="caption">{comparison}</p>
				<h3 class="ed-sr-only" id="{uid}-order">{$t('domains.finance.debt.plan.order')}</h3>
				<List labelledby="{uid}-order" rows={orderRows} />
				{#if missingRows.length}
					<p class="caption" id="{uid}-missing">{$t('domains.finance.debt.plan.notInPlan')}</p>
					<List labelledby="{uid}-missing" rows={missingRows} onaction={(item, row) => act(item.id, row.id)} />
				{/if}
			</section>
		{/if}
	</div>
{/if}

<style>
	.body {
		display: flex;
		flex-direction: column;
		gap: var(--space-6);
		padding: 0 var(--ed-gutter);
	}
	.figures-loading {
		max-width: 24rem;
	}
	.totals {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
	}
	.figures {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-3) var(--space-6);
		margin: 0 0 var(--space-2);
	}
	.figure {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		min-width: 0;
	}
	.figure dt {
		font: var(--ed-t-label);
		letter-spacing: var(--ed-t-label-tracking);
		color: var(--text-secondary);
	}
	.figure dd {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		margin: 0;
		font-variant-numeric: tabular-nums;
	}
	.caption {
		margin: 0;
		font: var(--ed-t-caption);
		letter-spacing: var(--ed-t-caption-tracking);
		color: var(--text-secondary);
	}
	.group {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		min-width: 0;
	}
	.heading {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-1) var(--space-3);
		min-width: 0;
	}
	.title {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		min-width: 0;
		margin: 0;
		font: var(--ed-t-title-sm);
		letter-spacing: var(--ed-t-title-sm-tracking);
		color: var(--text-primary);
	}
	/* the usage bar: decorative, the percent above it is the value */
	.bar {
		width: 16rem;
		max-width: 100%;
		height: var(--space-1);
		border-radius: var(--radius-full);
		background: var(--surface-3);
		overflow: hidden;
	}
	.fill {
		height: 100%;
		border-radius: var(--radius-full);
		background: var(--brand-primary);
	}
	.fill.warn {
		background: var(--warning);
	}
	/* the strategy above the extra on a narrow screen, side by side where there is room */
	.controls {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(min(100%, 14rem), 1fr));
		align-items: end;
		gap: var(--space-3);
	}
</style>
