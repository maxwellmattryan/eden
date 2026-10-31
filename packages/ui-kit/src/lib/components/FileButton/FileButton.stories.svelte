<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf'
	import { expect, fn, userEvent, waitFor } from 'storybook/test'
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

<!-- A file is one of several sources: the press opens a menu, the picker first, and a second press closes it -->
<Story
	name="With sources"
	args={{
		label: 'Choose a picture',
		icon: 'image-plus',
		accept: ['image/*'],
		multiple: false,
		sources: [{ id: 'link', label: 'From a link', icon: 'link', onselect: fn() }],
	}}
	parameters={{ platformFrame: 'inline' }}
	play={async ({ canvasElement, args }) => {
		const canvas = canvasOf(canvasElement)
		const button = canvas.getByRole('button', { name: 'Choose a picture' })
		await userEvent.click(button)
		await expect(button).toHaveAttribute('aria-expanded', 'true')
		// a popover menu on desktop, a bottom sheet on mobile: the same two rows either way
		await waitFor(() => expect(canvas.getByText('From a file')).toBeVisible())
		await userEvent.click(await canvas.findByText('From a link'))
		await waitFor(() => expect(args.sources?.[0]?.onselect).toHaveBeenCalled())
		await waitFor(() => expect(button).toHaveAttribute('aria-expanded', 'false'))
	}}
/>

<!-- With `camera`: on the phone the press opens a menu that leads with the camera, a second input with `capture`
     that opens it directly, then the picker; on desktop nothing changes and the press opens the picker -->
<Story
	name="Camera"
	args={{ label: 'Add a photo', icon: 'camera', accept: ['image/*'], camera: true }}
	play={async ({ canvasElement, args }) => {
		const scope = canvasElement.querySelector<HTMLElement>('.ed-canvas')
		if (!scope) return
		const canvas = canvasOf(canvasElement)
		const button = canvas.getByRole('button', { name: 'Add a photo' })
		const inputs = () => [...scope.querySelectorAll<HTMLInputElement>('input[type="file"]')]
		if (scope.closest('[data-platform]')?.getAttribute('data-platform') !== 'mobile') {
			await expect(button).not.toHaveAttribute('aria-haspopup')
			await expect(inputs()).toHaveLength(1)
			await expect(inputs()[0]).not.toHaveAttribute('capture')
			return
		}
		await expect(button).toHaveAttribute('aria-haspopup', 'menu')
		await expect(inputs()).toHaveLength(2)
		await expect(inputs()[0]).not.toHaveAttribute('capture')
		await expect(inputs()[1]).toHaveAttribute('capture', 'environment')
		await expect(inputs()[1]).toHaveAttribute('accept', 'image/*')
		await userEvent.click(button)
		await waitFor(() => expect(canvas.getByText('Take a photo')).toBeVisible())
		await expect(canvas.getByText('From the library or files')).toBeVisible()
		// the photo the camera hands back arrives like any picked file
		const photo = new File(['1234'], 'image.jpg', { type: 'image/jpeg' })
		const data = new DataTransfer()
		data.items.add(photo)
		inputs()[1]!.files = data.files
		inputs()[1]!.dispatchEvent(new Event('change', { bubbles: true }))
		await expect(args.onfiles).toHaveBeenLastCalledWith([photo])
	}}
/>

<Story
	name="Disabled"
	args={{ disabled: true }}
	play={async ({ canvasElement }) => {
		await expect(canvasOf(canvasElement).getByRole('button', { name: 'Attach files' })).toBeDisabled()
	}}
/>
