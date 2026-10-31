<script lang="ts">
	// The supplement form (Domains/Vigor/Supplements): the name, the brand, the dose, when it is taken, and a Hearth
	// stock item of the workspace's to link by name; the link keeps the item's URI and reads its row (D-177).
	import { Button, Field, Select, Sheet } from '@eden/ui-kit'
	import { t } from '../../../i18n/index.js'
	import { undoToast } from '../../../shell/index.js'
	import { fitness } from '../store.svelte.js'
	import { SUPPLEMENT_WHEN, type Supplement, type SupplementWhen } from '../types.js'

	type Props = {
		open: boolean
		supplement?: Supplement
	}
	let { open = $bindable(), supplement }: Props = $props()

	const uid = $props.id()
	// svelte-ignore state_referenced_locally
	let form = $state({
		name: supplement?.name ?? '',
		brand: supplement?.brand ?? '',
		dose: supplement?.dose ?? '',
		when: (supplement?.when ?? 'daily') as string,
		stockItemUri: supplement?.stockItemUri ?? '',
	})
	const WHEN_LABELS: Record<SupplementWhen, string> = {
		daily: 'whenDaily',
		'pre-workout': 'whenPreWorkout',
		'as-needed': 'whenAsNeeded',
	}
	const canSave = $derived(form.name.trim() !== '' && form.dose.trim() !== '')

	function save(event: SubmitEvent) {
		event.preventDefault()
		if (!canSave) return
		const when = (SUPPLEMENT_WHEN as readonly string[]).includes(form.when) ? (form.when as SupplementWhen) : 'daily'
		const { supplement: saved, undo } = fitness.saveSupplement({
			id: supplement?.id,
			name: form.name,
			...(form.brand.trim() ? { brand: form.brand.trim() } : {}),
			dose: form.dose.trim(),
			when,
			...(form.stockItemUri ? { stockItemUri: form.stockItemUri } : {}),
		})
		undoToast($t('garden.feed.supplementSaved', { values: { name: saved.name } }), undo)
		open = false
	}
</script>

<Sheet bind:open size="md" labelledby="{uid}-title">
	{#snippet header()}
		<h2 class="title" id="{uid}-title">
			{supplement ? $t('domains.fitness.supplements.form.titleEdit') : $t('domains.fitness.supplements.form.titleNew')}
		</h2>
	{/snippet}
	<form class="form" id="{uid}-form" onsubmit={save}>
		<Field label={$t('domains.fitness.supplements.form.name')} bind:value={form.name} />
		<div class="pair">
			<Field label={$t('domains.fitness.supplements.form.brand')} bind:value={form.brand} />
			<Field label={$t('domains.fitness.supplements.form.dose')} bind:value={form.dose} />
		</div>
		<Select
			label={$t('domains.fitness.supplements.form.when')}
			options={SUPPLEMENT_WHEN.map((id) => ({
				value: id,
				label: $t(`domains.fitness.supplements.form.${WHEN_LABELS[id]}`),
			}))}
			bind:value={form.when}
		/>
		<Select
			label={$t('domains.fitness.supplements.form.stockItem')}
			placeholder={$t('domains.fitness.supplements.form.notLinked')}
			options={fitness.stock.map((item) => ({ value: item.uri, label: item.name }))}
			bind:value={form.stockItemUri}
		/>
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
	.pair {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
		gap: var(--space-3);
	}
</style>
