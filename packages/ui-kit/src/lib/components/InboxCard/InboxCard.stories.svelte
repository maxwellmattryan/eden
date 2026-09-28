<script module lang="ts">
	import type { ComponentProps } from 'svelte'
	import { defineMeta } from '@storybook/addon-svelte-csf'
	import { expect, fn } from 'storybook/test'
	import { canvasOf } from '../../../storybook/play.js'
	import { domainGlyph } from '$lib/icons/domain-glyphs.js'
	import { iconNames } from '$lib/icons/icons.js'
	import { inbox } from '../../../stories/sample-data.js'
	import InboxCard, { type InboxAction } from './InboxCard.svelte'

	/** The themed names of the domains the sample notifications come from (product/domains/README.md). */
	const NAMES = { kitchen: 'Hearth', weather: 'Sky', fitness: 'Vigor' } as const

	const [spinach, showers, pullA] = inbox

	/** Done, snooze, open: the first is what the line asks for. */
	const actions: InboxAction[] = [
		{ id: 'done', label: 'Done', icon: 'check', onclick: fn() },
		{ id: 'snooze', label: 'Snooze', icon: 'clock', onclick: fn() },
		{ id: 'open', label: 'Open', onclick: fn() },
	]

	const { Story } = defineMeta({
		title: 'Components/Feedback/InboxCard',
		component: InboxCard,
		tags: ['autodocs'],
		args: {
			icon: domainGlyph(spinach.domain),
			line: spinach.line,
			when: spinach.when,
			domain: NAMES[spinach.domain],
			unread: spinach.unread,
			actions: [],
		},
		argTypes: { icon: { control: 'select', options: iconNames } },
	})
</script>

{#snippet template(args: ComponentProps<typeof InboxCard>)}
	<div class="col"><InboxCard {...args} /></div>
{/snippet}

<!-- Unread: the accent dot, the raised ground, "Unread" in the accessible name; the line keeps the voice's one weight -->
<Story name="Unread" {template} />

<Story
	name="Read"
	args={{
		icon: domainGlyph(pullA.domain),
		line: pullA.line,
		when: pullA.when,
		domain: NAMES[pullA.domain],
		unread: false,
	}}
	{template}
/>

<!-- Quiet actions in a row, lined up with the text; the first is what the line asks for -->
<Story
	name="With actions"
	args={{ actions }}
	{template}
	play={async ({ canvasElement, userEvent, args }) => {
		const canvas = canvasOf(canvasElement)
		await userEvent.click(canvas.getAllByRole('button', { name: 'Done' })[0]!)
		await expect(args.actions?.[0]?.onclick).toHaveBeenCalledTimes(1)
		await expect(args.actions?.[1]?.onclick).not.toHaveBeenCalled()
	}}
/>

<!-- Two cards from the sample inbox, one unread and one read: the ground tells them apart -->
<Story name="Two cards">
	{#snippet template()}
		<div class="col">
			{#each [showers, pullA] as notice (notice.id)}
				<InboxCard
					icon={domainGlyph(notice.domain)}
					line={notice.line}
					when={notice.when}
					domain={NAMES[notice.domain]}
					unread={notice.unread}
					actions={[actions[1]!]}
				/>
			{/each}
		</div>
	{/snippet}
</Story>

<!-- On the phone the quiet actions take the 44 px touch target through the button's auto size -->
<Story name="Mobile" args={{ actions }} parameters={{ platforms: ['mobile'] }} {template} />

<style>
	.col {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		max-width: calc(var(--sheet-max) * 0.6);
	}
</style>
