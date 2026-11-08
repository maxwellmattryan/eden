<script lang="ts">
	// A holding's own figures (D-195): with `field: 'cost-basis'` the owner's cost basis, a total in the holding's
	// currency that no read overwrites; with `field: 'value'` the owner's value for a holding Plaid gives no price for,
	// with the day it was set, which reads out of date after 90 days. Errors show under their field, never as a toast.
	import { Button, Field, Sheet } from '@eden/ui-kit'
	import { tick } from 'svelte'
	import { todayIso } from '../../../dates/index.js'
	import { t } from '../../../i18n/index.js'
	import { parseMoney, toDecimal } from '../../../money/index.js'
	import { settings } from '../../../settings/index.js'
	import { undoToast } from '../../../shell/index.js'
	import { finance } from '../store.svelte.js'
	import type { Holding } from '../types.js'
	import { moneyError } from '../words.js'

	type Props = {
		open: boolean
		holding: Holding
		field: 'cost-basis' | 'value'
	}
	let { open = $bindable(), holding, field }: Props = $props()

	const uid = $props.id()
	const lang = $derived(settings.language)
	const today = todayIso()
	const name = $derived(finance.securityById(holding.securityId)?.name ?? '')
	// svelte-ignore state_referenced_locally
	let amount = $state(
		field === 'cost-basis'
			? holding.costBasis
				? toDecimal(holding.costBasis)
				: ''
			: holding.typedValue
				? toDecimal(holding.typedValue.value)
				: ''
	)
	let on = $state(today)
	let errors = $state<{ amount?: string; on?: string }>({})

	const title = $derived(
		field === 'cost-basis'
			? $t(
					holding.costBasis
						? 'domains.finance.investments.costBasisTitle'
						: 'domains.finance.investments.costBasisTitleNew'
				)
			: $t(holding.typedValue ? 'domains.finance.investments.valueTitle' : 'domains.finance.investments.valueTitleNew')
	)

	async function save(event: SubmitEvent) {
		event.preventDefault()
		const parsed = parseMoney(amount, holding.currency, lang)
		const next: typeof errors = {}
		if ('error' in parsed) next.amount = moneyError(parsed.error, holding.currency, $t, lang)
		if (field === 'value') {
			if (!/^\d{4}-\d{2}-\d{2}$/.test(on)) next.on = $t('domains.finance.errors.day')
			else if (on > today) next.on = $t('domains.finance.errors.futureDay')
		}
		errors = next
		const first = (['amount', 'on'] as const).find((key) => next[key])
		if (first || 'error' in parsed) {
			await tick()
			document.getElementById(`${uid}-${first}`)?.focus()
			return
		}
		if (field === 'cost-basis') {
			const undo = finance.setCostBasis(holding.id, parsed)
			if (undo) undoToast($t('domains.finance.toasts.costBasisSet', { values: { name } }), undo)
		} else {
			const undo = finance.setHoldingValue(holding.id, { value: parsed, on })
			if (undo) undoToast($t('domains.finance.toasts.valueSet', { values: { name } }), undo)
		}
		open = false
	}
</script>

<Sheet bind:open size="sm" labelledby="{uid}-title">
	{#snippet header()}
		<div class="head">
			<h2 class="title" id="{uid}-title">{title}</h2>
			<p class="context">
				{field === 'cost-basis'
					? $t('domains.finance.investments.costBasisLede', { values: { name } })
					: $t('domains.finance.investments.valueLede', { values: { name } })}
			</p>
		</div>
	{/snippet}
	<form class="form" id="{uid}-form" onsubmit={save} novalidate>
		<Field
			id="{uid}-amount"
			label={$t(field === 'cost-basis' ? 'domains.finance.investments.costBasis' : 'domains.finance.investments.value')}
			unit={holding.currency}
			bind:value={amount}
			error={errors.amount}
			mono
			inputmode="decimal"
		/>
		{#if field === 'value'}
			<Field
				id="{uid}-on"
				label={$t('domains.finance.investments.valuedOn')}
				type="date"
				max={today}
				bind:value={on}
				error={errors.on}
			/>
		{/if}
	</form>
	{#snippet footer()}
		<Button label={$t('domains.finance.cancel')} variant="quiet" onclick={() => (open = false)} />
		<Button label={$t('domains.finance.save')} variant="primary" type="submit" form="{uid}-form" />
	{/snippet}
</Sheet>

<style>
	.head {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
	}
	.title {
		margin: 0;
		font: var(--ed-t-title);
		letter-spacing: var(--ed-t-title-tracking);
		font-variation-settings: var(--ed-t-title-opsz);
	}
	.context {
		margin: 0;
		font: var(--ed-t-body-sm);
		letter-spacing: var(--ed-t-body-sm-tracking);
		color: var(--text-secondary);
	}
	.form {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}
</style>
