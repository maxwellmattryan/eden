<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf'
	import { expect, fn, userEvent } from 'storybook/test'
	import { canvasOf } from '../../../storybook/play.js'
	import { defaultStrings } from '$lib/i18n/strings.js'
	import { canSee } from '../../../stories/sample-data.js'
	import CanSee from '../CanSee/CanSee.svelte'
	import FileButton from '../FileButton/FileButton.svelte'
	import FileChip from '../FileChip/FileChip.svelte'
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

	/** A paste as the engine would send it: text, files, or both. */
	function paste(target: HTMLElement, content: { text?: string; files?: File[] }) {
		const data = new DataTransfer()
		if (content.text !== undefined) data.setData('text/plain', content.text)
		for (const file of content.files ?? []) data.items.add(file)
		const event = new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true })
		target.dispatchEvent(event)
		return event
	}
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

<!-- The "can see" button at the foot's start, a caption before the button -->
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

<!-- Files attached to the message sit above it, the paperclip beside the eye; with something attached a blank
     message may be sent -->
<Story
	name="With attachments"
	args={{ allowEmpty: true }}
	play={async ({ canvasElement, args }) => {
		const canvas = canvasOf(canvasElement)
		await expect(canvas.getByText('basket.png')).toBeVisible()
		const send = canvas.getByRole('button', { name: s.send })
		await expect(send).toBeEnabled()
		await userEvent.click(send)
		await expect(args.onsend).toHaveBeenCalledWith('')
	}}
>
	{#snippet template(args)}
		<Composer {...args}>
			{#snippet attachments()}
				<FileChip name="basket.png" detail="840 KB" icon="image" onremove={() => {}} />
				<FileChip name="manual.pdf" detail="1.2 MB" icon="file-text" onremove={() => {}} />
			{/snippet}
			{#snippet tools()}
				<FileButton label="Attach files" size="sm" tooltip onfiles={() => {}} />
				<CanSee items={canSee} />
			{/snippet}
		</Composer>
	{/snippet}
</Story>

<!-- Pasted files go to `onfiles`, and so does a paste longer than `longPaste`, as a text file; a short paste, and
     text that carries a picture of itself, stay text -->
<Story
	name="Paste"
	args={{ onfiles: fn(), longPaste: 20 }}
	play={async ({ canvasElement, args }) => {
		const canvas = canvasOf(canvasElement)
		const field = canvas.getByRole('textbox', { name: s.askPlaceholder })
		const image = new File(['1234'], 'screenshot.png', { type: 'image/png' })

		const files = paste(field, { files: [image] })
		await expect(files.defaultPrevented).toBe(true)
		await expect(args.onfiles).toHaveBeenLastCalledWith([image])

		const short = paste(field, { text: 'two eggs' })
		await expect(short.defaultPrevented).toBe(false)
		const table = paste(field, { text: 'eggs\t2', files: [image] })
		await expect(table.defaultPrevented).toBe(false)
		await expect(args.onfiles).toHaveBeenCalledTimes(1)

		const long = paste(field, { text: 'a log of many lines, longer than the limit' })
		await expect(long.defaultPrevented).toBe(true)
		await expect(args.onfiles).toHaveBeenCalledTimes(2)
		const pasted = ((args.onfiles as ReturnType<typeof fn>).mock.calls[1]?.[0] as File[])[0]!
		await expect(pasted.name).toBe(s.pastedText)
		await expect(pasted.type).toBe('text/plain')
		await expect(await pasted.text()).toBe('a log of many lines, longer than the limit')
		await expect(field).toHaveValue('')
	}}
/>
