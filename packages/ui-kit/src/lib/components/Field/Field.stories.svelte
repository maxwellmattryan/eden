<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf'
	import { expect, fn } from 'storybook/test'
	import Field from './Field.svelte'
	import { projects, quickLogs, stock, weightSeries } from '../../../stories/sample-data.js'

	const weight = quickLogs[0]!
	const chicken = stock[0]!
	const repo = projects[0]!.repo
	const repoError = 'Couldn’t reach that repository. Check the name.'

	const { Story } = defineMeta({
		title: 'Components/Inputs/Field',
		component: Field,
		tags: ['autodocs'],
		args: { label: 'Name', placeholder: chicken.name, oninput: fn(), onkeydown: fn() },
		argTypes: {
			type: { control: 'select', options: ['text', 'number', 'email', 'url', 'search', 'password'] },
		},
	})
</script>

<script lang="ts">
	let typed = $state('')
</script>

<Story
	name="Default"
	play={async ({ canvas, userEvent, args }) => {
		const input = canvas.getByRole('textbox', { name: 'Name' })
		await userEvent.type(input, 'Miso')
		await expect(input).toHaveValue('Miso')
		await expect(canvas.getByRole('status')).toHaveTextContent('Miso')
		await expect(args.oninput).toHaveBeenCalled()
	}}
>
	{#snippet template(args)}
		<div style="display: grid; gap: var(--space-2); max-width: 320px">
			<Field {...args} bind:value={typed} />
			<output style="font: var(--ed-t-caption); color: var(--text-secondary)">{typed}</output>
		</div>
	{/snippet}
</Story>

<Story name="With unit" args={{ label: 'Quantity', value: chicken.qty, unit: chicken.unit, mono: true }} />

<Story name="Helper" args={{ label: 'Name', placeholder: chicken.name, helper: 'Shown in stock and grocery lists.' }} />

<Story
	name="Error"
	args={{ label: 'Repository', value: repo.slice(0, -1), mono: true, error: repoError }}
	play={async ({ canvas }) => {
		const input = canvas.getByRole('textbox', { name: 'Repository' })
		await expect(input).toHaveAttribute('aria-invalid', 'true')
		const message = canvas.getByText(repoError)
		await expect(input).toHaveAttribute('aria-describedby', message.id)
		await expect(input).toHaveAccessibleDescription(repoError)
	}}
/>

<Story name="With icon" args={{ label: 'Search', type: 'search', placeholder: 'Search stock', icon: 'search' }} />

<Story
	name="Large"
	args={{
		label: weight.label,
		value: String(weightSeries.at(-1)),
		unit: weight.unit,
		placeholder: weight.placeholder,
		large: true,
	}}
/>

<Story name="Mono" args={{ label: 'Repository', value: repo, mono: true }} />

<Story name="Trailing snippet" args={{ label: weight.label, value: String(weightSeries.at(-1)), unit: weight.unit }}>
	{#snippet template(args)}
		<div style="max-width: 320px">
			<Field {...args}>
				{#snippet trailing()}
					<kbd style="font: var(--ed-t-caption); color: var(--text-secondary); white-space: nowrap">Enter to save</kbd>
				{/snippet}
			</Field>
		</div>
	{/snippet}
</Story>
