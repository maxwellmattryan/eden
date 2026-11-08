<script lang="ts">
	// The savings-rate goal (product/domains/finance.md §6, "Goals (#88)", D-202): one whole percent from 1 to 99. The
	// error shows on the field and takes focus on Save; Save stores it with an undo toast. Cancel writes nothing.
	import { Button, Field, Sheet } from '@eden/ui-kit'
	import { tick } from 'svelte'
	import { t } from '../../../i18n/index.js'
	import { undoToast } from '../../../shell/index.js'
	import { goalErrors } from '../goals.js'
	import { finance } from '../store.svelte.js'

	type Props = {
		open: boolean
	}
	let { open = $bindable() }: Props = $props()

	const uid = $props.id()
	const held = finance.goalsView?.rateGoal?.rate
	let value = $state(held !== undefined ? String(Math.round(held / 100)) : '')
	let error = $state<string>()

	async function save(event: SubmitEvent) {
		event.preventDefault()
		const text = value.trim()
		const rate = /^\d+$/.test(text) ? Number(text) : Number.NaN
		const [code] = goalErrors({ kind: 'rate', rate }, { accounts: [] })
		const answer = code ? { error: code } : await finance.saveRate(rate)
		if (answer && typeof answer === 'object') {
			error = $t(`domains.finance.goals.errors.${answer.error}`)
			await tick()
			document.getElementById(`${uid}-rate`)?.focus()
			return
		}
		if (answer) undoToast($t('domains.finance.goals.toasts.rateSet'), answer)
		open = false
	}
</script>

<Sheet bind:open size="sm" labelledby="{uid}-title">
	{#snippet header()}
		<h2 class="title" id="{uid}-title">{$t('domains.finance.goals.rateSheet.title')}</h2>
	{/snippet}
	<form class="form" id="{uid}-form" onsubmit={save} novalidate>
		<Field
			id="{uid}-rate"
			label={$t('domains.finance.goals.rateSheet.field')}
			unit="%"
			bind:value
			{error}
			mono
			inputmode="numeric"
			maxlength={2}
		/>
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
</style>
