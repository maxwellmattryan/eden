<script lang="ts">
	// The chat's log (product/substrate/ai.md, "Surfaces"; docs/design/ux-patterns.md, "Gardener surfaces"): what
	// the desktop's panel and the phone's sheet both draw between their header and their composer. The states in
	// which the Gardener cannot answer (the browser, no key on this device, the budget), a save that failed, the T2
	// lock, the greeting of an empty conversation, the conversation itself, whose last reply carries the eye, and the
	// row that waits on a reply (D-80). It is its own scroller and follows the reply as it streams. Because both
	// surfaces draw this, the interrupted notice, Retry, the sprout and the eye are the same on both.
	import { tick, type Snippet } from 'svelte'
	import { GardenerMessage, Greeting, InlineError, Notice, Sprouting, Thread } from '@eden/ui-kit'
	import { t } from '../../i18n/index.js'
	import { threadAttachments } from './attachments.svelte.js'
	import { chat } from './chat.svelte.js'
	import MessageBlocks from './MessageBlocks.svelte'
	import { runtime } from './runtime.svelte.js'
	import { gardenerSetup } from './setup.svelte.js'
	import { threads } from './threads.svelte.js'

	type Props = {
		/** What stands under the "no key on this device" notice: the panel's key field, the sheet's way to Settings. */
		nokey?: Snippet
		/** Opens the budgets, from the notice that says the month's cap is reached. */
		onbudgets: () => void
		/** No padding of its own, where the surface already insets what it holds (a sheet). */
		flush?: boolean
	}
	let { nokey, onbudgets, flush = false }: Props = $props()

	let log = $state<HTMLElement>()

	// The log follows the reply as it streams, while the owner is at its foot: scrolled up to read, they are left
	// there. Sending a message or opening a thread goes to the foot again. Whether they are at the foot is read
	// against the height the log had before it grew, at the moment it grows, so a scroll is never raced.
	const NEAR_FOOT = 32
	let lastHeight = 0
	let shownThread: string | undefined
	// effect: imperative DOM
	$effect(() => {
		void threads.messages.length
		void threads.messages.at(-1)?.blocks
		void runtime.streaming
		void chat.waiting
		const thread = threads.current?.id
		if (thread !== shownThread) chat.toFoot = true
		shownThread = thread
		if (!log) return
		const atFoot = log.scrollTop + log.clientHeight >= lastHeight - NEAR_FOOT
		lastHeight = log.scrollHeight
		if (!chat.toFoot && !atFoot) return
		chat.toFoot = false
		void tick().then(() => {
			if (!log) return
			log.scrollTo({ top: log.scrollHeight })
			lastHeight = log.scrollHeight
		})
	})

	// the files of the open conversation: their thumbnails, and which are gone
	$effect(() => {
		void threadAttachments.load(threads.current?.uri)
	})
</script>

<div class={['log', chat.greets && 'log-empty', flush && 'log-flush']} bind:this={log}>
	{#if !chat.inApp}
		<Notice tone="info" title={$t('gardener.runsInApp')} />
	{:else if gardenerSetup.ready && !gardenerSetup.hasKey}
		<Notice tone="info" title={$t('gardener.noKey.title')} detail={$t('gardener.noKey.text')} />
		{@render nokey?.()}
	{/if}
	{#if chat.blocked}
		<Notice
			tone="warning"
			title={$t('gardener.budgetReached')}
			action={{ label: $t('gardener.openBudgets'), onclick: onbudgets }}
		/>
	{/if}
	{#if threads.saveFailed}
		<InlineError message={$t('gardener.saveFailed')} onretry={() => threads.flushWrites()} live />
	{/if}
	{#if threads.current?.tier === 'T2'}
		<Notice tone="info" icon="lock" title={$t('gardener.lockedThread')} />
	{/if}
	{#if chat.greets}<Greeting text={chat.greeting($t)} name={chat.ownerName} />{/if}
	<Thread label={$t('gardener.conversation')}>
		{#each threads.messages as message (message.id)}
			<MessageBlocks {message} last={message.id === chat.lastReply} />
		{/each}
		{#if chat.waiting}<GardenerMessage><Sprouting size="md" /></GardenerMessage>{/if}
	</Thread>
</div>

<style>
	/* the scroller is positioned, so what is absolute inside it (a tool card's hidden status word) scrolls with it
	   and never lays out against the page */
	.log {
		position: relative;
		overflow: hidden auto;
		display: grid;
		align-content: start;
		gap: var(--space-3);
		min-height: 0;
		padding: var(--space-3);
		overflow-wrap: anywhere;
	}
	.log-flush {
		padding: 0;
	}
	/* an empty conversation: the greeting takes the space the notices leave and centres in it */
	.log-empty {
		display: flex;
		flex-direction: column;
	}
	/* a grid item's min-width is its content's: a long unbroken word would widen the column */
	.log > :global(*) {
		min-width: 0;
	}
	/* the surface is the measure: the thread fills it so the gutters match on both sides */
	.log :global(.ed-thread) {
		max-width: none;
	}
</style>
