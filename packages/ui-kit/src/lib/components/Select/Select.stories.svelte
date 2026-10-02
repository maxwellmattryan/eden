<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf'
	import { expect, fn } from 'storybook/test'
	import { canvasOf } from '../../../storybook/play.js'
	import Select from './Select.svelte'
	import { addressCountries, addressForms } from '../../../stories/sample-data.js'

	const states = addressForms.US.rows[3]![0]!.options!
	const many = Array.from({ length: 249 }, (_, index) => ({ value: `c-${index}`, label: `Country ${index + 1}` }))

	const { Story } = defineMeta({
		title: 'Components/Inputs/Select',
		component: Select,
		tags: ['autodocs'],
		args: { label: 'State', options: states, value: 'TX', onchange: fn() },
	})
</script>

<script lang="ts">
	let chosen = $state('TX')
	/** A form's draft: nothing is set until a choice is made. */
	let draft = $state<Record<string, string>>({})
</script>

<Story
	name="Basic"
	play={async ({ canvasElement, userEvent, args }) => {
		const canvas = canvasOf(canvasElement)
		const select = canvas.getByRole('combobox', { name: 'State' })
		await expect(select).toHaveValue('TX')
		await userEvent.selectOptions(select, 'CA')
		await expect(select).toHaveValue('CA')
		await expect(canvas.getByRole('status')).toHaveTextContent('CA')
		await expect(args.onchange).toHaveBeenLastCalledWith('CA')
	}}
>
	{#snippet template(args)}
		<div style="display: grid; gap: var(--space-2); max-width: 320px">
			<Select {...args} bind:value={chosen} />
			<output style="font: var(--ed-t-caption); color: var(--text-secondary)">{chosen}</output>
		</div>
	{/snippet}
</Story>

<!-- Bound to a key the draft does not hold yet: nothing is chosen, the placeholder shows, and a choice sets the key -->
<Story
	name="Placeholder"
	args={{ placeholder: 'Choose', value: undefined }}
	play={async ({ canvasElement, userEvent }) => {
		const canvas = canvasOf(canvasElement)
		const select = canvas.getByRole('combobox', { name: 'State' })
		await expect(select).toHaveValue('')
		await expect(select).toHaveAttribute('data-unset')
		await userEvent.selectOptions(select, 'NY')
		await expect(select).not.toHaveAttribute('data-unset')
		await expect(canvas.getByRole('status')).toHaveTextContent('NY')
	}}
>
	{#snippet template(args)}
		<div style="display: grid; gap: var(--space-2); max-width: 320px">
			<Select {...args} bind:value={draft.region} />
			<output style="font: var(--ed-t-caption); color: var(--text-secondary)">{draft.region}</output>
		</div>
	{/snippet}
</Story>

<Story
	name="Grouped"
	args={{ label: addressForms.US.countryLabel, options: addressCountries, value: 'US' }}
	play={async ({ canvasElement }) => {
		const canvas = canvasOf(canvasElement)
		const select = canvas.getByRole('combobox', { name: addressForms.US.countryLabel })
		await expect(select.querySelectorAll('optgroup')).toHaveLength(2)
		await expect(select).toHaveValue('US')
	}}
/>

<Story
	name="Error"
	args={{ placeholder: 'Choose', value: undefined, error: 'Needed to save.' }}
	play={async ({ canvasElement }) => {
		const canvas = canvasOf(canvasElement)
		const select = canvas.getByRole('combobox', { name: 'State' })
		await expect(select).toHaveAttribute('aria-invalid', 'true')
		await expect(select).toHaveAccessibleDescription('Needed to save.')
	}}
/>

<Story name="Helper" args={{ helper: 'Where mail reaches you.' }} />

<Story name="Disabled" args={{ disabled: true }} />

<!-- Every country: the list is the system's, so its length costs nothing and typing a name finds it -->
<Story name="Long list" args={{ label: addressForms.US.countryLabel, options: many, value: 'c-120' }} />
