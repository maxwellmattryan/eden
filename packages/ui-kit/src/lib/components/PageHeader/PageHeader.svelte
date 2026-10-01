<script module lang="ts">
	import type { ComponentProps } from 'svelte'
	import type { IconName } from '../../icons/icons.js'
	import Button from '../Button/Button.svelte'
	import type { MenuItem } from '../Menu/Menu.svelte'

	/** A header action, rendered as a Button; the first in the list is the page's primary. */
	export interface PageHeaderAction {
		/** Disambiguates two actions with the same label. */
		id?: string
		label: string
		icon?: IconName
		/** primary for the first and secondary for the rest unless set. */
		variant?: NonNullable<ComponentProps<typeof Button>['variant']>
		/** Shown but not yet available: the Garden's "Edit layout" before edit mode exists. */
		disabled?: boolean
		onclick?: () => void
		/** The button opens a Menu of these instead of acting itself: one Add that offers what can be added. */
		menu?: MenuItem[]
	}
</script>

<script lang="ts">
	// The top of every domain page (docs/design/ux-patterns.md, "Page anatomy"): the quiet back arrow when there is
	// somewhere to go, the domain glyph at icon-lg, the themed name in display-lg with the brand rule under it where the
	// brand dial sets one, its plain subtitle in caption, the actions on the right (the first is the primary) and a filter
	// row beneath when the page is a list. The top right is also where a page's notices sit (`aside`): what the owner
	// should know before reading the page, such as a weather alert. It stands beside the name and the filters together,
	// so a notice of a few lines never makes the header taller than they are. On mobile the actions and the aside
	// wrap under the name. Never a second row of buttons. An action with a `menu` opens it under itself, lined up
	// with the button's end, and the pick is reported by the item's own `onselect`. A domain's motif (D-62) fills the room the header leaves
	// empty: from where the name and the filters end to where the actions or the notices begin, or to the page's
	// gutter when there are none. It never lies behind anything the header holds, and it fades in from the name's side
	// and out towards the page: decoration, so it takes no pointer and has no name.
	import type { Snippet } from 'svelte'
	import type { HTMLAttributes } from 'svelte/elements'
	import Icon from '../../icons/Icon.svelte'
	import { measure } from '../../internal/measure.js'
	import { platformOf } from '../../internal/platform.js'
	import BackButton from '../BackButton/BackButton.svelte'
	import Menu from '../Menu/Menu.svelte'

	type Props = Omit<HTMLAttributes<HTMLElement>, 'children'> & {
		/** The themed domain name, the page's h1. */
		name: string
		/** The plain subtitle beneath the name. Metadata a reader can do without, so it sits in text-tertiary. */
		subtitle?: string
		/** The domain glyph: pass `domainGlyph(id)`. */
		icon?: IconName
		/** Shows the back arrow: true, or the previous screen's name as its breadcrumb tooltip. Needs `onback`. */
		back?: boolean | string
		/** Goes back. */
		onback?: () => void
		/** The actions on the right; the first renders primary, the rest secondary. */
		actions?: PageHeaderAction[]
		/** The row beneath: a Segmented for tabs inside the domain, filter chips. */
		filters?: Snippet
		/** The top right of the page: its notices, such as an alert. Beside the actions, or alone. */
		aside?: Snippet
		/** The domain's motif, in the room the header leaves empty beside the name (D-62): a `Sketch`. Decoration only. */
		motif?: Snippet
		/** What the motif is showing, in a quiet line at the foot of its room: which way, how much. Left out when the
		 * room is too narrow to hold it clear of the filters. */
		legend?: Snippet
	}
	let {
		name,
		subtitle,
		icon,
		back = false,
		onback,
		actions = [],
		filters,
		aside,
		motif,
		legend,
		class: className = '',
		...rest
	}: Props = $props()

	// The one menu an action opens: which action's it is, and the button it hangs from.
	const keyOf = (action: PageHeaderAction) => action.id ?? action.label
	let menuKey = $state<string>()
	let menuAnchor = $state<HTMLElement>()
	let menuOpen = $state(false)
	const menuAction = $derived(actions.find((action) => keyOf(action) === menuKey))
	function toggleMenu(action: PageHeaderAction, button: HTMLElement) {
		const same = menuOpen && menuKey === keyOf(action)
		menuKey = keyOf(action)
		menuAnchor = button
		menuOpen = !same
	}

	// The root, for the platform: on mobile the actions take a row of their own under the name.
	let root = $state<HTMLElement>()
	const stacked = $derived(root ? platformOf(root) === 'mobile' : false)

	// The motif's room, in the header's own pixels: where what stands on the left ends, and how far from the right
	// edge what stands on the right begins. Read again whenever any of them changes size.
	let title = $state<HTMLElement>()
	let filtersRow = $state<HTMLElement>()
	let actionsRow = $state<HTMLElement>()
	let asideColumn = $state<HTMLElement>()
	let room = $state<{ start: number; end: number | null; width: number }>({ start: 0, end: null, width: 0 })
	/** The least room, in px, in which a legend stands clear of what is on the left. */
	const LEGEND_ROOM = 280
	const place = measure(() => {
		if (!root) return
		const ends = [title, filtersRow].map((el) => (el ? el.offsetLeft + el.offsetWidth : 0))
		const begins = [actionsRow, asideColumn].flatMap((el) => (el ? [el.offsetLeft] : []))
		const start = Math.max(...ends)
		const end = begins.length ? root.clientWidth - Math.min(...begins) : null
		room = { start, end, width: root.clientWidth - start - (end ?? 0) }
	})
</script>

<header
	class={['ed-page-header', { 'ed-page-header-stacked': stacked, 'ed-page-header-with-aside': !!aside }, className]}
	bind:this={root}
	{...rest}
>
	{#if motif}
		<div
			class="ed-page-header-motif"
			aria-hidden="true"
			style:--ed-page-header-motif-start="{room.start}px"
			style:--ed-page-header-motif-end={room.end == null ? undefined : `${room.end}px`}
		>
			{@render motif()}
		</div>
		{#if legend && room.width >= LEGEND_ROOM}
			<div
				class="ed-page-header-legend"
				data-tertiary
				style:--ed-page-header-motif-end={room.end == null ? undefined : `${room.end}px`}
			>
				{@render legend()}
			</div>
		{/if}
	{/if}
	<div class="ed-page-header-row">
		{#if back}<BackButton {onback} breadcrumb={typeof back === 'string' ? back : undefined} />{/if}
		{#if icon}<Icon name={icon} size="lg" class="ed-page-header-glyph" />{/if}
		<div class="ed-page-header-title" bind:this={title} {@attach motif && place}>
			<h1 class="ed-page-header-name">{name}</h1>
			{#if subtitle}<p class="ed-page-header-sub" data-tertiary>{subtitle}</p>{/if}
		</div>
		{#if actions.length}
			<div class="ed-page-header-actions" bind:this={actionsRow} {@attach motif && place}>
				{#each actions as action, i (keyOf(action))}
					{#if action.menu?.length}
						<Button
							label={action.label}
							icon={action.icon}
							variant={action.variant ?? (i === 0 ? 'primary' : 'secondary')}
							disabled={action.disabled}
							aria-haspopup="menu"
							aria-expanded={menuOpen && menuKey === keyOf(action)}
							onclick={(event) => toggleMenu(action, event.currentTarget)}
						/>
					{:else}
						<Button
							label={action.label}
							icon={action.icon}
							variant={action.variant ?? (i === 0 ? 'primary' : 'secondary')}
							disabled={action.disabled}
							onclick={action.onclick}
						/>
					{/if}
				{/each}
			</div>
			{#if menuAction?.menu?.length}
				<Menu bind:open={menuOpen} anchor={menuAnchor} label={menuAction.label} items={menuAction.menu} />
			{/if}
		{/if}
	</div>
	{#if filters}
		<div class="ed-page-header-filters" bind:this={filtersRow} {@attach motif && place}>{@render filters()}</div>
	{/if}
	{#if aside}
		<div class="ed-page-header-aside" bind:this={asideColumn} {@attach motif && place}>{@render aside()}</div>
	{/if}
</header>

<style>
	.ed-page-header {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
		padding: var(--space-4) var(--ed-gutter) var(--space-4);
		color: var(--text-primary);
		/* what the header holds is placed against it, and so is the motif's room */
		position: relative;
	}
	/* The motif's room runs a little past what it shows: from the very end of what stands on the left, through the
	   gutter to the header's edge, and above the header's top, so the feathering falls outside the streaks a reader
	   sees. Only its faintest part comes near the name. Never below the foot, where the page's cards begin. */
	.ed-page-header-motif {
		position: absolute;
		inset-block: calc(-1 * var(--space-6)) 0;
		inset-inline-start: var(--ed-page-header-motif-start, 0px);
		inset-inline-end: var(--ed-page-header-motif-end, 0px);
		pointer-events: none;
		/* Feathered on every side, so no line says where the room begins: each edge eases in over its feather rather
		   than ramping, and the foot fades into the page as it did */
		--ed-page-header-motif-side: calc(var(--space-8) * 3);
		--ed-page-header-motif-top: calc(var(--space-8) + var(--space-6));
		mask-image:
			linear-gradient(
				to right,
				transparent,
				rgb(0 0 0 / 0.1) calc(var(--ed-page-header-motif-side) * 0.3),
				rgb(0 0 0 / 0.5) calc(var(--ed-page-header-motif-side) * 0.6),
				rgb(0 0 0 / 0.88) calc(var(--ed-page-header-motif-side) * 0.85),
				black var(--ed-page-header-motif-side),
				black calc(100% - var(--ed-page-header-motif-side)),
				rgb(0 0 0 / 0.88) calc(100% - var(--ed-page-header-motif-side) * 0.85),
				rgb(0 0 0 / 0.5) calc(100% - var(--ed-page-header-motif-side) * 0.6),
				rgb(0 0 0 / 0.1) calc(100% - var(--ed-page-header-motif-side) * 0.3),
				transparent
			),
			linear-gradient(
				to bottom,
				transparent,
				rgb(0 0 0 / 0.1) calc(var(--ed-page-header-motif-top) * 0.3),
				rgb(0 0 0 / 0.5) calc(var(--ed-page-header-motif-top) * 0.6),
				rgb(0 0 0 / 0.88) calc(var(--ed-page-header-motif-top) * 0.85),
				black var(--ed-page-header-motif-top),
				black 75%,
				transparent
			);
		mask-composite: intersect;
	}
	/* The legend stands at the foot of the motif's room, on the line of the filters, clear of the feathering */
	.ed-page-header-legend {
		position: absolute;
		inset-block-end: var(--space-4);
		inset-inline-end: calc(var(--ed-page-header-motif-end, var(--ed-gutter) - var(--space-4)) + var(--space-4));
		display: flex;
		align-items: center;
		gap: var(--space-1);
		min-height: var(--space-6);
		font: var(--ed-t-caption);
		letter-spacing: var(--ed-t-caption-tracking);
		color: var(--text-tertiary);
	}
	.ed-page-header-row {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		min-width: 0;
	}
	.ed-page-header :global(.ed-page-header-glyph) {
		color: var(--text-secondary);
	}
	.ed-page-header-title {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		min-width: 0;
	}
	.ed-page-header-name {
		margin: 0;
		font: var(--ed-t-display-lg);
		letter-spacing: var(--ed-t-display-lg-tracking);
		font-variation-settings: var(--ed-t-display-lg-opsz);
		color: var(--text-primary);
		text-wrap: balance;
	}
	.ed-page-header-sub {
		margin: 0;
		font: var(--ed-t-caption);
		letter-spacing: var(--ed-t-caption-tracking);
		color: var(--text-tertiary);
	}
	.ed-page-header-actions {
		display: flex;
		flex: none;
		align-items: center;
		gap: var(--space-2);
		margin-left: auto;
	}
	/* With an aside the header is two columns: the name and the filters on the left, the notices on the right
	   beside them both, so the header is as tall as the taller side and no taller */
	.ed-page-header-with-aside {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(0, var(--sheet-sm));
		grid-template-areas: 'row aside' 'filters aside';
		align-items: start;
		column-gap: var(--space-6);
	}
	.ed-page-header-with-aside .ed-page-header-row {
		grid-area: row;
	}
	.ed-page-header-with-aside .ed-page-header-filters {
		grid-area: filters;
	}
	.ed-page-header-aside {
		grid-area: aside;
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		min-width: 0;
	}
	.ed-page-header-filters {
		/* as wide as what it holds, so the room beside it is the motif's */
		width: fit-content;
		max-width: 100%;
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2);
	}
	/* mobile: the actions wrap under the name, never a second row of buttons in the header */
	.ed-page-header-stacked .ed-page-header-row {
		flex-wrap: wrap;
	}
	.ed-page-header-stacked.ed-page-header-with-aside {
		grid-template-columns: minmax(0, 1fr);
		grid-template-areas: 'row' 'aside' 'filters';
	}
	.ed-page-header-stacked .ed-page-header-actions {
		flex-basis: 100%;
		flex-wrap: wrap;
		margin-left: 0;
	}
</style>
