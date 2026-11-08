<script lang="ts">
	// Change a row's category from Activity (product/domains/finance.md §6, #83): the live categories and No category,
	// starting on the row's own. With a merchant or a counterparty, "Use for every …" makes the choice a rule the next
	// pass follows (`setCategory` with `remember`); the undo takes all of it back. Cancel writes nothing.
	import { Button, Select, Sheet, Toggle } from '@eden/ui-kit'
	import { t } from '../../../i18n/index.js'
	import { undoToast } from '../../../shell/index.js'
	import { rowTitle } from '../activity.js'
	import type { LedgerRow } from '../ledger.js'
	import { finance } from '../store.svelte.js'

	type Props = {
		open: boolean
		row: LedgerRow
	}
	let { open = $bindable(), row }: Props = $props()

	const uid = $props.id()
	const title = $derived(rowTitle(row, $t))
	const canRemember = $derived(Boolean(row.merchantId || row.counterparty))
	const options = $derived([
		{ value: '', label: $t('domains.finance.activity.categorySheet.none') },
		...[...finance.categories]
			.sort((a, b) => a.name.localeCompare(b.name))
			.map((category) => ({ value: category.id, label: category.name })),
	])
	// svelte-ignore state_referenced_locally
	let value = $state(row.categoryId ?? '')
	let remember = $state(false)

	async function save(event: SubmitEvent) {
		event.preventDefault()
		const keep = remember && canRemember
		open = false
		const undo = await finance.setCategory(row.id, value || undefined, { remember: keep })
		if (undo)
			undoToast(
				keep
					? $t('domains.finance.activity.toasts.remembered', { values: { title } })
					: $t('domains.finance.activity.toasts.categorised'),
				undo
			)
	}
</script>

<Sheet bind:open size="sm" labelledby="{uid}-title">
	{#snippet header()}
		<div class="head">
			<h2 class="title" id="{uid}-title">{$t('domains.finance.activity.categorySheet.title')}</h2>
			<p class="context">{title}</p>
		</div>
	{/snippet}
	<form class="form" id="{uid}-form" onsubmit={save} novalidate>
		<Select
			label={$t('domains.finance.activity.categorySheet.category')}
			{options}
			{value}
			onchange={(next) => (value = next)}
		/>
		{#if canRemember}
			<Toggle
				label={$t('domains.finance.activity.categorySheet.remember', { values: { title } })}
				checked={remember}
				onchange={(next) => (remember = next)}
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
