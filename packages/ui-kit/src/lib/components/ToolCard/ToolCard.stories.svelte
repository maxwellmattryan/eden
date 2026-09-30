<script module lang="ts">
	import type { ComponentProps } from 'svelte'
	import { defineMeta } from '@storybook/addon-svelte-csf'
	import { expect, fn, waitFor } from 'storybook/test'
	import { canvasOf } from '../../../storybook/play.js'
	import { defaultStrings } from '$lib/i18n/strings.js'
	import { grocery } from '../../../stories/sample-data.js'
	import ToolCard from './ToolCard.svelte'

	const s = defaultStrings
	const event = {
		name: 'create-event',
		access: 'write',
		text: 'Move the workout before the showers.',
		payload: 'workout-session · Wed 09-30 07:00 · Castle Hill Fitness',
		confirm: 'Create event',
	} as const
	const push = {
		name: 'google-calendar.push',
		access: 'act-external',
		text: 'Send the shop-day event to Google “Work”.',
		payload: `${grocery.name} · ${grocery.shopDay}`,
		confirm: 'Send to Google',
	} as const

	const { Story } = defineMeta({
		title: 'Components/Gardener/ToolCard',
		component: ToolCard,
		tags: ['autodocs'],
		args: { ...event, state: 'pending', onconfirm: fn(), oncancel: fn() },
		argTypes: {
			access: { control: 'inline-radio', options: ['read', 'write-draft', 'write', 'act-external'] },
			state: { control: 'inline-radio', options: ['pending', 'running', 'done', 'failed', 'cancelled'] },
		},
	})

	/** read and write-draft cards never carry buttons. */
	const noButtons = async ({ canvasElement }: { canvasElement: HTMLElement }) => {
		await expect(canvasOf(canvasElement).queryAllByRole('button')).toHaveLength(0)
	}
	const read = {
		name: 'suggest-recipes',
		access: 'read',
		text: 'Read 22 stock items, 3 recipes, 2 allergies.',
		payload: undefined,
		confirm: undefined,
	} as const
</script>

<script lang="ts">
	let settling = $state<'running' | 'done'>('running')
</script>

{#snippet template(args: ComponentProps<typeof ToolCard>)}
	<div class="col"><ToolCard {...args} /></div>
{/snippet}

<!-- read: no badge, no buttons; the card only says what it read -->
<Story
	name="Read"
	args={{
		name: 'suggest-recipes',
		access: 'read',
		text: 'Read 22 stock items, 3 recipes, 2 allergies.',
		payload: undefined,
		confirm: undefined,
	}}
	{template}
	play={noButtons}
/>

<!-- write-draft: the pencil badge; the draft becomes a proposal card, so nothing to confirm here -->
<Story
	name="Write draft"
	args={{
		name: 'propose-fact',
		access: 'write-draft',
		text: 'Draft a dislike for cilantro, for you to accept or not.',
		payload: undefined,
		confirm: undefined,
	}}
	{template}
	play={noButtons}
/>

<!-- A draft that waits on the owner: the badge stays and a warning triangle says the card is not settled -->
<Story
	name="Draft waiting"
	args={{
		name: 'create-task',
		access: 'write-draft',
		text: undefined,
		payload: undefined,
		confirm: undefined,
		state: 'done',
		draft: 'pending',
	}}
	{template}
	play={async ({ canvasElement }) => {
		await expect(canvasOf(canvasElement).getAllByText(defaultStrings.gardener.toolWaiting)[0]).toBeInTheDocument()
	}}
/>

<!-- The draft kept: the badge is gone and the card is done -->
<Story
	name="Draft kept"
	args={{
		name: 'create-task',
		access: 'write-draft',
		text: undefined,
		payload: undefined,
		confirm: undefined,
		state: 'done',
		draft: 'committed',
	}}
	{template}
/>

<!-- The draft discarded: the badge is gone, a danger x, and the card says nothing changed -->
<Story
	name="Draft discarded"
	args={{
		name: 'create-task',
		access: 'write-draft',
		text: undefined,
		payload: undefined,
		confirm: undefined,
		state: 'done',
		draft: 'discarded',
	}}
	{template}
/>

<!-- write: the confirm inline, the payload in full, the honey button repeating the verb; confirming starts the run -->
<Story
	name="Write"
	{template}
	play={async ({ canvasElement, userEvent, args }) => {
		const canvas = canvasOf(canvasElement)
		await userEvent.click(canvas.getAllByRole('button', { name: event.confirm })[0]!)
		await expect(args.onconfirm).toHaveBeenCalledTimes(1)
		await expect(canvas.getAllByRole('status')[0]).toHaveTextContent(s.gardener.toolRunning)
		await expect(canvas.queryByRole('button', { name: event.confirm })).toBeNull()
	}}
/>

<!-- act-external: the arrow badge in warning; cancelling says that nothing changed -->
<Story
	name="Act external"
	args={{ ...push }}
	{template}
	play={async ({ canvasElement, userEvent, args }) => {
		const canvas = canvasOf(canvasElement)
		await userEvent.click(canvas.getAllByRole('button', { name: s.cancel })[0]!)
		await expect(args.oncancel).toHaveBeenCalledTimes(1)
		await expect(args.onconfirm).not.toHaveBeenCalled()
		await expect(canvas.getByText(s.gardener.cancelledNothingChanged)).toBeInTheDocument()
	}}
/>

<!-- With info: an xs glyph between the title and the badge hands its own element to the app, for a popover -->
<Story
	name="With info"
	args={{ oninfo: fn() }}
	{template}
	play={async ({ canvasElement, userEvent, args }) => {
		const canvas = canvasOf(canvasElement)
		const info = canvas.getAllByRole('button', { name: s.gardener.aboutTool })[0]!
		await userEvent.click(info)
		await expect(args.oninfo).toHaveBeenCalledTimes(1)
		await expect(args.oninfo).toHaveBeenCalledWith(expect.any(HTMLElement))
		await expect(args.oninfo).toHaveBeenCalledWith(info)
	}}
/>

<!-- Running: a spinner at the end of the title line while the tool works; no foot -->
<Story
	name="Running"
	args={{ ...read, state: 'running' }}
	{template}
	play={async ({ canvasElement }) => {
		await expect(canvasOf(canvasElement).getAllByRole('status')[0]).toHaveTextContent(s.gardener.toolRunning)
	}}
/>

<!-- Runs then settles: the spinner gives way to the success check with one Breeze, and the check stays -->
<Story
	name="Runs then settles"
	play={async ({ canvasElement }) => {
		const canvas = canvasOf(canvasElement)
		settling = 'running'
		await waitFor(() => expect(canvas.getAllByRole('status')[0]).toHaveTextContent(s.gardener.toolRunning))
		await new Promise((resolve) => setTimeout(resolve, 600))
		settling = 'done'
		await waitFor(() => expect(canvas.getAllByRole('status')[0]).toHaveTextContent(s.gardener.toolDone))
	}}
>
	{#snippet template()}
		<div class="col"><ToolCard {...read} state={settling} /></div>
	{/snippet}
</Story>

<!-- Settled: the ground has faded to the card ground and the success check sits where the spinner was; no "Done" line -->
<Story
	name="Confirmed"
	args={{ state: 'done' }}
	{template}
	play={async ({ canvasElement }) => {
		const canvas = canvasOf(canvasElement)
		await expect(canvas.getAllByRole('status')[0]).toHaveTextContent(s.gardener.toolDone)
		await expect(canvas.queryByRole('button', { name: event.confirm })).toBeNull()
	}}
/>

<!-- Failed: a danger x with no Breeze, the tint stays, and the body says what went wrong -->
<Story
	name="Failed"
	args={{ ...read, state: 'failed', text: 'The recipe store did not answer.' }}
	{template}
	play={async ({ canvasElement }) => {
		await expect(canvasOf(canvasElement).getAllByRole('status')[0]).toHaveTextContent(s.gardener.toolFailed)
	}}
/>

<!-- Cancelled: the tint stays, the buttons are gone, a danger x, and the card says nothing changed -->
<Story name="Cancelled" args={{ state: 'cancelled' }} {template} />

<style>
	.col {
		display: flex;
		flex-direction: column;
		max-width: calc(var(--sheet-max) * 0.6);
	}
</style>
