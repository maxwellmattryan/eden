<script module lang="ts">
	import type { ComponentProps } from 'svelte'
	import { defineMeta } from '@storybook/addon-svelte-csf'
	import type { SvelteRenderer } from '@storybook/svelte'
	import type { PlayFunctionContext } from 'storybook/internal/csf'
	import { expect, fn, waitFor } from 'storybook/test'
	import { canvasOf } from '../../../storybook/play.js'
	import { grocery } from '../../../stories/sample-data.js'
	import SwipeRow, { type SwipeLeading, type SwipeTrailing } from './SwipeRow.svelte'

	const limes = grocery.items.find((item) => item.id === 'g-02')!
	const done: SwipeLeading = { label: 'Done', icon: 'check', onaction: fn() }
	const remove: SwipeTrailing = { label: 'Delete', icon: 'trash', onaction: fn() }

	const { Story } = defineMeta({
		title: 'Components/Shell/SwipeRow',
		component: SwipeRow,
		tags: ['autodocs'],
		args: { leading: done, trailing: undefined },
		parameters: { platforms: ['mobile'] },
	})

	type Play = PlayFunctionContext<SvelteRenderer>
	/** Presses on the row's content, moves the pointer `dx` to the right (left when negative) and lets go. */
	const drag = (userEvent: Play['userEvent'], content: HTMLElement, dx: number) =>
		userEvent.pointer([
			{ keys: '[MouseLeft>]', target: content, coords: { x: 100, y: 20 } },
			{ coords: { x: 100 + dx / 2, y: 21 } },
			{ coords: { x: 100 + dx, y: 22 } },
			{ keys: '[/MouseLeft]' },
		])
	/** How many times a spy has fired so far, so a story's assertions do not depend on the order stories run in. */
	const calls = (spy: () => void) => (spy as ReturnType<typeof fn>).mock.calls.length
	const content = (canvasElement: HTMLElement) => canvasElement.querySelector<HTMLElement>('.ed-swipe-content')!
	const settled = (el: HTMLElement) => waitFor(() => expect(el.style.transform).toBe('translateX(0px)'))
</script>

<!-- a grocery row, as the Hearth list would render it -->
{#snippet row()}
	<div class="sb-row">
		<span>{limes.name}</span>
		<span class="sb-qty">{limes.qty}</span>
	</div>
{/snippet}

{#snippet template(args: Omit<ComponentProps<typeof SwipeRow>, 'children'>)}
	<div class="sb-list"><SwipeRow {...args}>{@render row()}</SwipeRow></div>
{/snippet}

<!-- a drag to the right past the action's width fires Done; a short one settles back; Tab reaches the button behind the row -->
<Story
	name="Leading done"
	{template}
	play={async ({ canvasElement, userEvent, args }) => {
		if (!canvasElement.querySelector('.ed-canvas')) return
		const canvas = canvasOf(canvasElement)
		const el = content(canvasElement)
		const onaction = args.leading!.onaction
		const before = calls(onaction)
		await drag(userEvent, el, 30)
		await settled(el)
		await expect(onaction).toHaveBeenCalledTimes(before)
		await drag(userEvent, el, 140)
		await expect(onaction).toHaveBeenCalledTimes(before + 1)
		await settled(el)
		await userEvent.tab()
		await expect(canvas.getByRole('button', { name: 'Done' })).toHaveFocus()
		await userEvent.keyboard('{Enter}')
		await expect(onaction).toHaveBeenCalledTimes(before + 2)
	}}
/>

<!-- a drag to the left past the width fires Delete, on the danger ground -->
<Story
	name="Trailing delete"
	args={{ leading: undefined, trailing: remove }}
	{template}
	play={async ({ canvasElement, userEvent, args }) => {
		if (!canvasElement.querySelector('.ed-canvas')) return
		const canvas = canvasOf(canvasElement)
		const el = content(canvasElement)
		const onaction = args.trailing!.onaction
		const before = calls(onaction)
		await drag(userEvent, el, -30)
		await settled(el)
		await expect(onaction).toHaveBeenCalledTimes(before)
		await drag(userEvent, el, -140)
		await expect(onaction).toHaveBeenCalledTimes(before + 1)
		await settled(el)
		await userEvent.tab()
		await expect(canvas.getByRole('button', { name: 'Delete' })).toHaveFocus()
		await userEvent.keyboard('{Enter}')
		await expect(onaction).toHaveBeenCalledTimes(before + 2)
	}}
/>

<Story
	name="Both"
	args={{ trailing: remove }}
	{template}
	play={async ({ canvasElement, userEvent, args }) => {
		if (!canvasElement.querySelector('.ed-canvas')) return
		const canvas = canvasOf(canvasElement)
		const el = content(canvasElement)
		const leading = args.leading!.onaction
		const trailing = args.trailing!.onaction
		const [l, t] = [calls(leading), calls(trailing)]
		await drag(userEvent, el, 140)
		await expect(leading).toHaveBeenCalledTimes(l + 1)
		await expect(trailing).toHaveBeenCalledTimes(t)
		await settled(el)
		await drag(userEvent, el, -140)
		await expect(trailing).toHaveBeenCalledTimes(t + 1)
		await expect(leading).toHaveBeenCalledTimes(l + 1)
		await settled(el)
		// both buttons are in the tab order, leading first
		await userEvent.tab()
		await expect(canvas.getByRole('button', { name: 'Done' })).toHaveFocus()
		await userEvent.tab()
		await expect(canvas.getByRole('button', { name: 'Delete' })).toHaveFocus()
	}}
/>

<!-- a row with another way to its actions (a list row, whose held press opens its menu): no hold under reduced
     motion, and the buttons out of the tab order; the drag is unchanged -->
<Story
	name="No hold"
	args={{ trailing: remove, hold: false, tabbable: false }}
	{template}
	play={async ({ canvasElement, userEvent, args }) => {
		if (!canvasElement.querySelector('.ed-canvas')) return
		const canvas = canvasOf(canvasElement)
		const el = content(canvasElement)
		const onaction = args.leading!.onaction
		const before = calls(onaction)
		await drag(userEvent, el, 140)
		await expect(onaction).toHaveBeenCalledTimes(before + 1)
		await settled(el)
		for (const button of canvas.getAllByRole('button')) await expect(button).toHaveAttribute('tabindex', '-1')
	}}
/>

<!-- on desktop the row renders unchanged: no actions, no gesture; the hover cluster and the context menu serve instead -->
<Story
	name="Desktop passthrough"
	args={{ trailing: remove }}
	parameters={{ platforms: ['desktop'] }}
	{template}
	play={async ({ canvasElement }) => {
		if (!canvasElement.querySelector('.ed-canvas')) return
		const canvas = canvasOf(canvasElement)
		await expect(canvas.getByText(limes.name)).toBeVisible()
		await expect(canvas.queryByRole('button')).toBeNull()
		await expect(canvasElement.querySelector('.ed-swipe-content')).toBeNull()
	}}
/>

<style>
	.sb-list {
		border: 1px solid var(--ed-card-border);
		border-radius: var(--ed-radius-card);
		overflow: hidden;
	}
	.sb-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		height: var(--ed-row);
		padding: 0 var(--space-4);
		font: var(--ed-t-text);
		color: var(--text-primary);
	}
	.sb-qty {
		font: var(--ed-t-data);
		color: var(--text-secondary);
	}
</style>
