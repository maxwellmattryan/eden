<script module lang="ts">
	import type { ComponentProps } from 'svelte'
	import { defineMeta } from '@storybook/addon-svelte-csf'
	import { expect, fn, waitFor } from 'storybook/test'
	import { canvasOf } from '../../../storybook/play.js'
	import { recipes } from '../../../stories/sample-data.js'
	import ToolCard from '../ToolCard/ToolCard.svelte'
	import GardenerMessage from './GardenerMessage.svelte'
	import Thread from './Thread.svelte'

	const [salmon, , soba] = recipes
	const question = 'What can I cook tonight?'
	const opening =
		'From your stock and three recipes, here are two you can cook tonight. The salmon first: the spinach expires tomorrow.'
	const reply: string[] = [
		opening,
		`${salmon.name} · ${salmon.minutes} min. ${soba.name} · ${soba.minutes} min. Nothing here contains nuts or shellfish.`,
	]
	const followUp = 'The salmon, then. Put it on the calendar for 18:30.'
	const onconfirm = fn()
	const oncancel = fn()

	const { Story } = defineMeta({
		title: 'Components/Gardener/GardenerMessage',
		component: GardenerMessage,
		tags: ['autodocs'],
		args: { text: reply, owner: false },
	})
</script>

<script lang="ts">
	let streamed = $state('')
</script>

{#snippet template(args: ComponentProps<typeof GardenerMessage>)}
	<div class="col"><GardenerMessage {...args} /></div>
{/snippet}

<!-- The Gardener speaking: its name in ai on ai-muted, the body in the voice and text-primary -->
<Story name="Reply" {template} />

<!-- The owner's own words: surface-2, aligned to the end, no name -->
<Story name="Owner" args={{ owner: true, text: question }} {template} />

<!-- A tool card inside the reply: the Gardener acting (honey) inside the Gardener speaking (green) -->
<Story name="With a tool card" args={{ text: 'I can move the workout before the showers. Here is the event.' }}>
	{#snippet template(args)}
		<div class="col">
			<GardenerMessage {...args}>
				<ToolCard
					name="create-event"
					access="write"
					text="Move the workout before the showers."
					payload="workout-session · Wed 09-30 07:00 · Castle Hill Fitness"
					confirm="Create event"
					{onconfirm}
					{oncancel}
				/>
			</GardenerMessage>
		</div>
	{/snippet}
</Story>

<!-- Replies stream: the play appends the reply a word at a time and the bubble grows in place -->
<Story
	name="Streaming"
	play={async ({ canvasElement }) => {
		const canvas = canvasOf(canvasElement)
		streamed = ''
		for (const word of opening.split(' ')) {
			streamed = streamed ? `${streamed} ${word}` : word
			await new Promise((resolve) => setTimeout(resolve, 25))
		}
		await waitFor(() => expect(canvas.getByText(opening)).toBeInTheDocument())
	}}
>
	{#snippet template()}
		<div class="col"><GardenerMessage text={streamed} /></div>
	{/snippet}
</Story>

<!-- Thread lays the messages out: a log, space-3 apart, the owner's at the end, a comfortable measure wide -->
<Story name="A thread">
	{#snippet template()}
		<Thread>
			<GardenerMessage owner text={question} />
			<GardenerMessage text={reply} />
			<GardenerMessage owner text={followUp} />
		</Thread>
	{/snippet}
</Story>

<style>
	.col {
		display: flex;
		flex-direction: column;
		max-width: calc(var(--sheet-max) * 0.6);
	}
</style>
