<script module lang="ts">
	import { tick, type ComponentProps } from 'svelte'
	import { defineMeta } from '@storybook/addon-svelte-csf'
	import { expect, fn, waitFor } from 'storybook/test'
	import { hasCanvas } from '../../../storybook/play.js'
	import { grocery } from '../../../stories/sample-data.js'
	import List, { type ListRowData } from '../List/List.svelte'
	import DropTarget from './DropTarget.svelte'

	const GROUP = 'grocery-item'

	const { Story } = defineMeta({
		title: 'Components/Data/DropTarget',
		component: DropTarget,
		tags: ['autodocs'],
		parameters: {
			// dragging a row is a desktop pointer's gesture
			platforms: ['desktop'],
			docs: {
				description: {
					component:
						'A region that takes dragged rows (D-106): the other end of a `List` with a `dragGroup`. While rows of a group it accepts are dragged over it, a light wash of the accent with a dashed edge covers the region. Rows that began inside it are not its to take, so a list is no target for its own rows, and nothing is reordered. The wash is for the pointer alone: keep the same move in the row’s menu.',
				},
			},
		},
		args: { accepts: [GROUP], ondrop: fn() },
	})

	const stores = grocery.stores.map((store) => ({
		id: store.id,
		name: store.name,
		rows: grocery.items
			.filter((item) => grocery.lists.find((list) => list.id === item.listId)?.storeId === store.id)
			.map((item): ListRowData => ({
				id: item.id,
				primary: item.name,
				chips: item.qty ? [{ label: item.qty, mono: true }] : [],
				done: item.done,
				checkable: true,
			})),
	}))

	/** The two regions of the story's canvas, each with its wash, and the rows of the first. */
	function regionsOf(canvasElement: HTMLElement) {
		const [first, second] = [...canvasElement.querySelectorAll<HTMLElement>('.ed-canvas .ed-droptarget')]
		const veil = (zone: HTMLElement) => zone.querySelector<HTMLElement>('.ed-droptarget-veil')!
		return {
			first: first!,
			second: second!,
			firstVeil: veil(first!),
			secondVeil: veil(second!),
			row: first!.querySelector<HTMLElement>('[role="row"]')!,
		}
	}

	/**
	 * One drag's events as the engine would send them. A scripted DataTransfer keeps what it carries to itself until
	 * the drop, which a real drag does not, so every event of the drag carries the same stand-in.
	 */
	function dragging() {
		const types: string[] = []
		const dataTransfer = {
			types,
			effectAllowed: 'uninitialized',
			dropEffect: 'none',
			setData: (type: string) => void types.push(type),
			setDragImage: () => {},
		}
		return async (
			type: 'dragstart' | 'dragenter' | 'dragover' | 'dragleave' | 'drop' | 'dragend',
			target: HTMLElement
		) => {
			const event = new DragEvent(type, { bubbles: true, cancelable: true })
			Object.defineProperty(event, 'dataTransfer', { value: dataTransfer })
			target.dispatchEvent(event)
			// the wash follows the state on the next flush
			await tick()
			return event
		}
	}
</script>

{#snippet template(args: ComponentProps<typeof DropTarget>)}
	{@const { children: _, ...target } = args}
	<div class="col">
		{#each stores as store (store.id)}
			<DropTarget {...target}>
				<List header={store.name} count={store.rows.length} rows={store.rows} dragGroup={GROUP} />
			</DropTarget>
		{/each}
	</div>
{/snippet}

<!-- A row picked up from the first list and dropped on the second: the row dims, the second list takes the wash, and
     the drop hands over the row's id -->
<Story
	name="Default"
	{template}
	play={async ({ canvasElement, args }) => {
		if (!hasCanvas(canvasElement)) return
		const { second, secondVeil, row } = regionsOf(canvasElement)
		await expect(row).toHaveAttribute('draggable', 'true')
		const drag = dragging()
		await drag('dragstart', row)
		await waitFor(() => expect(row).toHaveAttribute('data-dragging'))
		const enter = await drag('dragenter', second)
		await expect(enter.defaultPrevented).toBe(true)
		await expect(secondVeil).toHaveClass('ed-droptarget-over')
		// crossing into a child and back out of it is not leaving the region
		const child = second.querySelector<HTMLElement>('[role="row"]')!
		await drag('dragenter', child)
		await drag('dragleave', child)
		await expect(secondVeil).toHaveClass('ed-droptarget-over')
		await drag('drop', second)
		await expect(secondVeil).not.toHaveClass('ed-droptarget-over')
		await expect(args.ondrop).toHaveBeenCalledWith([stores[0]!.rows[0]!.id])
		await expect(row).not.toHaveAttribute('data-dragging')
	}}
/>

<!-- The wash, held open over the second list while a row of the first is dragged -->
<Story
	name="Dragging over"
	{template}
	play={async ({ canvasElement }) => {
		if (!hasCanvas(canvasElement)) return
		const { second, secondVeil, row } = regionsOf(canvasElement)
		const drag = dragging()
		await drag('dragstart', row)
		await drag('dragenter', second)
		await expect(secondVeil).toHaveClass('ed-droptarget-over')
	}}
/>

<!-- A list is no target for its own rows: no wash, and a drop there does nothing -->
<Story
	name="Own row"
	{template}
	play={async ({ canvasElement, args }) => {
		if (!hasCanvas(canvasElement)) return
		const { first, firstVeil, row } = regionsOf(canvasElement)
		const drag = dragging()
		await drag('dragstart', row)
		const over = await drag('dragover', first)
		await expect(over.defaultPrevented).toBe(false)
		await expect(firstVeil).not.toHaveClass('ed-droptarget-over')
		await drag('drop', first)
		await drag('dragend', row)
		await expect(args.ondrop).not.toHaveBeenCalled()
		await expect(row).not.toHaveAttribute('data-dragging')
	}}
/>

<!-- Rows of a group the region does not accept pass over it untouched -->
<Story
	name="Other group"
	{template}
	args={{ accepts: ['task'] }}
	play={async ({ canvasElement, args }) => {
		if (!hasCanvas(canvasElement)) return
		const { second, secondVeil, row } = regionsOf(canvasElement)
		const drag = dragging()
		await drag('dragstart', row)
		const enter = await drag('dragenter', second)
		await expect(enter.defaultPrevented).toBe(false)
		await expect(secondVeil).not.toHaveClass('ed-droptarget-over')
		await drag('drop', second)
		await drag('dragend', row)
		await expect(args.ondrop).not.toHaveBeenCalled()
	}}
/>

<!-- Off: the drag passes as if the region were not there -->
<Story
	name="Disabled"
	{template}
	args={{ disabled: true }}
	play={async ({ canvasElement, args }) => {
		if (!hasCanvas(canvasElement)) return
		const { second, secondVeil, row } = regionsOf(canvasElement)
		const drag = dragging()
		await drag('dragstart', row)
		const enter = await drag('dragenter', second)
		await expect(enter.defaultPrevented).toBe(false)
		await expect(secondVeil).not.toHaveClass('ed-droptarget-over')
		const drop = await drag('drop', second)
		await expect(drop.defaultPrevented).toBe(false)
		await drag('dragend', row)
		await expect(args.ondrop).not.toHaveBeenCalled()
	}}
/>

<style>
	.col {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
		max-width: calc(var(--sheet-max) * 0.55);
	}
</style>
