<script lang="ts">
	// Mark a money-out row reimbursable from Activity (product/domains/finance.md §6, #83): how much of it someone owes
	// back, in the row's currency, starting at the whole of it. A refusal (`reimbursable:*`) stays in the sheet as the
	// field's error; a saved one closes it with an undo.
	import { Button, Field, Sheet } from '@eden/ui-kit'
	import { tick } from 'svelte'
	import { t } from '../../../i18n/index.js'
	import { money, parseMoney, toDecimal } from '../../../money/index.js'
	import { settings } from '../../../settings/index.js'
	import { undoToast } from '../../../shell/index.js'
	import { rowTitle } from '../activity.js'
	import type { LedgerRow } from '../ledger.js'
	import { finance } from '../store.svelte.js'
	import { moneyError } from '../words.js'

	type Props = {
		open: boolean
		row: LedgerRow
	}
	let { open = $bindable(), row }: Props = $props()

	const uid = $props.id()
	const lang = $derived(settings.language)
	const currency = $derived(row.amount.currency)
	// svelte-ignore state_referenced_locally
	let value = $state(toDecimal(money(Math.abs(row.amount.minor), row.amount.currency)))
	let error = $state<string>()
	let saving = $state(false)

	async function refuse(text: string) {
		error = text
		await tick()
		document.getElementById(`${uid}-amount`)?.focus()
	}

	async function save(event: SubmitEvent) {
		event.preventDefault()
		if (saving) return
		const parsed = parseMoney(value, currency, lang)
		if ('error' in parsed) return refuse(moneyError(parsed.error, currency, $t, lang))
		saving = true
		const answer = await finance.setReimbursable(row.id, parsed)
		saving = false
		if (answer && 'error' in answer)
			return refuse($t(`domains.finance.activity.refusals.${answer.error.replace('reimbursable:', '')}`))
		open = false
		if (answer) undoToast($t('domains.finance.activity.toasts.reimbursable'), answer)
	}
</script>

<Sheet bind:open size="sm" labelledby="{uid}-title">
	{#snippet header()}
		<div class="head">
			<h2 class="title" id="{uid}-title">{$t('domains.finance.activity.reimbursableSheet.title')}</h2>
			<p class="context">{rowTitle(row, $t)}</p>
		</div>
	{/snippet}
	<form class="form" id="{uid}-form" onsubmit={save} novalidate>
		<Field
			id="{uid}-amount"
			label={$t('domains.finance.activity.reimbursableSheet.amount')}
			unit={currency}
			bind:value
			{error}
			mono
			inputmode="decimal"
		/>
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
