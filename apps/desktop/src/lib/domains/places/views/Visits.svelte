<script lang="ts">
	// Meadow's Visits tab (product/domains/places.md): where the owner has been and what they thought, newest first.
	// Each is a day, a rating out of five and a note; a click on the place's name shows it on the map. A visit is
	// logged from a place, so the empty state says where.
	import { EmptyState, IconButton, Rating, Thumbnail } from '@eden/ui-kit'
	import { formatDateOf } from '@eden/shared/dates'
	import { categoryGlyph, meadow, type SavedPlace, type Visit } from '@eden/shared/domains/places'
	import { locale, t } from '@eden/shared/i18n'
	import { undoToast } from '@eden/shared/shell'

	type Props = {
		onopen?: (place: SavedPlace) => void
	}
	let { onopen }: Props = $props()

	const lang = $derived($locale ?? 'en')
	const visits = $derived(
		meadow.visits.flatMap((visit) => {
			const place = meadow.placeById(visit.placeId)
			return place ? [{ visit, place }] : []
		})
	)
	function remove(visit: Visit, place: SavedPlace) {
		const { undo } = meadow.removeVisit(visit.id)
		undoToast($t('domains.places.toast.visitRemoved', { values: { name: place.name } }), undo)
	}
</script>

{#if meadow.ready && !visits.length}
	<EmptyState title={$t('domains.places.visits.empty.title')} text={$t('domains.places.visits.empty.text')} />
{:else}
	<div class="body">
		<ul class="visits" aria-label={$t('domains.places.tabs.visits')}>
			{#each visits as { visit, place } (visit.id)}
				<li class="visit">
					<Thumbnail src={place.thumb} icon={categoryGlyph(place.category)} size="md" />
					<div class="text">
						<button class="place" type="button" onclick={() => onopen?.(place)}>{place.name}</button>
						{#if visit.note}<p class="note">{visit.note}</p>{/if}
					</div>
					{#if visit.rating}<Rating readonly value={visit.rating} label={place.name} />{/if}
					<span class="day">{formatDateOf(visit.day, lang)}</span>
					<IconButton
						icon="trash"
						size="xs"
						danger
						label={$t('domains.places.visits.delete', { values: { name: place.name } })}
						tooltip
						onclick={() => remove(visit, place)}
					/>
				</li>
			{/each}
		</ul>
	</div>
{/if}

<style>
	.body {
		padding: 0 var(--ed-gutter);
	}
	.visits {
		display: flex;
		flex-direction: column;
		margin: 0;
		padding: 0;
		list-style: none;
		border: 1px solid var(--ed-card-border);
		border-radius: var(--ed-radius-card);
		background: var(--surface-1);
		overflow: hidden;
	}
	.visit {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-3);
		padding: var(--space-3);
	}
	.visit + .visit {
		border-top: 1px solid var(--stroke-subtle);
	}
	.text {
		flex: 1;
		min-width: calc(var(--space-8) * 4);
		display: flex;
		flex-direction: column;
		align-items: start;
		gap: var(--space-1);
	}
	.place {
		margin: 0;
		padding: 0;
		border: 0;
		border-radius: var(--ed-radius-control);
		background: none;
		color: var(--text-primary);
		font: var(--ed-t-text);
		font-weight: 500;
		text-align: start;
		cursor: pointer;
	}
	.place:hover {
		text-decoration: underline;
	}
	.place:focus-visible {
		outline: 2px solid transparent;
		box-shadow: var(--focus-ring);
	}
	.note {
		margin: 0;
		color: var(--text-secondary);
		font: var(--ed-t-body-sm);
		letter-spacing: var(--ed-t-body-sm-tracking);
		user-select: text;
	}
	.day {
		font: var(--ed-t-data-sm);
		letter-spacing: var(--ed-t-data-sm-tracking);
		color: var(--text-secondary);
	}
</style>
