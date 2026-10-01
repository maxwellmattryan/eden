<script lang="ts">
	// A stock item's form, in a sheet over the page (D-95): its picture with the buttons that change it, then its name,
	// amount, location, date, category, low-stock threshold and tip, and last the link a picture can be fetched from
	// (D-91). Save writes the fields as one change with one undo; Cancel, Escape and the scrim leave them as they were.
	// The picture is not one of the fields: choosing, linking or removing it is its own write with its own undo (D-90).
	// The page opens it through `edit(item)`.
	import {
		Button,
		Chip,
		Field,
		FileButton,
		Icon,
		IconButton,
		Menu,
		Segmented,
		Sheet,
		toast,
		type MenuItem,
	} from '@eden/ui-kit'
	import { CATEGORIES } from '@eden/shared/domains/kitchen'
	import { t } from '@eden/shared/i18n'
	import { undoToast } from '$lib/shell/undo'
	import { linkedPicture, squarePicture } from '../staging.svelte'
	import { categoryGlyph } from '../words'
	import { LOCATIONS, kitchen, type StockItem, type StockLocation, type StockPatch } from '../store.svelte'

	const uid = $props.id()
	const locationLabel = (location: StockLocation) => $t(`domains.kitchen.stock.locations.${location}`)
	/** A category as the form names it: one of the ids, or the words a row from before they were ids holds. */
	const categoryLabel = (category: string) =>
		(CATEGORIES as readonly string[]).includes(category) ? $t(`domains.kitchen.categories.${category}`) : category

	let open = $state(false)
	let editing = $state<string>()
	/** The item as the store holds it now, so a picture set from here shows at once. */
	const item = $derived(kitchen.stock.find((entry) => entry.id === editing))
	let form = $state({
		name: '',
		qty: '',
		unit: '',
		location: 'pantry' as StockLocation,
		expiry: '',
		category: '',
		threshold: '',
		tip: '',
	})

	/** Open the form on an item, its fields as text. */
	export function edit(target: StockItem) {
		form = {
			name: target.name,
			qty: target.qty,
			unit: target.unit ?? '',
			location: target.location,
			expiry: target.expiry ?? '',
			category: target.category ?? '',
			threshold: target.threshold === undefined ? '' : String(target.threshold),
			tip: target.tip ?? '',
		}
		pictureLink = ''
		editing = target.id
		open = true
	}
	function save(target: StockItem) {
		const threshold = Number(form.threshold.replace(',', '.'))
		const patch: StockPatch = {
			name: form.name.trim(),
			qty: form.qty.trim(),
			unit: form.unit.trim() || undefined,
			location: form.location,
			expiry: form.expiry || undefined,
			category: form.category || undefined,
			threshold: form.threshold.trim() && Number.isFinite(threshold) && threshold >= 0 ? threshold : undefined,
			tip: form.tip.trim() || undefined,
		}
		const { undo } = kitchen.updateStock(target.id, patch)
		undoToast($t('domains.kitchen.stock.toast.edited', { values: { name: patch.name || target.name } }), undo)
		open = false
	}

	const categoryItems = $derived<MenuItem[]>([
		...CATEGORIES.map((category) => ({
			id: category,
			label: $t(`domains.kitchen.categories.${category}`),
			checked: form.category === category,
		})),
		{ id: '', label: $t('domains.kitchen.stock.detail.noCategory'), checked: !form.category },
	])
	let categoryAnchor = $state<HTMLElement>()
	let categoryOpen = $state(false)

	// An item's own picture: the middle of a photo the owner picks, or none, which leaves the category's glyph.
	const PICTURES = [
		'image/jpeg',
		'image/png',
		'image/webp',
		'image/heic',
		'image/heif',
		'.jpg',
		'.jpeg',
		'.png',
		'.webp',
		'.heic',
		'.heif',
	]
	async function setPicture(target: StockItem, files: File[]) {
		const image = files[0] ? await squarePicture(files[0]) : undefined
		if (!image) {
			toast({ message: $t('domains.kitchen.stock.toast.pictureFailed') })
			return
		}
		const { undo } = kitchen.setStockPhoto(target.id, image)
		undoToast($t('domains.kitchen.stock.toast.pictureSet', { values: { name: target.name } }), undo)
	}
	let pictureLink = $state('')
	let fetching = $state(false)
	async function linkPicture(target: StockItem) {
		if (fetching || !pictureLink.trim()) return
		fetching = true
		const image = await linkedPicture(pictureLink)
		fetching = false
		if (!image) {
			toast({ message: $t('domains.kitchen.stock.toast.pictureLinkFailed') })
			return
		}
		pictureLink = ''
		const { undo } = kitchen.setStockPhoto(target.id, image)
		undoToast($t('domains.kitchen.stock.toast.pictureSet', { values: { name: target.name } }), undo)
	}
	function removePicture(target: StockItem) {
		const { undo } = kitchen.setStockPhoto(target.id, undefined)
		undoToast($t('domains.kitchen.stock.toast.pictureRemoved', { values: { name: target.name } }), undo)
	}
</script>

<Sheet bind:open size="md" labelledby="{uid}-title">
	{#snippet header()}
		<h2 class="title" id="{uid}-title">{$t('domains.kitchen.stock.detail.editing')}</h2>
	{/snippet}
	{#if item}
		{@const image = kitchen.photoOf(item)}
		<form
			class="form"
			id="{uid}-form"
			onsubmit={(event) => {
				event.preventDefault()
				save(item)
			}}
		>
			<div class="picture-row">
				{#if image}
					<img class="picture" src={image} alt="" />
				{:else}
					<span class="picture picture-glyph" aria-hidden="true"><Icon name={categoryGlyph(item.category)} /></span>
				{/if}
				<FileButton
					label={$t('domains.kitchen.stock.detail.choosePicture')}
					icon="image-plus"
					accept={PICTURES}
					multiple={false}
					tooltip
					onfiles={(files) => void setPicture(item, files)}
				/>
				{#if item.photo}
					<IconButton
						icon="trash"
						size="sm"
						label={$t('domains.kitchen.stock.detail.removePicture')}
						danger
						tooltip
						onclick={() => removePicture(item)}
					/>
				{/if}
			</div>
			<Field label={$t('domains.kitchen.stock.detail.name')} bind:value={form.name} />
			<div class="pair">
				<Field label={$t('domains.kitchen.stock.detail.quantity')} bind:value={form.qty} mono inputmode="decimal" />
				<Field label={$t('domains.kitchen.stock.detail.unit')} bind:value={form.unit} />
			</div>
			<div class="group">
				<span class="group-label">{$t('domains.kitchen.stock.detail.location')}</span>
				<Segmented
					items={LOCATIONS.map(locationLabel)}
					selected={LOCATIONS.indexOf(form.location)}
					label={$t('domains.kitchen.stock.detail.location')}
					onchange={(index) => (form.location = LOCATIONS[index]!)}
				/>
			</div>
			<div class="pair">
				<Field label={$t('domains.kitchen.stock.detail.expires')} type="date" bind:value={form.expiry} />
				<div class="group">
					<span class="group-label">{$t('domains.kitchen.stock.detail.category')}</span>
					<span class="anchor" bind:this={categoryAnchor}>
						<Chip
							label={form.category ? categoryLabel(form.category) : $t('domains.kitchen.stock.detail.noCategory')}
							tone="outline"
							icon="chevron-down"
							aria-haspopup="menu"
							aria-expanded={categoryOpen}
							onclick={() => (categoryOpen = !categoryOpen)}
						/>
					</span>
					<Menu
						bind:open={categoryOpen}
						anchor={categoryAnchor}
						align="start"
						label={$t('domains.kitchen.stock.detail.category')}
						items={categoryItems}
						onselect={(entry) => (form.category = entry.id ?? '')}
					/>
				</div>
			</div>
			<Field
				label={$t('domains.kitchen.stock.detail.threshold')}
				helper={$t('domains.kitchen.stock.detail.thresholdHelp')}
				bind:value={form.threshold}
				mono
				inputmode="decimal"
			/>
			<Field
				label={$t('domains.kitchen.stock.detail.tip')}
				helper={$t('domains.kitchen.stock.detail.tipHelp')}
				bind:value={form.tip}
				multiline
				rows={2}
			/>
			<Field
				label={$t('domains.kitchen.stock.detail.pictureLink')}
				helper={$t('domains.kitchen.stock.detail.pictureLinkHelp')}
				placeholder="https://"
				type="url"
				bind:value={pictureLink}
				disabled={fetching}
				onkeydown={(event: KeyboardEvent) => {
					if (event.key !== 'Enter') return
					event.preventDefault()
					void linkPicture(item)
				}}
			>
				{#snippet trailing()}
					<IconButton
						icon="arrow-right"
						size="sm"
						label={$t('domains.kitchen.stock.detail.usePictureLink')}
						tooltip
						disabled={fetching || !pictureLink.trim()}
						onclick={() => void linkPicture(item)}
					/>
				{/snippet}
			</Field>
		</form>
	{/if}
	{#snippet footer()}
		<Button label={$t('common.cancel')} variant="quiet" onclick={() => (open = false)} />
		<Button
			label={$t('common.save')}
			variant="primary"
			type="submit"
			form="{uid}-form"
			disabled={!item || !form.name.trim()}
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
	/* The fields one under another; the short ones share a line */
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
	.group {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: var(--space-1);
	}
	.group-label {
		font: var(--ed-t-label);
		letter-spacing: var(--ed-t-label-tracking);
		color: var(--text-secondary);
	}
	.anchor {
		display: inline-flex;
	}
	/* the item's picture, or its category's glyph on a tile of the same size, with the buttons that change it */
	.picture-row {
		display: flex;
		align-items: center;
		gap: var(--space-2);
	}
	.picture {
		flex: none;
		box-sizing: border-box;
		width: calc(var(--space-8) * 2);
		height: calc(var(--space-8) * 2);
		border: 1px solid var(--ed-card-border);
		border-radius: var(--ed-radius-control);
		object-fit: cover;
		background: var(--surface-2);
	}
	.picture-glyph {
		display: inline-grid;
		place-items: center;
		color: var(--text-secondary);
	}
</style>
