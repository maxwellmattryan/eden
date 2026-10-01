<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf'
	import { expect, fn } from 'storybook/test'
	import { canvasOf, hasCanvas } from '../../../storybook/play.js'
	import { defaultStrings } from '../../i18n/strings.js'
	import Pagination from './Pagination.svelte'

	const s = defaultStrings.pagination

	const { Story } = defineMeta({
		title: 'Components/Data/Pagination',
		component: Pagination,
		tags: ['autodocs'],
		args: { page: 1, pageSize: 50, total: 312, onchange: fn() },
	})
</script>

<!-- The first of seven pages: nothing before it, so the two buttons that go back are at rest -->
<Story
	name="First page"
	play={async ({ args, canvasElement, userEvent }) => {
		if (!hasCanvas(canvasElement)) return
		const canvas = canvasOf(canvasElement)
		await expect(canvas.getByRole('navigation', { name: s.label })).toBeVisible()
		await expect(canvas.getByText(s.range(1, 50, 312))).toBeVisible()
		await expect(canvas.getByRole('button', { name: s.first })).toBeDisabled()
		await expect(canvas.getByRole('button', { name: s.previous })).toBeDisabled()
		await userEvent.click(canvas.getByRole('button', { name: s.next }))
		await expect(args.onchange).toHaveBeenLastCalledWith(2)
		await expect(canvas.getByText(s.range(51, 100, 312))).toBeVisible()
		await userEvent.click(canvas.getByRole('button', { name: s.last }))
		await expect(args.onchange).toHaveBeenLastCalledWith(7)
		await expect(canvas.getByText(s.range(301, 312, 312))).toBeVisible()
		await expect(canvas.getByRole('button', { name: s.next })).toBeDisabled()
	}}
/>

<Story
	name="Middle"
	args={{ page: 4 }}
	play={async ({ args, canvasElement, userEvent }) => {
		if (!hasCanvas(canvasElement)) return
		const canvas = canvasOf(canvasElement)
		await expect(canvas.getByText(s.range(151, 200, 312))).toBeVisible()
		await userEvent.click(canvas.getByRole('button', { name: s.previous }))
		await expect(args.onchange).toHaveBeenLastCalledWith(3)
		await userEvent.click(canvas.getByRole('button', { name: s.first }))
		await expect(args.onchange).toHaveBeenLastCalledWith(1)
	}}
/>

<!-- The last page holds what is left; a page past the end reads as the last -->
<Story
	name="Last page"
	args={{ page: 99 }}
	play={async ({ canvasElement }) => {
		if (!hasCanvas(canvasElement)) return
		const canvas = canvasOf(canvasElement)
		await expect(canvas.getByText(s.range(301, 312, 312))).toBeVisible()
		await expect(canvas.getByRole('button', { name: s.last })).toBeDisabled()
	}}
/>

<!-- Everything fits on one page: the range still says how many, and every button rests -->
<Story
	name="Single page"
	args={{ total: 18 }}
	play={async ({ canvasElement }) => {
		if (!hasCanvas(canvasElement)) return
		const canvas = canvasOf(canvasElement)
		await expect(canvas.getByText(s.range(1, 18, 18))).toBeVisible()
		for (const name of [s.first, s.previous, s.next, s.last]) {
			await expect(canvas.getByRole('button', { name })).toBeDisabled()
		}
	}}
/>

<!-- Nothing to page: nothing is rendered, since an empty table has its own words -->
<Story
	name="Empty"
	args={{ total: 0 }}
	play={async ({ canvasElement }) => {
		if (!hasCanvas(canvasElement)) return
		await expect(canvasOf(canvasElement).queryByRole('navigation')).toBeNull()
	}}
/>
