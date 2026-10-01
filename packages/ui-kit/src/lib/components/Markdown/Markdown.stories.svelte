<script module lang="ts">
	import type { ComponentProps } from 'svelte'
	import { defineMeta } from '@storybook/addon-svelte-csf'
	import { expect, fn, waitFor } from 'storybook/test'
	import { canvasOf } from '../../../storybook/play.js'
	import { recipes } from '../../../stories/sample-data.js'
	import Markdown from './Markdown.svelte'

	const [salmon, tacos, soba] = recipes
	const prose = `Two you can cook **tonight**. The salmon first: the spinach expires *tomorrow*.`
	const full = [
		'## Tonight',
		prose,
		`1. ${salmon.name}, ${salmon.minutes} min\n2. ${soba.name}, ${soba.minutes} min\n   - nothing here contains nuts or shellfish`,
		'- [x] spinach\n- [ ] miso paste',
		'> Small, daily, enough.',
		`| Recipe | Minutes |\n| :-- | --: |\n| ${salmon.name} | ${salmon.minutes} |\n| ${tacos.name} | ${tacos.minutes} |`,
		'Set the oven with `bake 220` and keep the note:',
		'```text\nglaze: 2 tbsp miso, 1 tbsp mirin\n```',
		'More at [the recipe source](https://example.com/miso-salmon).',
	].join('\n\n')
	const fence = 'Here is the glaze:\n\n```text\nglaze: 2 tbsp miso'

	const { Story } = defineMeta({
		title: 'Components/Data/Markdown',
		component: Markdown,
		tags: ['autodocs'],
		args: { source: full, voice: false, onlink: fn() },
	})
</script>

<script lang="ts">
	let streamed = $state('')
</script>

{#snippet template(args: ComponentProps<typeof Markdown>)}
	<div class="col"><Markdown {...args} /></div>
{/snippet}

<!-- Everything the kit draws: a heading, emphasis, lists and tasks, a quote, a table, code and a link the app opens -->
<Story
	name="Everything"
	{template}
	play={async ({ canvasElement, userEvent, args }) => {
		const canvas = canvasOf(canvasElement)
		await expect(canvas.getAllByRole('heading', { name: 'Tonight' })[0]).toBeInTheDocument()
		await expect(canvas.getAllByText('tonight')[0]!.tagName).toBe('STRONG')
		await expect(canvas.getAllByRole('table')[0]).toBeInTheDocument()
		await userEvent.click(canvas.getAllByRole('link', { name: 'the recipe source' })[0]!)
		await expect(args.onlink).toHaveBeenCalledWith('https://example.com/miso-salmon')
	}}
/>

<!-- Prose in the Gardener's voice -->
<Story name="Voice" args={{ source: prose, voice: true }} {template} />

<!-- Raw HTML in the source is text: nothing a reply says becomes markup -->
<Story
	name="Raw HTML stays text"
	args={{ source: 'A reply with <b>tags</b> and <img src=x onerror=alert(1)> in it.' }}
	{template}
	play={async ({ canvasElement }) => {
		const canvas = canvasOf(canvasElement)
		await expect(canvas.getAllByText(/<b>tags<\/b>/)[0]).toBeInTheDocument()
		await expect(canvasElement.querySelector('.col img, .col b')).toBeNull()
	}}
/>

<!-- Streams: the source grows and a fence that has not closed yet is already a code block -->
<Story
	name="Streaming"
	play={async ({ canvasElement }) => {
		streamed = ''
		for (const word of fence.split(/(?<= )/)) {
			streamed += word
			await new Promise((resolve) => setTimeout(resolve, 25))
		}
		await waitFor(() => expect(canvasElement.querySelector('pre')).toHaveTextContent('glaze: 2 tbsp miso'))
	}}
>
	{#snippet template()}
		<div class="col"><Markdown source={streamed} voice /></div>
	{/snippet}
</Story>

<style>
	.col {
		display: flex;
		flex-direction: column;
		max-width: calc(var(--sheet-max) * 0.6);
	}
</style>
