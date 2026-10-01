<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf'
	import { expect, fn } from 'storybook/test'
	import { canvasOf } from '../../../storybook/play.js'
	import Button from './Button.svelte'
	import { iconNames } from '$lib/icons/icons.js'

	const { Story } = defineMeta({
		title: 'Components/Actions/Button',
		component: Button,
		tags: ['autodocs'],
		args: { label: 'Add', variant: 'secondary', size: 'auto', disabled: false, onclick: fn() },
		argTypes: {
			variant: { control: 'select', options: ['primary', 'secondary', 'quiet', 'danger', 'ai', 'honey'] },
			size: { control: 'inline-radio', options: ['md', 'lg', 'auto'] },
			icon: { control: 'select', options: iconNames },
			iconRight: { control: 'select', options: iconNames },
		},
	})
</script>

<!-- All six variants; every one hovers by the same ink wash over its own colour. Plays query the first rendering, since the
	side-by-side frame renders a story once per platform. -->
<Story
	name="Variants"
	play={async ({ canvasElement, userEvent, args }) => {
		const canvas = canvasOf(canvasElement)
		await userEvent.click(canvas.getAllByRole('button', { name: 'Capture a haul' })[0]!)
		await expect(args.onclick).toHaveBeenCalledTimes(1)
	}}
>
	{#snippet template(args)}
		<div class="row">
			<Button {...args} label="Capture a haul" variant="primary" />
			<Button {...args} label="Add" variant="secondary" />
			<Button {...args} label="Cook this" variant="quiet" />
			<Button {...args} label="Delete recipe" variant="danger" />
			<Button {...args} label="Accept" variant="ai" />
			<Button {...args} label="Send to Google" variant="honey" iconRight="arrow-up-right" />
		</div>
	{/snippet}
</Story>

<!-- md is always 32, lg always 44; auto is 32 on desktop and 44 on mobile, so the two frames differ -->
<Story
	name="Sizes"
	play={async ({ canvasElement, userEvent, args }) => {
		const canvas = canvasOf(canvasElement)
		const [first] = canvas.getAllByRole('button')
		await userEvent.click(first!)
		await expect(args.onclick).toHaveBeenCalledTimes(1)
	}}
>
	{#snippet template(args)}
		<div class="row">
			<Button {...args} label="Medium" size="md" variant="primary" />
			<Button {...args} label="Large" size="lg" variant="primary" />
			<Button {...args} label="Auto" size="auto" variant="primary" />
		</div>
	{/snippet}
</Story>

<Story name="Icon only" args={{ label: undefined, 'aria-label': 'Quick Log', icon: 'plus', variant: 'primary' }} />

<Story name="Disabled" args={{ label: 'Send to Google', iconRight: 'arrow-up-right', disabled: true }} />

<!-- An action row (D-96): every button carries a leading glyph, and the destructive one is danger, last -->
<Story name="Action row">
	{#snippet template(args)}
		<div class="row">
			<Button {...args} label="Edit" icon="pencil" />
			<Button {...args} label="Add to grocery" icon="plus" />
			<Button {...args} label="Delete" icon="trash" variant="danger" />
		</div>
	{/snippet}
</Story>

<Story name="With icons">
	{#snippet template(args)}
		<div class="row">
			<Button {...args} label="Start" icon="sunrise" variant="primary" />
			<Button {...args} label="Send to Google" iconRight="arrow-up-right" variant="honey" />
			<Button {...args} label="Sync now" icon="refresh-cw" variant="quiet" />
		</div>
	{/snippet}
</Story>

<!-- Enter and Space both activate a focused button -->
<Story
	name="Keyboard"
	args={{ label: 'Add' }}
	play={async ({ canvasElement, userEvent, args }) => {
		const canvas = canvasOf(canvasElement)
		await userEvent.tab()
		await expect(canvas.getAllByRole('button', { name: 'Add' })[0]!).toHaveFocus()
		await userEvent.keyboard('{Enter}')
		await userEvent.keyboard(' ')
		await expect(args.onclick).toHaveBeenCalledTimes(2)
	}}
/>

<Story name="Relief: flat and raised" parameters={{ platforms: ['desktop'] }}>
	{#snippet template()}
		<div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-8)">
			{#each ['flat', 'raised'] as relief (relief)}
				<section data-relief={relief} style="display: flex; flex-direction: column; gap: var(--space-4)">
					<h3 class="ed-t-title-sm" style="margin: 0; color: var(--text-secondary)">data-relief="{relief}"</h3>
					<div style="display: flex; gap: var(--space-2); flex-wrap: wrap; align-items: center">
						<Button label="Capture a haul" variant="primary" />
						<Button label="Delete recipe" variant="danger" />
						<Button label="Ask the Gardener" variant="ai" />
						<Button label="Create event" variant="honey" />
						<Button label="Cancel" />
						<Button label="Undo" variant="quiet" />
					</div>
					<p class="ed-t-body-sm" style="margin: 0; color: var(--text-secondary)">
						Raised gives a filled button its sheen and inner highlight; flat leaves the plain fill. Both press the same
						way.
					</p>
				</section>
			{/each}
		</div>
	{/snippet}
</Story>

<style>
	.row {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-3);
	}
</style>
