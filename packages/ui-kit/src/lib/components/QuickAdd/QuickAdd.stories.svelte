<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf'
	import { expect, fn } from 'storybook/test'
	import { canvasOf } from '../../../storybook/play.js'
	import QuickAdd, { type ParsedChip } from './QuickAdd.svelte'
	import { quickLogs, weightSeries } from '../../../stories/sample-data.js'

	// The two lines docs/design/ux-patterns.md uses to describe quick-add, and the fields they would sit above.
	const stockLine = '2 lb chicken thighs fridge'
	const stockHint = 'Add to stock…'
	const taskLine = 'dentist thursday 3pm'
	const taskHint = 'Add a task…'

	// A domain whose lines are mostly figures: every number becomes a mono chip.
	const weight = quickLogs[0]!
	const setLine = `3 × 12 at ${weightSeries.at(-1)} ${weight.unit}`
	const numericParse = (text: string): ParsedChip[] =>
		(text.match(/\d+(?:[.,]\d+)?/g) ?? []).map((figure) => ({ label: figure, mono: true }))

	const { Story } = defineMeta({
		title: 'Components/Inputs/QuickAdd',
		component: QuickAdd,
		tags: ['autodocs'],
		args: { placeholder: stockHint, onadd: fn(), oninput: fn(), onkeydown: fn() },
		argTypes: { parse: { control: false } },
	})
</script>

<Story
	name="Empty"
	play={async ({ canvasElement, userEvent, args }) => {
		const canvas = canvasOf(canvasElement)
		const input = canvas.getByRole('textbox', { name: stockHint })
		await expect(canvas.queryByRole('button')).toBeNull()
		await userEvent.type(input, stockLine)
		// the chips appear as the line is typed, and describe the field
		await expect(canvas.getByText('2 lb')).toBeVisible()
		await expect(canvas.getByText('fridge')).toBeVisible()
		await expect(input).toHaveAccessibleDescription(/2 lb/)
		await expect(canvas.getByRole('button', { name: 'Add' })).toBeVisible()
		await userEvent.keyboard('{Enter}')
		await expect(args.onadd).toHaveBeenCalledTimes(1)
		await expect(args.onadd).toHaveBeenCalledWith(
			stockLine,
			expect.arrayContaining([
				expect.objectContaining({ label: '2 lb', mono: true }),
				expect.objectContaining({ label: 'fridge' }),
			])
		)
		await expect(input).toHaveValue('')
		await expect(canvas.queryByText('2 lb')).toBeNull()
		await expect(input).not.toHaveAttribute('aria-describedby')
	}}
/>

<Story
	name="Parsed"
	args={{ value: stockLine }}
	play={async ({ canvasElement, userEvent, args }) => {
		const canvas = canvasOf(canvasElement)
		const input = canvas.getByRole('textbox', { name: stockHint })
		await expect(input).toHaveValue(stockLine)
		await expect(canvas.getByText('chicken thighs')).toBeVisible()
		await expect(canvas.getByText('2 lb')).toBeVisible()
		// the + commits too, and hands focus back to the field for the next line
		await userEvent.click(canvas.getByRole('button', { name: 'Add' }))
		await expect(args.onadd).toHaveBeenCalledTimes(1)
		await expect(input).toHaveValue('')
		await expect(input).toHaveFocus()
	}}
/>

<Story
	name="Weekday and time"
	args={{ placeholder: taskHint, value: taskLine }}
	play={async ({ canvasElement }) => {
		const canvas = canvasOf(canvasElement)
		await expect(canvas.getByText('dentist')).toBeVisible()
		await expect(canvas.getByText('Thu 15:00')).toBeVisible()
	}}
/>

<Story
	name="Custom parser"
	args={{ placeholder: `Log a set (${weight.unit})`, value: setLine, parse: numericParse }}
	play={async ({ canvasElement }) => {
		const canvas = canvasOf(canvasElement)
		await expect(canvas.getByText('3')).toBeVisible()
		await expect(canvas.getByText('12')).toBeVisible()
		await expect(canvas.getByText(String(weightSeries.at(-1)))).toBeVisible()
	}}
/>

<Story name="Mobile" args={{ value: stockLine }} parameters={{ platforms: ['mobile'] }} />
