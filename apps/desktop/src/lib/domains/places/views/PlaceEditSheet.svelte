<script lang="ts">
	// A place's form, in a sheet over the page (D-95): its picture with the button that changes it from a file or a link
	// (D-110), then its name, what kind of place it is, where it is, its website and phone, its price, whether it
	// serves no alcohol, the owner's notes, and its vibes by facet with a line to add one of the owner's own. Save
	// writes the fields as one change
	// with one undo; Cancel, Escape and the scrim leave them as they were. The picture is not one of the fields:
	// choosing or removing it is its own write with its own undo, as a recipe's is (D-93). The page opens it through
	// `edit(place)`, and blank through `add()`, where Add writes the place and the picture chosen for it as one change.
	import {
		AddressForm,
		Button,
		Chip,
		Field,
		Menu,
		Segmented,
		Sheet,
		Toggle,
		toast,
		type AddressFormKey,
		type MenuItem,
	} from '@eden/ui-kit'
	import {
		addressForm,
		addressFromHit,
		cleanAddress,
		defaultCountry,
		validateAddress,
		type Address,
	} from '@eden/shared/address'
	import { linkedSizedPicture, sizedPicture, type SizedPicture } from '@eden/shared/api'
	import {
		FACETS,
		PLACE_CATEGORIES,
		PRICE_LEVELS,
		categoryFromOsm,
		categoryGlyph,
		categoryKey,
		facetKey,
		instant,
		meadow,
		priceLabel,
		vibesByFacet,
		type Facet,
		type PlaceDraft,
		type PriceLevel,
		type SavedPlace,
	} from '@eden/shared/domains/places'
	import type { GeocodeHit } from '@eden/shared/geo'
	import { home } from '@eden/shared/home'
	import { locale, t } from '@eden/shared/i18n'
	import PictureDrop from '$lib/components/PictureDrop.svelte'
	import PictureInput from '$lib/components/PictureInput.svelte'
	import { undoToast } from '$lib/shell/undo'
	import { vibeNamer } from '../words'

	type Props = {
		/** A place was added from the blank form; the page shows it. */
		onadded?: (place: SavedPlace) => void
	}
	let { onadded }: Props = $props()

	const uid = $props.id()

	let open = $state(false)
	let editing = $state<string>()
	/** The place as the store holds it now, so a picture set from here shows at once. */
	const place = $derived(meadow.placeById(editing))
	/** An address starts in the home's country, else the language's: the form shows that country's fields. */
	const startAddress = (given?: Address): Address => ({
		...given,
		country: given?.country ?? defaultCountry({ home: home.current.address?.country, locale: $locale ?? 'en' }),
	})
	const blank = () => ({
		name: '',
		category: '' as string,
		address: startAddress(),
		locality: '',
		url: '',
		phone: '',
		price: 0,
		alcoholFree: false,
		notes: '',
		vibes: [] as string[],
	})
	let form = $state(blank())
	/** What a new place starts from beside its fields: where it is and where it came from. */
	let preset = $state<Partial<PlaceDraft>>({})
	/** The picture chosen for a place that is not added yet, kept here until Add writes it with the place. */
	let pending = $state<SizedPicture>()

	/** Open the form blank, to add a place; `given` fills what is already known of it. */
	export function add(given: Partial<PlaceDraft> = {}) {
		form = {
			...blank(),
			name: given.name ?? '',
			category: given.category ?? '',
			address: startAddress(given.address),
			locality: given.locality ?? '',
			url: given.url ?? '',
			price: given.price ?? 0,
			alcoholFree: given.alcoholFree === true,
			notes: given.notes ?? '',
			vibes: [...(given.vibes ?? [])],
		}
		preset = given
		left = []
		pending = undefined
		editing = undefined
		hits = []
		looked = false
		open = true
	}

	/** Open the form on a place, its fields as text. */
	export function edit(target: SavedPlace) {
		form = {
			name: target.name,
			category: target.category ?? '',
			address: startAddress(target.address),
			locality: target.locality ?? '',
			url: target.url ?? '',
			phone: target.phone ?? '',
			price: target.price ?? 0,
			alcoholFree: target.alcoholFree === true,
			notes: target.notes ?? '',
			vibes: [...target.vibes],
		}
		preset = {}
		left = []
		pending = undefined
		editing = target.id
		open = true
	}

	/** The form's fields as the store takes them. */
	function fields(base: Partial<PlaceDraft> = {}): PlaceDraft {
		return {
			...base,
			name: form.name.trim(),
			category: form.category || undefined,
			address: cleanAddress(form.address),
			locality: form.locality.trim() || undefined,
			url: form.url.trim() || undefined,
			phone: form.phone.trim() || undefined,
			price: form.price ? (form.price as PriceLevel) : undefined,
			alcoholFree: form.alcoholFree ? true : base.alcoholFree === undefined ? undefined : false,
			notes: form.notes.trim() || undefined,
			vibes: [...form.vibes],
		}
	}
	function save(target: SavedPlace) {
		const { undo } = meadow.updatePlace(
			target.id,
			fields({ point: target.point, favourite: target.favourite, alcoholFree: target.alcoholFree })
		)
		undoToast($t('domains.places.toast.edited', { values: { name: form.name.trim() || target.name } }), undo)
		open = false
	}
	function create() {
		const { place: made, undo } = meadow.addPlace(
			fields({ ...preset, savedFrom: preset.savedFrom ?? { via: 'manual', at: instant() } }),
			pending
		)
		undoToast($t('domains.places.toast.added', { values: { name: made.name } }), undo)
		onadded?.(made)
		open = false
	}

	// Where it is: a new place is looked up by its name, so it lands on the map without a coordinate being typed.
	// The geocoder is given the name and the rounded search area, nothing else (D-131).
	let hits = $state<GeocodeHit[]>([])
	let finding = $state(false)
	let looked = $state(false)
	const located = $derived(preset.point !== undefined)
	async function find() {
		if (finding || !form.name.trim()) return
		finding = true
		try {
			hits = await meadow.geocode(form.name.trim(), $locale ?? 'en')
		} catch {
			hits = []
		}
		looked = true
		finding = false
	}
	function take(hit: GeocodeHit) {
		preset = { ...preset, point: hit.point, providerIds: { ...(preset.providerIds ?? {}), osm: hit.externalId } }
		if (!form.category) form.category = categoryFromOsm(hit.kind)
		// what the lookup knows of the address fills only what is empty, and names the country when nothing was typed
		const found = addressFromHit(hit)
		if (found) {
			const typed = cleanAddress(form.address) !== undefined
			if (!typed && found.country) form.address.country = found.country
			for (const key of ['line1', 'city', 'region', 'postalCode'] as const) {
				if (!form.address[key]?.trim() && found[key]) form.address[key] = found[key]
			}
		}
		if (!form.locality && hit.locality) form.locality = hit.locality
		hits = []
	}

	// The address, as its country asks for one (D-137). None of it is required of a place; a postal code that is
	// not shaped as its country's are is said once the field is left, and holds Save until it is put right.
	let left = $state<AddressFormKey[]>([])
	const problems = $derived(validateAddress(form.address))
	const shape = $derived(
		addressForm(form.address, {
			label: (id, values) => $t(`address.${id}`, { values }),
			locale: $locale ?? 'en',
			home: home.current.address?.country,
			errors: Object.fromEntries(Object.entries(problems).filter(([key]) => left.includes(key as AddressFormKey))),
		})
	)

	// The picture
	const picture = $derived(place ? meadow.image(place) : pending?.thumbnail)
	function keep(sized: SizedPicture) {
		if (!place) {
			pending = sized
			return
		}
		const { undo } = meadow.setPhoto(place.id, sized)
		undoToast($t('domains.places.toast.pictured', { values: { name: place.name } }), undo)
	}
	async function choose(file: File) {
		const sized = await sizedPicture(file)
		if (sized) keep(sized)
		else toast({ message: $t('domains.places.form.pictureFailed') })
	}
	/** A link the owner pasted (D-110): the picture at the address, or the one its page names. */
	async function link(address: string) {
		const sized = await linkedSizedPicture(address)
		if (sized) keep(sized)
		else toast({ message: $t('domains.places.form.pictureLinkFailed') })
		return !!sized
	}
	function unpicture() {
		if (!place) {
			pending = undefined
			return
		}
		const { undo } = meadow.setPhoto(place.id, undefined)
		undoToast($t('domains.places.toast.unpictured', { values: { name: place.name } }), undo)
	}

	// The category
	let categoryAnchor = $state<HTMLElement>()
	let categoryOpen = $state(false)
	const categoryItems = $derived<MenuItem[]>(
		PLACE_CATEGORIES.map((id) => ({
			id,
			label: $t(categoryKey(id)),
			icon: categoryGlyph(id),
			checked: form.category === id,
		}))
	)

	// The price: none, then one to four signs
	const priceItems = [$t('domains.places.form.noPrice'), ...PRICE_LEVELS.map((level) => priceLabel(level))]

	// The vibes
	const vibeName = $derived(vibeNamer($t, meadow.vibes))
	const facets = $derived(vibesByFacet(meadow.vibes))
	const toggle = (id: string) =>
		(form.vibes = form.vibes.includes(id) ? form.vibes.filter((vibe) => vibe !== id) : [...form.vibes, id])
	let custom = $state('')
	let customFacet = $state(0)
	function addVibe() {
		const label = custom.trim()
		if (!label) return
		const { vibe } = meadow.addVibe(label, FACETS[customFacet] as Facet)
		if (!form.vibes.includes(vibe.id)) form.vibes = [...form.vibes, vibe.id]
		custom = ''
	}
</script>

<Sheet bind:open size="md" labelledby="{uid}-title">
	{#snippet header()}
		<h2 class="title" id="{uid}-title">
			{$t(place ? 'domains.places.form.editTitle' : 'domains.places.form.addTitle')}
		</h2>
	{/snippet}
	<PictureDrop onfile={(file) => void choose(file)}>
		<form
			class="form"
			id="{uid}-form"
			onsubmit={(event) => {
				event.preventDefault()
				if (place) save(place)
				else create()
			}}
		>
			<PictureInput
				{picture}
				glyph={categoryGlyph(form.category)}
				chooseLabel={$t('domains.places.form.choosePicture')}
				removeLabel={$t('domains.places.form.removePicture')}
				linkHelp={$t('domains.places.form.pictureLinkHelp')}
				onfile={(file) => void choose(file)}
				onlink={link}
				onremove={unpicture}
			/>

			<Field label={$t('domains.places.form.name')} bind:value={form.name} required />
			{#if !place}
				<div class="row">
					<div class="where">
						<Button
							label={$t(located ? 'domains.places.form.findAgain' : 'domains.places.form.find')}
							icon="locate-fixed"
							disabled={finding || !form.name.trim()}
							onclick={find}
						/>
						<span class="hint">
							{#if located}
								{$t('domains.places.form.located')}
							{:else if looked && !hits.length && !finding}
								{$t('domains.places.form.notFound')}
							{:else}
								{$t('domains.places.form.findHelp')}
							{/if}
						</span>
					</div>
					{#if hits.length}
						<div class="chips" role="group" aria-label={$t('domains.places.form.matches')}>
							{#each hits as hit (hit.externalId)}
								<Chip
									label={[hit.name, hit.addressLine, hit.locality].filter(Boolean).join(', ')}
									tone="outline"
									icon="map-pin"
									onclick={() => take(hit)}
								/>
							{/each}
						</div>
					{/if}
				</div>
			{/if}
			<div class="row">
				<span class="label" id="{uid}-category">{$t('domains.places.form.category')}</span>
				<span class="anchor" bind:this={categoryAnchor}>
					<Chip
						label={form.category ? $t(categoryKey(form.category)) : $t('domains.places.form.noCategory')}
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
					label={$t('domains.places.form.category')}
					items={categoryItems}
					onselect={(item) => (form.category = form.category === item.id ? '' : (item.id ?? ''))}
				/>
			</div>
			<AddressForm
				bind:value={form.address}
				country={shape.country}
				countries={shape.countries}
				countryLabel={$t('address.country')}
				rows={shape.rows}
				onblurfield={(key) => (left = [...left, key])}
			/>
			<Field label={$t('domains.places.form.locality')} bind:value={form.locality} />
			<div class="pair">
				<Field label={$t('domains.places.form.website')} bind:value={form.url} type="url" placeholder="https://" />
				<Field label={$t('domains.places.form.phone')} bind:value={form.phone} type="tel" />
			</div>
			<div class="row">
				<span class="label" id="{uid}-price">{$t('domains.places.form.price')}</span>
				<Segmented items={priceItems} bind:selected={form.price} label={$t('domains.places.form.price')} />
			</div>
			<Toggle
				label={$t('domains.places.form.alcoholFree')}
				description={$t('domains.places.form.alcoholFreeHelp')}
				bind:checked={form.alcoholFree}
			/>
			<Field
				label={$t('domains.places.form.notes')}
				placeholder={$t('domains.places.form.notesPlaceholder')}
				multiline
				rows={3}
				bind:value={form.notes}
			/>

			<fieldset class="vibes">
				<legend class="legend">{$t('domains.places.form.vibes')}</legend>
				{#each FACETS as facet (facet)}
					<div class="facet" role="group" aria-labelledby="{uid}-{facet}">
						<span class="label" id="{uid}-{facet}">{$t(facetKey(facet))}</span>
						<div class="chips">
							{#each facets[facet] as vibe (vibe.id)}
								<Chip
									label={vibe.label ?? vibeName(vibe.id)}
									selectable
									selected={form.vibes.includes(vibe.id)}
									onselect={() => toggle(vibe.id)}
								/>
							{/each}
						</div>
					</div>
				{/each}
				<div class="custom">
					<Field
						label={$t('domains.places.form.customVibe')}
						placeholder={$t('domains.places.form.customVibePlaceholder')}
						bind:value={custom}
						onkeydown={(event) => {
							if (event.key !== 'Enter') return
							event.preventDefault()
							addVibe()
						}}
					/>
					<Segmented
						items={FACETS.map((facet) => $t(facetKey(facet)))}
						bind:selected={customFacet}
						label={$t('domains.places.form.customFacet')}
					/>
					<Button label={$t('domains.places.form.addVibe')} icon="plus" disabled={!custom.trim()} onclick={addVibe} />
				</div>
			</fieldset>
		</form>
	</PictureDrop>
	{#snippet footer()}
		<Button label={$t('common.cancel')} variant="quiet" onclick={() => (open = false)} />
		<Button
			label={$t(place ? 'common.save' : 'domains.places.form.add')}
			variant="primary"
			type="submit"
			form="{uid}-form"
			disabled={!form.name.trim() || Object.keys(problems).length > 0}
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
		gap: var(--space-4);
	}
	.row {
		display: flex;
		flex-direction: column;
		align-items: start;
		gap: var(--space-1);
	}
	.where {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2);
	}
	.hint {
		color: var(--text-secondary);
		font: var(--ed-t-caption);
		letter-spacing: var(--ed-t-caption-tracking);
	}
	.pair {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(calc(var(--space-8) * 5), 1fr));
		gap: var(--space-4);
	}
	.label,
	.legend {
		color: var(--text-secondary);
		font: var(--ed-t-label);
		letter-spacing: var(--ed-t-label-tracking);
		font-variation-settings: var(--ed-t-label-opsz);
	}
	.legend {
		padding: 0;
		margin-bottom: var(--space-2);
		color: var(--text-primary);
	}
	.vibes {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
		margin: 0;
		padding: 0;
		border: 0;
		min-width: 0;
	}
	.facet {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}
	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
	}
	.custom {
		display: flex;
		flex-wrap: wrap;
		align-items: end;
		gap: var(--space-2);
	}
	.anchor {
		display: inline-flex;
	}
</style>
