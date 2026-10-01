<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf'
	import type { ComponentProps } from 'svelte'
	import { expect, fn, waitFor } from 'storybook/test'
	import { canvasOf } from '../../storybook/play.js'
	import { skyToday, weightSeries } from '../../stories/sample-data.js'
	import Button from '../components/Button/Button.svelte'
	import Toast from './Toast.svelte'
	import ToastHost from './ToastHost.svelte'
	import { ToastStore } from './toast.svelte.js'

	const weight = weightSeries.at(-1)
	const logged = `${weight} kg logged.`
	const removed = 'Log removed.'
	const unreachable = `Couldn't reach Open-Meteo. Showing the forecast from ${skyToday.lastGood}.`
	const logTrigger = `Log ${weight} kg`
	const errorTrigger = 'Refresh the forecast'

	type ToastArgs = ComponentProps<typeof Toast>

	const { Story } = defineMeta({
		title: 'Components/Feedback/Toast',
		component: Toast,
		tags: ['autodocs'],
		// the host is a fixed strip at the foot of the viewport, which no platform frame can contain
		parameters: { platformFrame: 'inline' },
		args: { message: logged, error: false, ondismiss: fn() },
	})

	const settle = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
</script>

<!-- Every story that shows a live toast mounts its own host on a fresh store, so stories never share one -->
{#snippet demo(args: ToastArgs, trigger: string, duration?: number)}
	{@const store = new ToastStore()}
	<div class="demo">
		<Button
			label={trigger}
			onclick={() => store.show({ message: args.message, action: args.action, error: args.error, duration })}
		/>
	</div>
	<ToastHost {store} />
{/snippet}

<!-- The undo toast that replaces a confirm for every reversible write. Undo runs its action, then the toast goes. -->
<Story
	name="Undo"
	args={{ action: { label: 'Undo', icon: 'undo-2', onclick: fn() } }}
	play={async ({ canvasElement, userEvent, args }) => {
		const canvas = canvasOf(canvasElement)
		await userEvent.click(canvas.getByRole('button', { name: logTrigger }))
		await expect(await canvas.findByRole('status')).toHaveTextContent(logged)
		await userEvent.click(canvas.getByRole('button', { name: 'Undo' }))
		await expect(args.action?.onclick).toHaveBeenCalledTimes(1)
		await waitFor(() => expect(canvas.queryByRole('status')).toBeNull())
	}}
>
	{#snippet template(args)}{@render demo(args, logTrigger)}{/snippet}
</Story>

<!-- An error is an alert: plain, what failed and the time of the last good data, with the alert icon in danger -->
<Story
	name="Error"
	args={{ message: unreachable, error: true, action: { label: 'Retry', onclick: fn() } }}
	play={async ({ canvasElement, userEvent, args }) => {
		const canvas = canvasOf(canvasElement)
		await userEvent.click(canvas.getByRole('button', { name: errorTrigger }))
		await expect(await canvas.findByRole('alert')).toHaveTextContent(unreachable)
		await userEvent.click(canvas.getByRole('button', { name: 'Retry' }))
		await expect(args.action?.onclick).toHaveBeenCalledTimes(1)
	}}
>
	{#snippet template(args)}{@render demo(args, errorTrigger)}{/snippet}
</Story>

<!-- One at a time: a second toast replaces the first and the clock restarts -->
<Story
	name="Replace"
	play={async ({ canvasElement, userEvent }) => {
		const canvas = canvasOf(canvasElement)
		await userEvent.click(canvas.getByRole('button', { name: 'Log, then remove the log' }))
		await expect(await canvas.findByRole('status')).toHaveTextContent(logged)
		await waitFor(() => expect(canvas.getByRole('status')).toHaveTextContent(removed), { timeout: 3000 })
		await waitFor(() => expect(canvas.getAllByRole('status')).toHaveLength(1))
	}}
>
	{#snippet template()}
		{@const store = new ToastStore()}
		<div class="demo">
			<Button
				label="Log, then remove the log"
				onclick={() => {
					store.show({ message: logged, action: { label: 'Undo' } })
					setTimeout(() => store.show({ message: removed }), 1000)
				}}
			/>
			<p class="note">The second toast arrives a second after the first and takes its place; they never stack.</p>
		</div>
		<ToastHost {store} />
	{/snippet}
</Story>

<!-- The clock stops while the pointer or focus is on the toast -->
<Story
	name="Paused on hover"
	args={{ action: { label: 'Undo', onclick: fn() } }}
	play={async ({ canvasElement, userEvent }) => {
		const canvas = canvasOf(canvasElement)
		const trigger = canvas.getByRole('button', { name: logTrigger })
		await userEvent.click(trigger)
		const toast = await canvas.findByRole('status')
		await userEvent.hover(toast)
		await settle(900)
		await expect(canvas.getByRole('status')).toBeInTheDocument()
		await userEvent.hover(trigger)
		await waitFor(() => expect(canvas.queryByRole('status')).toBeNull(), { timeout: 2000 })
	}}
>
	{#snippet template(args)}
		{@render demo(args, logTrigger, 600)}
		<p class="note">
			This toast lasts 600 ms instead of eight seconds. While the pointer or keyboard focus is on it the clock stops,
			and it runs again once both have left.
		</p>
	{/snippet}
</Story>

<!-- Left alone, the toast goes when its time is up -->
<Story
	name="Times out"
	play={async ({ canvasElement, userEvent }) => {
		const canvas = canvasOf(canvasElement)
		await userEvent.click(canvas.getByRole('button', { name: logTrigger }))
		await expect(await canvas.findByRole('status')).toBeInTheDocument()
		await waitFor(() => expect(canvas.queryByRole('status')).toBeNull(), { timeout: 2000 })
	}}
>
	{#snippet template(args)}{@render demo(args, logTrigger, 600)}{/snippet}
</Story>

<!-- The element on its own, one per state, for the docs -->
<Story name="Toast: undo" args={{ action: { label: 'Undo', icon: 'undo-2', onclick: fn() } }} />
<Story name="Toast: error" args={{ message: unreachable, error: true, action: { label: 'Retry', onclick: fn() } }} />
<Story name="Toast: message only" args={{ message: removed }} />

<style>
	.demo {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-3);
	}
	.note {
		margin: var(--space-4) 0 0;
		max-width: calc(var(--sheet-md) + var(--space-8));
		font: var(--ed-t-body-sm);
		color: var(--text-secondary);
	}
</style>
