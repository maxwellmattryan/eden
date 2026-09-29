<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf'
	import Button from '../Button/Button.svelte'
	import { expect, waitFor } from 'storybook/test'
	import { canvasOf } from '../../../storybook/play.js'
	import SkyGlyph, { CONDITIONS } from './SkyGlyph.svelte'
	import { skyWeek } from '../../../stories/sample-data.js'

	const { Story } = defineMeta({
		title: 'Components/Brand/SkyGlyph',
		component: SkyGlyph,
		tags: ['autodocs'],
		args: { condition: 'partly-cloudy', night: false, size: 'lg' },
		argTypes: {
			condition: { control: 'select', options: [...CONDITIONS] },
			size: { control: 'inline-radio', options: ['sm', 'md', 'lg'] },
		},
	})
</script>

<script lang="ts">
	let day = $state(0)
	const current = $derived(skyWeek[day] ?? skyWeek[0]!)
</script>

<!-- Every condition by day and by night, the condition's id under each. -->
<Story name="All conditions">
	{#snippet template(args)}
		<ul style="display: flex; flex-wrap: wrap; gap: var(--space-4); list-style: none; margin: 0; padding: 0">
			{#each CONDITIONS as condition (condition)}
				<li style="display: flex; flex-direction: column; align-items: center; gap: var(--space-2)">
					<SkyGlyph {...args} {condition} night={false} />
					<SkyGlyph {...args} {condition} night />
					<span style="font: var(--ed-t-caption); color: var(--text-secondary)">{condition}</span>
				</li>
			{/each}
		</ul>
	{/snippet}
</Story>

<!-- The glyph follows the week from the sample forecast; the swap crossfades through Icon. -->
<Story
	name="Live"
	play={async ({ canvasElement, userEvent }) => {
		const canvas = canvasOf(canvasElement)
		const [button] = canvas.getAllByRole('button')
		await userEvent.click(button!)
		await waitFor(() => expect(canvas.getAllByRole('img')[0]).toHaveAccessibleName('Partly cloudy'))
	}}
>
	{#snippet template(args)}
		<div style="display: flex; align-items: center; gap: var(--space-3); font: var(--ed-t-body)">
			<SkyGlyph {...args} condition={current.condition} />
			<span>{current.day} · {current.hi}° / {current.lo}°{current.note ? ` · ${current.note}` : ''}</span>
			<Button label="Next day" onclick={() => (day = (day + 1) % skyWeek.length)} />
		</div>
	{/snippet}
</Story>
