<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf'
	import { expect, fn, screen } from 'storybook/test'
	import { canvasOf } from '../../../storybook/play.js'
	import { sidebar } from '../../../stories/sample-data.js'
	import BackButton from './BackButton.svelte'

	const hearth = sidebar.items.find((item) => item.id === 'kitchen')!

	const { Story } = defineMeta({
		title: 'Components/Actions/BackButton',
		component: BackButton,
		tags: ['autodocs'],
		args: { onback: fn() },
		parameters: {
			docs: {
				description: {
					component:
						'The quiet back arrow at the top left of content. It renders only when `onback` is given, because the history stack then has somewhere to go; `breadcrumb` names the previous screen in a tooltip on hover and keyboard focus. Transparent at rest, an ink wash on hover, the focus ring on keyboard focus; the accessible name is "Back" unless `label` says otherwise.',
				},
			},
		},
	})
</script>

<Story
	name="Default"
	play={async ({ canvasElement, userEvent, args }) => {
		const canvas = canvasOf(canvasElement)
		await userEvent.tab()
		await expect(canvas.getAllByRole('button')[0]).toHaveFocus()
		await userEvent.keyboard('{Enter}')
		await expect(args.onback).toHaveBeenCalledTimes(1)
	}}
/>

<Story
	name="With breadcrumb"
	args={{ breadcrumb: hearth.name }}
	parameters={{ platformFrame: 'inline' }}
	play={async ({ canvasElement, userEvent }) => {
		const canvas = canvasOf(canvasElement)
		await userEvent.tab()
		const button = canvas.getAllByRole('button')[0]!
		await expect(button).toHaveFocus()
		const tip = await screen.findByRole('tooltip')
		await expect(tip).toHaveTextContent(hearth.name)
		await expect(button).toHaveAccessibleDescription(hearth.name)
	}}
/>

<Story
	name="Hidden"
	parameters={{
		docs: {
			description: {
				story:
					'Without `onback` there is nowhere to go back to, so nothing renders: no placeholder and no reserved space. The note below is the story’s, not the component’s.',
			},
		},
	}}
>
	{#snippet template()}
		<BackButton />
		<p class="sb-note">Nothing renders without <code>onback</code>.</p>
	{/snippet}
</Story>

<style>
	.sb-note {
		margin: 0;
		font: var(--ed-t-caption);
		color: var(--text-secondary);
	}
</style>
