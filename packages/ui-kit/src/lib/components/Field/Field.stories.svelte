<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf'
	import { expect, fn } from 'storybook/test'
	import { canvasOf } from '../../../storybook/play.js'
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
			type: { control: 'select', options: ['text', 'number', 'email', 'url', 'search', 'password', 'date'] },
		},
	})
</script>

<script lang="ts">
	let typed = $state('')
	let note = $state('')
	/** A form's draft: nothing is set until its field is typed in. */
	let draft = $state<Record<string, string>>({})
</script>

<Story
	name="Default"
	play={async ({ canvasElement, userEvent, args }) => {
		const canvas = canvasOf(canvasElement)
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

<!-- A form binds a field to a key its draft does not hold yet: the field reads as empty, and typing sets the key -->
<Story
	name="Bound to an unset key"
	args={{ label: 'Substance', placeholder: 'tree nuts' }}
	play={async ({ canvasElement, userEvent }) => {
		const canvas = canvasOf(canvasElement)
		const input = canvas.getByRole('textbox', { name: 'Substance' })
		await expect(input).toHaveValue('')
		await userEvent.type(input, 'shellfish')
		await expect(input).toHaveValue('shellfish')
		await expect(canvas.getByRole('status')).toHaveTextContent('shellfish')
	}}
>
	{#snippet template(args)}
		<div style="display: grid; gap: var(--space-2); max-width: 320px">
			<Field {...args} bind:value={draft.substance} />
			<output style="font: var(--ed-t-caption); color: var(--text-secondary)">{draft.substance}</output>
		</div>
	{/snippet}
</Story>

<Story name="With unit" args={{ label: 'Quantity', value: chicken.qty, unit: chicken.unit, mono: true }} />

<Story name="Helper" args={{ label: 'Name', placeholder: chicken.name, helper: 'Shown in stock and grocery lists.' }} />

<Story
	name="Error"
	args={{ label: 'Repository', value: repo.slice(0, -1), mono: true, error: repoError }}
	play={async ({ canvasElement }) => {
		const canvas = canvasOf(canvasElement)
		const input = canvas.getByRole('textbox', { name: 'Repository' })
		await expect(input).toHaveAttribute('aria-invalid', 'true')
		const message = canvas.getByText(repoError)
		await expect(input).toHaveAttribute('aria-describedby', message.id)
		await expect(input).toHaveAccessibleDescription(repoError)
	}}
/>

<Story name="With icon" args={{ label: 'Search', type: 'search', placeholder: 'Search stock', icon: 'search' }} />

<!-- A date is typed a part at a time; the part in hand is marked in the accent, never the system's blue -->
<Story
	name="Date"
	args={{ label: 'Until', type: 'date', value: '2026-11-30' }}
	play={async ({ canvasElement, userEvent }) => {
		const canvas = canvasOf(canvasElement)
		const input = canvas.getByLabelText('Until')
		await expect(input).toHaveValue('2026-11-30')
		await userEvent.click(input)
		await expect(input).toHaveFocus()
	}}
/>

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

<!-- A textarea in the same chrome: one line to begin with, growing with what is typed to about eight; Enter still
     reaches onkeydown, so a composer can submit on it -->
<Story
	name="Multiline"
	args={{ label: 'Note', placeholder: 'Ask the Gardener', multiline: true, icon: 'sparkles' }}
	play={async ({ canvasElement, userEvent, args }) => {
		const canvas = canvasOf(canvasElement)
		const input = canvas.getByRole('textbox', { name: 'Note' })
		await expect(input.tagName).toBe('TEXTAREA')
		await expect(input).toHaveAttribute('rows', '1')
		const before = input.getBoundingClientRect().height
		await userEvent.type(input, 'First line{Shift>}{Enter}{/Shift}Second line{Shift>}{Enter}{/Shift}Third line')
		await expect(input).toHaveValue('First line\nSecond line\nThird line')
		await expect(canvas.getByRole('status')).toHaveTextContent('Third line')
		await expect(args.oninput).toHaveBeenCalled()
		await expect(args.onkeydown).toHaveBeenCalled()
		// engines with field-sizing grow the field with its lines; the rest keep it one row tall and scroll
		if (CSS.supports('field-sizing', 'content')) {
			await expect(input.getBoundingClientRect().height).toBeGreaterThan(before)
		}
	}}
>
	{#snippet template(args)}
		<div style="display: grid; gap: var(--space-2); max-width: 320px">
			<Field {...args} bind:value={note} />
			<output style="font: var(--ed-t-caption); color: var(--text-secondary); white-space: pre-line">{note}</output>
		</div>
	{/snippet}
</Story>

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
