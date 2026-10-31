<script module lang="ts">
	import type { IconName } from '../../icons/icons.js'

	/** A swipe action: the label on the revealed button, an optional glyph above it, and what it does. */
	export interface SwipeAction {
		label: string
		icon?: IconName
		onaction: () => void
	}
	/** The leading action, done or check: the accent ground unless neutral. */
	export interface SwipeLeading extends SwipeAction {
		tone?: 'accent' | 'neutral'
	}
	/** The trailing action, delete: the danger ground. */
	export interface SwipeTrailing extends SwipeAction {
		tone?: 'danger'
	}
</script>

<script lang="ts">
	// A row that reveals a leading and a trailing action on a horizontal drag, on mobile only (ux-patterns, "Mobile
	// adaptations"; OQ-19 hand-rolled). The actions are real buttons behind the content, so Tab reaches them without a
	// swipe: a focused one rises above the content at its edge. A drag past the action's width (or 40 % of the row)
	// fires the action on release; anything shorter settles back over the panel duration. Under reduced motion the
	// content never travels: a 600 ms hold shows both actions over the row's ends, and a tap elsewhere or Escape hides
	// them. On desktop the children render unchanged. The gesture lives in `swipe.ts`, on the content itself. A row
	// that has another way to its actions (a list row, whose held press opens its menu) turns the hold off (`hold`)
	// and, where it is one tab stop among many, takes the buttons out of the tab order (`tabbable`).
	import type { Snippet } from 'svelte'
	import type { HTMLAttributes } from 'svelte/elements'
	import Icon from '../../icons/Icon.svelte'
	import { dismiss } from '../../internal/dismiss.js'
	import { platformOf } from '../../internal/platform.js'
	import { swipe } from './swipe.js'

	type Props = Omit<HTMLAttributes<HTMLDivElement>, 'children'> & {
		/** Revealed by a drag to the right: done or check. */
		leading?: SwipeLeading
		/** Revealed by a drag to the left: delete. */
		trailing?: SwipeTrailing
		/** Under reduced motion a 600 ms hold shows both actions. Off for a row whose held press does something else. */
		hold?: boolean
		/** The action buttons are tab stops. Off inside a grid that is one tab stop, where the row's menu holds them. */
		tabbable?: boolean
		/** The row. */
		children: Snippet
	}
	let { leading, trailing, hold = true, tabbable = true, children, class: className = '', ...rest }: Props = $props()

	// The root, for the platform: the wrapper behaves only on mobile.
	let root = $state<HTMLDivElement>()
	const mobile = $derived(root ? platformOf(root) === 'mobile' : false)

	/** The content's travel while a drag is on, in px; 0 at rest. */
	let offset = $state(0)
	let dragging = $state(false)
	/** Both actions shown over the row's ends, the reduced-motion reveal. */
	let revealed = $state(false)

	// both actions share one width; read from whichever is rendered when a pointer goes down
	const actionWidth = () => root?.querySelector<HTMLElement>('.ed-swipe-action')?.offsetWidth ?? 0
	// movement is off when the panel duration is zero: the reduced-motion block in base.css sets it so
	const still = () => (root ? parseFloat(getComputedStyle(root).getPropertyValue('--ed-duration-panel')) === 0 : false)

	function fire(action: SwipeAction | undefined) {
		revealed = false
		action?.onaction()
	}
</script>

<div
	bind:this={root}
	class={['ed-swipe', { 'ed-swipe-dragging': dragging, 'ed-swipe-revealed': revealed }, className]}
	{@attach dismiss(() => ({ when: revealed, onDismiss: () => (revealed = false) }))}
	{...rest}
>
	{#if mobile}
		{#if leading}
			<button
				class="ed-swipe-action ed-swipe-leading ed-swipe-{leading.tone ?? 'accent'}"
				type="button"
				tabindex={tabbable ? undefined : -1}
				onclick={() => fire(leading)}
			>
				{#if leading.icon}<Icon name={leading.icon} size="md" />{/if}
				<span class="ed-swipe-label">{leading.label}</span>
			</button>
		{/if}
		<div
			class="ed-swipe-content"
			style:transform="translateX({offset}px)"
			{@attach swipe(() => ({
				leading: !!leading,
				trailing: !!trailing,
				width: actionWidth,
				rowWidth: () => root?.offsetWidth ?? 0,
				still,
				hold,
				onMove: (dx) => {
					dragging = true
					offset = dx
				},
				onSettle: () => {
					dragging = false
					offset = 0
				},
				onCommit: (side) => fire(side === 'leading' ? leading : trailing),
				onHold: () => (revealed = true),
				onTap: () => (revealed = false),
			}))}
		>
			{@render children()}
		</div>
		{#if trailing}
			<button
				class="ed-swipe-action ed-swipe-trailing ed-swipe-{trailing.tone ?? 'danger'}"
				type="button"
				tabindex={tabbable ? undefined : -1}
				onclick={() => fire(trailing)}
			>
				{#if trailing.icon}<Icon name={trailing.icon} size="md" />{/if}
				<span class="ed-swipe-label">{trailing.label}</span>
			</button>
		{/if}
	{:else}
		{@render children()}
	{/if}
</div>

<style>
	.ed-swipe {
		--ed-swipe-width: calc(var(--touch-target) * 1.5);
		position: relative;
		isolation: isolate;
		overflow: hidden;
		background: var(--surface-1);
	}
	/* the content takes the row's ground so it hides the actions until it moves */
	.ed-swipe-content {
		position: relative;
		z-index: 1;
		background: inherit;
		touch-action: pan-y;
		transition: transform var(--ed-duration-panel) var(--ed-ease-out);
	}
	.ed-swipe-dragging .ed-swipe-content {
		transition: none;
	}
	.ed-swipe-action {
		position: absolute;
		top: 0;
		bottom: 0;
		z-index: 0;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 2px;
		box-sizing: border-box;
		width: var(--ed-swipe-width);
		margin: 0;
		padding: 0 var(--space-1);
		border: 0;
		font: var(--ed-t-caption);
		letter-spacing: var(--ed-t-caption-tracking);
		cursor: pointer;
		opacity: 0;
		transition: opacity var(--ed-duration-micro) var(--ed-ease-out);
	}
	.ed-swipe-leading {
		left: 0;
	}
	.ed-swipe-trailing {
		right: 0;
	}
	/* shown while the content moves; over the content when revealed by a hold or reached by the keyboard */
	.ed-swipe-dragging .ed-swipe-action,
	.ed-swipe-revealed .ed-swipe-action,
	.ed-swipe-action:focus-visible {
		opacity: 1;
	}
	.ed-swipe-revealed .ed-swipe-action,
	.ed-swipe-action:focus-visible {
		z-index: 2;
	}
	.ed-swipe-action:focus-visible {
		outline: 2px solid transparent;
		box-shadow: var(--focus-ring);
	}
	.ed-swipe-accent {
		background: var(--brand-primary);
		color: var(--on-brand);
	}
	.ed-swipe-neutral {
		background: var(--surface-3);
		color: var(--text-primary);
	}
	.ed-swipe-danger {
		background: var(--danger);
		color: var(--on-danger);
	}
	.ed-swipe-label {
		max-width: 100%;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
</style>
