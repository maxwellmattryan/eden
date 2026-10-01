<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf'
	import { expect, fn, userEvent } from 'storybook/test'
	import { canvasOf } from '../../../storybook/play.js'
	import { defaultStrings } from '$lib/i18n/strings.js'
	import FileChip from './FileChip.svelte'

	const s = defaultStrings

	// a picture small enough to live in the story: four squares of the palette
	const thumbnail =
		'data:image/svg+xml,' +
		encodeURIComponent(
			'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 2 2"><rect width="1" height="1" fill="#4f7a5a"/><rect x="1" width="1" height="1" fill="#c98a2e"/><rect y="1" width="1" height="1" fill="#b5644a"/><rect x="1" y="1" width="1" height="1" fill="#4a82a6"/></svg>'
		)

	const { Story } = defineMeta({
		title: 'Components/Files/FileChip',
		component: FileChip,
		tags: ['autodocs'],
		parameters: {
			docs: {
				description: {
					component:
						'One file on one line: a thumbnail when it has one, else a glyph for its kind, its name (which gives way first) and a quiet detail. `onremove` adds the cross, `onopen` makes the body a button. A file that could not be taken, or is no longer on this device, says so in place of the detail.',
				},
			},
		},
		args: { name: 'manual.pdf', detail: '1.2 MB', icon: 'file-text' },
	})
</script>

<Story name="Default" />

<!-- An image shows itself -->
<Story name="Thumbnail" args={{ name: 'basket.png', detail: '840 KB', icon: 'image', thumbnail }} />

<!-- Before a message is sent each file can be taken away again -->
<Story
	name="Removable"
	args={{ name: 'basket.png', detail: '840 KB', thumbnail, onremove: fn() }}
	play={async ({ canvasElement, args }) => {
		const canvas = canvasOf(canvasElement)
		await userEvent.click(canvas.getByRole('button', { name: s.remove('basket.png') }))
		await expect(args.onremove).toHaveBeenCalledTimes(1)
	}}
/>

<!-- In a sent message the body opens the file -->
<Story
	name="Opens"
	args={{ onopen: fn() }}
	play={async ({ canvasElement, args }) => {
		const canvas = canvasOf(canvasElement)
		await userEvent.click(canvas.getByRole('button', { name: s.file.open('manual.pdf') }))
		await expect(args.onopen).toHaveBeenCalledTimes(1)
	}}
/>

<!-- A long name gives way; the detail stays whole -->
<Story name="Long name" args={{ name: 'Receipt from the Saturday market, second stall.pdf', onremove: fn() }} />

<!-- Still being read -->
<Story
	name="Busy"
	args={{ state: 'busy', name: 'basket.png', icon: 'image' }}
	play={async ({ canvasElement }) => {
		await expect(canvasElement.querySelector('.ed-file')).toHaveAttribute('aria-busy', 'true')
	}}
/>

<!-- Could not be taken: the reason replaces the detail -->
<Story
	name="Error"
	args={{ state: 'error', onremove: fn() }}
	play={async ({ canvasElement }) => {
		await expect(canvasOf(canvasElement).getByText(s.file.failed)).toBeVisible()
	}}
/>

<!-- The message remembers a file this device no longer has -->
<Story
	name="Missing"
	args={{ state: 'missing', name: 'basket.png', icon: 'image', thumbnail }}
	play={async ({ canvasElement }) => {
		await expect(canvasOf(canvasElement).getByText(s.file.missing)).toBeVisible()
		await expect(canvasElement.querySelector('img')).toBeNull()
	}}
/>
