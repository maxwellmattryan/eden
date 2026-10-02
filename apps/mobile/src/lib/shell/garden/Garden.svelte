<script lang="ts">
	// The Garden on the phone (product/substrate/shell.md, "The Garden"; D-TBD(phone-garden)), after the phone canvas
	// of the Domains/Garden/Garden story: the quick-navigation row with Today and every enabled domain, the grid in
	// two columns (the kit's, at `data-platform="mobile"`) and the activity feed beneath it, in the page's own scroll.
	// The tiles' bodies are the ones the desktop mounts and the layout is the owner's on this device
	// (`settings.gardenLayout`, D-156) over the same default. Edit mode (D-155) is the tile's menu alone, a bottom
	// sheet: Move earlier, Move later, Size and Remove (D-106); nothing is dragged by touch. The catalog adds what is
	// not placed, and Remove and Reset can be undone from their toast. What the page says and writes is shared with the
	// desktop's (`@eden/shared/shell/garden`).
	import {
		EmptyState,
		Icon,
		PageHeader,
		Widget,
		WidgetCatalog,
		WidgetGrid,
		domainGlyph,
		type PageHeaderAction,
	} from '@eden/ui-kit'
	import { formatDate, nowIso } from '@eden/shared/dates'
	import { locale, t } from '@eden/shared/i18n'
	import { gardenCatalog, gardenLayout, shell } from '@eden/shared/manifest'
	import { holdBack, navigation } from '@eden/shared/navigation'
	import { settings } from '@eden/shared/settings'
	import { feed as activity } from '@eden/shared/shell'
	import {
		catalogView,
		feedRows,
		gardenEdits,
		isFirstRun,
		quickNavEntries,
		seedAll,
		shellTiles,
		tileViews,
	} from '@eden/shared/shell/garden'
	import { declarations, manifestFor, manifests } from '$lib/domains'

	const lang = $derived($locale ?? 'en')
	const format = $derived({ lang, clock: settings.clock })
	const subtitle = $derived(formatDate(nowIso(), lang))

	/** The quick-nav tiles: Today, then every enabled domain in order, the pinned ones too. */
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

	// The system's back press leaves edit mode before it leaves the page, once no sheet is open to take it first.
	$effect(() =>
		editing
			? holdBack(() => {
					editing = false
					return true
				})
			: undefined
	)

	/** The tiles with what is bound to each; while editing each carries its menu, which is all of edit mode here. */
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

	/** No domain has anything yet: the first run, when the page offers the sample data above its prompts. */
	const firstRun = $derived(isFirstRun(activity, manifests))
	const feed = $derived(feedRows(activity.entries, manifestFor, $t, format))
</script>

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
		{#if firstRun}
			<!-- above the grid, so the offer is not under a screen of prompts -->
			<EmptyState
				title={$t('empty.garden.title')}
				text={$t('empty.garden.text')}
				sample={{ onclick: () => seedAll(manifests, $t) }}
				motif={false}
			/>
		{/if}
		{#if tiles.length === 0}
			<EmptyState
				title={$t('garden.emptyLayout.title')}
				text={$t('garden.emptyLayout.text')}
				action={{ label: $t('garden.add'), icon: 'plus', onclick: openCatalog }}
				motif={false}
			/>
		{:else}
			<WidgetGrid>
				{#each tiles as { tile, icon, title, empty, domain, body, action, sizes, menu } (tile.id)}
					{@const Body = body}
					{@const edit = { editing, menu, sizes }}
					{#if Body}
						<Widget {title} {icon} {domain} size={tile.size} {action} {...edit}>
							<Body />
						</Widget>
					{:else}
						<Widget {title} {icon} {domain} size={tile.size} {empty} {...edit} />
					{/if}
				{/each}
			</WidgetGrid>
		{/if}
		{#if !firstRun}
			<!-- the feed, under the tiles: every entry, in the page's own scroll -->
			<aside class="feed" aria-label={$t('garden.activity')}>
				<h2 class="feed-title">{$t('garden.activity')}</h2>
				{#if feed.length === 0}
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
			</aside>
		{/if}
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
	/* The quick-navigation row: one tile per domain, glyph beside name, wrapping on the page ground */
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
		transition: background-color var(--ed-duration-micro) var(--ed-ease-out);
	}
	.tile :global(.ed-icon) {
		color: var(--text-secondary);
	}
	.tile:active {
		background: var(--surface-2);
	}
	.tile:focus-visible {
		outline: 2px solid transparent;
		box-shadow: var(--focus-ring);
	}
	/* One column: the sample offer on first run, the grid, then the feed */
	.content {
		display: flex;
		flex-direction: column;
		gap: var(--space-6);
		padding: 0 var(--ed-gutter);
	}
	.feed {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
		box-sizing: border-box;
		padding: var(--space-4);
		border: 1px solid var(--ed-card-border);
		border-radius: var(--ed-radius-card);
		background: var(--surface-1);
		box-shadow: var(--shadow-card);
	}
	.feed-title {
		margin: 0;
		font: var(--ed-t-title);
		letter-spacing: var(--ed-t-title-tracking);
		font-variation-settings: var(--ed-t-title-opsz);
	}
	.feed-list {
		display: flex;
		flex-direction: column;
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.feed-row {
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
