<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf'
	import { expect, fn, userEvent } from 'storybook/test'
	import { canvasOf, hasCanvas } from '../../../storybook/play.js'
	import { meadowPlaces, meadowSuggestions } from '../../../stories/sample-data.js'
	import MapPin from './MapPin.svelte'

	const place = meadowPlaces[0]!

	const { Story } = defineMeta({
		title: 'Components/Data/MapPin',
		component: MapPin,
		tags: ['autodocs'],
		parameters: {
			docs: {
				description: {
					component:
						'A pin on a map: a button whose foot is the place (D-129). The map draws ground and never a pin. The colour says what it is, the accent for a saved place, the Gardener’s green for one it found, honey for a listing, the ink for home and for a group, and the glyph repeats it, so colour is never alone. A `PinLayer` places it.',
				},
			},
		},
		args: { kind: 'saved', label: place.name, onselect: fn() },
		argTypes: { kind: { control: 'inline-radio', options: ['saved', 'suggested', 'listing', 'home', 'group'] } },
	})
</script>

<!-- A place the owner keeps -->
<Story
	name="Saved"
	play={async ({ canvasElement, args }) => {
		if (!hasCanvas(canvasElement)) return
		const pin = canvasOf(canvasElement).getByRole('button', { name: place.name })
		await expect(pin).toHaveAttribute('aria-pressed', 'false')
		await userEvent.click(pin)
		await expect(args.onselect).toHaveBeenCalled()
	}}
/>

<!-- One the Gardener found, in its green -->
<Story name="Suggested" args={{ kind: 'suggested', label: meadowSuggestions[0]!.name }} />

<!-- A listing, in honey -->
<Story name="Listing" args={{ kind: 'listing', label: 'Blanton late night' }} />

<!-- Home -->
<Story name="Home" args={{ kind: 'home', label: 'Home' }} />

<!-- Several places too close to tell apart: the count stands for them -->
<Story
	name="Group"
	args={{ kind: 'group', label: '4 places', count: 4 }}
	play={async ({ canvasElement }) => {
		if (!hasCanvas(canvasElement)) return
		await expect(canvasOf(canvasElement).getByRole('button', { name: '4 places' })).toHaveTextContent('4')
	}}
/>

<!-- The pin the page is showing: larger and ringed -->
<Story
	name="Selected"
	args={{ selected: true }}
	play={async ({ canvasElement }) => {
		if (!hasCanvas(canvasElement)) return
		await expect(canvasOf(canvasElement).getByRole('button', { name: place.name })).toHaveAttribute(
			'aria-pressed',
			'true'
		)
	}}
/>
