<script lang="ts">
	// Orchard's Overview (product/domains/finance.md §6, design/screens.md `orchard-overview`): the money story on the
	// left (net worth and its year, this month's cash flow, the checking balance before payday) and what wants
	// attention on the right (bills in the next fortnight, the budget, goals, flags, every account). One column when
	// narrow or on the phone (D-112). Bills, flags and accounts open their page. Story-only.
	import { BarChart, EmptyState, List, Stat, TrendChart, type ListRowData } from '$lib/index.js'
	import OrchardPage, {
		OTHER_CURRENCY,
		STALE_AS_OF,
		bankOf,
		dayLabel,
		formatAbs,
		formatMoney,
		freshness,
		isStale,
		usdOf,
	} from './OrchardPage.svelte'
	import {
		orchardAccounts,
		orchardBills,
		orchardBudget,
		orchardCashFlow,
		orchardFlags,
		orchardForecast,
		orchardGoals,
		orchardNetWorth,
		orchardNetWorthChange,
		orchardNetWorthMonths,
		orchardNetWorthNow,
	} from '../../sample-data.js'

	type Props = {
		/** Nothing linked yet: the EmptyState, no cards and no charts. */
		empty?: boolean
		/** Chase needs a sign-in. */
		stale?: boolean
		onlink?: () => void
		onsample?: () => void
		onreconnect?: () => void
		/** A bill, a flag or an account row opens its page; the sidebar too. */
		onnavigate?: (id: string) => void
	}
	let { empty = false, stale = false, onlink, onsample, onreconnect, onnavigate }: Props = $props()

	const uid = $props.id()
	const dollars = (value: number) => `$${Math.round(value).toLocaleString('en-US')}`
	const thousands = (value: number) => `$${Math.round(value / 1000)}k`
	const cents = (value: number) => Math.round(value * 100)

	const month = orchardCashFlow.at(-1)!
	const net = usdOf(cents(month.in) - cents(month.out))

	const balances = orchardForecast.map((day) => day.balance.minor / 100)
	const lowest = orchardForecast.reduce((low, day) => (day.balance.minor < low.balance.minor ? day : low))
	const payday = orchardForecast.at(-1)!

	/** Bills due from today to a fortnight out, oldest first. */
	const soon = orchardBills.filter(
		(bill) => bill.state !== 'paid' && bill.due && bill.due >= '09-30' && bill.due <= '10-14'
	)
	const billRows: ListRowData[] = soon.map((bill) => ({
		id: bill.id,
		primary: bill.payee,
		secondary: bill.estimate ? `about ${formatMoney(bill.amount)}` : formatMoney(bill.amount),
		meta: dayLabel(bill.due!),
	}))

	const over = orchardBudget.lines.filter((line) => line.spent.minor > line.planned.minor)
	const planned = usdOf(orchardBudget.lines.reduce((sum, line) => sum + line.planned.minor, 0))
	const spent = usdOf(orchardBudget.lines.reduce((sum, line) => sum + line.spent.minor, 0))
	const goal = orchardGoals[0]!

	const flagRows = $derived<ListRowData[]>([
		...(stale
			? [
					{
						id: 'fl-stale',
						icon: 'triangle-alert' as const,
						primary: 'Chase needs you to sign in again',
						secondary: `Balances ${STALE_AS_OF}`,
					},
				]
			: []),
		...orchardFlags.map((flag) => ({
			id: flag.id,
			icon: flag.kind === 'interest-charged' ? ('percent' as const) : ('trending-up' as const),
			primary: flag.title,
			secondary:
				flag.kind === 'price-rise' && flag.from
					? `Up from ${formatMoney(flag.from)} to ${formatMoney(flag.amount)} a month`
					: `${formatMoney(flag.amount)} this statement`,
			meta: stale && isStale(flag.account) ? STALE_AS_OF : undefined,
		})),
	])

	const accountRows = $derived<ListRowData[]>(
		orchardAccounts.map((account) => {
			const bank = bankOf(account.id)
			return {
				id: account.id,
				primary: `${bank.name} ••${bank.last4}`,
				secondary: account.manual ? `${freshness(account.id, stale)} · Not in totals` : freshness(account.id, stale),
				meta: account.balance.minor < 0 ? `${formatAbs(account.balance)} owed` : formatMoney(account.balance),
			}
		})
	)
	/** Chase's balances are in every total; a stale link says so under each one. */
	const totalsMark = $derived(stale ? `Includes Chase ${STALE_AS_OF}` : undefined)
	/** The page a row opens: its bill, the flagged rows in Activity, or the account. */
	const pageOf = (id: string) =>
		id.startsWith('bl-') ? 'finance/bills' : id.startsWith('fl-') ? 'finance/activity' : 'finance/accounts'
</script>

<OrchardPage tab="Overview" {stale} {onreconnect} {onnavigate}>
	{#snippet children(platform)}
		{#if empty}
			<EmptyState
				title="Nothing linked yet"
				text="Link a bank and Orchard keeps every account current on this device, or enter one by hand."
				action={{ label: 'Link a bank', icon: 'landmark', onclick: onlink }}
				sample={{ onclick: onsample }}
			/>
		{:else}
			<div class={['columns', { phone: platform === 'mobile' }]}>
				<div class="column">
					<section class="card" aria-labelledby="{uid}-worth">
						<h2 class="card-title" id="{uid}-worth">Net worth</h2>
						<div class="headline">
							<Stat value={formatMoney(orchardNetWorthNow)} size="lg" />
							<p class="change earned">{formatMoney(orchardNetWorthChange, { sign: true })} this month</p>
						</div>
						<p class="note">{OTHER_CURRENCY}</p>
						{#if totalsMark}<p class="note">{totalsMark}</p>{/if}
						<TrendChart
							values={orchardNetWorth}
							labels={orchardNetWorthMonths}
							format={thousands}
							height={160}
							extremes={false}
							label="Net worth by month, Oct 2025 to Sep 2026, from {dollars(orchardNetWorth[0]!)} to {dollars(
								orchardNetWorth.at(-1)!
							)}"
						/>
					</section>

					<section class="card" aria-labelledby="{uid}-flow">
						<h2 class="card-title" id="{uid}-flow">Cash flow</h2>
						<dl class="figures">
							<div class="figure">
								<dt>In</dt>
								<dd><Stat value={formatMoney(usdOf(cents(month.in)))} size="md" /></dd>
							</div>
							<div class="figure">
								<dt>Out</dt>
								<dd><Stat value={formatMoney(usdOf(cents(month.out)))} size="md" /></dd>
							</div>
							<div class="figure">
								<dt>Net</dt>
								<dd><Stat value={formatMoney(net, { sign: true })} size="md" /></dd>
							</div>
						</dl>
						<p class="note">September{totalsMark ? ` · ${totalsMark}` : ''}</p>
						<BarChart
							series={[{ id: 'out', label: 'Out', values: orchardCashFlow.map((entry) => entry.out) }]}
							labels={orchardCashFlow.map((entry) => entry.month)}
							format={dollars}
							height={140}
							label="Money out by month, Apr to Sep 2026"
						/>
					</section>

					<section class="card" aria-labelledby="{uid}-payday">
						<h2 class="card-title" id="{uid}-payday">Before payday</h2>
						<TrendChart
							values={balances}
							labels={orchardForecast.map((day, i) => (i % 3 === 0 ? dayLabel(day.day).slice(4) : ''))}
							titles={orchardForecast.map((day) => dayLabel(day.day))}
							format={dollars}
							height={140}
							extremes={false}
							label="Checking balance from today to payday on {dayLabel(payday.day)}"
							references={[{ value: 0, label: 'Zero' }]}
						/>
						<p class="low">
							Lowest {formatMoney(lowest.balance)} on {dayLabel(lowest.day)}, the day before payday
						</p>
					</section>
				</div>

				<div class="column">
					<section class="card" aria-labelledby="{uid}-bills">
						<h2 class="card-title" id="{uid}-bills">Bills in the next 14 days</h2>
						<List headless labelledby="{uid}-bills" rows={billRows} onopen={(row) => onnavigate?.(pageOf(row.id))} />
					</section>

					<section class="card" aria-labelledby="{uid}-budget">
						<h2 class="card-title" id="{uid}-budget">Budget</h2>
						<p class="line">
							{over.length} lines over: {over
								.map((line) => line.category)
								.sort()
								.join(', ')}
						</p>
						<p class="note">{formatMoney(spent)} spent of {formatMoney(planned)} planned in {orchardBudget.month}</p>
					</section>

					<section class="card" aria-labelledby="{uid}-goals">
						<h2 class="card-title" id="{uid}-goals">Goals</h2>
						<p class="line">{goal.name}</p>
						<p class="note">
							{formatMoney(goal.saved, { whole: true })} of {formatMoney(goal.target, { whole: true })} · by {goal.by}
						</p>
					</section>

					<section class="card" aria-labelledby="{uid}-flags">
						<h2 class="card-title" id="{uid}-flags">Flags</h2>
						<List headless labelledby="{uid}-flags" rows={flagRows} onopen={(row) => onnavigate?.(pageOf(row.id))} />
					</section>

					<section class="card" aria-labelledby="{uid}-accounts">
						<h2 class="card-title" id="{uid}-accounts">Accounts</h2>
						<List
							headless
							labelledby="{uid}-accounts"
							rows={accountRows}
							onopen={(row) => onnavigate?.(pageOf(row.id))}
						/>
					</section>
				</div>
			</div>
		{/if}
	{/snippet}
</OrchardPage>

<style>
	.columns {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-start;
		gap: var(--space-6);
		padding: 0 var(--ed-gutter);
	}
	.column {
		display: flex;
		flex: 1 1 22rem;
		flex-direction: column;
		gap: var(--space-4);
		min-width: 0;
	}
	.phone {
		gap: var(--space-4);
	}
	.phone .column {
		flex-basis: 100%;
	}
	.card {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
		padding: var(--space-4);
		border: 1px solid var(--ed-card-border);
		border-radius: var(--ed-radius-card);
		background: var(--surface-1);
	}
	.card-title {
		margin: 0;
		font: var(--ed-t-title-sm);
		letter-spacing: var(--ed-t-title-sm-tracking);
		font-variation-settings: var(--ed-t-title-sm-opsz);
	}
	.headline {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: var(--space-2) var(--space-3);
	}
	.change {
		margin: 0;
		font: var(--ed-t-data);
		letter-spacing: var(--ed-t-data-tracking);
		font-variant-numeric: tabular-nums;
	}
	.earned {
		color: var(--success);
	}
	.note {
		margin: 0;
		font: var(--ed-t-caption);
		letter-spacing: var(--ed-t-caption-tracking);
		color: var(--text-secondary);
	}
	.line {
		margin: 0;
		font: var(--ed-t-text);
	}
	.low {
		margin: 0;
		font: var(--ed-t-body-sm);
	}
	.figures {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-3) var(--space-6);
		margin: 0;
	}
	.figure {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
	}
	.figure dt {
		font: var(--ed-t-label);
		letter-spacing: var(--ed-t-label-tracking);
		color: var(--text-secondary);
	}
	.figure dd {
		margin: 0;
	}
</style>
