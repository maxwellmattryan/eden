<script lang="ts">
	// The tools (docs/engineering/gardener.md, "Tools"; docs/design/screens.md, `gardener-tools`): every tool the
	// Gardener has, the substrate's first and then each domain's, one row each with its owner, its access, its grade
	// and how many registry ids it may read. A row unfolds beneath itself to the same body the conversation's tool
	// popover shows (`ToolAbout`), with the input's shape folded beside it.
	import { DataTable, DetailSection, type DataTableCell, type DataTableColumn } from '@eden/ui-kit'
	import { SUBSTRATE, type GardenerTool } from '../../../gardener/index.js'
	import { t } from '../../../i18n/index.js'
	import { domainFace } from '../domain-face.js'
	import { handlerOf, tools } from '../handlers.js'
	import ToolAbout from '../ToolAbout.svelte'
	import { compactPage } from './compact.js'

	// The phone keeps the tool and its access, by their place in the full list; the grade and the reads are in the
	// detail's declaration already, and the owner is said above it (D-164).
	const compact = compactPage()
	const PHONE_COLUMNS = [0, 2]
	const kept = <T,>(cells: T[]): T[] => (compact ? PHONE_COLUMNS.map((index) => cells[index]!) : cells)

	// the row that is unfolded, by its index in `shown`
	let expanded = $state<number>()

	/** Who declares the tool: Eden for the substrate's, the domain by its name otherwise. */
	function ownerOf(tool: GardenerTool): string {
		if (tool.domain === SUBSTRATE) return $t('gardener.tool.substrate')
		const manifest = domainFace(tool.domain)
		return manifest ? $t(manifest.name) : tool.domain
	}

	// the substrate's first, then the domains by name; a tool by its id within its owner
	const shown = $derived(
		[...tools].sort((a, b) => {
			const own = Number(a.domain !== SUBSTRATE) - Number(b.domain !== SUBSTRATE)
			return own || ownerOf(a).localeCompare(ownerOf(b)) || a.declaration.id.localeCompare(b.declaration.id)
		})
	)

	const columns = $derived<DataTableColumn[]>(
		kept([
			{ label: $t('tools.columns.tool') },
			{ label: $t('tools.columns.owner') },
			{ label: $t('tools.columns.access'), hint: $t('tools.hints.access') },
			{ label: $t('tools.columns.grade'), hint: $t('tools.hints.grade') },
			{ label: $t('tools.columns.reads'), hint: $t('tools.hints.reads'), numeric: true },
		])
	)
	const rows = $derived<(string | DataTableCell)[][]>(
		shown.map((tool) =>
			kept<string | DataTableCell>([
				{ text: tool.declaration.id, code: true },
				ownerOf(tool),
				$t(`gardener.tool.accessKinds.${tool.declaration.access}`),
				tool.declaration.grade ? $t(`settings.gardener.grades.${tool.declaration.grade}`) : '—',
				String(tool.declaration.reads.length),
			])
		)
	)
</script>

<div class="body">
	<DataTable {columns} {rows} label={$t('tools.title')} bind:expanded>
		{#snippet detail(index)}
			{@const tool = shown[index]}
			{#if tool}
				<div class="detail">
					{#if compact}
						<DetailSection rows={[{ label: $t('tools.columns.owner'), value: ownerOf(tool) }]} />
					{/if}
					<ToolAbout {tool} />
					{#if !handlerOf(tool)}
						<DetailSection
							rows={[
								{
									label: $t('tools.status'),
									value: $t('tools.unavailable'),
									icon: 'triangle-alert',
									tone: 'warning',
								},
							]}
						/>
					{/if}
					<DetailSection label={$t('tools.schema')} collapsible>
						<pre class="schema">{JSON.stringify(tool.schema, null, 1)}</pre>
					</DetailSection>
				</div>
			{/if}
		{/snippet}
	</DataTable>
	<p class="quiet">{$t('tools.foot', { values: { count: shown.length } })}</p>
</div>

<style>
	.body {
		display: grid;
		gap: var(--space-4);
		padding: 0 var(--ed-gutter);
	}
	/* the sections side by side where the table is wide, stacked where it is not */
	.detail {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(calc(var(--space-8) * 8), 1fr));
		align-items: start;
	}
	.schema {
		margin: 0;
		font: var(--ed-t-data-sm);
		color: var(--text-primary);
		white-space: pre-wrap;
		overflow-wrap: anywhere;
		user-select: text;
		-webkit-user-select: text;
	}
	.quiet {
		margin: 0;
		font: var(--ed-t-body-sm);
		color: var(--text-secondary);
	}
</style>
