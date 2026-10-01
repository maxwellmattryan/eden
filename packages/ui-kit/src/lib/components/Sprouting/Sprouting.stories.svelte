<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf'
	import { expect } from 'storybook/test'
	import { canvasOf } from '../../../storybook/play.js'
	import { defaultStrings } from '$lib/i18n/strings.js'
	import GardenerMessage from '../GardenerMessage/GardenerMessage.svelte'
	import ToolCard from '../ToolCard/ToolCard.svelte'
	import Sprouting from './Sprouting.svelte'

	const { Story } = defineMeta({
		title: 'Components/Gardener/Sprouting',
		component: Sprouting,
		tags: ['autodocs'],
		args: { size: 'sm' },
		argTypes: { size: { control: 'inline-radio', options: ['sm', 'md'] } },
	})
</script>

<!-- The sprout grows once per grow duration and says "Writing a reply" to a screen reader; it stands grown under reduced motion -->
<Story
	name="Default"
	play={async ({ canvasElement }) => {
		await expect(canvasOf(canvasElement).getAllByRole('status')[0]).toHaveTextContent(defaultStrings.gardener.writing)
	}}
/>

<!-- md, beside body text -->
<Story name="Medium" args={{ size: 'md' }} />

<!-- Where the panel shows it: alone in the Gardener's bubble, until the first words take its place -->
<Story name="In a bubble" args={{ size: 'md' }}>
	{#snippet template(args)}
		<GardenerMessage><Sprouting {...args} /></GardenerMessage>
	{/snippet}
</Story>

<!-- Between rounds: the tools are done and the answer has not begun, so the sprout follows the cards -->
<Story name="After tool cards" args={{ size: 'md' }}>
	{#snippet template(args)}
		<GardenerMessage text="Let me look at the moon over the next weeks.">
			<ToolCard name="sun-and-moon" access="read" state="done" />
			<Sprouting {...args} />
		</GardenerMessage>
	{/snippet}
</Story>
