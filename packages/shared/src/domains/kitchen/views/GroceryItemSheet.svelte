<script lang="ts">
	// A grocery item's form, in a sheet over the page (D-95), the same one to add as to edit: its name, brand and
	// package size (D-104), quantity and the price typed on the line (D-105), the store whose list it is on, and a
	// note. Saved as one change with one undo. While adding, no store picked means the item goes where it was last
	// bought (D-97). The page opens it through `add(store?)` (a list's own Add passes its store, '' for the unfiled
	// list) and `edit(id)`. Both apps' Grocery mount it.
	import { Button, Chip, Field, Sheet } from '@eden/ui-kit'
	import { t } from '../../../i18n/index.js'
	import { undoToast } from '../../../shell/index.js'
	import { kitchen } from '../store.svelte.js'
	import type { GroceryItem } from '../types.js'

	const uid = $props.id()
	const anyStore = $derived($t('domains.kitchen.grocery.anyStore'))

	// `store` is the store's id, '' for the unfiled list; none, while adding, is no store picked.
	type ItemForm = {
		name: string
		brand: string
		size: string
		price: string
		qty: string
		store: string | undefined
		note: string
	}
	const BLANK: ItemForm = { name: '', brand: '', size: '', price: '', qty: '', store: undefined, note: '' }
	/** The price as typed, as an amount; nothing for what is not one. */
	const priceOf = (text: string) => {
		const amount = Number(text.trim().replace(',', '.'))
		return text.trim() && Number.isFinite(amount) && amount >= 0 ? amount : undefined
	}
	/** The form's fields as an item holds them: trimmed, and an empty one cleared. */
	const fields = () => ({
		name: form.name.trim(),
		brand: form.brand.trim() || undefined,
		size: form.size.trim() || undefined,
		price: priceOf(form.price),
		qty: form.qty.trim(),
		note: form.note.trim() || undefined,
	})
	let open = $state(false)
	let editing = $state<string>()
	let form = $state<ItemForm>({ ...BLANK })
	const edited = $derived(kitchen.grocery.items.find((item) => item.id === editing))

	/** Opens the form blank: no store picked, or a list's own store ('' for the unfiled list). */
	export function add(store?: string) {
		form = { ...BLANK, store }
		editing = undefined
		open = true
	}
	/** Opens the form on an item. */
	export function edit(id: string) {
		const item = kitchen.grocery.items.find((entry) => entry.id === id)
		if (!item) return
		form = {
			name: item.name,
			brand: item.brand ?? '',
			size: item.size ?? '',
			price: item.price === undefined ? '' : String(item.price),
			qty: item.qty,
			store: kitchen.storeOf(item)?.id ?? '',
			note: item.note ?? '',
		}
		editing = id
		open = true
	}
	function create() {
		const target = form.store === undefined ? undefined : form.store || null
		const { item, store, undo } = kitchen.addToGrocery(fields(), 'manual', target)
		// the toast names the store it landed on, or says only that it was added
		const message = store
			? $t('domains.kitchen.grocery.toast.addedTo', { values: { name: item.name, store: store.name } })
			: $t('domains.kitchen.grocery.toast.added', { values: { name: item.name } })
		undoToast(message, undo)
		open = false
	}
	function save(item: GroceryItem) {
		const { undo } = kitchen.updateGrocery(item.id, { ...fields(), storeId: form.store || null })
		undoToast($t('domains.kitchen.grocery.toast.edited', { values: { name: form.name.trim() || item.name } }), undo)
		open = false
	}
</script>

<Sheet bind:open size="sm" labelledby="{uid}-title">
	{#snippet header()}
		<h2 class="title" id="{uid}-title">
			{$t(edited ? 'domains.kitchen.grocery.pane.editing' : 'domains.kitchen.grocery.addItem')}
		</h2>
	{/snippet}
	{#if edited || !editing}
		<form
			class="form"
			id="{uid}-form"
			onsubmit={(event) => {
				event.preventDefault()
				if (edited) save(edited)
				else create()
			}}
		>
			<Field label={$t('domains.kitchen.grocery.pane.name')} bind:value={form.name} />
			<div class="pair">
				<Field label={$t('domains.kitchen.grocery.pane.brand')} bind:value={form.brand} />
				<Field
					label={$t('domains.kitchen.grocery.pane.size')}
					placeholder={$t('domains.kitchen.grocery.pane.sizeHint')}
					bind:value={form.size}
				/>
			</div>
			<div class="pair">
				<Field label={$t('domains.kitchen.grocery.pane.quantity')} bind:value={form.qty} mono />
				<Field label={$t('domains.kitchen.grocery.pane.price')} bind:value={form.price} mono inputmode="decimal" />
			</div>
			<p class="help">{$t('domains.kitchen.grocery.pane.priceHelp')}</p>
			<div class="group" role="group" aria-labelledby="{uid}-where">
				<span class="group-label" id="{uid}-where">{$t('domains.kitchen.grocery.pane.store')}</span>
				<div class="chips">
					{#each [...kitchen.grocery.stores.map( (store) => ({ id: store.id, label: store.name }) ), { id: '', label: anyStore }] as entry (entry.id)}
						<Chip
							label={entry.label}
							selectable
							tone={form.store === entry.id ? 'accent' : 'outline'}
							bind:selected={() => form.store === entry.id, (on) => (form.store = on || edited ? entry.id : undefined)}
						/>
					{/each}
				</div>
				{#if !edited}
					<p class="help">{$t('domains.kitchen.grocery.pane.storeHelp')}</p>
				{/if}
			</div>
			<Field label={$t('domains.kitchen.grocery.pane.note')} bind:value={form.note} />
		</form>
	{/if}
	{#snippet footer()}
		<Button label={$t('common.cancel')} variant="quiet" onclick={() => (open = false)} />
		<Button
			label={$t(edited ? 'common.save' : 'domains.kitchen.grocery.add')}
			variant="primary"
			type="submit"
			form="{uid}-form"
			disabled={(!edited && !!editing) || !form.name.trim()}
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
	.pair {
		display: grid;
		grid-template-columns: minmax(0, 3fr) minmax(0, 2fr);
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
	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
	}
	.help {
		margin: 0;
		font: var(--ed-t-body-sm);
		letter-spacing: var(--ed-t-body-sm-tracking);
		color: var(--text-secondary);
	}
</style>
