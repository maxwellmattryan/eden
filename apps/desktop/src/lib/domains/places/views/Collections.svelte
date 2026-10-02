<script lang="ts">
	// Meadow's Collections tab (product/domains/places.md): named sets of places, each a list of its own, all on the
	// page at once, with every saved place in a list at the side. A place dragged from the side onto a collection joins
	// it (D-106); the same move is in each row's menu, for touch and the keyboard. A collection's form is a small
	// sheet (D-95), opened blank by the header's New collection.
	import {
		Button,
		DropTarget,
		EmptyState,
		Field,
		IconButton,
		List,
		Sheet,
		type ListRowData,
		type MenuItem,
	} from '@eden/ui-kit'
	import { categoryGlyph, meadow, type Collection, type SavedPlace } from '@eden/shared/domains/places'
	import { t } from '@eden/shared/i18n'
	import { undoToast } from '@eden/shared/shell'
	import { categoryNamer } from '../words'

	type Props = {
		/** A place was picked: the page shows it on the map. */
		onopen?: (place: SavedPlace) => void
	}
	let { onopen }: Props = $props()

	const uid = $props.id()
	const GROUP = 'place'
	const categoryName = $derived(categoryNamer($t))

	const row = (place: SavedPlace, actions: MenuItem[]): ListRowData => ({
		id: place.id,
		primary: place.name,
		secondary: [categoryName(place.category), place.locality].filter(Boolean).join(' · '),
		thumbnail: place.thumb,
		icon: categoryGlyph(place.category),
		tile: true,
		actions,
	})
	const inActions = $derived<MenuItem[]>([
		{ id: 'remove', label: $t('domains.places.collections.remove'), icon: 'minus' },
	])
	const allActions = $derived<MenuItem[]>(
		meadow.collections.length
			? [
					{
						id: 'add',
						label: $t('domains.places.collections.addTo'),
						icon: 'plus',
						children: meadow.collections.map((collection) => ({ id: collection.id, label: collection.name })),
					},
				]
			: []
	)
	const placesOf = (collection: Collection) =>
		collection.placeIds.flatMap((id) => meadow.placeById(id) ?? []).map((place) => row(place, inActions))

	function join(collection: Collection, ids: string[]) {
		const { added, undo } = meadow.addToCollection(collection.id, ids)
		if (!added) return
		undoToast($t('domains.places.toast.collectedMany', { values: { count: added, collection: collection.name } }), undo)
	}
	function leave(collection: Collection, placeId: string) {
		const place = meadow.placeById(placeId)
		const { undo } = meadow.removeFromCollection(collection.id, placeId)
		undoToast(
			$t('domains.places.toast.uncollected', { values: { name: place?.name ?? '', collection: collection.name } }),
			undo
		)
	}
	function pickAll(item: MenuItem, picked: ListRowData) {
		const collection = meadow.collections.find((entry) => entry.id === item.id)
		if (collection) join(collection, [picked.id])
	}
	const open = (picked: ListRowData) => {
		const place = meadow.placeById(picked.id)
		if (place) onopen?.(place)
	}

	// The collection's form
	let sheet = $state(false)
	let editing = $state<string>()
	let form = $state({ name: '', note: '' })
	/** Open the form blank, to make a collection. */
	export function create() {
		form = { name: '', note: '' }
		editing = undefined
		sheet = true
	}
	function edit(collection: Collection) {
		form = { name: collection.name, note: collection.note ?? '' }
		editing = collection.id
		sheet = true
	}
	function save() {
		const name = form.name.trim()
		if (!name) return
		if (editing) {
			const { undo } = meadow.updateCollection(editing, form)
			undoToast($t('domains.places.toast.collectionEdited', { values: { name } }), undo)
		} else {
			const { undo } = meadow.addCollection(name, form.note)
			undoToast($t('domains.places.toast.collectionAdded', { values: { name } }), undo)
		}
		sheet = false
	}
	function remove() {
		if (!editing) return
		const { collection, undo } = meadow.removeCollection(editing)
		undoToast($t('domains.places.toast.collectionRemoved', { values: { name: collection?.name ?? '' } }), undo)
		sheet = false
	}
</script>

{#if meadow.ready && !meadow.collections.length}
	<EmptyState
		title={$t('domains.places.collections.empty.title')}
		text={$t('domains.places.collections.empty.text')}
		action={{ label: $t('domains.places.collections.new'), icon: 'plus', onclick: create }}
	/>
{:else}
	<div class="body">
		<div class="main">
			{#each meadow.collections as collection (collection.id)}
				<DropTarget accepts={[GROUP]} ondrop={(ids) => join(collection, ids)}>
					<section class="collection" aria-labelledby="{uid}-{collection.id}">
						<div class="head">
							<h2 class="heading" id="{uid}-{collection.id}">{collection.name}</h2>
							<IconButton
								icon="pencil"
								size="xs"
								label={$t('domains.places.collections.edit', { values: { name: collection.name } })}
								tooltip
								onclick={() => edit(collection)}
							/>
						</div>
						{#if collection.note}<p class="note">{collection.note}</p>{/if}
						{#if collection.placeIds.length}
							<List
								labelledby="{uid}-{collection.id}"
								headless
								rows={placesOf(collection)}
								onpick={open}
								onaction={(_item, picked) => leave(collection, picked.id)}
							/>
						{:else}
							<EmptyState
								inline
								motif={false}
								title={$t('domains.places.collections.none.title')}
								text={$t('domains.places.collections.none.text')}
							/>
						{/if}
					</section>
				</DropTarget>
			{/each}
		</div>
		<div class="side">
			<List
				header={$t('domains.places.collections.all')}
				count={meadow.places.length}
				rows={meadow.places.map((place) => row(place, allActions))}
				dragGroup={GROUP}
				onpick={open}
				onaction={pickAll}
			/>
		</div>
	</div>
{/if}

<Sheet bind:open={sheet} size="sm" labelledby="{uid}-form-title">
	{#snippet header()}
		<h2 class="heading" id="{uid}-form-title">
			{$t(editing ? 'domains.places.collections.editTitle' : 'domains.places.collections.new')}
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
		<Field label={$t('domains.places.collections.name')} bind:value={form.name} required />
		<Field label={$t('domains.places.collections.note')} multiline rows={2} bind:value={form.note} />
	</form>
	{#snippet footer()}
		<Button label={$t('common.cancel')} variant="quiet" onclick={() => (sheet = false)} />
		<Button
			label={$t(editing ? 'common.save' : 'domains.places.collections.add')}
			variant="primary"
			type="submit"
			form="{uid}-form"
			disabled={!form.name.trim()}
		/>
		{#if editing}
			<Button label={$t('domains.places.collections.delete')} variant="danger" icon="trash" onclick={remove} />
		{/if}
	{/snippet}
</Sheet>

<style>
	.body {
		display: grid;
		grid-template-columns: minmax(0, 1fr) var(--sheet-sm);
		align-items: start;
		gap: var(--space-6);
		padding: 0 var(--ed-gutter);
	}
	.main {
		display: flex;
		flex-direction: column;
		gap: var(--space-6);
		min-width: 0;
	}
	.side {
		position: sticky;
		top: var(--space-4);
		min-width: 0;
	}
	.collection {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}
	.head {
		display: flex;
		align-items: center;
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
	.form {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
	}
	/* narrow page: every place goes under the collections */
	@container page (max-width: 48rem) {
		.body {
			grid-template-columns: minmax(0, 1fr);
		}
		.side {
			position: static;
		}
	}
</style>
