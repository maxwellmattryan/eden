<script lang="ts">
	// The Gardener's panel (product/substrate/ai.md, "Surfaces"; docs/design/ux-patterns.md, "Gardener surfaces"): a
	// docked column on the right with the thread list behind a toggle, the conversation, whose last reply carries the
	// eye that says what it read, the composer, and the states in which it cannot answer: no key on this device, the browser, the
	// budget.
	// The whole panel is a drop zone while the composer is up (never over the thread list): files dropped on it, picked
	// with the paperclip or pasted into the field wait above the message as chips until it is sent (D-82 to D-84).
	// Opened from the sidebar, ⌘G, the status bar's chip or a domain page; a domain opens it on its own threads.
	import { onMount, tick } from 'svelte'
	import { goto } from '$app/navigation'
	import { resolve } from '$app/paths'
	import { Button, Composer, ConfirmSheet, Dropzone, Field, FileButton, FileChip, IconButton } from '@eden/ui-kit'
	import { ACCEPT, attachmentForm, LONG_PASTE_CHARS } from '@eden/shared/gardener'
	import { t } from '@eden/shared/i18n'
	import { settingsUi } from '@eden/shared/shell/settings'
	import { chat, gardenerSetup, gardenerUi, runtime, sizeLabel, threads } from '@eden/shared/shell/gardener'
	import ChatLog from '@eden/shared/shell/gardener/ChatLog.svelte'
	import ThreadList from '@eden/shared/shell/gardener/ThreadList.svelte'

	const uid = $props.id()
	let key = $state('')
	let keyBusy = $state(false)
	let foot = $state<HTMLElement>()

	// What the panel shares with the phone's chat sheet is the session (`chat`) and the log (`ChatLog`); the panel
	// keeps its own DOM. Files that were just staged put the caret back in the composer.
	chat.focusComposer = () => foot?.querySelector('textarea')?.focus()

	// The panel reads the threads once it opens, and runs what it was opened to run.
	$effect(() => {
		if (!gardenerUi.open) return
		chat.load()
	})

	onMount(() => {
		if (gardenerUi.open) void gardenerSetup.load()
		return () => (chat.focusComposer = undefined)
	})

	const ICONS = { image: 'image', pdf: 'file-text', text: 'file-text' } as const

	async function newThread() {
		chat.newThread()
		// the composer mounts again when the list was open, so focus once it is in the DOM
		await tick()
		foot?.querySelector('textarea')?.focus()
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
	const placeholder = $derived(chat.placeholder($t))
</script>

<!-- what waits on the message: a chip per file, each removable until it is sent -->
{#snippet stagedChips()}
	{#each chat.staged as entry (entry.key)}
		<FileChip
			name={entry.name}
			detail={sizeLabel(entry.size)}
			icon={ICONS[attachmentForm(entry.mime)]}
			thumbnail={entry.thumbnail}
			state={entry.busy ? 'busy' : 'ready'}
			onremove={() => chat.unstage(entry.key)}
		/>
	{/each}
{/snippet}

<!-- the composer's foot: the paperclip -->
{#snippet composerTools()}
	<FileButton
		label={$t('gardener.attach')}
		size="sm"
		accept={ACCEPT}
		disabled={!chat.canAsk || chat.blocked}
		tooltip
		onfiles={chat.picked}
	/>
{/snippet}

<!-- no key on this device: the panel takes it where it stands -->
{#snippet keyForm()}
	<form class="key" onsubmit={(e) => (e.preventDefault(), void saveKey())}>
		<Field bind:value={key} type="password" mono label={$t('settings.gardener.key.label')} placeholder="sk-ant-…" />
		<Button
			type="submit"
			variant="primary"
			icon="key-round"
			label={$t('settings.gardener.key.save')}
			disabled={keyBusy || !key.trim()}
		/>
	</form>
{/snippet}

<Dropzone
	class="panel-drop"
	{...chat.dropRules}
	disabled={chat.listOpen || !chat.canAsk || chat.blocked}
	ondrop={chat.dropped}
>
	<aside class="panel" aria-labelledby="{uid}-title">
		<header class="panel-head">
			<h2 id="{uid}-title" class="panel-title">{chat.title($t)}</h2>
			<IconButton
				icon="list"
				size="sm"
				label={$t('gardener.threads')}
				pressed={chat.listOpen}
				disabled={!chat.listOpen && !threads.of(gardenerUi.domain).length}
				tooltip
				onclick={() => (chat.listOpen = !chat.listOpen)}
			/>
			<IconButton
				icon="external-link"
				size="sm"
				label={$t('gardener.openPage')}
				tooltip
				onclick={() => void goto(resolve('/gardener/[[tab]]', {}))}
			/>
			<IconButton icon="plus" size="sm" label={$t('gardener.newThread')} tooltip onclick={() => void newThread()} />
			<IconButton icon="x" size="sm" label={$t('common.close')} tooltip onclick={() => gardenerUi.hide()} />
		</header>

		{#if chat.listOpen}
			<div class="panel-list">
				<ThreadList
					domain={gardenerUi.domain}
					onopen={(id) => void chat.openThread(id)}
					onempty={() => (chat.listOpen = false)}
				/>
			</div>
		{:else}
			<ChatLog nokey={keyForm} onbudgets={openBudgets} />
			<div class="panel-foot" bind:this={foot}>
				<Composer
					bind:value={chat.draft}
					{placeholder}
					label={placeholder}
					disabled={!chat.canAsk || chat.blocked}
					busy={runtime.streaming}
					attachments={chat.staged.length ? stagedChips : undefined}
					allowEmpty={chat.staged.length > 0}
					longPaste={LONG_PASTE_CHARS}
					tools={composerTools}
					onsend={(text) => void chat.send(text)}
					onfiles={chat.picked}
					onstop={() => void runtime.cancel()}
				/>
			</div>
		{/if}
	</aside>
</Dropzone>

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
	/* the drop zone is the panel's own box: it fills the dock and adds nothing to the layout */
	:global(.panel-drop) {
		width: 100%;
		height: 100%;
	}
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
	/* the list is positioned, so what is absolute inside it scrolls with it and never lays out against the page;
	   the log (`ChatLog`) is its own scroller in the middle row */
	.panel-list {
		position: relative;
		overflow: auto;
		grid-row: 2 / 4;
		padding: var(--space-3);
	}
	/* a grid item's min-width is its content's: a long unbroken word would widen the column */
	.panel-foot > :global(*) {
		min-width: 0;
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
</style>
