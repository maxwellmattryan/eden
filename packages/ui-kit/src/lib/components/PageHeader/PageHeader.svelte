<script module lang="ts">
	import type { ComponentProps } from 'svelte'
	import type { IconName } from '../../icons/icons.js'
	import Button from '../Button/Button.svelte'

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
	}
</script>

<script lang="ts">
	// The top of every domain page (docs/design/ux-patterns.md, "Page anatomy"): the quiet back arrow when there is
	// somewhere to go, the domain glyph at icon-lg, the themed name in display-lg with the brand rule under it where the
	// brand dial sets one, its plain subtitle in caption, the actions on the right (the first is the primary) and a filter
	// row beneath when the page is a list. The top right is also where a page's notices sit (`aside`): what the owner
	// should know before reading the page, such as a weather alert. It stands beside the name and the filters together,
	// so a notice of a few lines never makes the header taller than they are. On mobile the actions and the aside
	// wrap under the name. Never a second row of buttons.
	import type { Snippet } from 'svelte'
	import type { HTMLAttributes } from 'svelte/elements'
	import Icon from '../../icons/Icon.svelte'
	import { platformOf } from '../../internal/platform.js'
	import BackButton from '../BackButton/BackButton.svelte'

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
		class: className = '',
		...rest
	}: Props = $props()

	// The root, for the platform: on mobile the actions take a row of their own under the name.
	let root = $state<HTMLElement>()
	const stacked = $derived(root ? platformOf(root) === 'mobile' : false)
</script>

<header
	class={['ed-page-header', { 'ed-page-header-stacked': stacked, 'ed-page-header-with-aside': !!aside }, className]}
	bind:this={root}
	{...rest}
>
	<div class="ed-page-header-row">
		{#if back}<BackButton {onback} breadcrumb={typeof back === 'string' ? back : undefined} />{/if}
		{#if icon}<Icon name={icon} size="lg" class="ed-page-header-glyph" />{/if}
		<div class="ed-page-header-title">
			<h1 class="ed-page-header-name">{name}</h1>
			{#if subtitle}<p class="ed-page-header-sub" data-tertiary>{subtitle}</p>{/if}
		</div>
		{#if actions.length}
			<div class="ed-page-header-actions">
				{#each actions as action, i (action.id ?? action.label)}
					<Button
						label={action.label}
						icon={action.icon}
						variant={action.variant ?? (i === 0 ? 'primary' : 'secondary')}
						disabled={action.disabled}
						onclick={action.onclick}
					/>
				{/each}
			</div>
		{/if}
	</div>
	{#if filters}<div class="ed-page-header-filters">{@render filters()}</div>{/if}
	{#if aside}<div class="ed-page-header-aside">{@render aside()}</div>{/if}
</header>

<style>
	.ed-page-header {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
		padding: var(--space-4) var(--ed-gutter) var(--space-4);
		color: var(--text-primary);
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
