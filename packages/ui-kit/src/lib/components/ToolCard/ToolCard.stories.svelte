<script module lang="ts">
	import type { ComponentProps } from 'svelte'
	import { defineMeta } from '@storybook/addon-svelte-csf'
	import { expect, fn } from 'storybook/test'
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
			state: { control: 'inline-radio', options: ['pending', 'done', 'cancelled'] },
		},
	})

	/** read and write-draft cards never carry buttons. */
	const noButtons = async ({ canvasElement }: { canvasElement: HTMLElement }) => {
		await expect(canvasOf(canvasElement).queryAllByRole('button')).toHaveLength(0)
	}
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

<!-- write: the confirm inline, the payload in full, the honey button repeating the verb; confirming settles the card -->
<Story
	name="Write"
	{template}
	play={async ({ canvasElement, userEvent, args }) => {
		const canvas = canvasOf(canvasElement)
		await userEvent.click(canvas.getAllByRole('button', { name: event.confirm })[0]!)
		await expect(args.onconfirm).toHaveBeenCalledTimes(1)
		await expect(canvas.getByText(s.gardener.confirmed(event.confirm))).toBeInTheDocument()
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

<!-- Settled: the ground has faded to the card ground, the check in the accent, the result in caption -->
<Story name="Confirmed" args={{ state: 'done' }} {template} />

<!-- Cancelled: the tint stays, the buttons are gone, and the card says nothing changed -->
<Story name="Cancelled" args={{ state: 'cancelled' }} {template} />

<style>
	.col {
		display: flex;
		flex-direction: column;
		max-width: calc(var(--sheet-max) * 0.6);
	}
</style>
