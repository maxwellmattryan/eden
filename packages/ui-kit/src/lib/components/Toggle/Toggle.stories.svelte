<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf'
	import { expect, fn } from 'storybook/test'
	import { canvasOf } from '../../../storybook/play.js'
	import Toggle from './Toggle.svelte'

	const subtitles = 'Show subtitles in the sidebar'
	const compact = 'Compact rows'
	const grain = 'Paper grain'

	const { Story } = defineMeta({
		title: 'Components/Inputs/Toggle',
		component: Toggle,
		tags: ['autodocs'],
		args: { label: subtitles, checked: false, disabled: false, onchange: fn() },
	})
</script>

<Story
	name="On and off"
	play={async ({ canvasElement, userEvent, args }) => {
		const canvas = canvasOf(canvasElement)
		const off = canvas.getByRole('switch', { name: subtitles })
		const on = canvas.getByRole('switch', { name: compact })
		await expect(off).toHaveAttribute('aria-checked', 'false')
		await expect(on).toHaveAttribute('aria-checked', 'true')
		off.focus()
		await userEvent.keyboard(' ')
		await expect(off).toHaveAttribute('aria-checked', 'true')
		await expect(args.onchange).toHaveBeenLastCalledWith(true)
		await userEvent.keyboard(' ')
		await expect(off).toHaveAttribute('aria-checked', 'false')
		await expect(args.onchange).toHaveBeenLastCalledWith(false)
	}}
>
	{#snippet template(args)}
		<div style="display: grid; gap: var(--space-3); max-width: 360px">
			<Toggle {...args} />
			<Toggle label={compact} checked />
		</div>
	{/snippet}
</Story>

<Story
	name="Disabled"
	args={{ label: grain, description: 'Only at the lush brand level.', disabled: true, checked: true }}
	play={async ({ canvasElement, userEvent, args }) => {
		const canvas = canvasOf(canvasElement)
		const sw = canvas.getByRole('switch', { name: grain })
		await expect(sw).toBeDisabled()
		await userEvent.click(canvas.getByText(grain))
		await expect(sw).toHaveAttribute('aria-checked', 'true')
		await expect(args.onchange).not.toHaveBeenCalled()
	}}
/>

<Story
	name="In a settings row"
	args={{ label: subtitles, description: 'What each domain holds, under its name.', checked: true }}
	play={async ({ canvasElement, userEvent, args }) => {
		const canvas = canvasOf(canvasElement)
		const sw = canvas.getByRole('switch', { name: subtitles })
		await expect(sw).toHaveAccessibleDescription('What each domain holds, under its name.')
		await userEvent.click(canvas.getByText(subtitles))
		await expect(sw).toHaveAttribute('aria-checked', 'false')
		await expect(args.onchange).toHaveBeenLastCalledWith(false)
	}}
>
	{#snippet template(args)}
		<div
			style="max-width: 420px; background: var(--surface-1); border: 1px solid var(--stroke); border-radius: var(--ed-radius-card); box-shadow: var(--shadow-card)"
		>
			<div style="padding: var(--space-3) var(--space-4); border-bottom: 1px solid var(--stroke-subtle)">
				<Toggle {...args} />
			</div>
			<div style="padding: var(--space-3) var(--space-4)">
				<Toggle label={compact} description="32 px rows on desktop." />
			</div>
		</div>
	{/snippet}
</Story>
