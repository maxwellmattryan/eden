<script module lang="ts">
	import { tick } from 'svelte'
	import { defineMeta } from '@storybook/addon-svelte-csf'
	import { expect, fn } from 'storybook/test'
	import { hasCanvas } from '../../../storybook/play.js'
	import { defaultStrings } from '$lib/i18n/strings.js'
	import Composer from '../Composer/Composer.svelte'
	import Dropzone from './Dropzone.svelte'

	const s = defaultStrings.dropzone

	const { Story } = defineMeta({
		title: 'Components/Files/Dropzone',
		component: Dropzone,
		tags: ['autodocs'],
		parameters: {
			// dragging a file is a desktop gesture
			platforms: ['desktop'],
			docs: {
				description: {
					component:
						'A region that takes dropped files. While files are dragged over it, a light wash of the accent covers the whole region and a card says how many files are held and of what kinds, as far as the engine tells before the drop. A drag it could not take reads as a refusal on a plain ink wash. On the drop the files are held to the rules (types, count, size) and `ondrop` gets the ones taken and the ones refused, each with its reason. The wash is for the pointer alone: pair the zone with a `FileButton`.',
				},
			},
		},
		args: { ondrop: fn() },
	})

	const png = () => new File(['12345678'], 'basket.png', { type: 'image/png' })
	const jpg = () => new File(['1234'], 'receipt.jpg', { type: 'image/jpeg' })
	const pdf = () => new File(['123456'], 'manual.pdf', { type: 'application/pdf' })
	const video = () => new File(['12'], 'clip.mp4', { type: 'video/mp4' })

	/** The zone and its wash in the story's canvas. */
	function zoneOf(canvasElement: HTMLElement) {
		const zone = canvasElement.querySelector<HTMLElement>('.ed-canvas .ed-dropzone')!
		return { zone, veil: zone.querySelector<HTMLElement>('.ed-dropzone-veil')! }
	}

	/**
	 * A drag event as the engine would send it, carrying the files. A scripted DataTransfer keeps its items to itself
	 * until the drop, which a real drag does not, so the event carries a stand-in with what the zone reads.
	 */
	async function drag(type: 'dragenter' | 'dragover' | 'dragleave' | 'drop', target: HTMLElement, files: File[]) {
		const event = new DragEvent(type, { bubbles: true, cancelable: true })
		const dataTransfer = {
			types: ['Files'],
			items: files.map((file) => ({ kind: 'file', type: file.type })),
			files,
			dropEffect: 'none',
		}
		Object.defineProperty(event, 'dataTransfer', { value: dataTransfer })
		target.dispatchEvent(event)
		// the wash follows the state on the next flush
		await tick()
		return event
	}
</script>

{#snippet template(args: import('svelte').ComponentProps<typeof Dropzone>)}
	{@const { children: _, ...rules } = args}
	<Dropzone {...rules} style="display: flex; flex-direction: column; justify-content: flex-end; height: 320px;">
		<Composer label="Ask the Gardener" placeholder="Ask the Gardener" onsend={() => {}} />
	</Dropzone>
{/snippet}

<!-- At rest the zone shows only what it covers; a drag over it shows the wash, a drop hands over the files -->
<Story
	name="Default"
	{template}
	play={async ({ canvasElement, args }) => {
		if (!hasCanvas(canvasElement)) return
		const { zone, veil } = zoneOf(canvasElement)
		await expect(veil).not.toHaveClass('ed-dropzone-over')
		const files = [png(), jpg(), pdf()]
		const enter = await drag('dragenter', zone, files)
		await expect(enter.defaultPrevented).toBe(true)
		await expect(veil).toHaveClass('ed-dropzone-over')
		await expect(veil).toHaveTextContent(s.drop(3))
		await expect(veil).toHaveTextContent(`${s.groups.image(2)} · ${s.groups.pdf(1)}`)
		// crossing into a child and back out of it is not leaving the zone
		const field = zone.querySelector('textarea')!
		await drag('dragenter', field, files)
		await drag('dragleave', field, files)
		await expect(veil).toHaveClass('ed-dropzone-over')
		await drag('drop', zone, files)
		await expect(veil).not.toHaveClass('ed-dropzone-over')
		await expect(args.ondrop).toHaveBeenCalledWith(files, [])
	}}
/>

<!-- The wash and its card, held open: two images and a PDF over the zone -->
<Story
	name="Dragging over"
	{template}
	play={async ({ canvasElement }) => {
		if (!hasCanvas(canvasElement)) return
		const { zone, veil } = zoneOf(canvasElement)
		await drag('dragenter', zone, [png(), jpg(), pdf()])
		await expect(veil).toHaveClass('ed-dropzone-over')
	}}
/>

<!-- Leaving the zone takes the wash away and nothing is dropped -->
<Story
	name="Leaving"
	{template}
	play={async ({ canvasElement, args }) => {
		if (!hasCanvas(canvasElement)) return
		const { zone, veil } = zoneOf(canvasElement)
		await drag('dragenter', zone, [png()])
		await expect(veil).toHaveTextContent(s.drop(1))
		await drag('dragleave', zone, [png()])
		await expect(veil).not.toHaveClass('ed-dropzone-over')
		await expect(args.ondrop).not.toHaveBeenCalled()
	}}
/>

<!-- More files than there is room for: the refusal shows before the drop, and the drop takes what fits -->
<Story
	name="Too many"
	{template}
	args={{ maxFiles: 3, count: 1 }}
	play={async ({ canvasElement, args }) => {
		if (!hasCanvas(canvasElement)) return
		const { zone, veil } = zoneOf(canvasElement)
		const files = [png(), jpg(), pdf()]
		await drag('dragenter', zone, files)
		await expect(veil).toHaveClass('ed-dropzone-refused')
		await expect(veil).toHaveTextContent(s.tooMany(3))
		await drag('drop', zone, files)
		await expect(args.ondrop).toHaveBeenCalledWith([files[0], files[1]], [{ file: files[2], reason: 'count' }])
	}}
/>

<!-- Nothing in the drag is of a type the zone takes -->
<Story
	name="Not accepted"
	{template}
	args={{ accept: ['image/*', 'application/pdf', '.md'] }}
	play={async ({ canvasElement, args }) => {
		if (!hasCanvas(canvasElement)) return
		const { zone, veil } = zoneOf(canvasElement)
		const files = [video()]
		await drag('dragenter', zone, files)
		await expect(veil).toHaveClass('ed-dropzone-refused')
		await expect(veil).toHaveTextContent(s.notAccepted)
		await drag('drop', zone, files)
		await expect(args.ondrop).toHaveBeenCalledWith([], [{ file: files[0], reason: 'type' }])
	}}
/>

<!-- A size is only known at the drop: the wash welcomes the drag, the drop refuses the file that is too large -->
<Story
	name="Too large"
	{template}
	args={{ maxSize: 6, exclude: ['image/jpeg'] }}
	play={async ({ canvasElement, args }) => {
		if (!hasCanvas(canvasElement)) return
		const { zone, veil } = zoneOf(canvasElement)
		const files = [png(), jpg(), pdf()]
		await drag('dragenter', zone, files)
		await expect(veil).not.toHaveClass('ed-dropzone-refused')
		await drag('drop', zone, files)
		await expect(args.ondrop).toHaveBeenCalledWith(
			[files[2]],
			[
				{ file: files[0], reason: 'size' },
				{ file: files[1], reason: 'type' },
			]
		)
	}}
/>

<!-- Off: the drag passes as if the zone were not there, and the drop is left to the page -->
<Story
	name="Disabled"
	{template}
	args={{ disabled: true }}
	play={async ({ canvasElement, args }) => {
		if (!hasCanvas(canvasElement)) return
		const { zone, veil } = zoneOf(canvasElement)
		const enter = await drag('dragenter', zone, [png()])
		await expect(enter.defaultPrevented).toBe(false)
		await expect(veil).not.toHaveClass('ed-dropzone-over')
		const drop = await drag('drop', zone, [png()])
		await expect(drop.defaultPrevented).toBe(false)
		await expect(args.ondrop).not.toHaveBeenCalled()
	}}
/>

<!-- A drag of text is not the zone's: it reaches the field beneath untouched -->
<Story
	name="Text drag"
	{template}
	play={async ({ canvasElement, args }) => {
		if (!hasCanvas(canvasElement)) return
		const { zone, veil } = zoneOf(canvasElement)
		const data = new DataTransfer()
		data.setData('text/plain', 'spinach')
		const enter = new DragEvent('dragenter', { dataTransfer: data, bubbles: true, cancelable: true })
		zone.dispatchEvent(enter)
		await tick()
		await expect(enter.defaultPrevented).toBe(false)
		await expect(veil).not.toHaveClass('ed-dropzone-over')
		zone.dispatchEvent(new DragEvent('drop', { dataTransfer: data, bubbles: true, cancelable: true }))
		await expect(args.ondrop).not.toHaveBeenCalled()
	}}
/>
