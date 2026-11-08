<script lang="ts">
	// Orchard's Income section (product/domains/finance.md §6, #80, D-200), after the accounts: what comes in a month
	// and the trailing average, then a row per source the income pass found that is not hidden, the paychecks first,
	// the ended ones next and the tax refund or payment last. A late row says so in words and is never coloured: the
	// header's notice carries the urgency, and the danger colour means money owed. Rows do not act (D-118); their menus
	// do, each with an Undo; a paycheck's menu reads its pay stub or edits the deductions kept from one, and its line
	// ends with what the insurance premiums come to a paycheck (#85). Absent until the ledger is ready and while there is no source to show, with no empty state.
	import { Icon, List, type ListRowData, type MenuItem } from '@eden/ui-kit'
	import { t } from '../../../i18n/index.js'
	import { formatMoney } from '../../../money/index.js'
	import { amountText, settings } from '../../../settings/index.js'
	import { undoToast } from '../../../shell/index.js'
	import { premiumsOf } from '../paystub.js'
	import { payStubRead } from '../paystub.svelte.js'
	import { finance, type Undo } from '../store.svelte.js'
	import type { IncomeSource } from '../types.js'
	import { incomeLine, incomeMeta } from '../words.js'

	const uid = $props.id()
	const lang = $derived(settings.language)
	const home = $derived(settings.homeCurrency)
	const income = $derived(finance.income)

	/** Active and late paychecks, then the ended ones, then the tax sources. */
	const rank = (source: IncomeSource) => (source.kind !== 'income' ? 2 : source.endedOn ? 1 : 0)

	function actionsOf(source: IncomeSource): MenuItem[] {
		const items: MenuItem[] = []
		// a paycheck's deductions (#85): read from its stub, or the stored ones edited
		if (source.kind === 'income' && !source.endedOn)
			items.push({ id: 'pay-stub', label: $t('domains.finance.income.menu.payStub'), icon: 'file-text' })
		if (source.payStub)
			items.push({ id: 'deductions', label: $t('domains.finance.income.menu.editDeductions'), icon: 'pencil' })
		if (source.kind === 'income' && !source.endedOn)
			items.push({ id: 'ended', label: $t('domains.finance.income.menu.ended'), icon: 'lock' })
		else if (source.kind === 'income') {
			items.push({ id: 'still-paid', label: $t('domains.finance.income.menu.stillPaid'), icon: 'undo-2' })
			if (!income?.lean)
				items.push({ id: 'start-lean', label: $t('domains.finance.income.menu.startLean'), icon: 'triangle-alert' })
		}
		const hide = source.kind === 'tax-payment' ? 'notTaxPayment' : 'notIncome'
		items.push({ id: 'ignore', label: $t(`domains.finance.income.menu.${hide}`), icon: 'eye-off' })
		return items
	}

	/** What the stored stub's insurance premiums come to a paycheck, as the page writes amounts. */
	function premiums(source: IncomeSource): string | undefined {
		const amount = premiumsOf(source.payStub, source.expected.currency)
		return amount ? amountText(formatMoney(amount, lang), settings.hideAmounts) : undefined
	}

	const rows = $derived.by<ListRowData[]>(() => {
		if (!income) return []
		return [...income.rows]
			.sort((a, b) => rank(a.source) - rank(b.source))
			.map(({ source, monthly, missed, thirdChecks }) => ({
				id: source.id,
				primary: source.name,
				secondary: incomeLine(
					{
						source,
						account: finance.accountById(source.accountId),
						missed,
						thirdChecks,
						home,
						premiums: premiums(source),
					},
					$t,
					lang
				),
				meta: incomeMeta(source, monthly, $t, lang),
				actions: actionsOf(source),
			}))
	})

	const summary = $derived.by(() => {
		if (!income) return ''
		const monthly = $t('domains.finance.income.summary', { values: { monthly: formatMoney(income.monthly, lang) } })
		if (!income.average) return monthly
		const average = $t('domains.finance.income.average', {
			values: { months: income.average.months, average: formatMoney(income.average.average, lang) },
		})
		return `${monthly} · ${average}`
	})

	function said(undo: Undo | undefined, key: string, employer: string) {
		if (undo) undoToast($t(`domains.finance.toasts.${key}`, { values: { employer } }), undo)
	}

	function act(id: string | undefined, sourceId: string) {
		const source = finance.incomeById(sourceId)
		if (!source) return
		const employer = source.name
		if (id === 'pay-stub') void payStubRead.start(source.id)
		else if (id === 'deductions') payStubRead.edit(source.id)
		else if (id === 'ended') said(finance.endIncome(source.id), 'incomeEnded', employer)
		else if (id === 'still-paid') said(finance.restoreIncome(source.id), 'stillPaid', employer)
		else if (id === 'start-lean') said(finance.startLean(source.id), 'leanOn', employer)
		else if (id === 'ignore')
			said(finance.ignoreIncome(source.id), source.kind === 'tax-payment' ? 'notTaxPayment' : 'notIncome', employer)
	}
</script>

{#if rows.length && !finance.empty}
	<section class="income" aria-labelledby="{uid}-title">
		<div class="heading">
			<h2 class="title" id="{uid}-title">
				<span class="mark"><Icon name="banknote" size="sm" class="glyph" /></span>
				<span class="name">{$t('domains.finance.income.title')}</span>
			</h2>
			<span class="freshness">{summary}</span>
		</div>
		<List labelledby="{uid}-title" {rows} onaction={(item, row) => act(item.id, row.id)} />
	</section>
{/if}

<style>
	.income {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		min-width: 0;
		margin-top: var(--space-6);
		padding: 0 var(--ed-gutter);
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
	.title :global(.glyph) {
		color: var(--text-secondary);
	}
	.name {
		overflow-wrap: anywhere;
	}
	.mark {
		flex: none;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: var(--space-4);
		height: var(--space-4);
	}
	.freshness {
		margin-inline-end: auto;
		font: var(--ed-t-caption);
		letter-spacing: var(--ed-t-caption-tracking);
		color: var(--text-secondary);
	}
</style>
