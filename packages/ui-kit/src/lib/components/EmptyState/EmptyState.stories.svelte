<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf'
	import { expect, fn } from 'storybook/test'
	import { canvasOf } from '../../../storybook/play.js'
	import EmptyState from './EmptyState.svelte'

	const { Story } = defineMeta({
		title: 'Components/Feedback/EmptyState',
		component: EmptyState,
		tags: ['autodocs'],
		args: {
			title: 'Nothing in the fridge yet',
			text: 'Capture a haul or add an item.',
			action: { label: 'Capture a haul', icon: 'camera', onclick: fn() },
			motif: true,
		},
	})
</script>

<!-- Hearth's stock page before the first haul: the frond, the title, one sentence, the one primary action -->
<Story
	name="Default"
	play={async ({ canvasElement, userEvent, args }) => {
		const canvas = canvasOf(canvasElement)
		await userEvent.click(canvas.getByRole('button', { name: 'Capture a haul' }))
		await expect(args.action?.onclick).toHaveBeenCalledTimes(1)
	}}
/>

<Story name="No motif" args={{ motif: false }} />

<!-- The quiet link under the action seeds the page with the sample dataset -->
<Story
	name="With sample data link"
	args={{ sample: { onclick: fn() } }}
	play={async ({ canvasElement, userEvent, args }) => {
		const canvas = canvasOf(canvasElement)
		await userEvent.click(canvas.getByRole('button', { name: 'Add sample data' }))
		await expect(args.sample?.onclick).toHaveBeenCalledTimes(1)
	}}
/>

<Story name="Mobile" args={{ sample: { onclick: fn() } }} parameters={{ platforms: ['mobile'] }} />
