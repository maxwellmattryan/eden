<script lang="ts">
	// The Gardener's panel (product/substrate/ai.md, "Surfaces"; docs/design/ux-patterns.md, "Gardener surfaces"): a
	// docked column on the right with the thread list behind a toggle, the conversation, the literal "can see" row
	// above the composer, and the states in which it cannot answer: no key on this device, the browser, the budget.
	// Opened from the sidebar, ⌘G, the status bar's chip or a domain page; a domain opens it on its own threads.
	import { onMount, tick } from 'svelte'
	import { goto } from '$app/navigation'
	import { resolve } from '$app/paths'
	import { Button, CanSee, ConfirmSheet, Field, IconButton, InlineError, Notice, Thread } from '@eden/ui-kit'
	import { isTauri } from '@eden/shared/api'
	import type { MessageBlock } from '@eden/shared/gardener'
	import { t } from '@eden/shared/i18n'
	import { manifestFor } from '$lib/domains'
	import { settingsUi } from '$lib/settings/settings-ui.svelte'
	import { grants } from '../grants.svelte'
	import { undoToast } from '../undo'
	import Composer from './Composer.svelte'
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

	const domainName = $derived(gardenerUi.domain ? $t(manifestFor(gardenerUi.domain)?.name ?? '') : undefined)
	const title = $derived(
		threads.current?.title ??
			(domainName ? $t('gardener.askInDomain', { values: { domain: domainName } }) : $t('shell.gardener'))
	)
	const canSee = $derived(runtime.canSee as Extract<MessageBlock, { kind: 'can-see' }> | undefined)
	// the chip names each id as the owner knows it (a fact's name), the id itself beside it
	const chipItems = $derived((canSee?.items ?? []).map((item) => ({ ...item, label: registryLabel(item.id) })))
	const chipLocked = $derived((canSee?.locked ?? []).map((id) => ({ id, label: registryLabel(id) })))
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

	// The panel reads the threads once it opens, and runs what it was opened to run.
	$effect(() => {
		if (!gardenerUi.open) return
		void gardenerSetup.load()
		void threads.load().then(async () => {
			// the latest conversation of the surface opens, unless the panel was opened to run something
			if (gardenerUi.pending) return runtime.runPending()
			const latest = threads.of(gardenerUi.domain)[0]
			if (!threads.current && latest) await threads.open(latest.id)
		})
	})
	// The log follows the reply as it streams.
	// effect: imperative DOM
	$effect(() => {
		void threads.messages.length
		void runtime.streaming
		if (!log) return
		void tick().then(() => log?.scrollTo({ top: log.scrollHeight }))
	})

	onMount(() => {
		if (gardenerUi.open) void gardenerSetup.load()
	})

	function send(text: string) {
		void runtime.ask(text)
	}
	function newThread() {
		threads.close()
		listOpen = false
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
	function openAudit() {
		gardenerUi.hide()
		void goto(resolve('/gardener/audit'))
	}
	function openBudgets() {
		settingsUi.show('gardener')
	}
	const placeholder = $derived(
		domainName ? $t('gardener.askInDomain', { values: { domain: domainName } }) : $t('gardener.askPlaceholder')
	)
</script>

<aside class="panel" aria-labelledby="{uid}-title">
	<header class="panel-head">
		<IconButton
			icon="list"
			size="sm"
			label={$t('gardener.threads')}
			pressed={listOpen}
			tooltip
			onclick={() => (listOpen = !listOpen)}
		/>
		<h2 id="{uid}-title" class="panel-title">{title}</h2>
		<IconButton icon="plus" size="sm" label={$t('gardener.newThread')} tooltip onclick={newThread} />
		<IconButton icon="x" size="sm" label={$t('common.close')} tooltip onclick={() => gardenerUi.hide()} />
	</header>

	{#if listOpen}
		<div class="panel-list">
			<ThreadList domain={gardenerUi.domain} onopen={(id) => void openThread(id)} />
		</div>
	{:else}
		<div class="panel-log" bind:this={log}>
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
			{#if gardenerSetup.clamped && inApp}
				<Notice tone="info" title={$t('gardener.devClamp', { values: { model: gardenerSetup.map.light.model } })} />
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
			<Thread label={$t('gardener.conversation')}>
				{#each threads.messages as message (message.id)}
					<MessageBlocks {message} />
				{/each}
			</Thread>
		</div>
		<div class="panel-foot">
			{#if canSee}
				<CanSee
					items={chipItems}
					locked={chipLocked}
					trimmed={canSee.trimmed}
					onaudit={openAudit}
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
			<Composer
				{placeholder}
				disabled={!canAsk || blocked}
				streaming={runtime.streaming}
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
	.panel-list {
		overflow: auto;
		grid-row: 2 / 4;
	}
	.panel-log {
		overflow: hidden auto;
		display: grid;
		align-content: start;
		gap: var(--space-3);
		padding: var(--space-3);
		overflow-wrap: anywhere;
	}
	/* a grid item's min-width is its content's: a long unbroken word would widen the column */
	.panel-log > :global(*),
	.panel-foot > :global(*) {
		min-width: 0;
	}
	.panel-foot {
		display: grid;
		gap: var(--space-2);
		padding: var(--space-3);
		border-top: 1px solid var(--stroke-subtle);
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
		max-height: 160px;
		overflow: auto;
		overflow-wrap: anywhere;
	}
	.rows-none {
		margin: 0;
		font: var(--ed-t-body-sm);
		color: var(--text-secondary);
	}
</style>
