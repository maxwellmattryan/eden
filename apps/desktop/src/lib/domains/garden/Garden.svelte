<script lang="ts">
	// The Garden (product/substrate/shell.md, "The Garden"), ported from the approved Domains/Garden/Garden story: the
	// quick-navigation row, the Phase 1 default grid from `layout.ts`, and the activity feed in a column of its own.
	// The tiles come from the domain manifests and compute from their stores; a tile whose domain has nothing to show
	// keeps its one-line prompt. Edit mode is not built yet, so "Edit layout" shows disabled.
	import { goto } from '$app/navigation'
	import { resolve } from '$app/paths'
	import { EmptyState, Icon, PageHeader, Widget, WidgetGrid, domainGlyph, type WidgetAction } from '@eden/ui-kit'
	import { locale, t } from '@eden/shared/i18n'
	import { manifestFor, manifests } from '$lib/domains'
	import { undoToast } from '$lib/shell/undo'
	import { garden } from './store.svelte'
	import { formatDate, formatTime, formatWeekday, nowIso, relativeDay } from '../dates'
	import { layout, shellTiles, type GardenTile } from './layout'

	const todayHref = resolve('/today')
	const lang = $derived($locale ?? 'en')
	const subtitle = $derived(formatDate(nowIso(), lang))

	/** The quick-nav tiles: Today, then the enabled domains in order. */
	const quickNav = $derived([
		{ id: 'today', name: $t('shell.today'), icon: domainGlyph('today'), href: todayHref },
		...manifests.map((manifest) => ({
			id: manifest.id,
			name: $t(manifest.name),
			icon: manifest.glyph,
			href: resolve(manifest.routes.path),
		})),
	])

	function domainOf(tile: GardenTile): string | undefined {
		if (tile.id === 'today') return $t('shell.today')
		const manifest = manifestFor(tile.domain)
		return manifest ? $t(manifest.name) : undefined
	}

	const tiles = $derived(
		layout.map((tile) => {
			const declared = manifestFor(tile.domain)?.widgets.find((w) => w.id === tile.id)
			const declaration = declared ?? shellTiles[tile.id]
			const body = declaration?.hasData?.() ? declaration.body : undefined
			const action: WidgetAction | undefined =
				body && declaration?.action
					? { label: $t(declaration.action.label), onclick: declaration.action.open }
					: undefined
			return {
				tile,
				title: $t(declared?.title ?? tile.title),
				empty: $t(declared?.empty ?? tile.empty),
				domain: domainOf(tile),
				body,
				action,
			}
		})
	)

	/** No domain has anything yet: the first run, when the feed's column offers the sample data. */
	const firstRun = $derived(
		garden.ready && garden.feed.length === 0 && manifests.every((m) => !m.widgets.some((w) => w.hasData?.()))
	)

	function whenOf(at: string): string {
		const time = formatTime(at, lang)
		const day = relativeDay(at)
		if (day === 'today') return time
		if (day === 'yesterday') return $t('garden.feed.yesterday', { values: { time } })
		return formatWeekday(at, lang)
	}
	const feed = $derived(
		garden.feed.map((entry) => ({
			id: entry.id,
			icon: manifestFor(entry.domain)?.glyph ?? domainGlyph('garden'),
			line: $t(entry.key, { values: entry.values }),
			when: whenOf(entry.at),
		}))
	)

	function seedAll() {
		const undos = manifests.flatMap((manifest) => (manifest.seed ? [manifest.seed()] : []))
		if (!undos.length) return
		undoToast($t('common.sampleAdded'), () => undos.forEach((undo) => undo()))
	}
</script>

<div class="page">
	<PageHeader
		name={$t('shell.garden')}
		{subtitle}
		icon={domainGlyph('garden')}
		actions={[{ label: $t('garden.edit'), icon: 'grip-vertical', variant: 'secondary', disabled: true }]}
	/>
	<nav class="quick" aria-label={$t('garden.quickNav')}>
		<ul class="quick-list">
			{#each quickNav as entry (entry.id)}
				<li>
					<button class="tile" type="button" onclick={() => goto(entry.href)}>
						<Icon name={entry.icon} size="md" />
						<span>{entry.name}</span>
					</button>
				</li>
			{/each}
		</ul>
	</nav>
	<div class="content">
		<WidgetGrid>
			{#each tiles as { tile, title, empty, domain, body, action } (tile.id)}
				{@const Body = body}
				{#if Body}
					<Widget {title} icon={domainGlyph(tile.domain)} {domain} size={tile.size} {action}><Body /></Widget>
				{:else}
					<Widget {title} icon={domainGlyph(tile.domain)} {domain} size={tile.size} {empty} />
				{/if}
			{/each}
		</WidgetGrid>
		<aside class="feed" aria-label={$t('garden.activity')}>
			<h2 class="feed-title">{$t('garden.activity')}</h2>
			{#if firstRun}
				<EmptyState
					title={$t('empty.garden.title')}
					text={$t('empty.garden.text')}
					sample={{ onclick: seedAll }}
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
		</aside>
	</div>
</div>

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
		align-items: start;
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
