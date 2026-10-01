<script lang="ts">
	// The Garden (product/substrate/shell.md, "The Garden"), ported from the approved Domains/Garden/Garden story: the
	// quick-navigation row, the default grid the shell composes from the manifests (`defaultLayout`), and the activity
	// feed in a column of its own. The tiles compute from their domains' stores; a tile whose domain has nothing to
	// show keeps its one-line prompt. Edit mode is not built yet, so "Edit layout" shows disabled.
	import { goto } from '$app/navigation'
	import { resolve } from '$app/paths'
	import {
		EmptyState,
		Icon,
		PageHeader,
		Widget,
		WidgetGrid,
		domainGlyph,
		type GlyphId,
		type WidgetAction,
	} from '@eden/ui-kit'
	import { locale, t } from '@eden/shared/i18n'
	import { settings } from '@eden/shared/settings'
	import { defaultLayout, shell, type LayoutTile } from '@eden/shared/manifest'
	import { declarations, manifestFor, manifests, type WidgetBinding } from '$lib/domains'
	import { feed as activity } from '$lib/shell/feed.svelte'
	import { undoToast } from '$lib/shell/undo'
	import { formatDate, formatTime, formatWeekday, nowIso, relativeDay } from '@eden/shared/dates'
	import { shellTiles } from './tiles'

	const lang = $derived($locale ?? 'en')
	const format = $derived({ lang, clock: settings.clock })
	const subtitle = $derived(formatDate(nowIso(), lang))

	/** The quick-nav tiles: Today, then the enabled domains in order. */
	const quickNav = $derived([
		{ id: 'today', name: $t('shell.today'), icon: domainGlyph('today'), open: () => void goto(resolve('/today')) },
		...manifests.map((manifest) => ({
			id: manifest.id,
			name: $t(manifest.name),
			icon: manifest.glyph,
			open: manifest.routes.open,
		})),
	])

	const layout = defaultLayout(declarations, shell)
	const bindings: Partial<Record<string, WidgetBinding>> = shellTiles

	/** The name under the tile's title: its domain's, or Today's for the shell's own tile of it. */
	function domainOf(tile: LayoutTile): string | undefined {
		if (tile.glyph === 'today') return $t('shell.today')
		const manifest = manifestFor(tile.owner)
		return manifest ? $t(manifest.name) : undefined
	}

	const tiles = $derived(
		layout.map((tile) => {
			const bound = manifestFor(tile.owner)?.widgets.find((w) => w.id === tile.id) ?? bindings[tile.id]
			const body = bound?.hasData?.() ? bound.body : undefined
			const action: WidgetAction | undefined =
				body && bound?.action ? { label: $t(bound.action.label), onclick: bound.action.open } : undefined
			return {
				tile,
				// the registry builder checked each glyph against the kit's list
				icon: domainGlyph(tile.glyph as GlyphId),
				title: $t(tile.title),
				empty: $t(tile.empty),
				domain: domainOf(tile),
				body,
				action,
			}
		})
	)

	/** No domain has anything yet: the first run, when the feed's column offers the sample data. */
	const firstRun = $derived(
		activity.ready && activity.entries.length === 0 && manifests.every((m) => !m.widgets.some((w) => w.hasData?.()))
	)

	function whenOf(at: string): string {
		const time = formatTime(at, format)
		const day = relativeDay(at)
		if (day === 'today') return time
		if (day === 'yesterday') return $t('garden.feed.yesterday', { values: { time } })
		return formatWeekday(at, lang)
	}
	const feed = $derived(
		activity.entries.map((entry) => ({
			id: entry.id,
			icon:
				entry.domain === 'today' ? domainGlyph('today') : (manifestFor(entry.domain)?.glyph ?? domainGlyph('garden')),
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
		actions={[
			{
				id: 'profile',
				label: $t('garden.profile'),
				icon: 'id-card',
				variant: 'secondary',
				onclick: () => void goto(resolve('/garden/profile')),
			},
			{ id: 'edit', label: $t('garden.edit'), icon: 'grip-vertical', variant: 'secondary', disabled: true },
		]}
	/>
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
		<WidgetGrid>
			{#each tiles as { tile, icon, title, empty, domain, body, action } (tile.id)}
				{@const Body = body}
				{#if Body}
					<Widget {title} {icon} {domain} size={tile.size} {action}><Body /></Widget>
				{:else}
					<Widget {title} {icon} {domain} size={tile.size} {empty} />
				{/if}
			{/each}
		</WidgetGrid>
		<aside class="feed" aria-label={$t('garden.activity')}>
			<div class="feed-inner">
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
			</div>
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
