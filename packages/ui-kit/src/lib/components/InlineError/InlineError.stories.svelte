<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf'
	import { expect, fn, waitFor } from 'storybook/test'
	import { canvasOf } from '../../../storybook/play.js'
	import { skyToday } from '../../../stories/sample-data.js'
	import InlineError from './InlineError.svelte'

	const message = "Couldn't reach Open-Meteo."
	const lastGood = `Showing the forecast from ${skyToday.lastGood}.`

	const { Story } = defineMeta({
		title: 'Components/Feedback/InlineError',
		component: InlineError,
		tags: ['autodocs'],
		args: { message, live: false, onretry: fn() },
	})
</script>

<Story
	name="Default"
	play={async ({ canvasElement, userEvent, args }) => {
		const canvas = canvasOf(canvasElement)
		await userEvent.click(canvas.getByRole('button', { name: 'Retry' }))
		await expect(args.onretry).toHaveBeenCalledTimes(1)
	}}
/>

<Story name="With last good" args={{ lastGood }} />

<!-- onretry returns a promise: the button reads Retrying… and is disabled until it settles -->
<Story
	name="Retrying"
	args={{ lastGood, onretry: fn(() => new Promise<void>((resolve) => setTimeout(resolve, 800))) }}
	play={async ({ canvasElement, userEvent, args }) => {
		const canvas = canvasOf(canvasElement)
		const button = canvas.getByRole('button', { name: 'Retry' })
		await userEvent.click(button)
		await waitFor(() => expect(button).toHaveTextContent('Retrying…'))
		await expect(button).toBeDisabled()
		await waitFor(() => expect(button).toHaveTextContent(/^Retry$/), { timeout: 2000 })
		await expect(button).toBeEnabled()
		await expect(args.onretry).toHaveBeenCalledTimes(1)
	}}
/>

<!-- An error that arrives after the page: announced as an alert -->
<Story
	name="Live"
	args={{ lastGood, live: true }}
	play={async ({ canvasElement }) => {
		const canvas = canvasOf(canvasElement)
		await expect(canvas.getByRole('alert')).toHaveTextContent(message)
	}}
/>
