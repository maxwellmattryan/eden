<script lang="ts">
	// Orchard's Investments tab (product/domains/finance.md, "Investments", D-197): the holdings' value, cost basis and
	// gain in the home currency with a caption for what they leave out; the allocation by class; then a group per open
	// brokerage or retirement account in the Accounts tab's order, one row per holding. Rows do not act (D-118); their
	// menus do, offering only what applies: a value for a holding Plaid gives no price for, the owner's cost basis, and
	// clearing it. Every money figure goes through `formatMoney` and `amountText`, so hide-amounts covers it; the shares
	// are percentages and stay.
	import { EmptyState, List, Skeleton, Stat, DataTable, type ListRowData, type MenuItem } from '@eden/ui-kit'
	import { t } from '../../../i18n/index.js'
	import { formatMoney, type Money } from '../../../money/index.js'
	import { amountText, settings } from '../../../settings/index.js'
	import { undoToast } from '../../../shell/index.js'
	import { quantityText, type HoldingRow } from '../investments.js'
	import { finance } from '../store.svelte.js'
	import type { Holding } from '../types.js'
	import { dayLine, leftOutLine } from '../words.js'

	type Props = {
		/** "Link a brokerage", while a provider is bound; absent on the phone and in a plain browser. */
		onlink?: () => void
		oncostbasis: (holding: Holding) => void
		onvalue: (holding: Holding) => void
	}
	let { onlink, oncostbasis, onvalue }: Props = $props()

	const uid = $props.id()
	const lang = $derived(settings.language)
	const money = (amount: Money) => amountText(formatMoney(amount, lang), settings.hideAmounts)
	/** A gain, always signed: "+$1,234.00", "-$1,234.00". */
	const signed = (amount: Money) =>
		amountText(`${amount.minor > 0 ? '+' : ''}${formatMoney(amount, lang)}`, settings.hideAmounts)
	const day = (iso: string) => dayLine(iso, lang)
	/** Basis points as a percent with one decimal: "32.5%". */
	const percent = (points: number) =>
		new Intl.NumberFormat(lang, { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(
			points / 10000
		)

	const summary = $derived(finance.investments)
	const empty = $derived(!summary.groups.length && !finance.holdings.length)
	const leftOut = $derived(leftOutLine(summary.left, $t, lang, 'domains.finance.investments.leftOut'))

	const allocationRows = $derived(
		summary.allocation.classes.map((entry) => [
			$t(`domains.finance.investments.classes.${entry.id}`),
			money(entry.value),
			percent(entry.share),
		])
	)

	function actions(row: HoldingRow): MenuItem[] {
		const items: MenuItem[] = []
		const holding = row.holding
		if (row.ownerValued)
			items.push({
				id: 'value',
				label: $t(holding.typedValue ? 'domains.finance.menu.updateValue' : 'domains.finance.menu.addValue'),
				icon: 'refresh-cw',
			})
		items.push({
			id: 'cost-basis',
			label: $t(holding.costBasis ? 'domains.finance.menu.editCostBasis' : 'domains.finance.menu.addCostBasis'),
			icon: 'pencil',
		})
		if (holding.costBasisBy === 'owner')
			items.push({ id: 'clear', label: $t('domains.finance.menu.clearCostBasis'), icon: 'undo-2' })
		return items
	}

	function holdingRow(row: HoldingRow): ListRowData {
		const { holding, security, value } = row
		const parts = [quantityText(holding.quantity)]
		if (value) {
			if (holding.costBasis && row.gain)
				parts.push(
					$t('domains.finance.investments.cost', { values: { amount: money(holding.costBasis) } }),
					signed(row.gain)
				)
			if (value.by === 'owner') {
				parts.push($t('domains.finance.row.valued', { values: { day: day(value.on) } }))
				if (row.aged) parts.push($t('domains.finance.investments.outOfDate'))
			} else if (value.on) parts.push($t('domains.finance.investments.asOf', { values: { day: day(value.on) } }))
			if (row.away) parts.push($t('domains.finance.row.notInTotals'))
		}
		return {
			id: holding.id,
			primary: security?.name ?? '',
			chips: [
				...(security?.ticker ? [{ id: 'ticker', label: security.ticker, mono: true }] : []),
				...(holding.costBasisBy === 'carried'
					? [{ id: 'carried', label: $t('domains.finance.investments.carried'), tone: 'neutral' as const }]
					: []),
			],
			secondary: parts.join(' · '),
			meta: value ? money(value.value) : $t('domains.finance.investments.unpriced'),
			metaWarn: !value || row.aged,
			actions: actions(row),
		}
	}

	const groups = $derived(
		summary.groups.map((group) => ({
			id: group.account.id,
			title: group.account.name,
			detail: [
				group.account.institution,
				group.account.last4 ? $t('domains.finance.row.last4', { values: { last4: group.account.last4 } }) : undefined,
			]
				.filter(Boolean)
				.join(' · '),
			rows: group.rows.map(holdingRow),
		}))
	)

	function act(id: string | undefined, rowId: string) {
		const holding = finance.holdingById(rowId)
		if (!holding) return
		const name = finance.securityById(holding.securityId)?.name ?? ''
		if (id === 'value') onvalue(holding)
		else if (id === 'cost-basis') oncostbasis(holding)
		else if (id === 'clear') {
			const undo = finance.setCostBasis(holding.id, undefined)
			if (undo) undoToast($t('domains.finance.toasts.costBasisCleared', { values: { name } }), undo)
		}
	}
</script>

{#if !finance.ready}
	<div class="body" aria-busy="true">
		<div class="figures-loading"><Skeleton rows={1} icon={false} /></div>
		<Skeleton rows={3} />
		<Skeleton rows={3} />
	</div>
{:else if empty}
	<EmptyState
		title={$t('domains.finance.investments.empty.title')}
		text={$t(onlink ? 'domains.finance.investments.empty.bound' : 'domains.finance.investments.empty.unbound')}
		action={onlink
			? { label: $t('domains.finance.actions.linkBrokerage'), icon: 'landmark', onclick: onlink }
			: undefined}
	/>
{:else}
	<div class="body">
		<section class="totals" aria-labelledby="{uid}-totals">
			<h2 class="ed-sr-only" id="{uid}-totals">{$t('domains.finance.investments.label')}</h2>
			<dl class="figures">
				<div class="figure">
					<dt>{$t('domains.finance.investments.value')}</dt>
					<dd><Stat value={money(summary.value)} size="md" /></dd>
				</div>
				{#if summary.costBasis && summary.gain}
					<div class="figure">
						<dt>{$t('domains.finance.investments.costBasis')}</dt>
						<dd><Stat value={money(summary.costBasis)} size="md" /></dd>
					</div>
					<div class="figure">
						<dt>{$t('domains.finance.investments.gain')}</dt>
						<dd><Stat value={signed(summary.gain)} size="md" /></dd>
					</div>
				{/if}
			</dl>
			{#if summary.withoutBasis}
				<p class="caption">
					{$t('domains.finance.investments.withoutBasis', { values: { count: summary.withoutBasis } })}
				</p>
			{/if}
			{#if leftOut}<p class="caption">{leftOut}</p>{/if}
			{#if summary.unpriced}
				<p class="caption">
					{$t('domains.finance.investments.unpricedCount', { values: { count: summary.unpriced } })}
				</p>
			{/if}
		</section>

		{#if allocationRows.length}
			<section class="group" aria-labelledby="{uid}-allocation">
				<div class="heading">
					<h2 class="title" id="{uid}-allocation">{$t('domains.finance.investments.allocation')}</h2>
				</div>
				<DataTable
					label={$t('domains.finance.investments.allocation')}
					columns={[
						{ id: 'class', label: $t('domains.finance.investments.columns.class') },
						{ id: 'value', label: $t('domains.finance.investments.columns.value'), numeric: true },
						{ id: 'share', label: $t('domains.finance.investments.columns.share'), numeric: true, muted: true },
					]}
					rows={allocationRows}
				/>
			</section>
		{/if}

		{#each groups as group (group.id)}
			<section class="group" aria-labelledby="{uid}-{group.id}">
				<div class="heading">
					<h2 class="title" id="{uid}-{group.id}"><span class="name">{group.title}</span></h2>
					{#if group.detail}<span class="freshness">{group.detail}</span>{/if}
				</div>
				{#if group.rows.length}
					<List labelledby="{uid}-{group.id}" rows={group.rows} onaction={(item, row) => act(item.id, row.id)} />
				{:else}
					<p class="caption">{$t('domains.finance.investments.noHoldings')}</p>
				{/if}
			</section>
		{/each}
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
	.name {
		overflow-wrap: anywhere;
	}
	.freshness {
		margin-inline-end: auto;
		font: var(--ed-t-caption);
		letter-spacing: var(--ed-t-caption-tracking);
		color: var(--text-secondary);
	}
</style>
