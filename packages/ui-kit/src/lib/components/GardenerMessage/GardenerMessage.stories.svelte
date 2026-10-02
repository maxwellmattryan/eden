<script module lang="ts">
	import type { ComponentProps } from 'svelte'
	import { defineMeta } from '@storybook/addon-svelte-csf'
	import { expect, fn, waitFor } from 'storybook/test'
	import { canvasOf } from '../../../storybook/play.js'
	import { canSee, recipes } from '../../../stories/sample-data.js'
	import Button from '../Button/Button.svelte'
	import CanSee from '../CanSee/CanSee.svelte'
	import Markdown from '../Markdown/Markdown.svelte'
	import ToolCard from '../ToolCard/ToolCard.svelte'
	import ToolRun from '../ToolCard/ToolRun.svelte'
	import GardenerMessage from './GardenerMessage.svelte'
	import Thread from './Thread.svelte'
	import { defaultStrings } from '$lib/i18n/strings.js'

	const [salmon, , soba] = recipes
	const question = 'What can I cook tonight?'
	const opening =
		'From your stock and three recipes, here are two you can cook tonight. The salmon first: the spinach expires tomorrow.'
	const reply: string[] = [
		opening,
		`${salmon.name} · ${salmon.minutes} min. ${soba.name} · ${soba.minutes} min. Nothing here contains nuts or shellfish.`,
	]
	const lookingUp = 'Let me look at the moon over the next weeks.'
	const moonAnswer = 'The next full moon is around Monday 26 October.'
	const followUp = 'The salmon, then. Put it on the calendar for 18:30.'
	const onconfirm = fn()
	const oncancel = fn()
	const oncopy = fn()
	const s = defaultStrings
	const sent = 'Wed 30 Sep, 18:04'
	const markdownReply = [
		'Two you can cook **tonight**:',
		`1. ${salmon.name}, ${salmon.minutes} min\n2. ${soba.name}, ${soba.minutes} min`,
		'Start the rice first with `rinse, 1:1.1`.',
	].join('\n\n')

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

<!-- In the order it happened: what it said first, the reads folded into one line, then the answer, all as children -->
<Story
	name="Text, tools, then text"
	args={{ text: undefined }}
	play={async ({ canvasElement }) => {
		const bubble = canvasElement.querySelector('.ed-msg-bubble')!
		const before = canvasOf(canvasElement).getByText(lookingUp)
		const after = canvasOf(canvasElement).getByText(moonAnswer)
		const run = bubble.querySelector('.ed-tool')!
		await expect(before.compareDocumentPosition(run) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
		await expect(run.compareDocumentPosition(after) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
	}}
>
	{#snippet template(args)}
		<div class="col">
			<GardenerMessage {...args}>
				<Markdown source={lookingUp} voice />
				<ToolRun heading="sun-and-moon × 2" status="done">
					<ToolCard name="sun-and-moon" access="read" payload="day: 2026-10-25" state="done" />
					<ToolCard name="sun-and-moon" access="read" payload="day: 2026-10-26" state="done" />
				</ToolRun>
				<Markdown source={moonAnswer} voice />
			</GardenerMessage>
		</div>
	{/snippet}
</Story>

<!-- The Gardener acting: a draft as its own message, honey instead of green, with its own header -->
<Story name="Honey" args={{ tone: 'honey', name: 'A task to add', icon: 'sparkles', text: 'Buy spinach · today' }}>
	{#snippet template(args)}
		<div class="col">
			<GardenerMessage {...args}>
				<div class="row">
					<Button variant="honey" label="Add task" onclick={onconfirm} />
					<Button variant="quiet" label="Discard" onclick={oncancel} />
				</div>
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

<!-- A reply in Markdown: the text is drawn with lists, emphasis and code, still in the voice -->
<Story
	name="Markdown reply"
	args={{ text: markdownReply, markdown: true }}
	{template}
	play={async ({ canvasElement }) => {
		const canvas = canvasOf(canvasElement)
		await expect(canvas.getAllByText('tonight')[0]!.tagName).toBe('STRONG')
		await expect(canvas.getAllByRole('listitem').length).toBeGreaterThan(1)
	}}
/>

<!-- Under the bubble: when it was received, and a copy glyph that turns to a check once the app has copied -->
<Story
	name="With time and copy"
	args={{ time: sent, oncopy }}
	{template}
	play={async ({ canvasElement, userEvent }) => {
		const canvas = canvasOf(canvasElement)
		await expect(canvas.getAllByText(s.gardener.receivedAt(sent))[0]).toBeInTheDocument()
		await userEvent.click(canvas.getAllByRole('button', { name: s.gardener.copyMessage })[0]!)
		await expect(oncopy).toHaveBeenCalled()
		await waitFor(() => expect(canvas.getAllByRole('button', { name: s.gardener.copied })[0]).toBeInTheDocument())
	}}
/>

<!-- The app's own glyph after the copy glyph: the eye that says what this reply read (D-149) -->
<Story
	name="With an action in the foot"
	args={{ time: sent, oncopy }}
	parameters={{ platformFrame: 'inline' }}
	play={async ({ canvasElement, userEvent }) => {
		const canvas = canvasOf(canvasElement)
		const eye = canvas.getAllByRole('button', { name: s.gardener.canSee })[0]!
		await expect(canvas.getAllByRole('button', { name: s.gardener.copyMessage })[0]).toBeInTheDocument()
		await userEvent.click(eye)
		await waitFor(() => expect(canvas.getByRole('dialog', { name: s.gardener.canSeeTitle })).toBeVisible())
	}}
>
	{#snippet template(args)}
		<div class="col">
			<GardenerMessage {...args}>
				{#snippet actions()}
					<CanSee items={canSee} size="xs" />
				{/snippet}
			</GardenerMessage>
		</div>
	{/snippet}
</Story>

<!-- The owner's foot says when it was sent and sits at the end with its bubble -->
<Story
	name="Owner with time and copy"
	args={{ owner: true, text: question, time: sent, oncopy }}
	{template}
	play={async ({ canvasElement }) => {
		await expect(canvasOf(canvasElement).getAllByText(s.gardener.sentAt(sent))[0]).toBeInTheDocument()
	}}
/>

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
	.row {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
	}
	.col {
		display: flex;
		flex-direction: column;
		max-width: calc(var(--sheet-max) * 0.6);
	}
</style>
