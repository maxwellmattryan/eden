<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf'
	import { expect, fn, userEvent } from 'storybook/test'
	import { canvasOf } from '../../../storybook/play.js'
	import { defaultStrings } from '$lib/i18n/strings.js'
	import { canSee } from '../../../stories/sample-data.js'
	import CanSee from '../CanSee/CanSee.svelte'
	import Composer from './Composer.svelte'

	const s = defaultStrings.gardener

	const { Story } = defineMeta({
		title: 'Components/Gardener/Composer',
		component: Composer,
		tags: ['autodocs'],
		parameters: {
			docs: {
				description: {
					component:
						'One bordered box that holds the message and its foot: a bare field that grows with its lines and sends on Enter (Shift+Enter breaks the line), what the app puts beside the message at the foot’s start (the “can see” chip), a quiet caption and the round send button on the Gardener’s green at its end. The button becomes Stop while a reply streams. The composer clears itself after `onsend` and never sends blank space.',
				},
			},
		},
		args: { label: s.askPlaceholder, placeholder: s.askPlaceholder, onsend: fn(), onstop: fn() },
	})
</script>

<!-- Nothing sends while the field is blank; Enter sends the trimmed text and clears the field; Shift+Enter breaks -->
<Story
	name="Default"
	play={async ({ canvasElement, args }) => {
		const canvas = canvasOf(canvasElement)
		const field = canvas.getByRole('textbox', { name: s.askPlaceholder })
		const send = canvas.getByRole('button', { name: s.send })
		await expect(send).toBeDisabled()
		await userEvent.type(field, '   ')
		await expect(send).toBeDisabled()
		await userEvent.clear(field)
		await userEvent.type(field, 'What is for dinner?{Shift>}{Enter}{/Shift}Soon.')
		await expect(field).toHaveValue('What is for dinner?\nSoon.')
		await expect(send).toBeEnabled()
		await userEvent.keyboard('{Enter}')
		await expect(args.onsend).toHaveBeenCalledWith('What is for dinner?\nSoon.')
		await expect(field).toHaveValue('')
		await expect(send).toBeDisabled()
	}}
/>

<!-- The button sends too -->
<Story
	name="Button"
	play={async ({ canvasElement, args }) => {
		const canvas = canvasOf(canvasElement)
		await userEvent.type(canvas.getByRole('textbox', { name: s.askPlaceholder }), 'Plan the week')
		await userEvent.click(canvas.getByRole('button', { name: s.send }))
		await expect(args.onsend).toHaveBeenCalledWith('Plan the week')
	}}
/>

<!-- While the reply streams the button is Stop, Enter does nothing, and the field stays open for the next turn -->
<Story
	name="Busy"
	args={{ busy: true, value: 'And after that?' }}
	play={async ({ canvasElement, args }) => {
		const canvas = canvasOf(canvasElement)
		await expect(canvas.queryByRole('button', { name: s.send })).toBeNull()
		const field = canvas.getByRole('textbox', { name: s.askPlaceholder })
		await userEvent.type(field, '{Enter}')
		await expect(args.onsend).not.toHaveBeenCalled()
		await userEvent.click(canvas.getByRole('button', { name: s.stop }))
		await expect(args.onstop).toHaveBeenCalledTimes(1)
	}}
/>

<!-- No key on this device, or the budget reached: the field and the button are off -->
<Story
	name="Disabled"
	args={{ disabled: true }}
	play={async ({ canvasElement }) => {
		const canvas = canvasOf(canvasElement)
		await expect(canvas.getByRole('textbox', { name: s.askPlaceholder })).toBeDisabled()
		await expect(canvas.getByRole('button', { name: s.send })).toBeDisabled()
	}}
/>

<!-- The "can see" chip at the foot's start, a caption before the button -->
<Story
	name="With tools and meta"
	play={async ({ canvasElement }) => {
		const canvas = canvasOf(canvasElement)
		await expect(canvas.getByRole('button', { name: new RegExp(`^${s.canSee}`) })).toBeVisible()
		await expect(canvas.getByText('claude-sonnet · standard')).toBeVisible()
	}}
>
	{#snippet template(args)}
		<Composer {...args}>
			{#snippet tools()}
				<CanSee items={canSee} />
			{/snippet}
			{#snippet meta()}
				claude-sonnet · standard
			{/snippet}
		</Composer>
	{/snippet}
</Story>

<!-- A message of many lines: the field grows to about eight, then scrolls -->
<Story
	name="Long message"
	args={{
		value:
			'Plan the week from what is in the fridge.\nKeep Tuesday light.\nNo peanuts anywhere.\nUse the salmon before Thursday.\nOne soup.\nOne thing from the freezer.\nLeftovers for Friday lunch.\nAnd a grocery list for Saturday.\nThat is all.',
	}}
/>
