<script module lang="ts">
	import type { IconName } from '../../icons/icons.js'

	/** One tile the Garden can show. */
	export interface WidgetCatalogItem {
		id: string
		title: string
		/** A quiet line under the title: the sizes it comes in, what it shows. */
		note?: string
		/** Already on the Garden: it reads "Added" and cannot be added again. */
		placed?: boolean
	}
	/** The tiles of one domain, or the shell's own. */
	export interface WidgetCatalogGroup {
		id: string
		/** The themed domain name. */
		label: string
		/** The domain glyph: pass `domainGlyph(id)`. */
		icon?: IconName
		items: WidgetCatalogItem[]
	}
</script>

<script lang="ts">
	// The Garden's catalog (D-155): every tile the enabled domains and the shell offer, grouped by domain, each with an
	// Add button until it is placed. A tile is placed once, so a placed one says so in the button's place. The sheet
	// stays open after an Add, so several tiles can be added in one visit; Done, Escape and the scrim close it. A
	// centred sheet on desktop and a bottom sheet on mobile. What a group and a tile are called is the app's.
	import type { ComponentProps } from 'svelte'
	import Icon from '../../icons/Icon.svelte'
	import { useStrings } from '../../i18n/context.js'
	import Button from '../Button/Button.svelte'
	import Sheet, { type SheetCloseReason } from '../Sheet/Sheet.svelte'

	type Props = Omit<ComponentProps<typeof Sheet>, 'children' | 'header' | 'footer' | 'label' | 'labelledby'> & {
		/** Bindable. Set it to open and close; every close path sets it back to false. */
		open?: boolean
		/** The tiles, by domain, in the order to show them. A group with no tiles is not drawn. */
		groups: WidgetCatalogGroup[]
		/** Add was pressed on a tile; the parent places it and marks it `placed`. */
		onadd?: (id: string) => void
		/** Called after the sheet has closed, with why. */
		onclose?: (reason: SheetCloseReason) => void
	}
	const uid = $props.id()
	let { open = $bindable(false), groups, onadd, onclose, class: className = '', ...rest }: Props = $props()

	const s = useStrings()
	const titleId = `${uid}-title`
	const shown = $derived(groups.filter((group) => group.items.length > 0))
</script>

<Sheet
	bind:open
	size="md"
	labelledby={titleId}
	initialFocus="container"
	{onclose}
	class="ed-catalog {className}"
	{...rest}
>
	{#snippet header()}
		<h2 class="ed-catalog-title" id={titleId}>{s.widgetCatalog.title}</h2>
	{/snippet}
	<div class="ed-catalog-groups">
		{#each shown as group (group.id)}
			{@const groupId = `${uid}-${group.id}`}
			<section class="ed-catalog-group" aria-labelledby={groupId}>
				<h3 class="ed-catalog-group-name" id={groupId}>
					{#if group.icon}<Icon name={group.icon} size="sm" />{/if}
					<span>{group.label}</span>
				</h3>
				<ul class="ed-catalog-list">
					{#each group.items as item (item.id)}
						<li class="ed-catalog-row">
							<span class="ed-catalog-text">
								<span class="ed-catalog-name">{item.title}</span>
								{#if item.note}<span class="ed-catalog-note">{item.note}</span>{/if}
							</span>
							{#if item.placed}
								<span class="ed-catalog-added">
									<Icon name="check" size="sm" />
									<span>{s.widgetCatalog.added}</span>
								</span>
							{:else}
								<Button
									label={s.widgetCatalog.add}
									aria-label={s.widgetCatalog.addNamed(item.title)}
									icon="plus"
									variant="secondary"
									onclick={() => onadd?.(item.id)}
								/>
							{/if}
						</li>
					{/each}
				</ul>
			</section>
		{/each}
	</div>
	{#snippet footer()}
		<Button label={s.widgetCatalog.done} variant="primary" onclick={() => (open = false)} />
	{/snippet}
</Sheet>

<style>
	.ed-catalog-title {
		margin: 0;
		font: var(--ed-t-title);
		letter-spacing: var(--ed-t-title-tracking);
		font-variation-settings: var(--ed-t-title-opsz);
		color: var(--text-primary);
	}
	.ed-catalog-groups {
		display: flex;
		flex-direction: column;
		gap: var(--space-6);
	}
	.ed-catalog-group {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}
	.ed-catalog-group-name {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		margin: 0;
		font: var(--ed-t-label);
		letter-spacing: var(--ed-t-label-tracking);
		color: var(--text-secondary);
	}
	.ed-catalog-list {
		display: flex;
		flex-direction: column;
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.ed-catalog-row {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		min-height: var(--ed-row);
		padding-block: var(--space-2);
		border-bottom: 1px solid var(--stroke-subtle);
	}
	.ed-catalog-row:last-child {
		border-bottom: 0;
	}
	.ed-catalog-text {
		flex: 1;
		display: flex;
		flex-direction: column;
		min-width: 0;
	}
	.ed-catalog-name {
		font: var(--ed-t-body);
		letter-spacing: var(--ed-t-body-tracking);
		color: var(--text-primary);
		overflow-wrap: anywhere;
	}
	.ed-catalog-note {
		font: var(--ed-t-body-sm);
		letter-spacing: var(--ed-t-body-sm-tracking);
		color: var(--text-secondary);
	}
	.ed-catalog-added {
		flex: none;
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		font: var(--ed-t-label);
		letter-spacing: var(--ed-t-label-tracking);
		color: var(--text-secondary);
	}
</style>
