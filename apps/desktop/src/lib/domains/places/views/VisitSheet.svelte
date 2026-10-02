<script lang="ts">
	// Logging a visit (product/domains/places.md): the day, a rating out of five and a note, in a sheet over the page
	// (D-95). Save is one write with one undo. The page opens it through `log(place)`.
	import { Button, Field, Rating, Sheet } from '@eden/ui-kit'
	import { todayIso } from '@eden/shared/dates'
	import { meadow, type SavedPlace, type Visit } from '@eden/shared/domains/places'
	import { t } from '@eden/shared/i18n'
	import { undoToast } from '@eden/shared/shell'

	const uid = $props.id()
	let open = $state(false)
	let place = $state<SavedPlace>()
	let day = $state(todayIso())
	let rating = $state<number>()
	let note = $state('')

	/** Open the sheet on a place, dated today. */
	export function log(target: SavedPlace) {
		place = target
		day = todayIso()
		rating = undefined
		note = ''
		open = true
	}

	function save() {
		if (!place) return
		const { undo } = meadow.logVisit(place.id, { day: day || todayIso(), rating: rating as Visit['rating'], note })
		undoToast($t('domains.places.toast.visited', { values: { name: place.name } }), undo)
		open = false
	}
</script>

<Sheet bind:open size="sm" labelledby="{uid}-title">
	{#snippet header()}
		<h2 class="title" id="{uid}-title">
			{$t('domains.places.visit.title', { values: { name: place?.name ?? '' } })}
		</h2>
	{/snippet}
	<form
		class="form"
		id="{uid}-form"
		onsubmit={(event) => {
			event.preventDefault()
			save()
		}}
	>
		<Field label={$t('domains.places.visit.day')} type="date" bind:value={day} max={todayIso()} />
		<div class="rating">
			<span class="label" id="{uid}-rating">{$t('domains.places.visit.rating')}</span>
			<Rating bind:value={rating} label={$t('domains.places.visit.rating')} />
		</div>
		<Field
			label={$t('domains.places.visit.note')}
			placeholder={$t('domains.places.visit.notePlaceholder')}
			multiline
			rows={3}
			bind:value={note}
		/>
	</form>
	{#snippet footer()}
		<Button label={$t('common.cancel')} variant="quiet" onclick={() => (open = false)} />
		<Button label={$t('domains.places.visit.save')} variant="primary" type="submit" form="{uid}-form" />
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
		gap: var(--space-4);
	}
	.rating {
		display: flex;
		flex-direction: column;
		align-items: start;
		gap: var(--space-1);
	}
	.label {
		color: var(--text-secondary);
		font: var(--ed-t-label);
		letter-spacing: var(--ed-t-label-tracking);
		font-variation-settings: var(--ed-t-label-opsz);
	}
</style>
