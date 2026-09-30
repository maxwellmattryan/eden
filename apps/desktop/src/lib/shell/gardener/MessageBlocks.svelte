<script lang="ts">
	// One message of a thread as the panel shows it: the text as the bubble, and inside it the tool cards with their
	// confirm, the proposal cards, the drafts and any error (docs/design/ux-patterns.md, "Gardener surfaces"). The
	// can-see block is the chip row's, not the bubble's.
	import {
		Badge,
		DetailPopover,
		DetailSection,
		GardenerMessage,
		Notice,
		ProposalCard,
		ToolCard,
		type DetailRow,
	} from '@eden/ui-kit'
	import type { Message, MessageBlock } from '@eden/shared/gardener'
	import { t } from '@eden/shared/i18n'
	import { formatValue } from '@eden/shared/profile'
	import { profile } from '../profile/store.svelte'
	import { undoToast } from '../undo'
	import { manifestFor } from '$lib/domains'
	import DraftCard from './DraftCard.svelte'
	import { toolByWireName } from './handlers'
	import { runtime } from './runtime.svelte'

	type Props = { message: Message }
	let { message }: Props = $props()

	const blocks = $derived(message.blocks as MessageBlock[])
	const text = $derived(
		blocks
			.filter((block) => block.kind === 'text' && block.text.trim())
			.map((block) => (block as { text: string }).text)
	)
	const cards = $derived(
		blocks
			.map((block, index) => ({ block, index }))
			.filter(({ block }) => block.kind !== 'text' && block.kind !== 'can-see')
	)

	function accept(index: number, proposal: { id: string; type: string }) {
		const result = profile.accept(proposal.id, $t(`profile.facts.${proposal.type}`))
		if (result)
			undoToast($t('profile.toast.accepted', { values: { name: $t(`profile.facts.${proposal.type}`) } }), result.undo)
		runtime.settleProposal(message.id, index, 'accepted')
	}
	function dismiss(index: number, proposal: { id: string }) {
		profile.dismiss(proposal.id)
		runtime.settleProposal(message.id, index, 'dismissed')
	}
	// the popover about a tool: what it is declared to do, and what it did here
	type ToolBlock = Extract<MessageBlock, { kind: 'tool' }>
	let info = $state<{ anchor: HTMLElement; block: ToolBlock } | undefined>()
	let infoOpen = $state(false)
	const infoTool = $derived(info ? toolByWireName(info.block.call.name) : undefined)
	const infoDomain = $derived.by(() => {
		const domain = info?.block.call.domain
		if (!domain || domain === 'substrate') return $t('gardener.tool.substrate')
		const manifest = manifestFor(domain)
		return manifest ? $t(manifest.name) : domain
	})
	const declaredRows = $derived<DetailRow[]>(
		infoTool
			? [
					{ label: $t('gardener.tool.access'), value: infoTool.declaration.access, mono: true },
					{
						label: $t('gardener.tool.grade'),
						value: infoTool.declaration.grade
							? $t(`settings.gardener.grades.${infoTool.declaration.grade}`)
							: $t('gardener.tool.plain'),
					},
					{
						label: $t('gardener.tool.reads'),
						value: infoTool.declaration.reads.length ? infoTool.declaration.reads.join(', ') : '—',
						mono: infoTool.declaration.reads.length > 0,
					},
				]
			: []
	)
	function showInfo(anchor: HTMLElement, block: ToolBlock) {
		info = { anchor, block }
		infoOpen = true
	}
	const json = (value: unknown) => JSON.stringify(value, null, 1)
	const payload = (input: unknown) => {
		const json = JSON.stringify(input, null, 1)
		return json && json !== '{}' ? json : undefined
	}
</script>

{#if text.length || cards.length}
	<GardenerMessage text={text.length ? text : undefined} owner={message.role === 'owner'}>
		{#each cards as { block, index } (index)}
			{#if block.kind === 'tool'}
				<ToolCard
					name={block.call.tool}
					access={block.call.access}
					payload={payload(block.call.input)}
					text={block.call.error}
					confirm={block.call.access === 'write' || block.call.access === 'act-external'
						? $t('gardener.confirmTool', { values: { tool: block.call.tool } })
						: undefined}
					state={block.state}
					onconfirm={() => runtime.answerTool(block.call.id, true)}
					oncancel={() => runtime.answerTool(block.call.id, false)}
					oninfo={(anchor) => showInfo(anchor, block)}
				/>
			{:else if block.kind === 'proposal'}
				<ProposalCard
					fact={block.proposal.type}
					value={formatValue(block.proposal.type, block.proposal.value, $t)}
					text={block.proposal.text}
					state={block.state}
					onaccept={() => accept(index, block.proposal)}
					ondismiss={() => dismiss(index, block.proposal)}
				/>
			{:else if block.kind === 'draft'}
				<DraftCard
					draft={block.draft}
					status={block.state}
					domain={block.domain ?? 'substrate'}
					onsettle={(state) => runtime.settleDraft(message.id, index, state)}
				/>
			{:else if block.kind === 'error'}
				<Notice tone={block.code === 'budget' ? 'warning' : 'danger'} title={block.message} />
			{/if}
		{/each}
	</GardenerMessage>
{/if}

{#if info}
	<DetailPopover
		anchor={info.anchor}
		bind:open={infoOpen}
		tone="honey"
		icon="shovel"
		title={info.block.call.tool}
		subtitle={infoDomain}
		width="md"
		onclose={() => (info = undefined)}
	>
		{#if infoTool}
			<DetailSection label={$t('gardener.tool.about')}>
				<p class="tool-text">{infoTool.description}</p>
			</DetailSection>
			<DetailSection label={$t('gardener.tool.declared')} rows={declaredRows}>
				<div class="tool-badge"><Badge kind={info.block.call.access} /></div>
			</DetailSection>
		{/if}
		<DetailSection label={$t('gardener.tool.thisCall')}>
			<dl class="tool-call">
				<dt>{$t('gardener.tool.input')}</dt>
				<dd><pre>{json(info.block.call.input)}</pre></dd>
				{#if info.block.call.output !== undefined}
					<dt>{$t('gardener.tool.output')}</dt>
					<dd><pre>{json(info.block.call.output)}</pre></dd>
				{/if}
				{#if info.block.call.error}
					<dt>{$t('gardener.tool.error')}</dt>
					<dd class="tool-error">{info.block.call.error}</dd>
				{/if}
			</dl>
		</DetailSection>
	</DetailPopover>
{/if}

<style>
	.tool-text {
		margin: 0;
		font: var(--ed-t-voice);
		letter-spacing: var(--ed-t-voice-tracking);
		font-variation-settings: var(--ed-t-voice-opsz);
		color: var(--text-primary);
		text-wrap: pretty;
	}
	.tool-badge {
		display: flex;
		margin-top: var(--space-2);
	}
	.tool-call {
		display: grid;
		grid-template-columns: max-content minmax(0, 1fr);
		gap: var(--space-1) var(--space-3);
		margin: 0;
	}
	.tool-call dt {
		font: var(--ed-t-caption);
		letter-spacing: var(--ed-t-caption-tracking);
		color: var(--text-secondary);
	}
	.tool-call dd {
		margin: 0;
		min-width: 0;
		font: var(--ed-t-body-sm);
		color: var(--text-primary);
		overflow-wrap: anywhere;
	}
	.tool-call pre {
		margin: 0;
		font: var(--ed-t-data-sm);
		white-space: pre-wrap;
		overflow-wrap: anywhere;
		max-height: 160px;
		overflow: auto;
	}
	.tool-error {
		color: var(--danger);
	}
</style>
