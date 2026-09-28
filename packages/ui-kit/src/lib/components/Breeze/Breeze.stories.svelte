<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf'
	import Button from '../Button/Button.svelte'
	import { expect, fn, waitFor } from 'storybook/test'
	import { canvasOf } from '../../../storybook/play.js'
	import Breeze from './Breeze.svelte'
	import { feed } from '../../../stories/sample-data.js'

	const settled = feed[0]

	const { Story } = defineMeta({
		title: 'Components/Brand/Breeze',
		component: Breeze,
		tags: ['autodocs'],
		args: { count: 5, size: 28, onend: fn() },
		argTypes: {
			count: { control: { type: 'range', min: 1, max: 9, step: 1 } },
			size: { control: { type: 'range', min: 16, max: 64, step: 4 } },
		},
	})
</script>

<script lang="ts">
	let playing = $state(false)
	let played = $state(0)
</script>

<!-- One burst over a card that just settled; the parent unmounts the Breeze on onend. -->
<Story
	name="Once"
	play={async ({ canvasElement, userEvent, args }) => {
		const canvas = canvasOf(canvasElement)
		const [button] = canvas.getAllByRole('button')
		await userEvent.click(button!)
		await waitFor(() => expect(args.onend).toHaveBeenCalled(), { timeout: 3000 })
	}}
>
	{#snippet template(args)}
		<div style="display: flex; flex-direction: column; align-items: flex-start; gap: var(--space-3)">
			<div
				style="position: relative; padding: var(--space-3) var(--space-4); border: 1px solid var(--ed-card-border); border-radius: var(--ed-radius-card); background: var(--surface-1); font: var(--ed-t-body)"
			>
				{#if playing}
					<Breeze
						{...args}
						onend={() => {
							playing = false
							played += 1
							args.onend?.()
						}}
					/>
				{/if}
				{settled.line}
			</div>
			<Button label="Settle" onclick={() => (playing = true)} />
			<p style="margin: 0; font: var(--ed-t-caption); color: var(--text-secondary)">
				Played {played}
				{played === 1 ? 'time' : 'times'}. The Breeze is unmounted when it calls onend.
			</p>
		</div>
	{/snippet}
</Story>

<!-- base.css sets the breeze duration to 0 under prefers-reduced-motion; this story forces that value on a wrapper. -->
<Story
	name="Reduced motion"
	play={async ({ canvasElement, args }) => {
		await waitFor(() => expect(args.onend).toHaveBeenCalled())
		expect(canvasElement.querySelector('.ed-breeze')).toBeNull()
	}}
>
	{#snippet template(args)}
		<div
			style="--ed-duration-breeze: 0ms; display: flex; flex-direction: column; align-items: flex-start; gap: var(--space-3)"
		>
			<div
				style="position: relative; padding: var(--space-3) var(--space-4); border: 1px solid var(--ed-card-border); border-radius: var(--ed-radius-card); background: var(--surface-1); font: var(--ed-t-body)"
			>
				<Breeze {...args} />
				{settled.line}
			</div>
			<p style="margin: 0; font: var(--ed-t-caption); color: var(--text-secondary)">
				With the breeze duration at 0 ms (reduced motion) the Breeze renders nothing and calls onend at once.
			</p>
		</div>
	{/snippet}
</Story>
