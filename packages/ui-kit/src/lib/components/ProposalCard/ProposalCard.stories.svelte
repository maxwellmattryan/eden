<script module lang="ts">
	import type { ComponentProps } from 'svelte'
	import { defineMeta } from '@storybook/addon-svelte-csf'
	import { expect, fn } from 'storybook/test'
	import { canvasOf } from '../../../storybook/play.js'
	import { defaultStrings } from '$lib/i18n/strings.js'
	import ProposalCard from './ProposalCard.svelte'

	const s = defaultStrings

	const { Story } = defineMeta({
		title: 'Components/Gardener/ProposalCard',
		component: ProposalCard,
		tags: ['autodocs'],
		args: {
			fact: 'disliked-ingredient',
			value: 'cilantro',
			text: 'I noticed you avoid cilantro. Save as a dislike?',
			state: 'pending',
			onaccept: fn(),
			ondismiss: fn(),
		},
		argTypes: { state: { control: 'inline-radio', options: ['pending', 'accepted', 'dismissed'] } },
	})
</script>

{#snippet template(args: ComponentProps<typeof ProposalCard>)}
	<div class="col"><ProposalCard {...args} /></div>
{/snippet}

<!-- Accept stores the fact as user-confirmed: the card says so, settles to the card ground and the Breeze plays once -->
<Story
	name="Pending"
	{template}
	play={async ({ canvasElement, userEvent, args }) => {
		const canvas = canvasOf(canvasElement)
		await userEvent.click(canvas.getAllByRole('button', { name: s.gardener.accept })[0]!)
		await expect(args.onaccept).toHaveBeenCalledTimes(1)
		await expect(args.ondismiss).not.toHaveBeenCalled()
		await expect(canvas.getByText(s.gardener.savedToProfile)).toBeInTheDocument()
		await expect(canvas.queryByRole('button', { name: s.gardener.accept })).toBeNull()
	}}
/>

<Story name="Accepted" args={{ state: 'accepted' }} {template} />

<!-- a correction: the quiet line says what accepting takes the place of, and the day the fact holds until -->
<Story
	name="Replaces"
	args={{
		fact: 'dietary-preference',
		value: 'pescatarian',
		text: 'You said you eat fish again until the trip. Change your diet?',
		detail: 'Replaces vegetarian · Until 2026-11-15',
	}}
	{template}
	play={async ({ canvasElement }) => {
		await expect(canvasOf(canvasElement).getAllByText('Replaces vegetarian · Until 2026-11-15')[0]).toBeInTheDocument()
	}}
/>

<!-- Dismissed leaves no trace: the tint stays, and the card says nothing was stored -->
<Story
	name="Dismissed"
	args={{ fact: 'cuisine-preference', value: 'Japanese, Mexican, Mediterranean', text: undefined, state: 'dismissed' }}
	{template}
/>

<style>
	.col {
		display: flex;
		flex-direction: column;
		max-width: calc(var(--sheet-max) * 0.6);
	}
</style>
