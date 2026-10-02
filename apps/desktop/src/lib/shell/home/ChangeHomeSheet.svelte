<script lang="ts">
	// Changing home (D-143), in a sheet over the page (D-95): what it is called, its address as its country asks for
	// one, and where it is. Find looks the address up and offers what it found; a click on the map puts the pin
	// exactly on the house, which no lookup is asked to do: the geocoder is sent the street and the town, never the
	// house number, and a rounded point to look near (D-140). The address and the exact point stay on this device.
	// Save writes the home as one change with one undo; the forecast, the distances and the `home-area` fact follow
	// it through the home store's hook.
	import { tick } from 'svelte'
	import type { Attachment } from 'svelte/attachments'
	import { AddressForm, Button, Field, PinLayer, Sheet, toast, type AddressFormKey } from '@eden/ui-kit'
	import {
		addressForm,
		addressFromHit,
		cleanAddress,
		defaultCountry,
		geocodeText,
		validateAddress,
		type Address,
	} from '@eden/shared/address'
	import { readMapPalette, type MapSurface } from '@eden/shared/domains/places'
	import { photon, roundedPoint, throttle, type GeocodeHit, type LngLat } from '@eden/shared/geo'
	import { home } from '@eden/shared/home'
	import { locale, t } from '@eden/shared/i18n'
	import { createSurface, source } from '$lib/domains/places/map'
	import { undoToast } from '$lib/shell/undo'
	import { homeUi } from './home-ui.svelte'

	const uid = $props.id()
	const lang = $derived($locale ?? 'en')
	/** A city is enough for a home (substrate/onboarding.md); the rest of the address is the owner's to give. */
	const REQUIRED: AddressFormKey[] = ['city']
	/** Photon's terms ask for moderate use: one request a second. */
	const search = throttle(photon.search, 1)

	const was = $state.snapshot(home.current)
	const chosen = home.chosen
	let label = $state(chosen ? was.label : $t('home.defaultName'))
	let address = $state<Address>({
		...(chosen ? was.address : {}),
		country: (chosen ? was.address?.country : undefined) ?? defaultCountry({ locale: $locale ?? 'en' }),
	})
	/** Where the pin stands: the home's own point, until Find or a click moves it. A sample home has none to keep. */
	let point = $state<LngLat | undefined>(chosen ? { lng: was.longitude, lat: was.latitude } : undefined)

	// The address: what is wrong with a field is said once it has been left, or once Save was tried
	let left = $state<AddressFormKey[]>([])
	let tried = $state(false)
	const problems = $derived(validateAddress(address, { require: REQUIRED }))
	const errors = $derived(
		Object.fromEntries(Object.entries(problems).filter(([key]) => tried || left.includes(key as AddressFormKey)))
	)
	const shape = $derived(
		addressForm(address, {
			label: (id, values) => $t(`address.${id}`, { values }),
			locale: lang,
			home: was.address?.country,
			errors,
			require: REQUIRED,
		})
	)

	// Finding it
	let hits = $state<GeocodeHit[]>([])
	let finding = $state(false)
	let looked = $state(false)
	const query = $derived(geocodeText(address))
	async function find() {
		if (finding || !address.city?.trim()) return
		finding = true
		try {
			hits = await search({
				text: query,
				near: roundedPoint({ lng: was.longitude, lat: was.latitude }),
				lang,
				limit: 5,
				address: true,
			})
		} catch {
			hits = []
		}
		looked = true
		finding = false
		// one answer is the answer
		if (hits.length === 1 && hits[0]) take(hits[0])
	}
	function take(hit: GeocodeHit) {
		point = hit.point
		// what the lookup knows fills only what was left empty: the owner's own words stand
		const found = addressFromHit(hit)
		for (const key of ['city', 'region', 'postalCode'] as const) {
			if (!address[key]?.trim() && found?.[key]) address[key] = found[key]
		}
		surface?.setView({ center: hit.point, zoom: 16 })
		hits = []
	}

	// The map: ground from the same source as Meadow's, one pin, and a click that moves it
	let surface = $state.raw<MapSurface>()
	let failed = $state(false)
	let revision = $state(0)
	const project = $derived.by(() => {
		const live = surface
		return (at: LngLat) => live?.project(at) ?? null
	})
	const pins = $derived(point && surface ? [{ id: 'home', point, kind: 'home' as const, label: label.trim() }] : [])
	const ground: Attachment<HTMLElement> = (container) => {
		let gone = false
		let made: MapSurface | undefined
		const offs: (() => void)[] = []
		void (async () => {
			// the sheet is laid out once it is open: the map needs its box to have a size
			await tick()
			try {
				made = await createSurface({
					container,
					view: { center: point ?? roundedPoint({ lng: was.longitude, lat: was.latitude }), zoom: point ? 16 : 11 },
					palette: readMapPalette(container),
					lang,
					still: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
				})
				if (gone) return made.destroy()
				await made.ready
				if (gone) return
				offs.push(made.on('move', () => (revision += 1)))
				offs.push(made.onClick((at) => (point = at)))
				surface = made
			} catch {
				failed = true
			}
		})()
		return () => {
			gone = true
			for (const off of offs) off()
			surface = undefined
			made?.destroy()
		}
	}

	// Saving
	let saving = $state(false)
	const ready = $derived(label.trim() !== '' && point !== undefined)
	async function save() {
		tried = true
		if (!ready || !point || saving || Object.keys(problems).length) return
		saving = true
		try {
			const { undo } = await home.set({ label: label.trim(), point, address: cleanAddress(address) })
			undoToast($t('home.toast.changed'), () => void undo())
			homeUi.open = false
		} catch {
			toast({ message: $t('home.toast.failed') })
		} finally {
			saving = false
		}
	}
</script>

<Sheet bind:open={homeUi.open} size="md" labelledby="{uid}-title">
	{#snippet header()}
		<h2 class="title" id="{uid}-title">{$t(chosen ? 'home.title' : 'home.titleFirst')}</h2>
	{/snippet}
	<form
		class="form"
		id="{uid}-form"
		onsubmit={(event) => {
			event.preventDefault()
			void save()
		}}
	>
		<Field label={$t('home.name')} bind:value={label} />
		<AddressForm
			bind:value={address}
			country={shape.country}
			countries={shape.countries}
			countryLabel={$t('address.country')}
			rows={shape.rows}
			onblurfield={(key) => (left = [...left, key])}
		/>
		<div class="row">
			<div class="where">
				<Button
					label={$t(point ? 'home.findAgain' : 'home.find')}
					icon="locate-fixed"
					disabled={finding || !address.city?.trim()}
					onclick={find}
				/>
				<span class="hint" aria-live="polite">
					{#if looked && !hits.length && !finding && !point}
						{$t('home.notFound')}
					{:else}
						{$t('home.findHelp', { values: { source: photon.name } })}
					{/if}
				</span>
			</div>
			{#if hits.length}
				<ul class="hits" aria-label={$t('home.matches')}>
					{#each hits as hit (hit.externalId)}
						<li>
							<Button
								variant="quiet"
								icon="map-pin"
								label={[hit.name, hit.city ?? hit.locality, hit.region].filter(Boolean).join(', ')}
								onclick={() => take(hit)}
							/>
						</li>
					{/each}
				</ul>
			{/if}
		</div>
		<div class="row">
			<section class="map" aria-label={$t('home.map')}>
				<div class="ground" {@attach ground}></div>
				<PinLayer {pins} {project} {revision} selected="home" label={$t('home.map')} />
				<p class="credit">{failed ? $t('home.mapFailed') : source.attribution}</p>
			</section>
			<span class="hint">{$t(point ? 'home.mapHelp' : 'home.mapEmpty')}</span>
		</div>
	</form>
	{#snippet footer()}
		<Button label={$t('common.cancel')} onclick={() => (homeUi.open = false)} />
		<Button label={$t('common.save')} variant="primary" type="submit" form="{uid}-form" disabled={!ready || saving} />
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
		gap: var(--space-2);
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
	.hits {
		display: flex;
		flex-direction: column;
		align-items: start;
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.map {
		position: relative;
		height: calc(var(--space-8) * 9);
		border: 1px solid var(--ed-card-border);
		border-radius: var(--ed-radius-card);
		background: var(--surface-1);
		overflow: hidden;
		isolation: isolate;
	}
	.ground {
		position: absolute;
		inset: 0;
		cursor: crosshair;
	}
	.credit {
		position: absolute;
		left: var(--space-2);
		right: var(--space-2);
		bottom: var(--space-2);
		width: fit-content;
		margin: 0;
		padding: 0 var(--space-2);
		/* the credit may take two lines in a sheet's width, so it is a rounded box, not a pill */
		border-radius: var(--ed-radius-control);
		background: var(--surface-0);
		color: var(--text-secondary);
		font: var(--ed-t-caption);
		letter-spacing: var(--ed-t-caption-tracking);
	}
</style>
