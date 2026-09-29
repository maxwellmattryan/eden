<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf'
	import { expect, fn, userEvent, waitFor } from 'storybook/test'
	import { canvasOf } from '../../../storybook/play.js'
	import { defaultStrings } from '$lib/i18n/strings.js'
	import { inbox, integrations, recipes } from '../../../stories/sample-data.js'
	import Button from '../Button/Button.svelte'
	import Field from '../Field/Field.svelte'
	import IconButton from '../IconButton/IconButton.svelte'
	import Popover from './Popover.svelte'

	const strings = defaultStrings
	const google = integrations[0]!
	const meteo = integrations[1]!
	const recipe = recipes[0]!
	const renameLabel = 'Rename the recipe'
	const contextLabel = 'Recipe actions'
	const areaLabel = 'Right-click here for a popover at the pointer'

	const { Story } = defineMeta({
		title: 'Components/Overlays/Popover',
		component: Popover,
		tags: ['autodocs'],
		parameters: {
			platformFrame: 'inline',
			docs: {
				description: {
					component:
						'An anchored floating panel in the browser’s top layer: menus, the inbox behind the bell, the Quick Log sheet behind +, an integration’s status. It sits below its anchor and flips above when there is no room (or when `side="top"` fits), lines up with the anchor’s start or end, unfurls from the anchor’s edge, and closes on Escape or a pointer outside, handing focus back to the anchor. As a `dialog` (the default) it traps Tab and focuses its first control; a `menu` leaves focus to its items.',
				},
			},
		},
		args: { align: 'start', side: 'bottom', gap: 6, role: 'dialog', onclose: fn() },
		argTypes: {
			align: { control: 'inline-radio', options: ['start', 'end'] },
			side: { control: 'inline-radio', options: ['top', 'bottom'] },
			role: { control: 'inline-radio', options: ['dialog', 'menu'] },
			anchor: { control: false },
		},
	})
</script>

<script lang="ts">
	let open = $state(false)
	let trigger = $state<HTMLElement>()
	let point = $state<{ getBoundingClientRect(): DOMRect }>()
	let name = $state(recipe.name)

	// A right-click (or a click) opens at the pointer; a keyboard activation has no pointer, so it opens at the area's centre.
	function atPointer(e: MouseEvent) {
		e.preventDefault()
		const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
		const x = e.detail === 0 ? rect.left + rect.width / 2 : e.clientX
		const y = e.detail === 0 ? rect.top + rect.height / 2 : e.clientY
		point = { getBoundingClientRect: () => new DOMRect(x, y, 0, 0) }
		open = true
	}
</script>

<Story
	name="Below"
	parameters={{
		docs: {
			description: {
				story:
					'The default: below the anchor, lined up with its start. The anchor is the span around the trigger, so focus returns to the control inside it.',
			},
		},
	}}
	play={async ({ canvasElement, args }) => {
		const canvas = canvasOf(canvasElement)
		const trigger = canvas.getByRole('button', { name: google.label })
		await userEvent.click(trigger)
		const panel = await canvas.findByRole('dialog', { name: google.label })
		await waitFor(() => expect(panel).toBeVisible())
		await expect(panel).toHaveAttribute('data-side', 'bottom')
		await userEvent.keyboard('{Escape}')
		await waitFor(() => expect(panel).not.toBeVisible())
		await expect(args.onclose).toHaveBeenLastCalledWith('escape')
		await waitFor(() => expect(trigger).toHaveFocus())
		// a pointer down outside closes too
		await userEvent.click(trigger)
		await waitFor(() => expect(panel).toBeVisible())
		await userEvent.click(canvasElement)
		await waitFor(() => expect(panel).not.toBeVisible())
		await expect(args.onclose).toHaveBeenLastCalledWith('outside')
	}}
>
	{#snippet template(args)}
		<span class="sb-anchor" bind:this={trigger}>
			<Button
				label={google.label}
				iconRight="chevron-down"
				aria-haspopup="dialog"
				aria-expanded={open}
				onclick={() => (open = !open)}
			/>
		</span>
		<Popover
			bind:open
			anchor={trigger}
			align={args.align}
			side={args.side}
			gap={args.gap}
			role={args.role}
			onclose={args.onclose}
			label={google.label}
		>
			<div class="sb-card">
				<p class="sb-title">{google.label}</p>
				<p class="sb-line">{google.detail}</p>
				<Button label={strings.statusBar.syncNow} size="md" />
			</div>
		</Popover>
	{/snippet}
</Story>

<Story
	name="Above"
	parameters={{
		docs: {
			description: {
				story: 'The anchor sits at the bottom of the canvas, so the panel flips above it and unfurls upwards.',
			},
		},
	}}
	play={async ({ canvasElement }) => {
		const canvas = canvasOf(canvasElement)
		const trigger = canvas.getByRole('button', { name: meteo.label })
		await userEvent.click(trigger)
		const panel = await canvas.findByRole('dialog', { name: meteo.label })
		await waitFor(() => expect(panel).toBeVisible())
		await expect(panel).toHaveAttribute('data-side', 'top')
		await expect(panel.getBoundingClientRect().bottom).toBeLessThanOrEqual(trigger.getBoundingClientRect().top)
		await userEvent.keyboard('{Escape}')
		await waitFor(() => expect(panel).not.toBeVisible())
		await waitFor(() => expect(trigger).toHaveFocus())
	}}
>
	{#snippet template(args)}
		<div class="sb-bottom">
			<span class="sb-anchor" bind:this={trigger}>
				<Button
					label={meteo.label}
					iconRight="chevron-up"
					aria-haspopup="dialog"
					aria-expanded={open}
					onclick={() => (open = !open)}
				/>
			</span>
		</div>
		<Popover
			bind:open
			anchor={trigger}
			align={args.align}
			side={args.side}
			gap={args.gap}
			role={args.role}
			onclose={args.onclose}
			label={meteo.label}
		>
			<div class="sb-card">
				<p class="sb-title">{meteo.label}</p>
				<p class="sb-line">{meteo.detail}</p>
			</div>
		</Popover>
	{/snippet}
</Story>

<Story
	name="Align end"
	args={{ align: 'end' }}
	parameters={{
		docs: {
			description: {
				story: 'The inbox behind the bell: the panel’s end edge lines up with the anchor’s, so it grows leftwards.',
			},
		},
	}}
	play={async ({ canvasElement }) => {
		const canvas = canvasOf(canvasElement)
		const trigger = canvas.getByRole('button', { name: strings.iconButton.withCount(strings.statusBar.inbox, 2) })
		await userEvent.click(trigger)
		const panel = await canvas.findByRole('dialog', { name: strings.statusBar.inbox })
		await waitFor(() => expect(panel).toBeVisible())
		await expect(panel).toHaveAttribute('data-align', 'end')
		const drift = Math.abs(panel.getBoundingClientRect().right - trigger.getBoundingClientRect().right)
		await expect(drift).toBeLessThanOrEqual(2)
		await userEvent.keyboard('{Escape}')
		await waitFor(() => expect(panel).not.toBeVisible())
	}}
>
	{#snippet template(args)}
		<div class="sb-end">
			<span class="sb-anchor" bind:this={trigger}>
				<IconButton
					icon="bell"
					label={strings.statusBar.inbox}
					count={2}
					active={open}
					aria-haspopup="dialog"
					aria-expanded={open}
					onclick={() => (open = !open)}
				/>
			</span>
		</div>
		<Popover
			bind:open
			anchor={trigger}
			align={args.align}
			side={args.side}
			gap={args.gap}
			role={args.role}
			onclose={args.onclose}
			label={strings.statusBar.inbox}
		>
			<ul class="sb-inbox">
				{#each inbox as item (item.id)}
					<li>
						<span>{item.line}</span>
						<span class="sb-when">{item.when}</span>
					</li>
				{/each}
			</ul>
		</Popover>
	{/snippet}
</Story>

<Story
	name="As dialog"
	parameters={{
		docs: {
			description: {
				story:
					'A small form. The first control takes focus, Tab cycles inside the panel, and Escape or a pointer outside closes it and returns focus to the trigger.',
			},
		},
	}}
	play={async ({ canvasElement, args }) => {
		const canvas = canvasOf(canvasElement)
		const trigger = canvas.getByRole('button', { name: renameLabel })
		await userEvent.click(trigger)
		const panel = await canvas.findByRole('dialog', { name: renameLabel })
		await waitFor(() => expect(panel).toBeVisible())
		const input = canvas.getByRole('textbox', { name: 'Name' })
		await waitFor(() => expect(input).toHaveFocus())
		await userEvent.tab()
		await userEvent.tab()
		await expect(panel.contains(document.activeElement)).toBe(true)
		await userEvent.tab()
		await expect(input).toHaveFocus()
		await userEvent.tab({ shift: true })
		await expect(panel.contains(document.activeElement)).toBe(true)
		await userEvent.keyboard('{Escape}')
		await waitFor(() => expect(panel).not.toBeVisible())
		await expect(args.onclose).toHaveBeenLastCalledWith('escape')
		await waitFor(() => expect(trigger).toHaveFocus())
	}}
>
	{#snippet template(args)}
		<span class="sb-anchor" bind:this={trigger}>
			<Button
				label={renameLabel}
				icon="pencil"
				aria-haspopup="dialog"
				aria-expanded={open}
				onclick={() => (open = !open)}
			/>
		</span>
		<Popover
			bind:open
			anchor={trigger}
			align={args.align}
			side={args.side}
			gap={args.gap}
			role={args.role}
			onclose={args.onclose}
			label={renameLabel}
		>
			<form
				class="sb-form"
				onsubmit={(e) => {
					e.preventDefault()
					open = false
				}}
			>
				<Field label="Name" bind:value={name} />
				<div class="sb-actions">
					<Button label={strings.cancel} variant="quiet" size="md" onclick={() => (open = false)} />
					<Button label={strings.save} variant="primary" size="md" type="submit" />
				</div>
			</form>
		</Popover>
	{/snippet}
</Story>

<Story
	name="At a point"
	parameters={{
		docs: {
			description: {
				story:
					'A context position: the anchor is any object with `getBoundingClientRect`, here a zero-size rect at the pointer from a right-click.',
			},
		},
	}}
	play={async ({ canvasElement, args }) => {
		const canvas = canvasOf(canvasElement)
		const area = canvas.getByText(areaLabel)
		await userEvent.pointer({ keys: '[MouseRight]', target: area })
		const panel = await canvas.findByRole('dialog', { name: contextLabel })
		await waitFor(() => expect(panel).toBeVisible())
		await userEvent.click(canvasElement)
		await waitFor(() => expect(panel).not.toBeVisible())
		await expect(args.onclose).toHaveBeenLastCalledWith('outside')
	}}
>
	{#snippet template(args)}
		<button type="button" class="sb-area" oncontextmenu={atPointer} onclick={atPointer}>{areaLabel}</button>
		<Popover
			bind:open
			anchor={point}
			align={args.align}
			side={args.side}
			gap={args.gap}
			role={args.role}
			onclose={args.onclose}
			label={contextLabel}
		>
			<div class="sb-card">
				<Button label={strings.add} variant="quiet" size="md" icon="plus" onclick={() => (open = false)} />
				<Button label={strings.undo} variant="quiet" size="md" icon="undo-2" onclick={() => (open = false)} />
			</div>
		</Popover>
	{/snippet}
</Story>

<style>
	.sb-anchor {
		display: inline-block;
	}
	.sb-bottom {
		display: flex;
		align-items: flex-end;
		min-height: calc(100dvh - 2 * var(--space-6));
	}
	.sb-end {
		display: flex;
		justify-content: flex-end;
	}
	.sb-card {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: var(--space-2);
		padding: var(--space-3) var(--space-4);
	}
	.sb-title {
		margin: 0;
		font: var(--ed-t-label);
		letter-spacing: var(--ed-t-label-tracking);
	}
	.sb-line {
		margin: 0;
		font: var(--ed-t-body-sm);
		color: var(--text-secondary);
	}
	.sb-inbox {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		width: var(--sheet-sm);
		max-width: 100%;
		margin: 0;
		padding: var(--space-3) var(--space-4);
		list-style: none;
		font: var(--ed-t-body-sm);
	}
	.sb-inbox li {
		display: flex;
		justify-content: space-between;
		gap: var(--space-3);
	}
	.sb-when {
		flex: none;
		font: var(--ed-t-caption);
		letter-spacing: var(--ed-t-caption-tracking);
		color: var(--text-secondary);
	}
	.sb-form {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
		width: calc(var(--sheet-sm) - var(--space-8));
		max-width: 100%;
		padding: var(--space-4);
	}
	.sb-actions {
		display: flex;
		justify-content: flex-end;
		gap: var(--space-2);
	}
	.sb-area {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 100%;
		min-height: calc(var(--touch-target) * 3);
		margin: 0;
		padding: 0;
		border: 1px dashed var(--stroke);
		border-radius: var(--ed-radius-card);
		background: transparent;
		font: var(--ed-t-body);
		color: var(--text-secondary);
		cursor: context-menu;
	}
	.sb-area:focus-visible {
		outline: 2px solid transparent;
		box-shadow: var(--focus-ring);
	}
</style>
