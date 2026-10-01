<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf'
	import { expect } from 'storybook/test'
	import { canvasOf } from '../../../storybook/play.js'
	import Greeting from './Greeting.svelte'
	import Composer from '../Composer/Composer.svelte'
	import { owner } from '../../../stories/sample-data.js'

	const [first] = owner.name.split(' ')

	const { Story } = defineMeta({
		title: 'Components/Gardener/Greeting',
		component: Greeting,
		tags: ['autodocs'],
		args: { text: `What's up, ${first}?`, name: first },
	})
</script>

<!-- The line of an empty conversation, the name in the owner's accent -->
<Story
	name="Default"
	play={async ({ canvasElement }) => {
		const canvas = canvasOf(canvasElement)
		await expect(canvas.getByText(first)).toHaveClass('ed-greeting-name')
	}}
/>

<!-- The app varies the line by the hour -->
<Story name="Morning" args={{ text: `Good morning, ${first}.` }} />

<!-- A locale puts the name where it writes it -->
<Story name="Name first" args={{ text: `${first}さん、こんばんは。` }} />

<!-- Before the owner has said what to call them -->
<Story name="No name" args={{ text: 'What needs tending?', name: undefined }} />

<Story
	name="Long name"
	args={{ text: 'Where shall we start, Maximiliana Featherstonehaugh?', name: 'Maximiliana Featherstonehaugh' }}
/>

<!-- The empty conversation: the greeting fills the space above the composer and centres in it -->
<Story name="Above the composer">
	{#snippet template(args)}
		<div
			style="display: flex; flex-direction: column; height: 420px; padding: var(--space-3); background: var(--surface-0)"
		>
			<Greeting {...args} />
			<Composer label="Ask the Gardener" placeholder="Ask the Gardener" />
		</div>
	{/snippet}
</Story>
