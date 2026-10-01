<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf'
	import { expect, fn } from 'storybook/test'
	import { canvasOf } from '../../../storybook/play.js'
	import IconButton from './IconButton.svelte'
	import { iconNames } from '$lib/icons/icons.js'
	import { inbox } from '../../../stories/sample-data.js'

	const unread = inbox.filter((n) => n.unread).length

	const { Story } = defineMeta({
		title: 'Components/Actions/IconButton',
		component: IconButton,
		tags: ['autodocs'],
		args: { icon: 'bell', label: 'Inbox', size: 'md', onclick: fn() },
		argTypes: {
			icon: { control: 'select', options: iconNames },
			size: { control: 'inline-radio', options: ['sm', 'md'] },
		},
	})
</script>

<Story
	name="Default"
	play={async ({ canvasElement, userEvent, args }) => {
		const canvas = canvasOf(canvasElement)
		await userEvent.click(canvas.getAllByRole('button', { name: 'Inbox' })[0]!)
		await expect(args.onclick).toHaveBeenCalledTimes(1)
	}}
/>

<!-- The count is a visual badge; the accessible name carries it as words -->
<Story
	name="With count"
	args={{ count: unread }}
	play={async ({ canvasElement }) => {
		const canvas = canvasOf(canvasElement)
		await expect(canvas.getAllByRole('button', { name: `Inbox, ${unread} unread` })[0]!).toBeInTheDocument()
	}}
/>

<Story name="Fab" args={{ icon: 'plus', label: 'Quick Log', fab: true }} parameters={{ platforms: ['mobile'] }} />

<!-- A filled rounded square at its size: the composer's send button on the Gardener's green, or an accent fill -->
<Story name="Filled">
	{#snippet template(args)}
		<div class="row">
			<IconButton {...args} icon="corner-down-left" label="Send" fill="ai" />
			<IconButton {...args} icon="square" label="Stop" fill="ai" size="sm" />
			<IconButton {...args} icon="plus" label="Add" fill="brand" />
			<IconButton {...args} icon="corner-down-left" label="Send" fill="ai" disabled />
		</div>
	{/snippet}
</Story>

<!-- The pressed look while its popover is open; aria-expanded passes through -->
<Story name="Active" args={{ icon: 'sparkles', label: 'Gardener', active: true, 'aria-expanded': true }} />

<!-- A destructive action: the glyph in the danger ink -->
<Story name="Danger" args={{ icon: 'trash', label: 'Delete', danger: true }} />

<!-- A real toggle -->
<Story
	name="Pressed"
	args={{ icon: 'eye-off', label: 'Hide values', pressed: true }}
	play={async ({ canvasElement }) => {
		const canvas = canvasOf(canvasElement)
		await expect(canvas.getAllByRole('button', { name: 'Hide values' })[0]!).toHaveAttribute('aria-pressed', 'true')
	}}
/>

<!-- md follows the platform control; sm stays 28 for rows and the status bar; xs is a hint beside a label -->
<Story name="Sizes">
	{#snippet template(args)}
		<div class="row">
			<IconButton {...args} icon="info" label="About humidity" size="xs" />
			<IconButton {...args} icon="ellipsis" label="Actions" size="sm" />
			<IconButton {...args} icon="x" label="Remove" size="sm" />
			<IconButton {...args} icon="bell" label="Inbox" size="md" count={128} />
			<IconButton {...args} icon="plus" label="Quick Log" size="md" />
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
