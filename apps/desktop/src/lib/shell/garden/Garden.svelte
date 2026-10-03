<script lang="ts">
	// The Garden (product/substrate/shell.md, "The Garden"), ported from the approved Domains/Garden/Garden story: the
	// quick-navigation row, the grid the shell composes from the manifests, and the activity feed in a column of its
	// own. The tiles compute from their domains' stores; a tile whose domain has nothing to show keeps its one-line
	// prompt. The layout is the owner's on this device (`settings.gardenLayout`, D-156) over the default the shell
	// declares. Edit mode (D-155) changes it and keeps every change as it is made: a tile is dragged beside another,
	// moved by its grip's arrow keys or its menu, resized by its corner or its menu among the sizes it declares, and
	// removed; the catalog adds what is not placed. Remove and Reset can be undone from their toast.
	import {
		EmptyState,
		Icon,
		PageHeader,
		Widget,
		WidgetCatalog,
		WidgetGrid,
		domainGlyph,
		type PageHeaderAction,
		type WidgetSize,
	} from '@eden/ui-kit'
	import { locale, t } from '@eden/shared/i18n'
	import { settings } from '@eden/shared/settings'
	import { gardenCatalog, gardenLayout, shell } from '@eden/shared/manifest'
	import { declarations, manifestFor, manifests } from '$lib/domains'
	import { feed as activity } from '@eden/shared/shell'
	import { navigation } from '@eden/shared/navigation'
	import { formatDate, nowIso } from '@eden/shared/dates'
	import {
		TileDrag,
		catalogView,
		feedRows,
		gardenEdits,
		isFirstRun,
		quickNavEntries,
		seedAll,
		shellTiles,
		tileViews,
	} from '@eden/shared/shell/garden'

	const lang = $derived($locale ?? 'en')
	const format = $derived({ lang, clock: settings.clock })
	const subtitle = $derived(formatDate(nowIso(), lang))

	/** The quick-nav tiles: Today, then the enabled domains in order. */
	const quickNav = $derived(quickNavEntries(manifests, $t, () => void navigation.open({ place: 'today' })))

	const catalog = gardenCatalog(declarations, shell)
	const layout = $derived(gardenLayout(declarations, shell, settings.gardenLayout))

	let editing = $state(false)
	let catalogOpen = $state(false)

	/** What edit mode writes: each edit kept as it is made, Remove and Reset with their undo toast. */
	const edits = gardenEdits(() => $t)
	function openCatalog() {
		editing = true
		catalogOpen = true
	}

	const drag = new TileDrag({
		enabled: () => editing,
		ondrop: (id, target) => {
			// after a tile is before the one that follows it, the held one aside
			const rest = layout.filter((tile) => tile.id !== id)
			const at = target ? rest.findIndex((tile) => tile.id === target.id) : -1
			const before = !target || at < 0 ? null : (rest[target.side === 'before' ? at : at + 1]?.id ?? null)
			edits.move(id, before)
		},
	})

	/** The tiles with what is bound to each; while editing each carries its menu (D-106). */
	const tiles = $derived(tileViews(layout, catalog, shellTiles, manifestFor, $t, editing ? edits : undefined))

	const actions = $derived<PageHeaderAction[]>(
		editing
			? [
					{ id: 'done', label: $t('common.done'), icon: 'check', variant: 'primary', onclick: () => (editing = false) },
					{ id: 'add', label: $t('garden.add'), icon: 'plus', variant: 'secondary', onclick: openCatalog },
					...(settings.gardenLayout
						? [
								{
									id: 'reset',
									label: $t('garden.reset'),
									icon: 'rotate-ccw',
									variant: 'danger',
									onclick: edits.reset,
								} as const,
							]
						: []),
				]
			: [
					{
						id: 'profile',
						label: $t('garden.profile'),
						icon: 'id-card',
						variant: 'secondary',
						onclick: () => void navigation.open({ place: 'profile' }),
					},
					{
						id: 'edit',
						label: $t('garden.edit'),
						icon: 'grip-vertical',
						variant: 'secondary',
						onclick: () => (editing = true),
					},
				]
	)

	/** The catalog: every tile by its domain, the shell's own under the Garden's name, with what is placed marked. */
	const groups = $derived(
		catalogView(
			catalog,
			layout.map((tile) => tile.id),
			manifestFor,
			$t
		)
	)

	/** Escape leaves edit mode, once nothing above the page is there to take it. */
	function onkeydown(e: KeyboardEvent) {
		if (!editing || e.key !== 'Escape' || e.defaultPrevented || catalogOpen) return
		if (document.querySelector('dialog[open], :popover-open')) return
		editing = false
	}

	/** No domain has anything yet: the first run, when the feed's column offers the sample data. */
	const firstRun = $derived(isFirstRun(activity, manifests))
	const feed = $derived(feedRows(activity.entries, manifestFor, $t, format))
</script>

<svelte:window {onkeydown} />

<div class="page">
	<PageHeader name={$t('shell.garden')} {subtitle} icon={domainGlyph('garden')} {actions} />
	<nav class="quick" aria-label={$t('garden.quickNav')}>
		<ul class="quick-list">
			{#each quickNav as entry (entry.id)}
				<li>
					<button class="tile" type="button" onclick={entry.open}>
						<Icon name={entry.icon} size="md" />
						<span>{entry.name}</span>
					</button>
				</li>
			{/each}
		</ul>
	</nav>
	<div class="content">
		{#if tiles.length === 0}
			<EmptyState
				title={$t('garden.emptyLayout.title')}
				text={$t('garden.emptyLayout.text')}
				action={{ label: $t('garden.add'), icon: 'plus', onclick: openCatalog }}
				motif={false}
			/>
		{:else}
			<WidgetGrid {@attach drag.ground()}>
				{#each tiles as { tile, icon, title, empty, domain, body, action, sizes, menu } (tile.id)}
					{@const Body = body}
					{@const edit = {
						editing,
						menu,
						sizes,
						dragging: drag.held === tile.id,
						drop: drag.over?.id === tile.id ? drag.over.side : undefined,
						onmove: (delta: -1 | 1) => edits.step(tile.id, delta),
						onresize: (size: WidgetSize) => edits.resize(tile.id, size),
					}}
					{#if Body}
						<Widget {title} {icon} {domain} size={tile.size} {action} {...edit} {@attach drag.tile(tile.id)}>
							<Body />
						</Widget>
					{:else}
						<Widget {title} {icon} {domain} size={tile.size} {empty} {...edit} {@attach drag.tile(tile.id)} />
					{/if}
				{/each}
			</WidgetGrid>
		{/if}
		<aside class="feed" aria-label={$t('garden.activity')}>
			<div class="feed-inner">
				<h2 class="feed-title">{$t('garden.activity')}</h2>
				{#if firstRun}
					<EmptyState
						title={$t('empty.garden.title')}
						text={$t('empty.garden.text')}
						sample={{ onclick: () => seedAll(manifests, $t) }}
						motif={false}
					/>
				{:else if feed.length === 0}
					<p class="meta">{$t('garden.empty.feed')}</p>
				{:else}
					<ol class="feed-list">
						{#each feed as entry (entry.id)}
							<li class="feed-row">
								<Icon name={entry.icon} size="sm" class="feed-glyph" />
								<span class="row-text">{entry.line}</span>
								<span class="row-meta">{entry.when}</span>
							</li>
						{/each}
					</ol>
				{/if}
			</div>
		</aside>
	</div>
</div>

<WidgetCatalog bind:open={catalogOpen} {groups} onadd={edits.add} />

<style>
	.page {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
		padding-bottom: var(--space-8);
	}
	/* The quick-navigation row: one tile per domain, glyph beside name, on the page ground */
	.quick {
		padding: 0 var(--ed-gutter);
	}
	.quick-list {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.tile {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		box-sizing: border-box;
		min-height: var(--ed-control);
		margin: 0;
		padding: 0 var(--space-3);
		border: 1px solid var(--ed-card-border);
		border-radius: var(--ed-radius-control);
		background: var(--surface-1);
		color: var(--text-primary);
		font: var(--ed-t-label);
		letter-spacing: var(--ed-t-label-tracking);
		cursor: pointer;
		transition:
			background-color var(--ed-duration-micro) var(--ed-ease-out),
			border-color var(--ed-duration-micro) var(--ed-ease-out);
	}
	.tile :global(.ed-icon) {
		color: var(--text-secondary);
	}
	.tile:hover {
		background: var(--surface-2);
		border-color: var(--stroke-hover);
	}
	.tile:focus-visible {
		outline: 2px solid transparent;
		box-shadow: var(--focus-ring);
	}
	/* The grid, and the feed in a column beside it */
	.content {
		display: grid;
		grid-template-columns: minmax(0, 1fr) calc(var(--sheet-sm) * 0.8);
		align-items: stretch;
		gap: var(--space-6);
		padding: 0 var(--ed-gutter);
	}
	/* narrow page */
	@container page (max-width: 48rem) {
		/* one column: the grid, then the feed under it */
		.content {
			grid-template-columns: minmax(0, 1fr);
		}
		.feed {
			min-height: 0;
		}
		.feed-inner {
			position: static;
			max-height: 24rem;
		}
	}
	/* The feed is as tall as the grid beside it, never taller: its inner box is taken out of flow so only the
	   list scrolls when the entries run long */
	.feed {
		position: relative;
		min-height: 16rem;
		box-sizing: border-box;
		border: 1px solid var(--ed-card-border);
		border-radius: var(--ed-radius-card);
		background: var(--surface-1);
		box-shadow: var(--shadow-card);
	}
	.feed-inner {
		position: absolute;
		inset: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
		box-sizing: border-box;
		padding: var(--space-4);
		overflow: hidden;
	}
	.feed-title {
		flex: none;
		margin: 0;
		font: var(--ed-t-title);
		letter-spacing: var(--ed-t-title-tracking);
		font-variation-settings: var(--ed-t-title-opsz);
	}
	.feed-list {
		flex: 1;
		min-height: 0;
		overflow-y: auto;
		display: flex;
		flex-direction: column;
		margin: 0;
		padding: 0;
		list-style: none;
	}
	/* never shrunk: in the scrolling column a row that gave way below its content would let the wrapped line spill over its neighbours */
	.feed-row {
		flex: none;
		display: flex;
		align-items: center;
		box-sizing: border-box;
		padding-block: var(--space-1);
		gap: var(--space-2);
		min-height: var(--ed-row);
		border-bottom: 1px solid var(--stroke-subtle);
	}
	.feed-row:last-child {
		border-bottom: 0;
	}
	.feed-row :global(.feed-glyph) {
		flex: none;
		color: var(--text-secondary);
	}
	.row-text {
		flex: 1;
		min-width: 0;
		font: var(--ed-t-body);
		letter-spacing: var(--ed-t-body-tracking);
	}
	.row-meta {
		flex: none;
		font: var(--ed-t-data-sm);
		letter-spacing: var(--ed-t-data-sm-tracking);
		font-variant-numeric: tabular-nums;
		color: var(--text-secondary);
		white-space: nowrap;
	}
	.meta {
		margin: 0;
		font: var(--ed-t-body-sm);
		letter-spacing: var(--ed-t-body-sm-tracking);
		color: var(--text-secondary);
	}
</style>
