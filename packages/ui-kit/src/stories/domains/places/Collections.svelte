<script lang="ts">
	// Meadow's Collections view (product/domains/places.md): named sets of places, each a list of its own, all on the
	// page at once. Every saved place stands in a list at the side, and a place dragged from it onto a collection
	// joins it (D-106); the same move is in each row's menu, for touch and the keyboard.
	import { DropTarget, EmptyState, List, type ListRowData, type MenuItem, type PageHeaderAction } from '$lib/index.js'
	import MeadowPage, { CATEGORY_GLYPHS, CATEGORY_NAMES } from './MeadowPage.svelte'
	import { meadowCollections, meadowPlaces, type SamplePlace } from '../../sample-data.js'

	type Props = {
		empty?: boolean
		onnew?: () => void
		onadd?: (collection: string, places: string[]) => void
		onaction?: (item: MenuItem, row: ListRowData) => void
		onopen?: (place: string) => void
		onnavigate?: (id: string) => void
	}
	let { empty = false, onnew, onadd, onaction, onopen, onnavigate }: Props = $props()

	const GROUP = 'place'
	const collections = $derived(empty ? [] : meadowCollections)
	const row = (place: SamplePlace, actions: MenuItem[]): ListRowData => ({
		id: place.id,
		primary: place.name,
		secondary: `${CATEGORY_NAMES[place.category]} · ${place.locality}`,
		thumbnail: place.picture,
		icon: CATEGORY_GLYPHS[place.category],
		tile: true,
		actions,
	})
	const inActions: MenuItem[] = [{ id: 'remove', label: 'Remove from collection', icon: 'minus' }]
	const allActions = $derived<MenuItem[]>([
		{
			id: 'add',
			label: 'Add to',
			icon: 'plus',
			children: collections.map((collection) => ({ id: collection.id, label: collection.name })),
		},
	])
	const actions = $derived<PageHeaderAction[]>([
		{ label: 'New collection', icon: 'plus', variant: empty ? 'secondary' : undefined, onclick: onnew },
	])
</script>

<MeadowPage tab="Collections" {actions} {onnavigate}>
	{#snippet children(platform)}
		{#if empty}
			<EmptyState
				title="No collections yet"
				text="Gather places that go together: where you work, where you take people, where you go to be alone."
				action={{ label: 'New collection', icon: 'plus', onclick: onnew }}
			/>
		{:else}
			<div class={['body', { 'body-wide': platform === 'desktop' }]}>
				<div class="main">
					{#each collections as collection (collection.id)}
						<DropTarget accepts={[GROUP]} ondrop={(ids) => onadd?.(collection.id, ids)}>
							<section class="collection" aria-labelledby="col-{collection.id}">
								<h2 class="heading" id="col-{collection.id}">{collection.name}</h2>
								{#if collection.note}<p class="note">{collection.note}</p>{/if}
								<List
									labelledby="col-{collection.id}"
									headless
									rows={meadowPlaces
										.filter((place) => collection.placeIds.includes(place.id))
										.map((place) => row(place, inActions))}
									onpick={(picked) => onopen?.(picked.id)}
									{onaction}
								/>
							</section>
						</DropTarget>
					{/each}
				</div>
				<div class="side">
					<List
						header="All places"
						count={meadowPlaces.length}
						rows={meadowPlaces.map((place) => row(place, allActions))}
						dragGroup={GROUP}
						onpick={(picked) => onopen?.(picked.id)}
						{onaction}
					/>
				</div>
			</div>
		{/if}
	{/snippet}
</MeadowPage>

<style>
	.body {
		display: grid;
		gap: var(--space-6);
		padding: 0 var(--ed-gutter);
	}
	.body-wide {
		grid-template-columns: minmax(0, 1fr) var(--sheet-sm);
		align-items: start;
	}
	.main {
		display: flex;
		flex-direction: column;
		gap: var(--space-6);
		min-width: 0;
	}
	.collection {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}
	.heading {
		margin: 0;
		font: var(--ed-t-title);
		letter-spacing: var(--ed-t-title-tracking);
		font-variation-settings: var(--ed-t-title-opsz);
	}
	.note {
		margin: 0;
		color: var(--text-secondary);
		font: var(--ed-t-body-sm);
		letter-spacing: var(--ed-t-body-sm-tracking);
	}
</style>
