<script module lang="ts">
	import type { ComponentProps } from 'svelte'
	import { defineMeta } from '@storybook/addon-svelte-csf'
	import { expect, waitFor } from 'storybook/test'
	import { canvasOf } from '../../../storybook/play.js'
	import { defaultStrings } from '$lib/i18n/strings.js'
	import ToolCard from './ToolCard.svelte'
	import ToolRun from './ToolRun.svelte'

	const s = defaultStrings
	const days = ['2026-10-01', '2026-10-02', '2026-10-03']
	const heading = (count: number) => `sun-and-moon × ${count}`

	const { Story } = defineMeta({
		title: 'Components/Gardener/ToolRun',
		component: ToolRun,
		tags: ['autodocs'],
		args: { heading: heading(days.length), status: 'done' },
		argTypes: { status: { control: 'inline-radio', options: ['running', 'done', 'cancelled'] } },
	})
</script>

<script lang="ts">
	let ran = $state(1)
	let settling = $state<'running' | 'done'>('running')
</script>

{#snippet cards(state: 'running' | 'done' | 'cancelled', count = days.length)}
	{#each days.slice(0, count) as day (day)}
		<ToolCard name="sun-and-moon" access="read" payload={`day: ${day}`} {state} />
	{/each}
{/snippet}

{#snippet template(args: ComponentProps<typeof ToolRun>)}
	<div class="col"><ToolRun {...args}>{@render cards(args.status ?? 'done')}</ToolRun></div>
{/snippet}

<!-- Done: one line for the lot, the success check, the cards behind the chevron -->
<Story
	name="Done"
	{template}
	play={async ({ canvasElement, userEvent }) => {
		const canvas = canvasOf(canvasElement)
		await expect(canvas.getAllByRole('status')).toHaveLength(1)
		const fold = canvas.getByRole('button', { name: s.show })
		await expect(fold).toHaveAttribute('aria-expanded', 'false')
		await userEvent.click(fold)
		await expect(canvas.getByRole('button', { name: s.hide })).toHaveAttribute('aria-expanded', 'true')
		await expect(canvas.getAllByRole('status')).toHaveLength(1 + days.length)
		await userEvent.click(canvas.getByRole('button', { name: s.hide }))
		await expect(canvas.getAllByRole('status')).toHaveLength(1)
	}}
/>

<!-- Running: the spinner stands for every call still at work -->
<Story
	name="Running"
	args={{ status: 'running' }}
	{template}
	play={async ({ canvasElement }) => {
		await expect(canvasOf(canvasElement).getAllByRole('status')[0]).toHaveTextContent(s.gardener.toolRunning)
	}}
/>

<!-- Open: the cards of the run, each with its own state -->
<Story name="Open" args={{ open: true }} {template} />

<!-- Runs then settles: the count climbs as calls arrive, then the spinner gives way to the check -->
<Story
	name="Runs then settles"
	play={async ({ canvasElement }) => {
		const canvas = canvasOf(canvasElement)
		ran = 1
		settling = 'running'
		for (const count of [2, 3]) {
			await new Promise((resolve) => setTimeout(resolve, 300))
			ran = count
		}
		await waitFor(() => expect(canvas.getByText(heading(3))).toBeInTheDocument())
		settling = 'done'
		await waitFor(() => expect(canvas.getAllByRole('status')[0]).toHaveTextContent(s.gardener.toolDone))
	}}
>
	{#snippet template()}
		<div class="col">
			<ToolRun heading={heading(ran)} status={settling}>{@render cards(settling, ran)}</ToolRun>
		</div>
	{/snippet}
</Story>

<!-- Cancelled: the request went away before the calls finished -->
<Story name="Cancelled" args={{ status: 'cancelled' }} {template} />

<style>
	.col {
		display: flex;
		flex-direction: column;
		max-width: calc(var(--sheet-max) * 0.6);
	}
</style>
