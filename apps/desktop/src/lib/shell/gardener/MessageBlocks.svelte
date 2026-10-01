<script lang="ts">
	// One message of a thread as the panel shows it: a bubble that holds, in the order they happened, what was said,
	// the tool cards with their confirm, the proposal cards and any error (docs/design/ux-patterns.md, "Gardener
	// surfaces"); reads in a row fold into one line. A draft is its own message after the bubble, in honey. The can-see block is the chip row's, not the bubble's. A reply is drawn as Markdown; under each message is when it
	// was sent or received and a glyph that copies its words. A tool the Gardener ran as its own request is a note in
	// the thread, not a bubble.
	import {
		DetailPopover,
		DetailSection,
		FileChip,
		GardenerMessage,
		Markdown,
		Notice,
		ProposalCard,
		Sprouting,
		ToolCard,
		ToolRun,
	} from '@eden/ui-kit'
	import { openExternal } from '@eden/shared/api'
	import { stampToDate } from '@eden/shared/data'
	import { formatMoment } from '@eden/shared/dates'
	import {
		attachmentForm,
		attachmentsOf,
		awaitsWords,
		segmentsOf,
		type Message,
		type MessageBlock,
		type ToolBlock,
		type ToolState,
	} from '@eden/shared/gardener'
	import { locale, t } from '@eden/shared/i18n'
	import { settings } from '@eden/shared/settings'
	import { copyText } from '$lib/clipboard'
	import { formatValue } from '@eden/shared/profile'
	import { profile } from '../profile/store.svelte'
	import { undoToast } from '../undo'
	import { threadAttachments } from './attachments.svelte'
	import DraftCard from './DraftCard.svelte'
	import { sizeLabel } from './files'
	import ToolAbout from './ToolAbout.svelte'
	import { handlerOf, toolByWireName } from './handlers'
	import { runtime } from './runtime.svelte'

	type Props = { message: Message }
	let { message }: Props = $props()

	const blocks = $derived(message.blocks as MessageBlock[])
	const text = $derived(
		blocks
			.filter((block) => block.kind === 'text' && block.text.trim())
			.map((block) => (block as { text: string }).text)
	)
	// the files the owner attached: each block names its Attachment row, which has the thumbnail (D-83)
	const files = $derived(message.role === 'owner' ? attachmentsOf(blocks) : [])
	const FILE_ICONS = { image: 'image', pdf: 'file-text', text: 'file-text' } as const
	const drafts = $derived(
		blocks.map((block, index) => ({ block, index })).filter(({ block }) => block.kind === 'draft')
	)
	// the message a request is still writing
	const live = $derived(runtime.live?.messageId === message.id)
	// a reply still marked as being written by a request that is gone (the app closed mid-way) was interrupted
	const interrupted = $derived(!live && blocks.some((block) => block.kind === 'writing'))
	// a card left running or waiting by such a request reads as cancelled
	const stateOf = (state: ToolState): ToolState =>
		(state === 'running' || state === 'pending') && !live ? 'cancelled' : state
	// Asking again is offered on the thread's last reply, when it was interrupted or failed in a way a second try may
	// clear. The reply fades and is then deleted for good; the wait is the kit's settle, nothing under reduced motion.
	let leaving = $state(false)
	const again = $derived(
		runtime.canRetry(message.id) && !leaving ? { label: $t('gardener.retry'), onclick: retry } : undefined
	)
	function retry() {
		if (leaving) return
		leaving = true
		const settle = getComputedStyle(document.documentElement).getPropertyValue('--ed-duration-settle').trim()
		const ms = settle.endsWith('ms') ? parseFloat(settle) : parseFloat(settle) * 1000
		setTimeout(() => void runtime.retry(message.id), Number.isFinite(ms) ? ms : 0)
	}
	const segments = $derived(segmentsOf(blocks, stateOf))
	// a run's line: the tool and how many times when it is one tool, how many tools when it is several
	function runHeading(items: { block: ToolBlock }[]): string {
		const [first] = items
		const same = items.every(({ block }) => block.call.tool === first?.block.call.tool)
		return same && first
			? $t('gardener.toolRun.same', { values: { tool: first.block.call.tool, count: items.length } })
			: $t('gardener.toolRun.mixed', { values: { count: items.length } })
	}
	function runStatus(items: { block: ToolBlock }[]): 'running' | 'done' | 'cancelled' {
		const states = items.map(({ block }) => stateOf(block.state))
		if (states.includes('running')) return 'running'
		return states.every((state) => state === 'done') ? 'done' : 'cancelled'
	}
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
	// the popover about a tool: what it is declared to do, and what it did here; its glyph pressed again closes it
	let info = $state<{ anchor: HTMLElement; block: ToolBlock } | undefined>()
	let infoOpen = $state(false)
	const infoTool = $derived(info ? toolByWireName(info.block.call.name) : undefined)
	function showInfo(anchor: HTMLElement, block: ToolBlock) {
		if (infoOpen && info?.anchor === anchor) {
			infoOpen = false
			return
		}
		info = { anchor, block }
		infoOpen = true
	}
	const json = (value: unknown) => JSON.stringify(value, null, 1)
	// what a card shows of its call: the handler's own words for it where it has them, else the input as it was sent
	const payload = (block: ToolBlock) => {
		const tool = toolByWireName(block.call.name)
		const handler = tool && handlerOf(tool)
		const words = handler && 'run' in handler ? handler.preview?.(block.call.input) : undefined
		if (words) return words
		const json = JSON.stringify(block.call.input, null, 1)
		return json && json !== '{}' ? json : undefined
	}
</script>

{#snippet toolCard(block: ToolBlock, index: number)}
	<ToolCard
		name={block.call.tool}
		access={block.call.access}
		payload={payload(block)}
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
{/snippet}

{#if message.role === 'owner'}
	{#if text.length || files.length}
		<GardenerMessage {text} owner {time} oncopy={text.length ? copy : undefined}>
			{#if files.length}
				<div class="files">
					{#each files as file (file.id)}
						<FileChip
							name={file.name}
							detail={sizeLabel(file.size)}
							icon={FILE_ICONS[attachmentForm(file.mime)]}
							thumbnail={threadAttachments.thumbnail(file.id)}
							state={threadAttachments.missing(file.id, `eden://thread/${message.threadId}`) ? 'missing' : 'ready'}
						/>
					{/each}
				</div>
			{/if}
		</GardenerMessage>
	{/if}
{:else if segments.length || interrupted}
	<GardenerMessage {time} oncopy={copy} class={leaving ? 'reply-leaving' : undefined}>
		{#each segments as segment (`${segment.kind}-${segment.index}`)}
			{#if segment.kind === 'text'}
				<Markdown source={segment.text} voice onlink={(href) => void openExternal(href)} />
			{:else if segment.kind === 'run'}
				<ToolRun heading={runHeading(segment.items)} status={runStatus(segment.items)}>
					{#each segment.items as { block, index } (index)}
						{@render toolCard(block, index)}
					{/each}
				</ToolRun>
			{:else if segment.block.kind === 'tool'}
				{@render toolCard(segment.block, segment.index)}
			{:else if segment.block.kind === 'proposal'}
				{@const proposal = segment.block.proposal}
				<ProposalCard
					fact={proposal.type}
					value={formatValue(proposal.type, proposal.value, $t)}
					text={proposal.text}
					state={segment.block.state}
					onaccept={() => accept(segment.index, proposal)}
					ondismiss={() => dismiss(segment.index, proposal)}
				/>
			{:else if segment.block.kind === 'error'}
				<Notice
					tone={segment.block.code === 'budget' ? 'warning' : 'danger'}
					title={segment.block.message}
					action={runtime.retryable(segment.block.code) ? again : undefined}
				/>
			{/if}
		{/each}
		<!-- between rounds: the tools are through and the answer has not begun (D-80) -->
		{#if live && segments.length && awaitsWords(segments, stateOf)}<Sprouting size="md" />{/if}
		{#if interrupted}
			<Notice
				tone="warning"
				title={$t('gardener.interrupted.title')}
				detail={$t('gardener.interrupted.text')}
				action={again}
			/>
		{/if}
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
	/* the message's files: a wrapping row of chips under its words */
	.files {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-1);
		min-width: 0;
	}
	:global(.reply-leaving) {
		opacity: 0;
		transition: opacity var(--ed-duration-settle) var(--ed-ease-out);
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
