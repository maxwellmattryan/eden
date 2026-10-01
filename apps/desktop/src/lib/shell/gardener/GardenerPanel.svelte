<script lang="ts">
	// The Gardener's panel (product/substrate/ai.md, "Surfaces"; docs/design/ux-patterns.md, "Gardener surfaces"): a
	// docked column on the right with the thread list behind a toggle, the conversation, the composer with the literal
	// "can see" chip at its foot, and the states in which it cannot answer: no key on this device, the browser, the
	// budget.
	// Opened from the sidebar, ⌘G, the status bar's chip or a domain page; a domain opens it on its own threads.
	import { onMount, tick } from 'svelte'
	import { goto } from '$app/navigation'
	import { resolve } from '$app/paths'
	import {
		Button,
		CanSee,
		Composer,
		ConfirmSheet,
		Field,
		GardenerMessage,
		Greeting,
		IconButton,
		InlineError,
		Notice,
		Sprouting,
		Thread,
	} from '@eden/ui-kit'
	import { isTauri } from '@eden/shared/api'
	import { hourOfDay } from '@eden/shared/dates'
	import { gardenerPanelState, greetingKey, segmentsOf, type MessageBlock } from '@eden/shared/gardener'
	import { t } from '@eden/shared/i18n'
	import { manifestFor } from '$lib/domains'
	import { settingsUi } from '$lib/settings/settings-ui.svelte'
	import { grants } from '../grants.svelte'
	import { profile } from '../profile/store.svelte'
	import { undoToast } from '../undo'
	import { labelRows, registryLabel, type RowLabel } from './labels'
	import { GRANT_SUBJECT } from './types'
	import MessageBlocks from './MessageBlocks.svelte'
	import { gardenerUi } from './panel-ui.svelte'
	import { runtime } from './runtime.svelte'
	import { gardenerSetup } from './setup.svelte'
	import ThreadList from './ThreadList.svelte'
	import { threads } from './threads.svelte'

	const uid = $props.id()
	let listOpen = $state(false)
	// the rows behind an opened chip, labelled; read when the chip opens and kept for the block
	let labels = $state<Record<string, RowLabel[] | undefined>>({})
	let unlocking = $state<string | undefined>()
	let key = $state('')
	let keyBusy = $state(false)
	let log = $state<HTMLElement>()
	let foot = $state<HTMLElement>()

	const domainName = $derived(gardenerUi.domain ? $t(manifestFor(gardenerUi.domain)?.name ?? '') : undefined)
	const title = $derived(
		threads.current?.title ??
			(domainName ? $t('gardener.askInDomain', { values: { domain: domainName } }) : $t('shell.gardener'))
	)
	const canSee = $derived(runtime.canSee as Extract<MessageBlock, { kind: 'can-see' }> | undefined)
	// the chip names each id as the owner knows it (a fact's name), the id itself beside it
	const chipItems = $derived((canSee?.items ?? []).map((item) => ({ ...item, label: registryLabel(item.id) })))
	// a locked id the owner has since shared leaves the list: the block is that request's snapshot, the grant is live
	const chipLocked = $derived(
		(canSee?.locked ?? [])
			.filter(
				(id) =>
					!grants.grants.some(
						(grant) =>
							grant.subject === GRANT_SUBJECT &&
							grant.resource === id &&
							grant.access === 'read' &&
							grant.lifetime === 'standing' &&
							!grant.deletedAt
					)
			)
			.map((id) => ({ id, label: registryLabel(id) }))
	)
	const chipRows = $derived(canSee?.rows ?? {})
	// a new block empties what the last one's chips showed
	$effect(() => {
		void canSee
		labels = {}
	})
	async function expand(item: { id: string }) {
		if (labels[item.id]) return
		labels = { ...labels, [item.id]: await labelRows(item.id, chipRows[item.id] ?? []) }
	}
	/** A standing read grant on the T2 id the tools in reach declared; the next request includes it (grants.md). */
	async function allow(id: string) {
		unlocking = undefined
		try {
			const granted = await grants.grant({
				subject: GRANT_SUBJECT,
				resource: id,
				resourceType: 'registry',
				access: 'read',
				lifetime: 'standing',
				origin: 'confirm',
			})
			undoToast($t('gardener.allowed', { values: { id: registryLabel(id) } }), () => void grants.revoke(granted.id))
		} catch {
			// the store refused: the chip stays locked
		}
	}
	const inApp = isTauri()
	// the browser answers with a scripted stream, so the composer stays open there
	const canAsk = $derived((inApp ? gardenerSetup.hasKey : true) && !gardenerSetup.failed)
	const blocked = $derived(gardenerSetup.percent >= 100 && gardenerSetup.capUsd > 0)

	// An empty conversation opens with a greeting: one of the locale's lines, by the hour and a roll made anew for
	// each new conversation, with the owner's preferred name when the profile holds one. It waits for the panel to
	// settle (the latest conversation may be about to open) and for the profile, so it never flashes or changes.
	let settled = $state(false)
	let roll = $state(Math.random())
	const ownerName = $derived.by(() => {
		const fact = profile.facts.find((entry) => entry.type === 'preferred-name' && !profile.isExpired(entry))
		return typeof fact?.value === 'string' ? fact.value.trim() || undefined : undefined
	})
	const greeting = $derived(
		$t(greetingKey(hourOfDay(Date.now()), roll, !!ownerName), { values: { name: ownerName ?? '' } })
	)
	const greets = $derived(settled && profile.ready && !threads.current && canAsk && !blocked)

	// The panel reads the threads once it opens, and runs what it was opened to run.
	$effect(() => {
		if (!gardenerUi.open) return
		void gardenerSetup.load()
		void grants.load()
		void profile.load()
		// what the app closed on last time is written to the audit log before anything new is asked
		void runtime.settleOpen()
		void threads
			.load()
			.then(async () => {
				// the conversation the panel was left on opens, a new one staying new, and the surface's latest when
				// none was kept or it is gone; unless the panel was opened to run something
				if (gardenerUi.pending) return runtime.runPending()
				if (threads.current) return
				const kept = gardenerPanelState().thread
				if (kept === null) return
				const id = threads.threads.some((entry) => entry.id === kept) ? kept : threads.of(gardenerUi.domain)[0]?.id
				if (id) await threads.open(id)
			})
			.finally(() => (settled = true))
	})
	// The Gardener is awaited with nothing yet to show (D-80): the owner's message is being packed, or the reply has
	// begun and holds no words and no card. One row for both, so the sprout grows on without starting over; once the
	// reply has something, the bubble takes its place and draws its own sprout between rounds.
	const waiting = $derived.by(() => {
		const thread = threads.current?.id
		if (!thread) return false
		if (runtime.preparing === thread) return !runtime.pending
		const last = threads.messages.at(-1)
		return (
			runtime.live?.threadId === thread &&
			runtime.live.messageId === last?.id &&
			!segmentsOf(last.blocks as MessageBlock[]).length
		)
	})

	// The log follows the reply as it streams, while the owner is at its foot: scrolled up to read, they are left
	// there. Sending a message or opening a thread goes to the foot again. Whether they are at the foot is read
	// against the height the log had before it grew, at the moment it grows, so a scroll is never raced.
	const NEAR_FOOT = 32
	let toFoot = true
	let lastHeight = 0
	let shownThread: string | undefined
	// effect: imperative DOM
	$effect(() => {
		void threads.messages.length
		void threads.messages.at(-1)?.blocks
		void runtime.streaming
		void waiting
		const thread = threads.current?.id
		if (thread !== shownThread) toFoot = true
		shownThread = thread
		if (!log) return
		const atFoot = log.scrollTop + log.clientHeight >= lastHeight - NEAR_FOOT
		lastHeight = log.scrollHeight
		if (!toFoot && !atFoot) return
		toFoot = false
		void tick().then(() => {
			if (!log) return
			log.scrollTo({ top: log.scrollHeight })
			lastHeight = log.scrollHeight
		})
	})

	onMount(() => {
		if (gardenerUi.open) void gardenerSetup.load()
	})

	function send(text: string) {
		toFoot = true
		void runtime.ask(text)
	}
	async function newThread() {
		threads.close()
		roll = Math.random()
		listOpen = false
		// the composer mounts again when the list was open, so focus once it is in the DOM
		await tick()
		foot?.querySelector('textarea')?.focus()
	}
	async function openThread(id: string) {
		await threads.open(id)
		listOpen = false
	}
	async function saveKey() {
		if (!key.trim()) return
		keyBusy = true
		try {
			await gardenerSetup.setKey(key)
			key = ''
		} finally {
			keyBusy = false
		}
	}
	function openBudgets() {
		settingsUi.show('gardener')
	}
	const placeholder = $derived(
		domainName ? $t('gardener.askInDomain', { values: { domain: domainName } }) : $t('gardener.askPlaceholder')
	)
</script>

<!-- the development clamp, once, at the composer's foot: an info glyph whose tooltip says it -->
{#snippet clampNote()}
	<IconButton
		icon="info"
		size="xs"
		label={$t('gardener.devClamp', { values: { model: gardenerSetup.map.light.model } })}
		tooltip
	/>
{/snippet}

{#snippet canSeeChip()}
	{#if canSee}
		<CanSee
			items={chipItems}
			locked={chipLocked}
			trimmed={canSee.trimmed}
			onexpand={(item) => void expand(item)}
			onunlock={(id) => (unlocking = id)}
		>
			{#snippet expanded(item)}
				{@const rows = labels[item.id]}
				{#if !(chipRows[item.id] ?? []).length}
					<p class="rows-none">{$t('gardener.noRows')}</p>
				{:else if !rows}
					<p class="rows-none">…</p>
				{:else}
					<ul class="rows">
						{#each rows as row (row.id)}<li>{row.label}</li>{/each}
					</ul>
				{/if}
			{/snippet}
		</CanSee>
	{/if}
{/snippet}

<aside class="panel" aria-labelledby="{uid}-title">
	<header class="panel-head">
		<h2 id="{uid}-title" class="panel-title">{title}</h2>
		<IconButton
			icon="list"
			size="sm"
			label={$t('gardener.threads')}
			pressed={listOpen}
			disabled={!listOpen && !threads.of(gardenerUi.domain).length}
			tooltip
			onclick={() => (listOpen = !listOpen)}
		/>
		<IconButton
			icon="clipboard-list"
			size="sm"
			label={$t('gardener.openAudit')}
			tooltip
			onclick={() => void goto(resolve('/gardener/audit'))}
		/>
		<IconButton
			icon="wrench"
			size="sm"
			label={$t('gardener.openTools')}
			tooltip
			onclick={() => void goto(resolve('/gardener/tools'))}
		/>
		<IconButton icon="plus" size="sm" label={$t('gardener.newThread')} tooltip onclick={() => void newThread()} />
		<IconButton icon="x" size="sm" label={$t('common.close')} tooltip onclick={() => gardenerUi.hide()} />
	</header>

	{#if listOpen}
		<div class="panel-list">
			<ThreadList domain={gardenerUi.domain} onopen={(id) => void openThread(id)} onempty={() => (listOpen = false)} />
		</div>
	{:else}
		<div class={['panel-log', greets && 'panel-log-empty']} bind:this={log}>
			{#if !inApp}
				<Notice tone="info" title={$t('gardener.runsInApp')} />
			{:else if gardenerSetup.ready && !gardenerSetup.hasKey}
				<Notice tone="info" title={$t('gardener.noKey.title')} detail={$t('gardener.noKey.text')} />
				<form class="key" onsubmit={(e) => (e.preventDefault(), void saveKey())}>
					<Field
						bind:value={key}
						type="password"
						mono
						label={$t('settings.gardener.key.label')}
						placeholder="sk-ant-…"
					/>
					<Button
						type="submit"
						variant="primary"
						icon="key-round"
						label={$t('settings.gardener.key.save')}
						disabled={keyBusy || !key.trim()}
					/>
				</form>
			{/if}
			{#if blocked}
				<Notice
					tone="warning"
					title={$t('gardener.budgetReached')}
					action={{ label: $t('gardener.openBudgets'), onclick: openBudgets }}
				/>
			{/if}
			{#if threads.saveFailed}
				<InlineError message={$t('gardener.saveFailed')} onretry={() => threads.flushWrites()} live />
			{/if}
			{#if threads.current?.tier === 'T2'}
				<Notice tone="info" icon="lock" title={$t('gardener.lockedThread')} />
			{/if}
			{#if greets}<Greeting text={greeting} name={ownerName} />{/if}
			<Thread label={$t('gardener.conversation')}>
				{#each threads.messages as message (message.id)}
					<MessageBlocks {message} />
				{/each}
				{#if waiting}<GardenerMessage><Sprouting size="md" /></GardenerMessage>{/if}
			</Thread>
		</div>
		<div class="panel-foot" bind:this={foot}>
			<Composer
				{placeholder}
				label={placeholder}
				disabled={!canAsk || blocked}
				busy={runtime.streaming}
				tools={canSee ? canSeeChip : undefined}
				meta={gardenerSetup.clamped && inApp ? clampNote : undefined}
				onsend={send}
				onstop={() => void runtime.cancel()}
			/>
		</div>
	{/if}
</aside>

{#if unlocking}
	<ConfirmSheet
		open={true}
		title={$t('gardener.allow.title')}
		subject={$t('shell.gardener')}
		resource={registryLabel(unlocking)}
		text={$t('gardener.allow.text', { values: { id: registryLabel(unlocking) } })}
		verb={$t('gardener.allow.verb')}
		onconfirm={() => unlocking && void allow(unlocking)}
		oncancel={() => (unlocking = undefined)}
	/>
{/if}

{#if runtime.pending}
	<ConfirmSheet
		open={true}
		title={runtime.pending.title}
		subject={runtime.pending.subject}
		resource={runtime.pending.resource}
		text={runtime.pending.text}
		verb={runtime.pending.verb}
		onconfirm={() => runtime.pending?.resolve(true)}
		oncancel={() => runtime.pending?.resolve(false)}
	/>
{/if}

<style>
	.panel {
		display: grid;
		/* one column that never grows past the panel: a grid track's default minimum is its content's */
		grid-template-columns: minmax(0, 1fr);
		grid-template-rows: auto minmax(0, 1fr) auto;
		width: 100%;
		height: 100%;
		border-left: 1px solid var(--stroke-subtle);
		background: var(--surface-0);
		min-width: 0;
		overflow: hidden;
	}
	.panel-head {
		display: flex;
		align-items: center;
		gap: var(--space-1);
		padding: var(--space-2) var(--space-3);
		border-bottom: 1px solid var(--stroke-subtle);
	}
	.panel-title {
		flex: 1;
		min-width: 0;
		margin: 0;
		font: var(--ed-t-title-sm);
		letter-spacing: var(--ed-t-title-sm-tracking);
		color: var(--text-primary);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	/* the scrollers are positioned, so what is absolute inside them (a tool card's hidden status word) scrolls with
	   them and never lays out against the page */
	.panel-list {
		position: relative;
		overflow: auto;
		grid-row: 2 / 4;
		padding: var(--space-3);
	}
	.panel-log {
		position: relative;
		overflow: hidden auto;
		display: grid;
		align-content: start;
		gap: var(--space-3);
		padding: var(--space-3);
		overflow-wrap: anywhere;
	}
	/* an empty conversation: the greeting takes the space the notices leave and centres in it */
	.panel-log-empty {
		display: flex;
		flex-direction: column;
	}
	/* a grid item's min-width is its content's: a long unbroken word would widen the column */
	.panel-log > :global(*),
	.panel-foot > :global(*) {
		min-width: 0;
	}
	/* the panel is the measure: the thread fills it so the gutters match on both sides */
	.panel-log :global(.ed-thread) {
		max-width: none;
	}
	/* the composer floats at the foot in its own box, so no rule parts it from the log */
	.panel-foot {
		display: grid;
		padding: var(--space-2) var(--space-3) var(--space-3);
	}
	.key {
		display: grid;
		gap: var(--space-2);
	}
	.rows {
		margin: 0;
		padding-left: var(--space-4);
		font: var(--ed-t-body-sm);
		color: var(--text-primary);
		overflow-wrap: anywhere;
	}
	.rows-none {
		margin: 0;
		font: var(--ed-t-body-sm);
		color: var(--text-secondary);
	}
</style>
