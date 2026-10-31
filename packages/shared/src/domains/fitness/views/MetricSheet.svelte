<script lang="ts">
	// The metric sheet (Domains/Vigor/Body, "Log"): a kind, a value in the owner's unit (kept metric, D-177) and the day
	// it was taken, at the time it is now.
	import { Button, Field, Select, Sheet } from '@eden/ui-kit'
	import { timeIn, todayIso } from '../../../dates/index.js'
	import { t } from '../../../i18n/index.js'
	import { settings } from '../../../settings/index.js'
	import { undoToast } from '../../../shell/index.js'
	import { startAtOf } from '../progress.js'
	import { fitness } from '../store.svelte.js'
	import { METRIC_KINDS, type MetricKind } from '../types.js'
	import { fromDisplay, unitOf } from '../units.js'

	type Props = {
		open: boolean
		kind: MetricKind
	}
	let { open = $bindable(), kind }: Props = $props()

	const uid = $props.id()
	// svelte-ignore state_referenced_locally
	let form = $state({ kind: kind as string, value: '', date: todayIso() })
	const chosen = $derived((METRIC_KINDS as readonly string[]).includes(form.kind) ? (form.kind as MetricKind) : kind)
	const unit = $derived(unitOf(chosen, settings.measurement))
	const value = $derived(Number(form.value.replace(',', '.')))
	const canSave = $derived(value > 0 && value < 1000 && form.date !== '')

	function save(event: SubmitEvent) {
		event.preventDefault()
		if (!canSave) return
		const stored = fromDisplay(chosen, value, settings.measurement)
		const at = startAtOf(form.date, timeIn(Date.now(), undefined))
		const { undo } = fitness.logMetric(chosen, stored, { at })
		const name = $t(`domains.fitness.body.kinds.${chosen}`)
		undoToast($t('garden.feed.metricLogged', { values: { kind: name, value: `${value} ${unit}` } }), undo)
		open = false
	}
</script>

<Sheet bind:open size="sm" labelledby="{uid}-title">
	{#snippet header()}
		<h2 class="title" id="{uid}-title">{$t('domains.fitness.body.metricForm.title')}</h2>
	{/snippet}
	<form class="form" id="{uid}-form" onsubmit={save}>
		<Select
			label={$t('domains.fitness.body.metricForm.kind')}
			options={METRIC_KINDS.map((id) => ({ value: id, label: $t(`domains.fitness.body.kinds.${id}`) }))}
			bind:value={form.kind}
		/>
		<Field
			label={$t('domains.fitness.body.metricForm.value')}
			{unit}
			bind:value={form.value}
			mono
			inputmode="decimal"
		/>
		<Field label={$t('domains.fitness.body.metricForm.date')} type="date" bind:value={form.date} />
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
