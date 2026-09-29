<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf'
	import { expect, fn } from 'storybook/test'
	import { canvasOf } from '../../../storybook/play.js'
	import { iconNames } from '$lib/icons/icons.js'
	import { skyToday } from '../../../stories/sample-data.js'
	import Banner from './Banner.svelte'

	const offline = `Offline. Showing the forecast from ${skyToday.lastGood}.`

	const { Story } = defineMeta({
		title: 'Components/Feedback/Banner',
		component: Banner,
		tags: ['autodocs'],
		args: { tone: 'info', message: offline, placement: 'inline', dismissible: false, ondismiss: fn() },
		argTypes: {
			tone: { control: 'inline-radio', options: ['info', 'warning', 'danger'] },
			placement: { control: 'inline-radio', options: ['inline', 'top'] },
			icon: { control: 'select', options: iconNames },
		},
	})
</script>

<!-- The status-bar strip while offline: info, a status, the time of the last good data -->
<Story
	name="Offline"
	play={async ({ canvasElement }) => {
		const canvas = canvasOf(canvasElement)
		await expect(canvas.getByRole('status')).toHaveTextContent(offline)
	}}
/>

<!-- A stale integration: warning colours the icon and the edge only, and the one quiet action sits inline -->
<Story
	name="Stale"
	args={{
		tone: 'warning',
		message: 'Google Work last synced yesterday 22:10.',
		action: { label: 'Sync now', onclick: fn() },
	}}
	play={async ({ canvasElement, userEvent, args }) => {
		const canvas = canvasOf(canvasElement)
		await expect(canvas.getByRole('alert')).toBeInTheDocument()
		await userEvent.click(canvas.getByRole('button', { name: 'Sync now' }))
		await expect(args.action?.onclick).toHaveBeenCalledTimes(1)
	}}
/>

<!-- A failure the owner can put away once read -->
<Story
	name="Error"
	args={{
		tone: 'danger',
		message: 'Sign-in expired. Reconnect to resume.',
		action: { label: 'Reconnect', onclick: fn() },
		dismissible: true,
	}}
	play={async ({ canvasElement, userEvent, args }) => {
		const canvas = canvasOf(canvasElement)
		await expect(canvas.getByRole('alert')).toBeInTheDocument()
		await userEvent.click(canvas.getByRole('button', { name: 'Dismiss' }))
		await expect(args.ondismiss).toHaveBeenCalledTimes(1)
	}}
/>

<!-- The full-width bar on mobile, reaching under the safe-area inset -->
<Story name="Top" args={{ placement: 'top' }} parameters={{ platforms: ['mobile'] }} />
