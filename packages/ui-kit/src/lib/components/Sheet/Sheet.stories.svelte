<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf'
	import { expect, fn, userEvent, waitFor } from 'storybook/test'
	import { canvasOf } from '../../../storybook/play.js'
	import Sheet from './Sheet.svelte'
	import Button from '../Button/Button.svelte'
	import Field from '../Field/Field.svelte'

	const { Story } = defineMeta({
		title: 'Components/Overlays/Sheet',
		component: Sheet,
		tags: ['autodocs'],
		parameters: { platformFrame: 'inline' },
		args: { size: 'md', placement: 'auto', dismissible: true, onclose: fn() },
		argTypes: {
			placement: { control: 'inline-radio', options: ['auto', 'bottom', 'center', 'side'] },
			size: { control: 'inline-radio', options: ['sm', 'md', 'lg', 'full'] },
		},
	})
</script>

<script lang="ts">
	let open = $state(false)
</script>

{#snippet template(args: Record<string, unknown>)}
	<Button label="Open the sheet" onclick={() => (open = true)} />
	<Sheet bind:open {...args} label="A sheet">
		{#snippet header()}<h2 class="ed-t-title" style="margin: 0">Delete the recipe?</h2>{/snippet}
		<p class="ed-t-voice" style="margin: 0">Its stock links will become text. Nothing else changes.</p>
		<div style="margin-top: var(--space-3)"><Field label="Reason" placeholder="Optional" /></div>
		{#snippet footer()}
			<Button label="Cancel" onclick={() => (open = false)} />
			<Button label="Delete recipe" variant="danger" onclick={() => (open = false)} />
		{/snippet}
	</Sheet>
{/snippet}

<Story name="Center" args={{ placement: 'center' }} {template} />
<Story name="Bottom" args={{ placement: 'bottom' }} parameters={{ platforms: ['mobile'] }} {template} />
<Story name="Side" args={{ placement: 'side' }} parameters={{ platforms: ['desktop'] }} {template} />
<Story name="Auto follows the platform" args={{ placement: 'auto' }} {template} />
<Story name="Sizes: small" args={{ size: 'sm', placement: 'center' }} {template} />
<Story name="Sizes: large" args={{ size: 'lg', placement: 'center' }} {template} />
<Story name="Not dismissible" args={{ dismissible: false, placement: 'center' }} {template} />

<Story
	name="Focus on the sheet"
	args={{ initialFocus: 'container', placement: 'center' }}
	{template}
	play={async ({ canvasElement }) => {
		const canvas = canvasOf(canvasElement)
		await userEvent.click(canvas.getByRole('button', { name: 'Open the sheet' }))
		const dialog = await canvas.findByRole('dialog', { name: 'A sheet' })
		await waitFor(() => expect(document.activeElement).toBe(dialog.querySelector('.ed-sheet-panel')))
		await userEvent.tab()
		await expect(document.activeElement).toBe(canvas.getByRole('textbox', { name: 'Reason' }))
	}}
/>

<Story
	name="Keyboard: Escape closes and returns focus"
	args={{ placement: 'center' }}
	{template}
	play={async ({ canvasElement, args }) => {
		const canvas = canvasOf(canvasElement)
		const trigger = canvas.getByRole('button', { name: 'Open the sheet' })
		await userEvent.click(trigger)
		const dialog = await canvas.findByRole('dialog', { name: 'A sheet' })
		await expect(dialog).toBeVisible()
		await expect(dialog.contains(document.activeElement)).toBe(true)
		await userEvent.tab()
		await userEvent.tab()
		await userEvent.tab()
		await userEvent.tab()
		await expect(dialog.contains(document.activeElement)).toBe(true)
		await userEvent.keyboard('{Escape}')
		// the sheet fades before it closes
		await waitFor(() => expect(dialog).not.toBeVisible())
		// the close event and the native focus return arrive a task after close()
		await waitFor(() => expect(args.onclose).toHaveBeenCalledWith('escape'))
		await waitFor(() => expect(document.activeElement).toBe(trigger))
	}}
/>
