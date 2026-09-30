<script lang="ts">
	// One message of a thread as the panel shows it: the text as the bubble, and inside it the tool cards with their
	// confirm, the proposal cards and any error (docs/design/ux-patterns.md, "Gardener surfaces"). A draft is its own
	// message after the bubble, in honey. The can-see block is the chip row's, not the bubble's. A reply is drawn as Markdown; under each message is when it
	// was sent or received and a glyph that copies its words. A tool the Gardener ran as its own request is a note in
	// the thread, not a bubble.
	import { DetailPopover, DetailSection, GardenerMessage, Notice, ProposalCard, ToolCard } from '@eden/ui-kit'
	import { openExternal } from '@eden/shared/api'
	import { stampToDate } from '@eden/shared/data'
	import { formatMoment } from '@eden/shared/dates'
	import type { Message, MessageBlock, ToolState } from '@eden/shared/gardener'
	import { locale, t } from '@eden/shared/i18n'
	import { settings } from '@eden/shared/settings'
	import { copyText } from '$lib/clipboard'
	import { formatValue } from '@eden/shared/profile'
	import { profile } from '../profile/store.svelte'
	import { undoToast } from '../undo'
	import DraftCard from './DraftCard.svelte'
	import ToolAbout from './ToolAbout.svelte'
	import { toolByWireName } from './handlers'
	import { runtime } from './runtime.svelte'
	import { threads } from './threads.svelte'

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
			.filter(({ block }) => block.kind !== 'text' && block.kind !== 'can-see' && block.kind !== 'draft')
	)
	const drafts = $derived(
		blocks.map((block, index) => ({ block, index })).filter(({ block }) => block.kind === 'draft')
	)
	// the message a request is still writing: the last one, while the runtime streams
	const live = $derived(runtime.streaming && threads.messages.at(-1)?.id === message.id)
	// a card left running or waiting by a request that is gone (the app closed mid-way) reads as cancelled
	const stateOf = (state: ToolState): ToolState =>
		(state === 'running' || state === 'pending') && !runtime.streaming ? 'cancelled' : state
	// What became of the draft or the proposal a tool call left, for that call's card: found by the call's id, or, in
	// a message stored before the id was kept, as the first one after the card and before the next tool's.
	function draftOf(index: number, callId: string): 'pending' | 'committed' | 'discarded' | undefined {
		let left = blocks.find((block) => (block.kind === 'draft' || block.kind === 'proposal') && block.callId === callId)
		if (!left) {
			for (const block of blocks.slice(index + 1)) {
				if (block.kind === 'tool') break
				if ((block.kind === 'draft' || block.kind === 'proposal') && !block.callId) {
					left = block
					break
				}
			}
		}
		if (left?.kind === 'draft') return left.state
		if (left?.kind === 'proposal')
			return left.state === 'accepted' ? 'committed' : left.state === 'dismissed' ? 'discarded' : 'pending'
		return undefined
	}
	// when it was sent or received: the row's stamp, once the store has answered with one
	const time = $derived.by(() => {
		const at = message.createdAt ? stampToDate(message.createdAt) : null
		if (!at || live) return undefined
		return formatMoment(at.getTime(), { lang: $locale ?? 'en', clock: settings.clock })
	})
	const copy = $derived(text.length && !live ? () => copyText(text.join('\n\n')) : undefined)

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
	<GardenerMessage
		text={text.length ? text : undefined}
		owner={message.role === 'owner'}
		markdown
		onlink={(href) => void openExternal(href)}
		{time}
		oncopy={copy}
	>
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
					state={stateOf(block.state)}
					draft={draftOf(index, block.call.id)}
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
			{:else if block.kind === 'error'}
				<Notice tone={block.code === 'budget' ? 'warning' : 'danger'} title={block.message} />
			{/if}
		{/each}
	</GardenerMessage>
{/if}

{#each drafts as { block, index } (index)}
	{#if block.kind === 'draft'}
		<DraftCard
			draft={block.draft}
			status={block.state}
			domain={block.domain ?? 'substrate'}
			onsettle={(state) => runtime.settleDraft(message.id, index, state)}
		/>
	{/if}
{/each}

{#if info}
	<DetailPopover
		anchor={info.anchor}
		bind:open={infoOpen}
		tone="honey"
		icon="shovel"
		title={info.block.call.tool}
		width="md"
		onclose={() => (info = undefined)}
	>
		{#if infoTool}
			<ToolAbout tool={infoTool} collapsible />
		{/if}
		<DetailSection label={$t('gardener.tool.thisCall')} collapsible>
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
