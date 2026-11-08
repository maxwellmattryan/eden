<script lang="ts">
	// The late paycheck's question (product/domains/finance.md §6, #80, D-198): did the job end? "No, it's just late"
	// keeps the source and stops asking about that day; "Yes, it ended" ends it today and turns lean mode on. Each
	// answer has an Undo. Dismissing the sheet answers nothing, so the header's notice stays.
	import { Button, Sheet } from '@eden/ui-kit'
	import { t } from '../../../i18n/index.js'
	import { settings } from '../../../settings/index.js'
	import { undoToast } from '../../../shell/index.js'
	import { finance } from '../store.svelte.js'
	import type { IncomeSource } from '../types.js'
	import { dayLine } from '../words.js'

	type Props = {
		open: boolean
		source: IncomeSource
		/** The missed pay day the question is about. */
		day: string
	}
	let { open = $bindable(), source, day }: Props = $props()

	const uid = $props.id()
	const due = $derived(dayLine(day, settings.language))

	function late() {
		const undo = finance.paycheckLate(source.id, day)
		if (undo) undoToast($t('domains.finance.toasts.justLate', { values: { day: due } }), undo)
		open = false
	}
	function ended() {
		const undo = finance.endIncome(source.id, { lean: true })
		if (undo) undoToast($t('domains.finance.toasts.incomeEnded', { values: { employer: source.name } }), undo)
		open = false
	}
</script>

<Sheet bind:open size="sm" labelledby="{uid}-title">
	{#snippet header()}
		<h2 class="title" id="{uid}-title">
			{$t('domains.finance.income.paycheck.title', { values: { employer: source.name } })}
		</h2>
	{/snippet}
	<div class="body">
		<p class="context">{$t('domains.finance.income.paycheck.due', { values: { day: due } })}</p>
		<p class="context">{$t('domains.finance.income.paycheck.text')}</p>
	</div>
	{#snippet footer()}
		<Button label={$t('domains.finance.income.paycheck.justLate')} variant="secondary" onclick={late} />
		<Button label={$t('domains.finance.income.paycheck.ended')} variant="primary" onclick={ended} />
	{/snippet}
</Sheet>

<style>
	.title {
		margin: 0;
		font: var(--ed-t-title);
		letter-spacing: var(--ed-t-title-tracking);
		font-variation-settings: var(--ed-t-title-opsz);
	}
	.body {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}
	.context {
		margin: 0;
		font: var(--ed-t-body-sm);
		letter-spacing: var(--ed-t-body-sm-tracking);
		color: var(--text-secondary);
	}
</style>
