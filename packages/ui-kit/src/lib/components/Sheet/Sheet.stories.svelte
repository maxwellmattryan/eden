<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf'
	import { expect, fn, userEvent, waitFor, within } from 'storybook/test'
	import Sheet from './Sheet.svelte'

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
	<button type="button" class="ed-t-button" onclick={() => (open = true)}>Open the sheet</button>
	<Sheet bind:open {...args} label="A sheet">
		{#snippet header()}<h2 class="ed-t-title" style="margin: 0">Delete the recipe?</h2>{/snippet}
		<p class="ed-t-voice" style="margin: 0">Its stock links will become text. Nothing else changes.</p>
		<label class="ed-t-label" style="display: block; margin-top: var(--space-3)">
			Reason<br /><input type="text" style="margin-top: 4px" />
		</label>
		{#snippet footer()}
			<button type="button" onclick={() => (open = false)}>Cancel</button>
			<button type="button" onclick={() => (open = false)}>Delete recipe</button>
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
	name="Keyboard: Escape closes and returns focus"
	args={{ placement: 'center' }}
	{template}
	play={async ({ canvasElement, args }) => {
		const canvas = within(canvasElement)
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
		await expect(dialog).not.toBeVisible()
		// the close event and the native focus return arrive a task after close()
		await waitFor(() => expect(args.onclose).toHaveBeenCalledWith('escape'))
		await waitFor(() => expect(document.activeElement).toBe(trigger))
	}}
/>
