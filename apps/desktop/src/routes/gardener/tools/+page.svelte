<script lang="ts">
	// The tools page (docs/engineering/gardener.md, "Tools"; docs/design/screens.md, `gardener-tools`): every tool the
	// Gardener has, the substrate's first and then each domain's, one row each with its owner, its access, its grade
	// and how many registry ids it may read. A row opens the same body the conversation's tool popover shows
	// (`ToolAbout`), with the input's shape folded beneath. Linked from the Gardener tab and the panel's header.
	import {
		DataTable,
		DetailPopover,
		DetailSection,
		PageHeader,
		domainGlyph,
		type DataTableCell,
		type DataTableColumn,
	} from '@eden/ui-kit'
	import { SUBSTRATE, type GardenerTool } from '@eden/shared/gardener'
	import { t } from '@eden/shared/i18n'
	import { manifestFor } from '$lib/domains'
	import { handlerOf, tools } from '$lib/shell/gardener/handlers'
	import ToolAbout from '$lib/shell/gardener/ToolAbout.svelte'

	let open = $state(false)
	let detail = $state<{ tool: GardenerTool; anchor: HTMLElement } | undefined>()

	/** Who declares the tool: Eden for the substrate's, the domain by its name otherwise. */
	function ownerOf(tool: GardenerTool): string {
		if (tool.domain === SUBSTRATE) return $t('gardener.tool.substrate')
		const manifest = manifestFor(tool.domain)
		return manifest ? $t(manifest.name) : tool.domain
	}

	// the substrate's first, then the domains by name; a tool by its id within its owner
	const shown = $derived(
		[...tools].sort((a, b) => {
			const own = Number(a.domain !== SUBSTRATE) - Number(b.domain !== SUBSTRATE)
			return own || ownerOf(a).localeCompare(ownerOf(b)) || a.declaration.id.localeCompare(b.declaration.id)
		})
	)

	const columns = $derived<DataTableColumn[]>([
		{ label: $t('tools.columns.tool') },
		{ label: $t('tools.columns.owner') },
		{ label: $t('tools.columns.access') },
		{ label: $t('tools.columns.grade') },
		{ label: $t('tools.columns.reads'), numeric: true },
	])
	const rows = $derived<(string | DataTableCell)[][]>(
		shown.map((tool) => [
			{ text: tool.declaration.id, code: true },
			ownerOf(tool),
			$t(`gardener.tool.accessKinds.${tool.declaration.access}`),
			tool.declaration.grade ? $t(`settings.gardener.grades.${tool.declaration.grade}`) : '—',
			String(tool.declaration.reads.length),
		])
	)

	function show(index: number, anchor: HTMLElement) {
		const tool = shown[index]
		if (!tool) return
		detail = { tool, anchor }
		open = true
	}
</script>

<div class="page">
	<PageHeader name={$t('tools.title')} subtitle={$t('tools.subtitle')} icon={domainGlyph('gardener')} />
	<div class="body">
		<DataTable {columns} {rows} label={$t('tools.title')} onrow={show} />
		<p class="quiet">{$t('tools.foot', { values: { count: shown.length } })}</p>
	</div>
</div>

{#if detail}
	{@const tool = detail.tool}
	<DetailPopover
		anchor={detail.anchor}
		bind:open
		tone="honey"
		icon="shovel"
		title={tool.declaration.id}
		width="md"
		label={$t('tools.detailLabel')}
		onclose={() => (detail = undefined)}
	>
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
	</DetailPopover>
{/if}

<style>
	.page {
		flex: 1 0 auto;
		display: flex;
		flex-direction: column;
		padding-bottom: var(--space-8);
	}
	.body {
		display: grid;
		gap: var(--space-4);
		padding: 0 var(--ed-gutter);
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
