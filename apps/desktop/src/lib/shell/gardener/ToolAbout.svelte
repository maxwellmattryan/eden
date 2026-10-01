<script lang="ts">
	// What a tool is declared to do, as two DetailSections for a DetailPopover: its description in the voice, then the
	// declaration in rows (access, grade, whether it asks first, what it may read, by name). The conversation's tool
	// popover and the tools page show this same body, so a tool reads the same wherever it is met.
	import { DetailSection, type DetailRow } from '@eden/ui-kit'
	import type { GardenerTool } from '@eden/shared/gardener'
	import { t } from '@eden/shared/i18n'
	import { registryLabel } from './labels'

	type Props = {
		tool: GardenerTool
		/** The declaration folds behind its caption's chevron, closed; open and fixed otherwise. */
		collapsible?: boolean
	}
	let { tool, collapsible = false }: Props = $props()

	const rows = $derived<DetailRow[]>([
		{ label: $t('gardener.tool.access'), value: $t(`gardener.tool.accessKinds.${tool.declaration.access}`) },
		{
			label: $t('gardener.tool.grade'),
			value: tool.declaration.grade
				? $t(`settings.gardener.grades.${tool.declaration.grade}`)
				: $t('gardener.tool.plain'),
		},
		{
			label: $t('gardener.tool.confirm'),
			value: tool.declaration.confirm ? $t('gardener.tool.confirmYes') : $t('gardener.tool.confirmNo'),
		},
		{
			label: $t('gardener.tool.reads'),
			value: tool.declaration.reads.length
				? tool.declaration.reads.map((id) => registryLabel(id)).join(', ')
				: $t('gardener.tool.readsNothing'),
		},
	])
</script>

<DetailSection label={$t('gardener.tool.about')}>
	<p class="tool-text">{tool.description}</p>
</DetailSection>
<DetailSection label={$t('gardener.tool.declared')} {rows} {collapsible} />

<style>
	.tool-text {
		margin: 0;
		font: var(--ed-t-voice);
		letter-spacing: var(--ed-t-voice-tracking);
		font-variation-settings: var(--ed-t-voice-opsz);
		color: var(--text-primary);
		text-wrap: pretty;
		/* a description may list what it takes, one to a line */
		white-space: pre-line;
	}
</style>
