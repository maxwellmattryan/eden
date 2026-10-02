<script lang="ts">
	// A store's form, in a sheet over the page (D-95), the same one to add as to edit: its picture (D-103) with the
	// buttons that change it, its name, what it sells, where it is (D-101, an address shaped as its country asks,
	// D-137), its website and phone, a note, and its shop day, which is optional (D-98). The picture is not one of the
	// fields: choosing, fetching or removing it is its own write with its own undo. A website new to a store brings
	// its icon and what its page says of the store (D-103, D-108). The page opens it through `add()` and `edit(id)`;
	// both apps' Grocery mount it.
	import {
		AddressForm,
		Button,
		Chip,
		Field,
		FileButton,
		IconButton,
		Sheet,
		Thumbnail,
		toast,
		type AddressFormKey,
	} from '@eden/ui-kit'
	import {
		addressForm,
		cleanAddress,
		defaultCountry,
		encodeAddress,
		readAddress,
		validateAddress,
		type Address,
	} from '../../../address/index.js'
	import { PICTURE_ACCEPT } from '../../../api/index.js'
	import { daysFromToday, todayIso } from '../../../dates/index.js'
	import { home } from '../../../home/index.js'
	import { locale, t } from '../../../i18n/index.js'
	import { undoToast } from '../../../shell/index.js'
	import { shopDayMorning } from '../digest.js'
	import { fitPicture, storeLogo } from '../staging.svelte.js'
	import { kitchen, type Undo } from '../store.svelte.js'
	import { fetchStoreSite } from '../store-site.js'
	import { STORE_SELLS, type GroceryStore, type StoreSells } from '../types.js'

	const uid = $props.id()

	/** A store's address starts in the home's country, else the language's (D-137). */
	const homeCountry = () => defaultCountry({ home: home.current.address?.country, locale: $locale ?? 'en' })
	const startAddress = (given?: Address): Address => ({ ...given, country: given?.country ?? homeCountry() })
	const blankPlace = () => ({
		name: '',
		sells: ['grocery'] as StoreSells[],
		address: startAddress(),
		url: '',
		phone: '',
		note: '',
		date: '',
		time: '',
	})
	let open = $state(false)
	let storeId = $state<string>()
	let place = $state(blankPlace())
	const shown = $derived(kitchen.storeById(storeId))
	const shopDayOf = (id: string) => kitchen.grocery.lists.find((list) => list.storeId === id)?.shopDay

	/** Opens the form blank: the header's Add store. */
	export function add() {
		place = blankPlace()
		left = []
		storeId = undefined
		open = true
	}
	/** Opens the form on a store. */
	export function edit(id: string) {
		const store = kitchen.storeById(id)
		if (!store) return
		const shopDay = shopDayOf(id)
		place = {
			name: store.name,
			sells: [...store.sells],
			// one line from before addresses had parts is read against the home's country
			address: startAddress(readAddress(store.place?.address, homeCountry())),
			url: store.place?.url ?? '',
			phone: store.place?.phone ?? '',
			note: store.note ?? '',
			date: shopDay?.slice(0, 10) ?? '',
			time: shopDay?.slice(11, 16) ?? '',
		}
		left = []
		storeId = id
		open = true
	}

	const placeFields = () => ({
		sells: STORE_SELLS.filter((kind) => place.sells.includes(kind)),
		where: { address: cleanAddress(place.address), url: place.url.trim(), phone: place.phone.trim() },
		note: place.note.trim(),
		shopDay: place.date ? `${place.date}T${place.time || '10:00'}:00` : undefined,
	})
	// The address as its country asks for one. None of it is required; a postal code that is not shaped as its
	// country's are is said once the field is left, and holds Save until it is put right.
	let left = $state<AddressFormKey[]>([])
	const problems = $derived(validateAddress(place.address))
	const shape = $derived(
		addressForm(place.address, {
			label: (id, values) => $t(`address.${id}`, { values }),
			locale: $locale ?? 'en',
			home: home.current.address?.country,
			errors: Object.fromEntries(Object.entries(problems).filter(([key]) => left.includes(key as AddressFormKey))),
		})
	)

	// The store's own picture: one the owner picks, fitted whole, the website's fetched again, or none.
	async function choosePicture(store: GroceryStore, files: File[]) {
		const image = files[0] ? await fitPicture(files[0]) : undefined
		if (!image) {
			toast({ message: $t('domains.kitchen.grocery.toast.pictureFailed') })
			return
		}
		const { undo } = kitchen.setStorePhoto(store.id, image)
		undoToast($t('domains.kitchen.grocery.toast.pictureSet', { values: { store: store.name } }), undo)
	}
	let fetching = $state(false)
	async function fetchPicture(store: GroceryStore) {
		if (fetching || !place.url.trim()) return
		fetching = true
		const image = await storeLogo(place.url)
		fetching = false
		if (!image) {
			toast({ message: $t('domains.kitchen.grocery.toast.pictureNotFound') })
			return
		}
		const { undo } = kitchen.setStorePhoto(store.id, image)
		undoToast($t('domains.kitchen.grocery.toast.pictureSet', { values: { store: store.name } }), undo)
	}
	function removePicture(store: GroceryStore) {
		const { undo } = kitchen.setStorePhoto(store.id, undefined)
		undoToast($t('domains.kitchen.grocery.toast.pictureRemoved', { values: { store: store.name } }), undo)
	}

	/** Add: the store with all its form held, and its shop day, as one undo. */
	function create() {
		const { sells, where, note, shopDay } = placeFields()
		const { store, created, undo } = kitchen.addStore(place.name, sells, { note, place: where })
		open = false
		if (!created) {
			undoToast($t('domains.kitchen.grocery.toast.storeExists', { values: { store: store.name } }), undo)
			return
		}
		const undos = [undo]
		if (shopDay) undos.push(kitchen.setShopDay(store.id, shopDay))
		if (where.url) undos.push(fetchStoreSite(store.id, where.url))
		undoToast($t('domains.kitchen.grocery.toast.storeAdded', { values: { store: store.name } }), () =>
			undos.reverse().forEach((entry) => entry())
		)
	}
	function save(store: GroceryStore) {
		const undos: Undo[] = []
		const name = place.name.trim() || store.name
		const { sells, where, note, shopDay } = placeFields()
		const same =
			name === store.name &&
			sells.join() === store.sells.join() &&
			note === (store.note ?? '') &&
			encodeAddress(where.address) === encodeAddress(readAddress(store.place?.address)) &&
			where.url === (store.place?.url ?? '') &&
			where.phone === (store.place?.phone ?? '')
		if (!same) undos.push(kitchen.updateStore(store.id, { name, sells, note, place: where }).undo)
		const moved = shopDay !== shopDayOf(store.id)
		if (moved) undos.push(kitchen.setShopDay(store.id, shopDay))
		// a website that is new to a store brings its icon and what its page says of the store (D-103, D-108)
		if (where.url && where.url !== (store.place?.url ?? '')) undos.push(fetchStoreSite(store.id, where.url))
		open = false
		if (!undos.length) return
		// a morning already past has no reminder to promise
		const late = (shopDayMorning(shopDay)?.at ?? Infinity) <= Date.now()
		const key = !moved ? 'storeSaved' : !shopDay ? 'shopDayCleared' : late ? 'shopDaySetLate' : 'shopDaySet'
		undoToast($t(`domains.kitchen.grocery.toast.${key}`, { values: { store: name } }), () =>
			undos.reverse().forEach((undo) => undo())
		)
	}
	function remove(id: string) {
		const { store, undo } = kitchen.removeStore(id)
		open = false
		if (store) undoToast($t('domains.kitchen.grocery.toast.storeRemoved', { values: { store: store.name } }), undo)
	}
</script>

<Sheet bind:open size="sm" labelledby="{uid}-title">
	{#snippet header()}
		<h2 class="title" id="{uid}-title">
			{$t(shown ? 'domains.kitchen.grocery.pane.editingStore' : 'domains.kitchen.grocery.addStore')}
		</h2>
	{/snippet}
	{#if shown || !storeId}
		<form
			class="form"
			id="{uid}-form"
			onsubmit={(event) => {
				event.preventDefault()
				if (shown) save(shown)
				else create()
			}}
		>
			{#if shown}
				<div class="picture-row">
					<Thumbnail size="md" src={kitchen.storePhotoOf(shown)} icon="store" />
					<FileButton
						label={$t('domains.kitchen.grocery.pane.choosePicture')}
						icon="image-plus"
						accept={PICTURE_ACCEPT}
						multiple={false}
						camera
						tooltip
						onfiles={(files) => void choosePicture(shown, files)}
					/>
					{#if place.url.trim()}
						<IconButton
							icon="refresh-cw"
							size="sm"
							label={$t('domains.kitchen.grocery.pane.fetchPicture')}
							tooltip
							disabled={fetching}
							onclick={() => void fetchPicture(shown)}
						/>
					{/if}
					{#if shown.photo}
						<IconButton
							icon="trash"
							size="sm"
							label={$t('domains.kitchen.grocery.pane.removePicture')}
							danger
							tooltip
							onclick={() => removePicture(shown)}
						/>
					{/if}
				</div>
			{/if}
			<Field label={$t('domains.kitchen.grocery.pane.name')} bind:value={place.name} />
			<div class="group" role="group" aria-labelledby="{uid}-sells">
				<span class="group-label" id="{uid}-sells">{$t('domains.kitchen.grocery.pane.sells')}</span>
				<div class="chips">
					{#each STORE_SELLS as kind (kind)}
						<Chip
							label={$t(`domains.kitchen.grocery.sells.${kind}`)}
							selectable
							tone={place.sells.includes(kind) ? 'accent' : 'outline'}
							bind:selected={
								() => place.sells.includes(kind),
								(on) => (place.sells = on ? [...place.sells, kind] : place.sells.filter((entry) => entry !== kind))
							}
						/>
					{/each}
				</div>
			</div>
			<AddressForm
				bind:value={place.address}
				country={shape.country}
				countries={shape.countries}
				countryLabel={$t('address.country')}
				rows={shape.rows}
				onblurfield={(key) => (left = [...left, key])}
			/>
			<div class="pair">
				<Field label={$t('domains.kitchen.grocery.pane.website')} type="url" bind:value={place.url} />
				<Field label={$t('domains.kitchen.grocery.pane.phone')} type="tel" bind:value={place.phone} />
			</div>
			<Field label={$t('domains.kitchen.grocery.pane.storeNote')} multiline bind:value={place.note} />
			<div class="pair">
				<Field label={$t('domains.kitchen.grocery.pane.shopDay')} type="date" bind:value={place.date} />
				<Field
					label={$t('domains.kitchen.grocery.pane.shopTime')}
					type="time"
					bind:value={place.time}
					disabled={!place.date}
				/>
			</div>
			<div class="chips">
				<Chip
					label={$t('domains.kitchen.grocery.pane.today')}
					tone="outline"
					onclick={() => (place.date = todayIso())}
				/>
				<Chip
					label={$t('domains.kitchen.grocery.pane.tomorrow')}
					tone="outline"
					onclick={() => (place.date = daysFromToday(1))}
				/>
				{#if place.date}
					<Chip
						label={$t('domains.kitchen.grocery.pane.noShopDay')}
						tone="outline"
						onclick={() => {
							place.date = ''
							place.time = ''
						}}
					/>
				{/if}
			</div>
			<p class="help">{$t('domains.kitchen.grocery.pane.shopDayHelp')}</p>
		</form>
	{/if}
	{#snippet footer()}
		{#if shown}
			<Button
				label={$t('domains.kitchen.grocery.pane.deleteStore')}
				variant="danger"
				onclick={() => remove(shown.id)}
			/>
		{/if}
		<Button label={$t('common.cancel')} variant="quiet" onclick={() => (open = false)} />
		<Button
			label={$t(shown ? 'common.save' : 'domains.kitchen.grocery.add')}
			variant="primary"
			type="submit"
			form="{uid}-form"
			disabled={(!shown && !!storeId) || !place.name.trim() || Object.keys(problems).length > 0}
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
	/* the store's picture with the buttons that change it */
	.picture-row {
		display: flex;
		align-items: center;
		gap: var(--space-2);
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
