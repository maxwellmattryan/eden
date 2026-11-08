<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf'
	import { expect, within } from 'storybook/test'
	import Meter from './Meter.svelte'
	import { orchardBudget } from '../../../stories/sample-data.js'

	const lineOf = (category: string) => orchardBudget.lines.find((line) => line.category === category)!
	const major = (minor: number) => minor / 100
	const dollars = (minor: number) => `$${major(minor).toFixed(2)}`
	const argsOf = (category: string, spent?: number) => {
		const line = lineOf(category)
		const value = spent ?? line.spent.minor
		return {
			value: major(value),
			max: major(line.planned.minor),
			label: line.category,
			valuetext: `${dollars(value)} of ${dollars(line.planned.minor)}`,
		}
	}

	type Rgba = [number, number, number, number]
	const rgbaOf = (colour: string): Rgba => {
		const [r = 0, g = 0, b = 0, a = 1] = (colour.match(/[\d.]+/g) ?? []).map(Number)
		return [r, g, b, a]
	}
	const over = ([r, g, b, a]: Rgba, [br, bg, bb]: Rgba): Rgba => [
		r * a + br * (1 - a),
		g * a + bg * (1 - a),
		b * a + bb * (1 - a),
		1,
	]
	const luminance = ([r, g, b]: Rgba) => {
		const [lr, lg, lb] = [r, g, b].map((value) => {
			const c = value / 255
			return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
		}) as [number, number, number]
		return 0.2126 * lr + 0.7152 * lg + 0.0722 * lb
	}
	const contrast = (a: Rgba, b: Rgba) => {
		const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number]
		return (hi + 0.05) / (lo + 0.05)
	}
	/** The fill against the track as it shows on the panel behind it. */
	const fillContrast = (meter: HTMLElement) => {
		const fill = rgbaOf(getComputedStyle(meter.firstElementChild!).backgroundColor)
		const track = rgbaOf(getComputedStyle(meter).backgroundColor)
		const panel = rgbaOf(getComputedStyle(meter.parentElement!).backgroundColor)
		return contrast(fill, over(track, panel))
	}
	/** The colour a variable paints, read through a probe in the same subtree. */
	const colourOf = (inside: HTMLElement, variable: string) => {
		const probe = document.createElement('span')
		probe.style.background = `var(${variable})`
		inside.append(probe)
		const colour = getComputedStyle(probe).backgroundColor
		probe.remove()
		return colour
	}

	const { Story } = defineMeta({
		title: 'Components/Data/Meter',
		component: Meter,
		tags: ['autodocs'],
		args: argsOf('Groceries'),
		argTypes: { tone: { control: 'inline-radio', options: ['auto', 'default', 'danger'] } },
	})
</script>

<Story
	name="Default"
	play={async ({ canvasElement }) => {
		const meter = within(canvasElement).getByRole('meter', { name: 'Groceries' })
		await expect(meter).toHaveAttribute('aria-valuemin', '0')
		await expect(meter).toHaveAttribute('aria-valuenow', '541.2')
		await expect(meter).toHaveAttribute('aria-valuemax', '600')
		await expect(meter).toHaveAttribute('aria-valuetext', '$541.20 of $600.00')
		const fill = meter.firstElementChild as HTMLElement
		await expect(fill.getBoundingClientRect().width).toBeCloseTo(meter.getBoundingClientRect().width * 0.902, 0)
		await expect(getComputedStyle(fill).backgroundColor).toBe(colourOf(meter, '--brand-primary'))
	}}
>
	{#snippet template(args)}
		<div class="panel"><Meter {...args} /></div>
	{/snippet}
</Story>

<!-- Over its plan: the fill stops at the track's end and turns to danger, in light and dark alike. -->
<Story
	name="Over"
	args={argsOf('Dining')}
	play={async ({ canvasElement }) => {
		const meters = within(canvasElement).getAllByRole('meter', { name: 'Dining' })
		await expect(meters).toHaveLength(2)
		for (const meter of meters) {
			await expect(meter).toHaveAttribute('aria-valuenow', '312.4')
			// the maximum stretches to the value, so the value is never outside the range
			await expect(meter).toHaveAttribute('aria-valuemax', '312.4')
			const fill = meter.firstElementChild as HTMLElement
			await expect(fill.getBoundingClientRect().width).toBeCloseTo(meter.getBoundingClientRect().width, 0)
			await expect(getComputedStyle(fill).backgroundColor).toBe(colourOf(meter, '--danger'))
			// non-text contrast of the danger fill on the track
			await expect(fillContrast(meter)).toBeGreaterThanOrEqual(3)
		}
	}}
>
	{#snippet template(args)}
		<div class="themes">
			<div class="panel" data-theme="light"><Meter {...args} /></div>
			<div class="panel" data-theme="dark"><Meter {...args} /></div>
		</div>
	{/snippet}
</Story>

<Story
	name="Empty"
	args={argsOf('Shopping', 0)}
	play={async ({ canvasElement }) => {
		const meter = within(canvasElement).getByRole('meter', { name: 'Shopping' })
		await expect(meter).toHaveAttribute('aria-valuenow', '0')
		await expect(meter).toHaveAttribute('aria-valuemax', '200')
		await expect((meter.firstElementChild as HTMLElement).getBoundingClientRect().width).toBe(0)
	}}
>
	{#snippet template(args)}
		<div class="panel"><Meter {...args} /></div>
	{/snippet}
</Story>

<style>
	.themes {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}
	.panel {
		max-width: 420px;
		padding: var(--space-4);
		border-radius: var(--ed-radius-card);
		background: var(--surface-1);
	}
</style>
