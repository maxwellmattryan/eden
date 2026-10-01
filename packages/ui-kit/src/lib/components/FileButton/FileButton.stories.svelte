<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf'
	import { expect, fn } from 'storybook/test'
	import { canvasOf } from '../../../storybook/play.js'
	import FileButton from './FileButton.svelte'

	const { Story } = defineMeta({
		title: 'Components/Files/FileButton',
		component: FileButton,
		tags: ['autodocs'],
		parameters: {
			docs: {
				description: {
					component:
						'An icon button that opens the platform’s file picker and hands back the files chosen: the way to attach a file without dragging it. `accept` filters what the picker offers; the app holds the files to its rules with `checkFiles`, as it does a drop.',
				},
			},
		},
		args: { label: 'Attach files', tooltip: true, onfiles: fn() },
	})

	/** The picker's answer, as the engine would give it: the files set on the input, then its change. */
	function choose(canvasElement: HTMLElement, files: File[]) {
		const input = (canvasElement.querySelector('.ed-canvas') ?? canvasElement).querySelector<HTMLInputElement>(
			'input[type="file"]'
		)!
		const data = new DataTransfer()
		for (const file of files) data.items.add(file)
		input.files = data.files
		input.dispatchEvent(new Event('change', { bubbles: true }))
		return input
	}
</script>

<!-- The button is named by its label; the files chosen come back, and the same file can be chosen again -->
<Story
	name="Default"
	play={async ({ canvasElement, args }) => {
		const canvas = canvasOf(canvasElement)
		await expect(canvas.getByRole('button', { name: 'Attach files' })).toBeEnabled()
		const file = new File(['1234'], 'basket.png', { type: 'image/png' })
		const input = choose(canvasElement, [file])
		await expect(args.onfiles).toHaveBeenCalledWith([file])
		await expect(input.value).toBe('')
		choose(canvasElement, [file])
		await expect(args.onfiles).toHaveBeenCalledTimes(2)
	}}
/>

<!-- The picker offers only what the app takes, one file at a time -->
<Story
	name="Filtered"
	args={{ accept: ['image/*', '.pdf'], multiple: false, size: 'sm' }}
	play={async ({ canvasElement }) => {
		const input = canvasElement.querySelector<HTMLInputElement>('input[type="file"]')!
		await expect(input).toHaveAttribute('accept', 'image/*,.pdf')
		await expect(input.multiple).toBe(false)
	}}
/>

<Story
	name="Disabled"
	args={{ disabled: true }}
	play={async ({ canvasElement }) => {
		await expect(canvasOf(canvasElement).getByRole('button', { name: 'Attach files' })).toBeDisabled()
	}}
/>
