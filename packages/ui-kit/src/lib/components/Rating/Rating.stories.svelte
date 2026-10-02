<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf'
	import { expect, fn, userEvent } from 'storybook/test'
	import { canvasOf, hasCanvas } from '../../../storybook/play.js'
	import { meadowVisits } from '../../../stories/sample-data.js'
	import Rating from './Rating.svelte'

	const visit = meadowVisits[0]!

	const { Story } = defineMeta({
		title: 'Components/Inputs/Rating',
		component: Rating,
		tags: ['autodocs'],
		parameters: {
			docs: {
				description: {
					component:
						'A rating out of a few stars: a radio group with one tab stop and arrows between the stars. A press on the star that is set clears it, since a rating is optional. `readonly` shows one already given as a single image with its sentence.',
				},
			},
		},
		args: { label: 'Your rating', value: visit.rating, onchange: fn() },
	})
</script>

<!-- Four of five; a press on another star moves it, a press on the fourth clears it -->
<Story
	name="Default"
	play={async ({ canvasElement, args }) => {
		if (!hasCanvas(canvasElement)) return
		const canvas = canvasOf(canvasElement)
		await expect(canvas.getByRole('radiogroup', { name: 'Your rating' })).toBeVisible()
		const stars = canvas.getAllByRole('radio')
		await expect(stars).toHaveLength(5)
		await expect(canvas.getByRole('radio', { name: '4 stars' })).toHaveAttribute('aria-checked', 'true')
		await userEvent.click(canvas.getByRole('radio', { name: '2 stars' }))
		await expect(args.onchange).toHaveBeenLastCalledWith(2)
		await userEvent.click(canvas.getByRole('radio', { name: '2 stars' }))
		await expect(args.onchange).toHaveBeenLastCalledWith(undefined)
	}}
/>

<!-- Nothing set yet -->
<Story name="Unrated" args={{ value: undefined }} />

<!-- Shown and not changed: one image with its sentence -->
<Story
	name="Read only"
	args={{ readonly: true, label: 'Cosmic Coffee' }}
	play={async ({ canvasElement }) => {
		if (!hasCanvas(canvasElement)) return
		const canvas = canvasOf(canvasElement)
		await expect(canvas.getByRole('img', { name: 'Cosmic Coffee: 4 of 5' })).toBeVisible()
		await expect(canvas.queryByRole('radio')).toBeNull()
	}}
/>

<!-- Read only with no rating -->
<Story name="Read only, unrated" args={{ readonly: true, value: undefined, label: 'Nickel City' }} />

<!-- Out of three -->
<Story name="Three stars" args={{ max: 3, value: 2 }} />
