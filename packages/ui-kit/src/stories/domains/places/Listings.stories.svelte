<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf'
	import type { ComponentProps } from 'svelte'
	import { expect, fn, userEvent } from 'storybook/test'
	import { canvasOf, hasCanvas } from '../../../storybook/play.js'
	import { meadowListings } from '../../sample-data.js'
	import Listings from './Listings.svelte'

	const { Story } = defineMeta({
		title: 'Domains/Meadow/Listings',
		component: Listings,
		tags: ['autodocs'],
		parameters: {
			docs: {
				description: {
					component:
						'Meadow’s Listings view (product/domains/places.md): what is on this weekend that fits the owner’s vibes, found by the Gardener with a web search (D-132), each with why it fits and where it was read. Interested makes a tentative `outing` Event and Going confirms it. The weekly search runs on Sunday on its own, capped and with a setting to turn it off (D-134); the foot of the page says when it last looked.',
				},
			},
		},
		args: { onmark: fn(), onopen: fn(), onfind: fn(), onsettings: fn(), onnavigate: fn() },
	})
</script>

{#snippet template(args: ComponentProps<typeof Listings>)}
	<Listings {...args} />
{/snippet}

<!-- Two listings for the weekend, soonest first, nothing marked -->
<Story
	name="This weekend"
	{template}
	play={async ({ canvasElement, args }) => {
		if (!hasCanvas(canvasElement)) return
		const canvas = canvasOf(canvasElement)
		await expect(canvas.getByRole('tab', { name: 'Listings' })).toHaveAttribute('aria-selected', 'true')
		for (const listing of meadowListings)
			await expect(canvas.getByRole('heading', { level: 3, name: listing.title })).toBeVisible()
		await userEvent.click(canvas.getAllByRole('button', { name: 'Interested' })[0]!)
		await expect(args.onmark).toHaveBeenCalledWith('l-02', 'interested')
	}}
/>

<!-- One marked interested, one going: each says what the calendar holds -->
<Story
	name="Interested and going"
	{template}
	args={{ marks: { 'l-01': 'interested', 'l-02': 'going' } }}
	play={async ({ canvasElement }) => {
		if (!hasCanvas(canvasElement)) return
		const canvas = canvasOf(canvasElement)
		await expect(canvas.getByText('On your calendar as a tentative outing.')).toBeVisible()
		await expect(canvas.getByText('On your calendar as an outing.')).toBeVisible()
		await expect(canvas.getAllByRole('button', { name: 'Going', pressed: true })).toHaveLength(1)
	}}
/>

<!-- Nothing found yet -->
<Story
	name="Empty"
	{template}
	args={{ empty: true }}
	play={async ({ canvasElement }) => {
		if (!hasCanvas(canvasElement)) return
		await expect(canvasOf(canvasElement).getByText('Nothing for the weekend yet')).toBeVisible()
	}}
/>

<!-- No key: what was found stays, nothing new can be looked for -->
<Story
	name="No provider"
	{template}
	args={{ noProvider: true, marks: { 'l-01': 'interested' } }}
	play={async ({ canvasElement }) => {
		if (!hasCanvas(canvasElement)) return
		const canvas = canvasOf(canvasElement)
		await expect(canvas.getByText('No key on this device')).toBeVisible()
		await expect(canvas.queryByRole('button', { name: 'Find listings' })).toBeNull()
	}}
/>
