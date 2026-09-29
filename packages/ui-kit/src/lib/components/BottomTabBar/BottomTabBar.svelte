<script module lang="ts">
	import type { IconName } from '../../icons/icons.js'

	/** One tab of the mobile shell. */
	export interface BottomTab {
		/** The plain id (garden, kitchen, more): what `current` holds and `onselect` receives. */
		id: string
		/** The themed name under the glyph. */
		label: string
		/** The glyph: `domainGlyph(id)` for a domain, `menu` for More. */
		icon: IconName
		/** A count on the glyph's corner, read as part of the tab's name. Rare. */
		badge?: number
	}
</script>

<script lang="ts">
	// The mobile shell's tabs: Garden, Today, two pinned domains, More (product/substrate/shell.md). Five equal cells,
	// each its glyph over its label, the current one marked aria-current and drawn in the accent; a badge on a glyph
	// folds into the tab's name. The bar is one tab stop: arrows, Home and End move focus through `roving`; Enter or a
	// tap selects. The kit renders a block that pads the bottom safe-area inset; the app pins it to the viewport.
	import type { HTMLAttributes } from 'svelte/elements'
	import Icon from '../../icons/Icon.svelte'
	import { useStrings } from '../../i18n/context.js'
	import { roving } from '../../internal/roving.js'

	type Props = Omit<HTMLAttributes<HTMLElement>, 'children' | 'onselect'> & {
		/** The tabs, five at most. */
		items: BottomTab[]
		/** The current tab's id. Bindable. */
		current?: string
		/** The nav's accessible name; defaults to the strings' "Sections". */
		label?: string
		/** Called with the id after a tap or Enter selects a tab. */
		onselect?: (id: string) => void
	}
	let { items, current = $bindable(), label, onselect, class: className = '', ...rest }: Props = $props()

	const s = useStrings()

	function pick(id: string) {
		current = id
		onselect?.(id)
	}
</script>

<nav
	class={['ed-tab-bar', className]}
	aria-label={label ?? s.tabBar.label}
	{@attach roving(() => ({ selector: '[data-tab]', orientation: 'horizontal' }))}
	{...rest}
>
	<ul class="ed-tab-bar-list">
		{#each items as tab (tab.id)}
			<li class="ed-tab-bar-cell">
				<button
					class="ed-tab"
					type="button"
					data-tab
					aria-current={tab.id === current ? 'page' : undefined}
					aria-label={tab.badge ? s.tabBar.withBadge(tab.label, tab.badge) : undefined}
					onclick={() => pick(tab.id)}
				>
					<span class="ed-tab-glyph">
						<Icon name={tab.icon} size="md" />
						{#if tab.badge}<span class="ed-tab-badge" aria-hidden="true">{tab.badge}</span>{/if}
					</span>
					<span class="ed-tab-label">{tab.label}</span>
				</button>
			</li>
		{/each}
	</ul>
</nav>

<style>
	.ed-tab-bar {
		box-sizing: border-box;
		padding-bottom: var(--ed-safe-bottom);
		background: var(--surface-1);
		border-top: 1px solid var(--stroke-subtle);
		color: var(--text-secondary);
	}
	.ed-tab-bar-list {
		display: grid;
		grid-auto-flow: column;
		grid-auto-columns: minmax(0, 1fr);
		height: var(--tab-bar);
		margin: 0;
		padding: 0 var(--space-1);
		list-style: none;
	}
	.ed-tab-bar-cell {
		display: flex;
		min-width: 0;
	}
	.ed-tab {
		display: flex;
		flex: 1;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 2px;
		min-width: 0;
		min-height: var(--touch-target);
		height: 100%;
		margin: 0;
		padding: 0 var(--space-1);
		border: 0;
		border-radius: var(--ed-radius-control);
		background: transparent;
		color: var(--text-secondary);
		cursor: pointer;
		-webkit-tap-highlight-color: transparent;
		transition: color var(--ed-duration-micro) var(--ed-ease-out);
	}
	.ed-tab:active {
		color: var(--text-primary);
	}
	/* the current tab: the glyph in the accent; the label in brand-hover, since the accent itself sits under 4.5:1 at 12 px */
	.ed-tab[aria-current='page'] {
		color: var(--brand-primary);
	}
	.ed-tab[aria-current='page'] .ed-tab-label {
		color: var(--brand-hover);
	}
	.ed-tab:focus-visible {
		outline: 2px solid transparent;
		box-shadow: var(--focus-ring);
	}
	.ed-tab-glyph {
		position: relative;
		display: inline-flex;
		flex: none;
	}
	.ed-tab-label {
		max-width: 100%;
		font: var(--ed-t-caption);
		letter-spacing: var(--ed-t-caption-tracking);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	/* a circle for one digit that widens into a pill, on the glyph's top-right corner, as on IconButton */
	.ed-tab-badge {
		position: absolute;
		top: calc(-1 * (var(--space-1) + 2px));
		right: calc(-1 * (var(--space-1) + 2px));
		box-sizing: border-box;
		min-width: var(--space-4);
		height: var(--space-4);
		padding: 0 var(--space-1);
		border-radius: var(--radius-full);
		background: var(--brand-primary);
		color: var(--on-brand);
		font: var(--ed-t-caption);
		font-family: var(--ed-font-mono);
		line-height: var(--space-4);
		text-align: center;
		font-variant-numeric: tabular-nums;
	}
</style>
