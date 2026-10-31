<script lang="ts">
	// The goal sheet (Domains/Vigor/Body, "Set goal"): a target weight in the owner's unit, kept in kg, and the day to
	// reach it by.
	import { Button, Field, Sheet } from '@eden/ui-kit'
	import { t } from '../../../i18n/index.js'
	import { settings } from '../../../settings/index.js'
	import { undoToast } from '../../../shell/index.js'
	import { fitness } from '../store.svelte.js'
	import { fromDisplay, toDisplay, unitOf } from '../units.js'

	let { open = $bindable() }: { open: boolean } = $props()

	const uid = $props.id()
	const unit = $derived(unitOf('weight', settings.measurement))
	let form = $state({
		target: fitness.goal ? toDisplay('weight', fitness.goal.target, settings.measurement).toFixed(1) : '',
		by: fitness.goal?.by ?? '',
	})
	const target = $derived(Number(form.target.replace(',', '.')))
	const canSave = $derived(target > 0 && target < 1000 && form.by !== '')

	function save(event: SubmitEvent) {
		event.preventDefault()
		if (!canSave) return
		const kg = fromDisplay('weight', target, settings.measurement)
		const undo = fitness.setGoal(kg, form.by)
		undoToast($t('garden.feed.goalSet', { values: { target: target.toFixed(1), unit, date: form.by } }), undo)
		open = false
	}
</script>

<Sheet bind:open size="sm" labelledby="{uid}-title">
	{#snippet header()}
		<h2 class="title" id="{uid}-title">{$t('domains.fitness.body.goalForm.title')}</h2>
	{/snippet}
	<form class="form" id="{uid}-form" onsubmit={save}>
		<Field
			label={$t('domains.fitness.body.goalForm.target')}
			{unit}
			bind:value={form.target}
			mono
			inputmode="decimal"
		/>
		<Field label={$t('domains.fitness.body.goalForm.by')} type="date" bind:value={form.by} />
	</form>
	{#snippet footer()}
		<Button label={$t('domains.fitness.cancel')} variant="quiet" onclick={() => (open = false)} />
		<Button label={$t('domains.fitness.save')} variant="primary" type="submit" form="{uid}-form" disabled={!canSave} />
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
