<script lang="ts">
	// A stock item's form, in a sheet over the page (D-95): its picture with the buttons that change it, then its name,
	// brand and package size (D-104), amount, location, date, category, low-stock threshold and tip. The picture's button
	// offers a file or a link to fetch it from (D-91, D-110), and one dropped or pasted is taken too. Save writes the fields as one change with one undo; Cancel, Escape and the scrim leave them as they were.
	// The picture is not one of the fields: choosing, linking or removing it is its own write with its own undo (D-90).
	// The page opens it through `edit(item)`, and blank through `add()` (D-109): there Add writes the item and the
	// picture chosen for it as one change with one undo, and a grocer's product link also fills the name, the brand
	// and the size left empty (D-91, D-104).
	import { Button, Chip, Field, Menu, Segmented, Sheet, toast, type MenuItem } from '@eden/ui-kit'
	import { CATEGORIES, categoriesFor, productLink } from '@eden/shared/domains/kitchen'
	import { t } from '@eden/shared/i18n'
	import { undoToast } from '@eden/shared/shell'
	import { linkedPicture, squarePicture } from '@eden/shared/domains/kitchen'
	import { categoryGlyph } from '@eden/shared/domains/kitchen'
	import PictureDrop from '@eden/shared/components/PictureDrop.svelte'
	import PictureInput from '@eden/shared/components/PictureInput.svelte'
	import { LOCATIONS, kitchen, type StockItem, type StockLocation, type StockPatch } from '@eden/shared/domains/kitchen'

	type Props = {
		/** An item was added from the blank form; the page shows it. */
		onadded?: (item: StockItem) => void
	}
	let { onadded }: Props = $props()

	const uid = $props.id()
	const locationLabel = (location: StockLocation) => $t(`domains.kitchen.stock.locations.${location}`)
	/** A category as the form names it: one of the ids, or the words a row from before they were ids holds. */
	const categoryLabel = (category: string) =>
		(CATEGORIES as readonly string[]).includes(category) ? $t(`domains.kitchen.categories.${category}`) : category

	let open = $state(false)
	let editing = $state<string>()
	/** The item as the store holds it now, so a picture set from here shows at once. */
	const item = $derived(kitchen.stock.find((entry) => entry.id === editing))
	const blank = () => ({
		name: '',
		brand: '',
		size: '',
		qty: '1',
		unit: '',
		location: 'pantry' as StockLocation,
		expiry: '',
		category: '',
		threshold: '',
		tip: '',
	})
	let form = $state(blank())
	/** The picture chosen for an item that is not added yet, kept here until Add writes it with the item. */
	let pending = $state<string>()

	/** Open the form blank, to add an item. */
	export function add() {
		form = blank()
		pending = undefined
		editing = undefined
		open = true
	}

	/**
	 * Open the form on an item, its fields as text. A `preset` stands over the item's own: a row that ran out,
	 * dropped on a location, opens there with its quantity to type (D-111).
	 */
	export function edit(target: StockItem, preset: { location?: StockLocation; qty?: string } = {}) {
		form = {
			name: target.name,
			brand: target.brand ?? '',
			size: target.size ?? '',
			qty: target.qty,
			unit: target.unit ?? '',
			location: target.location,
			expiry: target.expiry ?? '',
			category: target.category ?? '',
			threshold: target.threshold === undefined ? '' : String(target.threshold),
			tip: target.tip ?? '',
			...preset,
		}
		editing = target.id
		open = true
	}
	/** The form's fields as the store takes them. */
	function fields() {
		const threshold = Number(form.threshold.replace(',', '.'))
		return {
			name: form.name.trim(),
			brand: form.brand.trim() || undefined,
			size: form.size.trim() || undefined,
			qty: form.qty.trim(),
			unit: form.unit.trim() || undefined,
			location: form.location,
			expiry: form.expiry || undefined,
			category: form.category || undefined,
			threshold: form.threshold.trim() && Number.isFinite(threshold) && threshold >= 0 ? threshold : undefined,
			tip: form.tip.trim() || undefined,
		}
	}
	function save(target: StockItem) {
		const patch: StockPatch = fields()
		const { undo } = kitchen.updateStock(target.id, patch)
		undoToast($t('domains.kitchen.stock.toast.edited', { values: { name: patch.name || target.name } }), undo)
		open = false
	}
	/** Add: the item and the picture chosen for it, taken back by one undo. */
	function create() {
		const held = kitchen.stock.length
		const { item, undo } = kitchen.addStockItem(fields())
		const unpicture = pending ? kitchen.setStockPhoto(item.id, pending).undo : undefined
		// no more items than before: one that ran out came back (D-92)
		const key = kitchen.stock.length === held ? 'back' : 'added'
		undoToast($t(`domains.kitchen.stock.toast.${key}`, { values: { name: item.name } }), () => {
			unpicture?.()
			undo()
		})
		onadded?.(item)
		open = false
	}

	/** Moves the form's item, and drops a category its new place does not have: food's under Household, or the other way (D-122). */
	function place(location: StockLocation) {
		form.location = location
		const known = (CATEGORIES as readonly string[]).includes(form.category)
		if (known && !(categoriesFor(location) as readonly string[]).includes(form.category)) form.category = ''
	}

	const categoryItems = $derived<MenuItem[]>([
		...categoriesFor(form.location).map((category) => ({
			id: category,
			label: $t(`domains.kitchen.categories.${category}`),
			checked: form.category === category,
		})),
		{ id: '', label: $t('domains.kitchen.stock.detail.noCategory'), checked: !form.category },
	])
	let categoryAnchor = $state<HTMLElement>()
	let categoryOpen = $state(false)

	// An item's own picture: the middle of a photo the owner picks, or none, which leaves the category's glyph.
	// For an item not added yet the picture waits in `pending`, and nothing is written.
	async function setPicture(target: StockItem | undefined, file: File) {
		const image = await squarePicture(file)
		if (!image) {
			toast({ message: $t('domains.kitchen.stock.toast.pictureFailed') })
			return
		}
		if (!target) {
			pending = image
			return
		}
		const { undo } = kitchen.setStockPhoto(target.id, image)
		undoToast($t('domains.kitchen.stock.toast.pictureSet', { values: { name: target.name } }), undo)
	}
	/** The picture a link means; true when one came of it. */
	async function linkPicture(target: StockItem | undefined, pictureLink: string) {
		// a product's link on the blank form names the product too (D-91, D-104): it fills what is still empty
		const product = target ? null : productLink(pictureLink)
		if (product) {
			form.name ||= product.name
			form.brand ||= product.brand ?? ''
			form.size ||= product.size ?? ''
		}
		const image = await linkedPicture(pictureLink)
		if (!image) {
			toast({ message: $t('domains.kitchen.stock.toast.pictureLinkFailed') })
			return false
		}
		if (!target) {
			pending = image
			return true
		}
		const { undo } = kitchen.setStockPhoto(target.id, image)
		undoToast($t('domains.kitchen.stock.toast.pictureSet', { values: { name: target.name } }), undo)
		return true
	}
	function removePicture(target: StockItem | undefined) {
		if (!target) {
			pending = undefined
			return
		}
		const { undo } = kitchen.setStockPhoto(target.id, undefined)
		undoToast($t('domains.kitchen.stock.toast.pictureRemoved', { values: { name: target.name } }), undo)
	}
</script>

<Sheet bind:open size="md" labelledby="{uid}-title">
	{#snippet header()}
		<h2 class="title" id="{uid}-title">
			{$t(editing ? 'domains.kitchen.stock.detail.editing' : 'domains.kitchen.stock.addItem')}
		</h2>
	{/snippet}
	{#if item || !editing}
		{@const image = item ? kitchen.photoOf(item) : pending}
		<PictureDrop onfile={(file) => void setPicture(item, file)}>
			<form
				class="form"
				id="{uid}-form"
				onsubmit={(event) => {
					event.preventDefault()
					if (item) save(item)
					else create()
				}}
			>
				<PictureInput
					picture={image}
					glyph={categoryGlyph(item ? item.category : form.category || undefined)}
					chooseLabel={$t('domains.kitchen.stock.detail.choosePicture')}
					removeLabel={$t('domains.kitchen.stock.detail.removePicture')}
					linkHelp={$t(`domains.kitchen.stock.detail.${item ? 'pictureLinkHelp' : 'pictureLinkAddHelp'}`)}
					onfile={(file) => void setPicture(item, file)}
					onlink={(link) => linkPicture(item, link)}
					onremove={() => removePicture(item)}
				/>
				<Field label={$t('domains.kitchen.stock.detail.name')} bind:value={form.name} />
				<div class="pair">
					<Field label={$t('domains.kitchen.stock.detail.brand')} bind:value={form.brand} />
					<Field
						label={$t('domains.kitchen.stock.detail.size')}
						placeholder={$t('domains.kitchen.stock.detail.sizeHint')}
						bind:value={form.size}
					/>
				</div>
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
						onchange={(index) => place(LOCATIONS[index]!)}
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
			</form>
		</PictureDrop>
	{/if}
	{#snippet footer()}
		<Button label={$t('common.cancel')} variant="quiet" onclick={() => (open = false)} />
		<Button
			label={$t(editing ? 'common.save' : 'domains.kitchen.stock.add')}
			variant="primary"
			type="submit"
			form="{uid}-form"
			disabled={(!!editing && !item) || !form.name.trim()}
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
</style>
