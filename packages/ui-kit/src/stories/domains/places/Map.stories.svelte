<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf'
	import type { ComponentProps } from 'svelte'
	import { expect, fn, userEvent, within } from 'storybook/test'
	import { canvasOf, hasCanvas } from '../../../storybook/play.js'
	import { defaultStrings } from '$lib/i18n/strings.js'
	import { meadowPlaces, meadowSuggestions, sidebar } from '../../sample-data.js'
	import Map from './Map.svelte'

	const meadow = sidebar.items.find((entry) => entry.id === 'places')!
	const cosmic = meadowPlaces[0]!
	const found = meadowSuggestions[0]!
	/** True on the desktop canvas, where the status bar stands at the foot. */
	const wide = (canvas: ReturnType<typeof canvasOf>) =>
		canvas.queryByRole('contentinfo', { name: defaultStrings.statusBar.label }) !== null
	const pinsOf = (canvas: ReturnType<typeof canvasOf>) =>
		within(canvas.getByRole('region', { name: 'Map' })).getAllByRole('button', { pressed: undefined })

	const { Story } = defineMeta({
		title: 'Domains/Meadow/Map',
		component: Map,
		tags: ['autodocs'],
		parameters: {
			docs: {
				description: {
					component:
						'Meadow’s Map view (product/domains/places.md), mocked from kit components under D-54 and shaped as D-129 says a map page is: the map is the main column, the filters and results the side column, and the detail of a picked place lies over the map’s edge. The filter is four facets of vibes, any of within a facet and all of across them (D-133), with practical chips beside; it narrows the saved places with no key and no network. Find more sends the filter to the Gardener with a web search (D-132), and says so with its estimate under the button; what it finds stands on the map in the Gardener’s green until saved or dismissed. Every pin is a `MapPin` in a `PinLayer` over a still drawing: Storybook never mounts a map. On the phone the map stands on top, the list by distance under it, and a picked place takes the list’s room.',
				},
			},
		},
		args: {
			onpick: fn(),
			onfilter: fn(),
			onfind: fn(),
			onsave: fn(),
			ondismiss: fn(),
			onfavourite: fn(),
			onvisit: fn(),
			onedit: fn(),
			onmaps: fn(),
			onadd: fn(),
			onimport: fn(),
			onsample: fn(),
			onsettings: fn(),
			onnavigate: fn(),
		},
	})
</script>

{#snippet template(args: ComponentProps<typeof Map>)}
	<Map {...args} />
{/snippet}

<!-- Every saved place and home on the map, nearest first in the list, nothing picked -->
<Story
	name="Default"
	{template}
	play={async ({ canvasElement, args }) => {
		if (!hasCanvas(canvasElement)) return
		const canvas = canvasOf(canvasElement)
		await expect(canvas.getByRole('heading', { level: 1, name: meadow.name })).toBeVisible()
		await expect(canvas.getAllByRole('tab')).toHaveLength(4)
		await expect(canvas.getByRole('tab', { name: 'Map' })).toHaveAttribute('aria-selected', 'true')
		// a pin for every saved place, and one for home
		await expect(pinsOf(canvas)).toHaveLength(meadowPlaces.length + 1)
		await expect(canvas.getByRole('group', { name: 'Your places' })).toBeVisible()
		if (wide(canvas)) {
			// the four facets, each a named group of chips
			for (const facet of ['What I’m doing', 'How I feel', 'The setting', 'The crowd'])
				await expect(canvas.getByRole('group', { name: facet })).toBeVisible()
			await expect(canvas.getByRole('button', { name: 'Find more' })).toBeEnabled()
			await userEvent.click(canvas.getByRole('button', { name: 'Cozy' }))
			await expect(args.onfilter).toHaveBeenCalledWith(['cozy'])
		}
		await userEvent.click(canvas.getByRole('button', { name: cosmic.name }))
		await expect(args.onpick).toHaveBeenCalledWith(cosmic.id)
	}}
/>

<!-- Cozy or calm, and outdoors: any of within a facet, all of across them. Three places fit -->
<Story
	name="Filtered"
	{template}
	args={{ vibes: ['cozy', 'calm', 'outdoors'] }}
	play={async ({ canvasElement }) => {
		if (!hasCanvas(canvasElement)) return
		const canvas = canvasOf(canvasElement)
		await expect(canvas.getByRole('group', { name: 'Places that fit the filter' })).toBeVisible()
		// Cosmic (cozy, outdoors), Zilker (calm, outdoors), Sour Duck (cozy, outdoors), and home
		await expect(pinsOf(canvas)).toHaveLength(4)
		await expect(canvas.queryByRole('button', { name: 'Nickel City' })).toBeNull()
	}}
/>

<!-- Cosmic Coffee picked: its pin stands out and its detail lies over the map's edge, hours with their source -->
<Story
	name="Place selected"
	{template}
	args={{ selected: cosmic.id }}
	play={async ({ canvasElement, args }) => {
		if (!hasCanvas(canvasElement)) return
		const canvas = canvasOf(canvasElement)
		const pane = within(canvas.getByRole('complementary', { name: cosmic.name }))
		await expect(pane.getByRole('heading', { name: cosmic.name })).toBeVisible()
		await expect(pane.getByText(/Check before you go/)).toBeVisible()
		await expect(pane.getByRole('img', { name: 'Your rating: 4 of 5' })).toBeVisible()
		await expect(canvas.getByRole('button', { name: cosmic.name, pressed: true })).toBeVisible()
		await userEvent.click(pane.getByRole('button', { name: 'Log a visit' }))
		await expect(args.onvisit).toHaveBeenCalledWith(cosmic.id)
	}}
/>

<!-- What the Gardener found for "a quiet cafe to work in": green pins, each with why it fits; none is saved -->
<Story
	name="Suggestions"
	{template}
	args={{ suggestions: true, selected: found.id, vibes: ['work-friendly', 'deep-work', 'quiet'] }}
	play={async ({ canvasElement, args }) => {
		if (!hasCanvas(canvasElement)) return
		const canvas = canvasOf(canvasElement)
		const pane = within(canvas.getByRole('complementary', { name: found.name }))
		await expect(pane.getByText(found.why)).toBeVisible()
		await expect(pane.getByText(/Not saved yet/)).toBeVisible()
		await userEvent.click(pane.getByRole('button', { name: 'Save' }))
		await expect(args.onsave).toHaveBeenCalledWith(found.id)
	}}
/>

<!-- A search on its way: the button rests, the rows to come are skeletons -->
<Story
	name="Searching"
	{template}
	args={{ searching: true, vibes: ['work-friendly', 'quiet'] }}
	play={async ({ canvasElement }) => {
		if (!hasCanvas(canvasElement)) return
		const canvas = canvasOf(canvasElement)
		if (wide(canvas)) await expect(canvas.getByRole('button', { name: 'Searching' })).toBeDisabled()
	}}
/>

<!-- No key on this device: the saved places still filter; finding new ones says what it needs -->
<Story
	name="No provider"
	{template}
	args={{ noProvider: true }}
	play={async ({ canvasElement, args }) => {
		if (!hasCanvas(canvasElement)) return
		const canvas = canvasOf(canvasElement)
		await expect(pinsOf(canvas)).toHaveLength(meadowPlaces.length + 1)
		if (!wide(canvas)) return
		await expect(canvas.getByText('No key on this device')).toBeVisible()
		await expect(canvas.queryByRole('button', { name: 'Find more' })).toBeNull()
		await userEvent.click(canvas.getByRole('button', { name: 'Open settings' }))
		await expect(args.onsettings).toHaveBeenCalled()
	}}
/>

<!-- Nothing saved: home alone on the map, and the two ways in -->
<Story
	name="Empty"
	{template}
	args={{ empty: true }}
	play={async ({ canvasElement, args }) => {
		if (!hasCanvas(canvasElement)) return
		const canvas = canvasOf(canvasElement)
		await expect(canvas.getByText('No places yet')).toBeVisible()
		await expect(pinsOf(canvas)).toHaveLength(1)
		await userEvent.click(canvas.getByRole('button', { name: 'Import a list' }))
		await expect(args.onimport).toHaveBeenCalled()
	}}
/>

<!-- No tiles: the saved pins on plain ground, and the status bar says so -->
<Story
	name="Offline"
	{template}
	args={{ offline: true }}
	play={async ({ canvasElement }) => {
		if (!hasCanvas(canvasElement)) return
		const canvas = canvasOf(canvasElement)
		await expect(pinsOf(canvas)).toHaveLength(meadowPlaces.length + 1)
		await expect(canvas.queryByText(/OpenStreetMap contributors/)).toBeNull()
		if (wide(canvas)) await expect(canvas.getByRole('button', { name: 'Find more' })).toBeDisabled()
	}}
/>

<!-- The search brought nothing back: said beside the button, with a way to try again; nothing was saved -->
<Story
	name="Search failed"
	{template}
	args={{ failed: true, vibes: ['romantic', 'late-night'] }}
	play={async ({ canvasElement }) => {
		if (!hasCanvas(canvasElement)) return
		const canvas = canvasOf(canvasElement)
		if (wide(canvas)) await expect(canvas.getByText(/came back with nothing/)).toBeVisible()
	}}
/>
