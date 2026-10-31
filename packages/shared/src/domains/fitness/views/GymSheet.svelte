<script lang="ts">
	// The gym form (Domains/Vigor/Gyms, "Form"): the name, the equipment added a chip at a time from a field, the hours,
	// the notes and a venue Place of the workspace's to link.
	import { Button, Chip, Field, IconButton, Select, Sheet } from '@eden/ui-kit'
	import { t } from '../../../i18n/index.js'
	import { undoToast } from '../../../shell/index.js'
	import { fitness } from '../store.svelte.js'
	import type { Gym } from '../types.js'

	type Props = {
		open: boolean
		gym?: Gym
	}
	let { open = $bindable(), gym }: Props = $props()

	const uid = $props.id()
	// svelte-ignore state_referenced_locally
	let form = $state({
		name: gym?.name ?? '',
		equipment: [...(gym?.equipment ?? [])],
		adding: '',
		hours: gym?.hours ?? '',
		notes: gym?.notes ?? '',
		placeId: gym?.placeId ?? '',
	})

	function addEquipment() {
		const piece = form.adding.trim()
		if (piece && !form.equipment.includes(piece)) form.equipment.push(piece)
		form.adding = ''
	}
	function save(event: SubmitEvent) {
		event.preventDefault()
		if (!form.name.trim()) return
		addEquipment()
		const { gym: saved, undo } = fitness.saveGym({
			id: gym?.id,
			name: form.name,
			equipment: form.equipment,
			...(form.hours.trim() ? { hours: form.hours.trim() } : {}),
			...(form.notes.trim() ? { notes: form.notes.trim() } : {}),
			...(form.placeId ? { placeId: form.placeId } : {}),
		})
		undoToast($t('garden.feed.gymSaved', { values: { name: saved.name } }), undo)
		open = false
	}
</script>

<Sheet bind:open size="md" labelledby="{uid}-title">
	{#snippet header()}
		<h2 class="title" id="{uid}-title">
			{gym ? $t('domains.fitness.gyms.form.titleEdit') : $t('domains.fitness.gyms.form.titleNew')}
		</h2>
	{/snippet}
	<form class="form" id="{uid}-form" onsubmit={save}>
		<Field label={$t('domains.fitness.gyms.form.name')} bind:value={form.name} />
		<Field
			label={$t('domains.fitness.gyms.equipment')}
			helper={$t('domains.fitness.gyms.form.equipmentHelper')}
			bind:value={form.adding}
			onkeydown={(event) => {
				if (event.key !== 'Enter') return
				event.preventDefault()
				addEquipment()
			}}
		/>
		{#if form.equipment.length}
			<ul class="chips" aria-label={$t('domains.fitness.gyms.form.equipmentToSave')}>
				{#each form.equipment as piece, i (piece)}
					<li class="removable">
						<Chip label={piece} />
						<IconButton
							icon="x"
							size="xs"
							label={$t('domains.fitness.gyms.form.remove', { values: { name: piece } })}
							tooltip
							onclick={() => form.equipment.splice(i, 1)}
						/>
					</li>
				{/each}
			</ul>
		{/if}
		<Field label={$t('domains.fitness.gyms.hours')} bind:value={form.hours} />
		<Field label={$t('domains.fitness.gyms.notes')} bind:value={form.notes} multiline rows={2} />
		<Select
			label={$t('domains.fitness.gyms.place')}
			placeholder={$t('domains.fitness.gyms.form.notLinked')}
			options={fitness.venues.map((venue) => ({ value: venue.id, label: venue.name }))}
			bind:value={form.placeId}
		/>
	</form>
	{#snippet footer()}
		<Button label={$t('domains.fitness.cancel')} variant="quiet" onclick={() => (open = false)} />
		<Button
			label={$t('domains.fitness.save')}
			variant="primary"
			type="submit"
			form="{uid}-form"
			disabled={!form.name.trim()}
		/>
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
	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.removable {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
	}
</style>
