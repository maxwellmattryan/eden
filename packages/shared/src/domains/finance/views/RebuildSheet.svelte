<script lang="ts">
	// Plan the rebuild (product/domains/finance.md §6, "Goals (#88)", D-203): a dipped goal's month to be made whole by,
	// over the next 24 months and 6 out at first, with what that asks a month said live. Save stores the plan with an
	// undo toast; Cancel, or dismissing the sheet, writes nothing.
	import { Button, Select, Sheet } from '@eden/ui-kit'
	import { dateIn } from '../../../dates/index.js'
	import { t } from '../../../i18n/index.js'
	import { formatMoney, type Money } from '../../../money/index.js'
	import { amountText, settings } from '../../../settings/index.js'
	import { undoToast } from '../../../shell/index.js'
	import { goalMonthly, monthsLeft } from '../goals.js'
	import { addMonths } from '../ledger.js'
	import { finance } from '../store.svelte.js'
	import type { SavingsGoal } from '../types.js'
	import { monthYearLine } from '../words.js'

	type Props = {
		open: boolean
		goal: SavingsGoal
	}
	let { open = $bindable(), goal }: Props = $props()

	const uid = $props.id()
	const lang = $derived(settings.language)
	const money = (amount: Money) => amountText(formatMoney(amount, lang), settings.hideAmounts)
	const thisMonth = $derived(dateIn(undefined, finance.clock).slice(0, 7))

	const row = $derived(
		finance.goalsView?.groups.flatMap((group) => group.rows).find((entry) => entry.goal.id === goal.id)
	)
	const months = $derived(
		Array.from({ length: 24 }, (_, at) => {
			const value = addMonths(thisMonth, at + 1)
			return { value, label: monthYearLine(`${value}-01`, lang, true) }
		})
	)
	// svelte-ignore state_referenced_locally
	let by = $state(goal.rebuildBy ?? addMonths(dateIn(undefined, finance.clock).slice(0, 7), 6))

	const monthly = $derived(row?.dip ? goalMonthly(row.dip.amount, Math.max(1, monthsLeft(thisMonth, by))) : undefined)

	async function save(event: SubmitEvent) {
		event.preventDefault()
		const undo = await finance.planRebuild(goal.id, by)
		if (undo) undoToast($t('domains.finance.goals.toasts.rebuild', { values: { name: goal.name ?? '' } }), undo)
		open = false
	}
</script>

<Sheet bind:open size="sm" labelledby="{uid}-title">
	{#snippet header()}
		<h2 class="title" id="{uid}-title">{$t('domains.finance.goals.rebuildSheet.title')}</h2>
	{/snippet}
	<form class="form" id="{uid}-form" onsubmit={save} novalidate>
		{#if row?.dip}
			<p class="text">
				{$t('domains.finance.goals.rebuildSheet.down', {
					values: { amount: money(row.dip.amount), high: money(row.dip.from) },
				})}
			</p>
		{/if}
		<Select label={$t('domains.finance.goals.rebuildSheet.by')} options={months} bind:value={by} />
		<p class="note" aria-live="polite">
			{monthly
				? $t('domains.finance.goals.rebuildSheet.live', {
						values: { amount: money(monthly), month: monthYearLine(`${by}-01`, lang, true) },
					})
				: ''}
		</p>
	</form>
	{#snippet footer()}
		<Button label={$t('domains.finance.cancel')} variant="quiet" onclick={() => (open = false)} />
		<Button label={$t('domains.finance.save')} variant="primary" type="submit" form="{uid}-form" />
	{/snippet}
</Sheet>

<style>
	.title {
		margin: 0;
		font: var(--ed-t-title);
		letter-spacing: var(--ed-t-title-tracking);
		font-variation-settings: var(--ed-t-title-opsz);
	}
	.form {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}
	.text {
		margin: 0;
		font: var(--ed-t-text);
	}
	.note {
		margin: 0;
		font: var(--ed-t-caption);
		letter-spacing: var(--ed-t-caption-tracking);
		color: var(--text-secondary);
	}
</style>
