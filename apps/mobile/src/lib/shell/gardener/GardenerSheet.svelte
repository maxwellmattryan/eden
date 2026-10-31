<script lang="ts">
	// The Gardener's chat on the phone (product/substrate/ai.md, "Surfaces"; docs/design/ux-patterns.md, "Gardener
	// surfaces"; D-163): one full-height bottom sheet, opened by the top bar's button and by
	// anything else that calls `gardenerUi.show()` (a conversation's row, an audit entry, Toolbench's brainstorm).
	// The header names the conversation and holds the grade switch (D-74, the status bar's on desktop), the thread
	// list, a new conversation and close; under it one quiet line says the month's spend against its cap and the
	// model, and the development clamp (D-81). The thread list is a second level in the conversation's place. The
	// session and the log are the ones desktop's panel draws (`chat`, `ChatLog`), so an interrupted reply, Retry, the
	// sprout and the eye are the same here. With no key on this device the sheet leads to Settings, where a key is
	// typed; there is no field here. Files come through the system's own chooser (camera, library, files) or a paste
	// (D-82 to D-84); nothing is dropped on a phone. The sheet never reopens at launch, and the Gardener's page is
	// reached from More, not from here.
	import { Button, Composer, ConfirmSheet, FileButton, FileChip, Icon, IconButton, Menu, Sheet } from '@eden/ui-kit'
	import { ACCEPT, attachmentForm, formatUsd, GRADES, LONG_PASTE_CHARS, WARN_PERCENT } from '@eden/shared/gardener'
	import { t } from '@eden/shared/i18n'
	import { settings } from '@eden/shared/settings'
	import { chat, gardenerSetup, gardenerUi, runtime, sizeLabel, threads } from '@eden/shared/shell/gardener'
	import ChatLog from '@eden/shared/shell/gardener/ChatLog.svelte'
	import ThreadList from '@eden/shared/shell/gardener/ThreadList.svelte'
	import { settingsUi } from '@eden/shared/shell/settings'

	const uid = $props.id()
	const titleId = `${uid}-title`
	const ICONS = { image: 'image', pdf: 'file-text', text: 'file-text' } as const
	const GRADE_ICONS = { light: 'seed', standard: 'sprout', deep: 'tree-deciduous' } as const

	// The sheet reads the threads once it opens, and runs what it was opened to run.
	$effect(() => {
		if (!gardenerUi.open) return
		chat.load()
	})

	const title = $derived(chat.title($t))
	const placeholder = $derived(chat.placeholder($t))
	// the grade and the spend are said once the Gardener can answer here: with no key there is nothing to grade
	const answers = $derived(gardenerSetup.ready && chat.canAsk)

	// The grade switch (D-74): the current grade's glyph, and a menu of the three.
	let gradeAnchor = $state<HTMLElement>()
	let gradeOpen = $state(false)
	const gradeLabel = $derived(
		$t('gardener.sheet.grade', {
			values: { grade: $t(`settings.gardener.grades.${gardenerSetup.grade}`), model: gardenerSetup.model },
		})
	)
	const gradeItems = $derived(
		GRADES.map((grade) => ({
			id: grade,
			label: $t(`settings.gardener.grades.${grade}`),
			icon: GRADE_ICONS[grade],
			checked: grade === gardenerSetup.grade,
			onselect: () => settings.setGardenerGrade(grade),
		}))
	)

	// The month's spend as a line of words (no meter on the phone): against the cap when there is one.
	const money = (usd: number) => `$${formatUsd(usd)}`
	const spend = $derived(
		gardenerSetup.capUsd > 0
			? $t('gardener.sheet.budget', {
					values: { spent: money(gardenerSetup.spentThisMonth), cap: money(gardenerSetup.capUsd) },
				})
			: $t('gardener.sheet.spent', { values: { spent: money(gardenerSetup.spentThisMonth) } })
	)
	// past the warning mark the line leads with the warning's glyph; at the cap the log's own notice speaks as well
	const nearCap = $derived(gardenerSetup.capUsd > 0 && gardenerSetup.percent >= WARN_PERCENT)

	/** Settings on the Gardener tab, over the chat: the key and the budgets are both there, and Back returns here. */
	function openSettings() {
		settingsUi.show('gardener')
	}

	// Android's back press reaches a sheet as Escape (`$lib/shell/back`): with the thread list up it steps back to
	// the conversation and the sheet stays. Only while this sheet is the one on top with nothing open over it.
	function onkey(event: KeyboardEvent) {
		if (event.key !== 'Escape' || !gardenerUi.open || !chat.listOpen) return
		const target = event.target instanceof Element ? event.target : null
		const dialog = target?.closest('dialog[open]')
		if (!dialog?.classList.contains('gardener-sheet') || dialog.querySelector(':popover-open')) return
		event.preventDefault()
		event.stopPropagation()
		chat.listOpen = false
	}
</script>

<svelte:window onkeydowncapture={onkey} />

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

<!-- the composer's foot: the paperclip, which the system answers with the camera, the library and files -->
{#snippet composerTools()}
	<FileButton
		label={$t('gardener.attach')}
		size="sm"
		accept={ACCEPT}
		disabled={!chat.canAsk || chat.blocked}
		onfiles={chat.picked}
	/>
{/snippet}

<!-- no key on this device: it is typed in Settings, never here -->
{#snippet toSettings()}
	<div class="to-settings">
		<Button variant="primary" icon="key-round" label={$t('gardener.noKey.openSettings')} onclick={openSettings} />
	</div>
{/snippet}

<!-- the composer, the sheet's foot while the conversation shows. The keyboard: Android's webview shrinks the sheet
     with it; whether iOS keeps the foot above it is a device check (the shell's keyboard inset would be added to
     the sheet's panel here). -->
{#snippet composerFoot()}
	<div class="foot">
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
{/snippet}

<Sheet
	class="gardener-sheet"
	open={gardenerUi.open}
	placement="bottom"
	size="full"
	labelledby={titleId}
	initialFocus="container"
	footer={chat.listOpen ? undefined : composerFoot}
	onclose={() => gardenerUi.hide()}
>
	{#snippet header()}
		<div class="head">
			<h2 id={titleId} class="title">{title}</h2>
			{#if answers}
				<span class="anchor" bind:this={gradeAnchor}>
					<IconButton
						icon={GRADE_ICONS[gardenerSetup.grade]}
						size="sm"
						label={gradeLabel}
						aria-haspopup="menu"
						aria-expanded={gradeOpen}
						onclick={() => (gradeOpen = !gradeOpen)}
					/>
				</span>
				<Menu bind:open={gradeOpen} anchor={gradeAnchor} label={$t('gardener.sheet.gradeMenu')} items={gradeItems} />
			{/if}
			<IconButton
				icon="list"
				size="sm"
				label={$t('gardener.threads')}
				pressed={chat.listOpen}
				disabled={!chat.listOpen && !threads.of(gardenerUi.domain).length}
				onclick={() => (chat.listOpen = !chat.listOpen)}
			/>
			<IconButton icon="plus" size="sm" label={$t('gardener.newThread')} onclick={() => chat.newThread()} />
			<IconButton icon="x" size="sm" label={$t('common.close')} onclick={() => gardenerUi.hide()} />
		</div>
		{#if answers}
			<p class="spend">
				{#if nearCap}<span class="near"><Icon name="triangle-alert" size="sm" /></span>{/if}
				<span>{spend}</span>
				<span class="model">{gardenerSetup.model}</span>
			</p>
			{#if gardenerSetup.clamped && chat.inApp}
				<p class="spend">
					{$t('gardener.devClamp', {
						values: { model: gardenerSetup.map.light.model, deep: gardenerSetup.map.deep.model },
					})}
				</p>
			{/if}
		{/if}
	{/snippet}

	{#if chat.listOpen}
		<ThreadList
			domain={gardenerUi.domain}
			onopen={(id) => void chat.openThread(id)}
			onempty={() => (chat.listOpen = false)}
		/>
	{:else}
		<div class="log"><ChatLog flush nokey={toSettings} onbudgets={openSettings} /></div>
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
</Sheet>

<style>
	.head {
		display: flex;
		align-items: center;
		gap: var(--space-1);
	}
	.title {
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
	.anchor {
		display: inline-flex;
	}
	/* the month's spend and the model, one quiet line that wraps before it clips */
	.spend {
		display: flex;
		flex-wrap: wrap;
		gap: 0 var(--space-2);
		margin: var(--space-1) 0 0;
		font: var(--ed-t-body-sm);
		color: var(--text-secondary);
	}
	.near {
		display: inline-flex;
		align-self: center;
		color: var(--warning);
	}
	.model {
		font: var(--ed-t-data-sm);
		overflow-wrap: anywhere;
	}
	/* the log is its own scroller: it takes the body's height, and the body itself never scrolls */
	.log {
		display: grid;
		grid-template-rows: minmax(0, 1fr);
		grid-template-columns: minmax(0, 1fr);
		height: 100%;
	}
	.to-settings {
		display: flex;
	}
	/* the sheet's footer lines its buttons up at the end; the composer takes the whole foot */
	.foot {
		flex: 1;
		min-width: 0;
		display: grid;
	}
	.foot > :global(*) {
		min-width: 0;
	}
</style>
