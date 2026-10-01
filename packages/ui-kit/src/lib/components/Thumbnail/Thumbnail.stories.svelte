<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf'
	import { expect } from 'storybook/test'
	import Thumbnail from './Thumbnail.svelte'

	/** A stand-in for a picture, as a data URL: a story needs no binary asset, and the app's CSP has no blob:. */
	const picture =
		'data:image/svg+xml,' +
		encodeURIComponent(
			'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 4 4"><rect width="4" height="4" fill="#dcd8c8"/><circle cx="2" cy="2" r="1.2" fill="#7c8a7f"/></svg>'
		)

	const { Story } = defineMeta({
		title: 'Components/Data/Thumbnail',
		component: Thumbnail,
		tags: ['autodocs'],
		args: { size: 'sm', icon: 'store' },
		argTypes: { size: { control: 'inline-radio', options: ['sm', 'md'] } },
	})
</script>

<!-- The picture, square, decorative: the name beside it says what it is -->
<Story
	name="Picture"
	args={{ src: picture }}
	play={async ({ canvasElement }) => {
		const image = canvasElement.querySelector('img.ed-thumb')!
		await expect(image).toHaveAttribute('alt', '')
		await expect(image.getBoundingClientRect().width).toBe(image.getBoundingClientRect().height)
	}}
/>

<!-- No picture: the glyph on a tile of the same size -->
<Story
	name="Tile"
	play={async ({ canvasElement }) => {
		await expect(canvasElement.querySelector('img')).toBeNull()
		await expect(canvasElement.querySelector('.ed-thumb-tile svg')).not.toBeNull()
	}}
/>

<!-- md, beside a title -->
<Story name="Medium" args={{ size: 'md', src: picture }} />

<!-- md with no picture -->
<Story name="Medium tile" args={{ size: 'md' }} />
