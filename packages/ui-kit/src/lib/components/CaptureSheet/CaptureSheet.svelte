<script module lang="ts">
	import type { IconName } from '../../icons/icons.js'
	import { groupOf } from '../../files/check-files.js'

	export type CaptureLocation = 'fridge' | 'freezer' | 'pantry' | 'counter'

	/** collect: the sources are staged. reading: the provider has them. rows: what it read is checked. failed: nothing came back. */
	export type CapturePhase = 'collect' | 'reading' | 'rows' | 'failed'

	/** A source waiting to be read, or one that was: a photo, a receipt, a PDF, pasted text. */
	export interface CaptureFile {
		key: string
		name: string
		/** The caption beside the name: a size, "pasted text". */
		detail?: string
		/** A small image of it, as a data URL. */
		thumbnail?: string
		/** Still being measured. */
		busy?: boolean
	}

	/** One recognised item. The sheet never changes a row: every edit is a patch handed to `onrowchange`. */
	export interface CaptureRow {
		id: string
		name: string
		qty: string
		unit?: string
		location: CaptureLocation
		/** An ISO date, YYYY-MM-DD. */
		expiry?: string
		/** The expiry was guessed, not read. */
		estimated?: boolean
		/** A category id from `categories`. */
		category?: string
		/** A storage or handling tip worth showing; drawn as the info button with a tooltip. */
		tip?: string
		/** The stock item this row would merge into, and whether it will. */
		merge?: { name: string; on: boolean }
		/** A small picture of the item, cut from its photo, as a data URL. */
		thumbnail?: string
	}

	/** What is captured: a shop just brought home, or the shelves as they stand, where a match updates the item. */
	export type CaptureKind = 'haul' | 'stock'

	/** A category a row may be filed under. */
	export interface CaptureCategory {
		id: string
		label: string
	}

	/** The four locations, in the order the chips show them. */
	export const LOCATIONS: readonly CaptureLocation[] = ['fridge', 'freezer', 'pantry', 'counter']

	/** The glyph for a source without a picture of itself, by its name: a photo, or anything written. */
	const glyphOf = (file: CaptureFile): IconName =>
		groupOf({ name: file.name, type: '' }) === 'image' ? 'image' : 'file-text'

	/** The remove buttons a removal hands its focus on to: a row's, a staged file's. */
	const REMOVE = '.ed-capture-trash, .ed-file-remove'
</script>

<script lang="ts">
	// Capture, in one sheet and two phases (D-13; docs/design/ux-patterns.md, "Capture verification sheet"). First the
	// sources are collected: a drop area with a file button, the staged files as chips, a paste anywhere in the sheet
	// (files, or a list as text), with the provider, the model and the cost named at the foot beside Read. While the
	// provider reads there is a spinner and Stop; a read that failed says why and offers Retry. Then the rows are
	// checked: the sources' thumbnails with the provider line beneath, and each row editable inline, the name, the
	// quantity and unit, the expiry with its estimated badge, the location as a radio group of chips, the category
	// behind a chip that opens a menu, a merge switch when a stock item matches, a tip behind an info glyph, and
	// remove; "Add a row" under the list, the counts and Commit at the foot.
	// The sheet holds no draft of its own: `phase`, `files` and `rows` are the parent's, every edit is a callback, and
	// nothing is stored until the parent acts on `oncommit`. Discard, Escape and the scrim call `onclose`. On mobile
	// the sheet is full height and each row takes several lines; `layout` reads the platform once unless it is forced.
	import type { Snippet } from 'svelte'
	import type { ClipboardEventHandler, HTMLDialogAttributes } from 'svelte/elements'
	import { tick, untrack } from 'svelte'
	import Icon from '../../icons/Icon.svelte'
	import { useStrings } from '../../i18n/context.js'
	import { checkFiles, type FileCheck, type FileRules } from '../../files/check-files.js'
	import { platformOf } from '../../internal/platform.js'
	import { roving } from '../../internal/roving.js'
	import Badge from '../Badge/Badge.svelte'
	import Button from '../Button/Button.svelte'
	import Chip from '../Chip/Chip.svelte'
	import Dropzone from '../Dropzone/Dropzone.svelte'
	import Field from '../Field/Field.svelte'
	import FileButton from '../FileButton/FileButton.svelte'
	import FileChip from '../FileChip/FileChip.svelte'
	import IconButton from '../IconButton/IconButton.svelte'
	import InlineError from '../InlineError/InlineError.svelte'
	import Menu, { type MenuItem } from '../Menu/Menu.svelte'
	import Sheet, { type SheetCloseReason } from '../Sheet/Sheet.svelte'
	import Spinner from '../Spinner/Spinner.svelte'
	import Toggle from '../Toggle/Toggle.svelte'

	type Props = Omit<HTMLDialogAttributes, 'open' | 'oncancel' | 'onclose' | 'onkeydown' | 'onpaste'> & {
		/** Bindable. Set it to open; Discard, Escape and the scrim set it back to false. */
		open?: boolean
		/** Where the capture stands; the parent moves it on. */
		phase: CapturePhase
		/** haul (the default) words the sheet for a shop just bought; stock for photos of the shelves as they stand. */
		kind?: CaptureKind
		/** The sources, staged or read. */
		files: CaptureFile[]
		/** The recognised rows, shown in the `rows` phase. */
		rows: CaptureRow[]
		/** What a file is held to, however it arrives: dropped, picked or pasted. `count` is the parent's to keep. */
		rules?: FileRules
		/** Who reads the sources: "Anthropic". */
		provider: string
		/** The model it reads with: "Haiku". */
		model?: string
		/** The cost, already formatted: "0.8 ¢". */
		cost?: string
		/** Why Read cannot run (no key, the budget): shown in place of the provider line, and Read is off. */
		blocked?: string
		/** What went wrong, shown in the `failed` phase beside Retry. */
		error?: string
		/** The categories a row may be filed under; without any, rows show no category. */
		categories?: CaptureCategory[]
		/** wide puts the thumbnails beside the rows, stacked above them at full height; auto follows data-platform. */
		layout?: 'auto' | 'wide' | 'stacked'
		/** The app's own line under the provider line: a link to settings. */
		notice?: Snippet
		/** Files picked, dropped or pasted that the rules take. */
		onfiles?: (files: File[]) => void
		/** The ones the rules refuse, each with its reason, as the Dropzone reports them. */
		onrejected?: (rejected: FileCheck['rejected']) => void
		/** Text pasted into the sheet while collecting: a list. */
		onpastetext?: (text: string) => void
		/** The cross on a staged file. */
		onremovefile?: (key: string) => void
		/** Read, and Retry after a failure. */
		onread?: () => void
		/** Stop, while reading. */
		onstop?: () => void
		/** An edit to a row, as the fields that changed. */
		onrowchange?: (id: string, patch: Partial<CaptureRow>) => void
		onremoverow?: (id: string) => void
		/** "Add a row"; the new row's name takes focus once it is in `rows`. */
		onaddrow?: () => void
		/** Commit. The sheet stays open: the parent closes it once its write is through. */
		oncommit?: () => void
		/** The capture is discarded: the Discard button, Escape or the scrim. */
		onclose?: () => void
	}
	const uid = $props.id()
	let {
		open = $bindable(false),
		phase,
		kind = 'haul',
		files,
		rows,
		rules,
		provider,
		model,
		cost,
		blocked,
		error,
		categories,
		layout = 'auto',
		notice,
		onfiles,
		onrejected,
		onpastetext,
		onremovefile,
		onread,
		onstop,
		onrowchange,
		onremoverow,
		onaddrow,
		oncommit,
		onclose,
		class: className = '',
		...rest
	}: Props = $props()

	const s = useStrings()
	// the words that differ when the shelves are read as they stand: a match is brought up to date, not added to
	const words = $derived(kind === 'stock' ? s.capture.stock : s.capture)
	// a row without a picture keeps its place once any row has one, so the names stay in a column
	const pictured = $derived(rows.some((row) => row.thumbnail))
	const titleId = `${uid}-title`
	// the dot stays with the word before it, so a line that breaks never starts with one
	const providerLine = $derived([provider, model, cost && s.capture.estimate(cost)].filter(Boolean).join('\u00a0· '))
	const canRead = $derived(!blocked && files.length > 0 && !files.some((file) => file.busy))
	const merged = $derived(rows.filter((row) => row.merge?.on).length)
	const created = $derived(rows.length - merged)

	let body = $state<HTMLElement>()
	let list = $state<HTMLElement>()
	const stacked = $derived(layout === 'auto' ? !!body && platformOf(body) === 'mobile' : layout === 'stacked')

	// One menu serves every row's category chip: it hangs on the chip that opened it.
	let menuOpen = $state(false)
	let menuAnchor = $state<HTMLElement | null>(null)
	let menuFor = $state<string>()
	const menuItems = $derived.by<MenuItem[]>(() => {
		const current = rows.find((row) => row.id === menuFor)?.category
		return (categories ?? []).map(({ id, label }) => ({ id, label, checked: id === current }))
	})

	/** A row's name where it is spoken, with a stand-in while it has none. */
	const named = (row: CaptureRow) => row.name.trim() || s.capture.unnamed

	function change(id: string, patch: Partial<CaptureRow>) {
		onrowchange?.(id, patch)
	}
	function openCategories(anchor: HTMLElement, id: string) {
		// the chip pressed again while its menu is open closes it
		if (menuOpen && menuAnchor === anchor) {
			menuOpen = false
			return
		}
		menuAnchor = anchor
		menuFor = id
		menuOpen = true
	}
	function pickCategory(item: MenuItem) {
		if (menuFor && item.id) change(menuFor, { category: item.id })
	}

	/** Every way in holds a file to the same rules: the Dropzone has run them, a pick and a paste run them here. */
	function hand(accepted: File[], rejected: FileCheck['rejected']) {
		if (accepted.length) onfiles?.(accepted)
		if (rejected.length) onrejected?.(rejected)
	}
	function take(picked: File[]) {
		const check = checkFiles(picked, rules)
		hand(check.accepted, check.rejected)
	}
	// A paste anywhere in the sheet while collecting: files are sources, text is a list. The handler sits on the
	// dialog, since the focus a paste is sent to is the sheet's panel until something inside is focused.
	const paste: ClipboardEventHandler<HTMLDialogElement> = (e) => {
		const data = e.clipboardData
		if (phase !== 'collect' || !data) return
		// a field the app put in its notice keeps its own paste
		if (e.target instanceof Element && e.target.closest('input, textarea, [contenteditable]')) return
		const text = data.getData('text/plain')
		// a copied table or passage often carries a picture of itself beside its text: the text is what was meant
		if (text.trim()) {
			e.preventDefault()
			onpastetext?.(text)
		} else if (data.files.length) {
			e.preventDefault()
			take(Array.from(data.files))
		}
	}

	/**
	 * Removing a row or a staged file takes its remove button away, and the focus that button held would fall out of
	 * the sheet. The item that holds focus is noted first; once it is gone the focus goes to the same button on the
	 * item that took its place, or to the body when it was the last.
	 */
	async function removing(act: () => void) {
		const held = document.activeElement?.closest('li')
		const next = held?.nextElementSibling ?? held?.previousElementSibling
		act()
		if (!held || !body?.contains(held)) return
		await tick()
		if (held.isConnected) return
		const target = next?.isConnected ? next.querySelector<HTMLElement>(REMOVE) : null
		;(target ?? body)?.focus({ preventScroll: true })
	}
	/** A row the parent adds is there to be typed into: its name takes focus. */
	async function add() {
		const before = rows.length
		onaddrow?.()
		await tick()
		if (rows.length > before) list?.querySelector<HTMLElement>(':scope > li:last-child input')?.focus()
	}

	function discard() {
		onclose?.()
		open = false
	}
	function commit() {
		if (rows.length) oncommit?.()
	}
	// Escape and the scrim close the dialog themselves and report here; a close through `open` has been accounted for.
	function closed(reason: SheetCloseReason) {
		if (reason !== 'api') onclose?.()
	}

	let seen: CapturePhase | undefined
	$effect(() => {
		// effect: imperative DOM. A new phase takes the button that was pressed away (Read, Stop, Retry), and the focus
		// it held would fall out of the sheet: the body takes it, so the keyboard stays where the owner is.
		const now = phase
		const was = seen
		seen = now
		const el = body
		if (was === undefined || was === now || !el || !untrack(() => open)) return
		const sheet = el.closest('dialog')
		if (sheet && !sheet.contains(document.activeElement)) el.focus({ preventScroll: true })
	})
</script>

{#snippet staged(removable: boolean)}
	{#if files.length}
		<ul class="ed-capture-files" aria-label={s.capture.sources}>
			{#each files as file (file.key)}
				<li>
					<FileChip
						name={file.name}
						detail={file.detail}
						icon={glyphOf(file)}
						thumbnail={file.thumbnail}
						state={file.busy ? 'busy' : 'ready'}
						onremove={removable ? () => removing(() => onremovefile?.(file.key)) : undefined}
					/>
				</li>
			{/each}
		</ul>
	{/if}
{/snippet}

<Sheet
	bind:open
	size={stacked ? 'full' : 'lg'}
	labelledby={titleId}
	onclose={closed}
	onpaste={paste}
	class="ed-capture {className}"
	{...rest}
>
	{#snippet header()}
		<h2 class="ed-capture-title" id={titleId}>{phase === 'rows' ? words.title : words.collectTitle}</h2>
	{/snippet}
	<div class={['ed-capture-body', { 'ed-capture-stacked': stacked }]} bind:this={body} tabindex="-1">
		{#if phase === 'rows'}
			<div class={['ed-capture-check', { 'ed-capture-bare': !files.length }]}>
				<div class="ed-capture-media">
					{#if files.length}
						<ul class="ed-capture-thumbs" aria-label={s.capture.sources}>
							{#each files as file (file.key)}
								<li class="ed-capture-thumb">
									{#if file.thumbnail}
										<img src={file.thumbnail} alt={file.name} />
									{:else}
										<Icon name={glyphOf(file)} />
										<span class="ed-capture-thumb-name">{file.name}</span>
									{/if}
								</li>
							{/each}
						</ul>
					{/if}
					<p class="ed-capture-provider">{s.capture.readBy(providerLine)}</p>
				</div>
				<div class="ed-capture-main">
					{#if rows.length}
						<ul class="ed-capture-rows" aria-label={s.capture.draftRows} bind:this={list}>
							{#each rows as row (row.id)}
								{@const merge = row.merge}
								{@const category = categories?.find((entry) => entry.id === row.category)}
								<li class={['ed-capture-row', { 'ed-capture-row-merge': merge?.on }]}>
									<div class="ed-capture-name">
										{#if row.thumbnail}
											<img class="ed-capture-pic" src={row.thumbnail} alt="" />
										{:else if pictured}
											<span class="ed-capture-pic ed-capture-nopic" aria-hidden="true"
												><Icon name="image" size="sm" /></span
											>
										{/if}
										<Field
											value={row.name}
											placeholder={s.capture.rowName}
											aria-label={s.capture.rowName}
											oninput={(e) => change(row.id, { name: e.currentTarget.value })}
										/>
									</div>
									<div class="ed-capture-qty">
										<Field
											value={row.qty}
											mono
											inputmode="decimal"
											aria-label={s.capture.rowQty}
											oninput={(e) => change(row.id, { qty: e.currentTarget.value })}
										/>
									</div>
									<div class="ed-capture-unit">
										<Field
											value={row.unit ?? ''}
											placeholder={s.capture.rowUnit}
											aria-label={s.capture.rowUnit}
											oninput={(e) => change(row.id, { unit: e.currentTarget.value || undefined })}
										/>
									</div>
									<div class="ed-capture-expiry">
										<!-- a date the owner sets is no longer a guess -->
										<Field
											type="date"
											value={row.expiry ?? ''}
											aria-label={s.capture.rowExpiry}
											oninput={(e) => change(row.id, { expiry: e.currentTarget.value || undefined, estimated: false })}
										/>
									</div>
									<span class="ed-capture-actions">
										{#if row.tip}
											<IconButton icon="info" size="xs" label={s.about(named(row))} tooltip={row.tip} />
										{/if}
										<IconButton
											class="ed-capture-trash"
											icon="trash"
											label={s.remove(named(row))}
											size={stacked ? 'md' : 'sm'}
											onclick={() => removing(() => onremoverow?.(row.id))}
										/>
									</span>
									<div
										class="ed-capture-locations"
										role="radiogroup"
										aria-label={s.capture.location(named(row))}
										{@attach roving(() => ({
											selector: '[role="radio"]',
											orientation: 'horizontal',
											current: () => untrack(() => LOCATIONS.indexOf(row.location)),
											onMove: (_, index) => change(row.id, { location: LOCATIONS[index]! }),
										}))}
									>
										{#each LOCATIONS as location (location)}
											<Chip
												label={s.capture.locations[location]}
												tone={row.location === location ? 'accent' : 'neutral'}
												role="radio"
												aria-checked={row.location === location}
												onclick={() => change(row.id, { location })}
											/>
										{/each}
									</div>
									{#if categories?.length || row.estimated}
										<div class="ed-capture-meta">
											{#if categories?.length}
												<Chip
													label={category?.label ?? s.capture.category}
													tone="outline"
													icon="chevron-down"
													aria-label={category ? s.capture.categoryNamed(category.label) : undefined}
													aria-haspopup="menu"
													aria-expanded={menuOpen && menuFor === row.id}
													onclick={(e) => openCategories(e.currentTarget as HTMLElement, row.id)}
												/>
											{/if}
											{#if row.estimated}<Badge kind="estimated" />{/if}
										</div>
									{/if}
									{#if merge}
										<div class="ed-capture-merge">
											<Toggle
												label={words.mergeWith(merge.name)}
												checked={merge.on}
												onchange={(on) => change(row.id, { merge: { ...merge, on } })}
											/>
										</div>
									{/if}
								</li>
							{/each}
						</ul>
					{/if}
					<Button label={s.capture.addRow} variant="quiet" icon="plus" onclick={add} />
				</div>
			</div>
			<Menu
				bind:open={menuOpen}
				anchor={menuAnchor}
				align="start"
				label={s.capture.category}
				items={menuItems}
				onselect={pickCategory}
			/>
		{:else if phase === 'collect'}
			<Dropzone {...rules} ondrop={hand}>
				<div class="ed-capture-collect">
					<div class="ed-capture-stage ed-capture-invite">
						<Icon name="camera" size="lg" />
						<p class="ed-capture-lead">{words.invite}</p>
						<p class="ed-capture-hint">{stacked ? words.inviteHintTouch : words.inviteHint}</p>
						<FileButton
							label={s.capture.chooseFiles}
							tooltip
							accept={rules?.accept}
							multiple={rules?.maxFiles !== 1}
							onfiles={take}
						/>
					</div>
					{@render staged(true)}
				</div>
			</Dropzone>
		{:else}
			<div class="ed-capture-collect">
				<div class="ed-capture-stage">
					{#if phase === 'reading'}
						<Spinner size="md" label={s.capture.reading} />
						<p class="ed-capture-hint" aria-hidden="true">{s.capture.reading}</p>
					{:else}
						<InlineError message={error ?? ''} onretry={onread} live />
					{/if}
				</div>
				{@render staged(false)}
			</div>
		{/if}
	</div>
	{#snippet footer()}
		{#if phase === 'rows'}
			<p class="ed-capture-note" role="status">
				{rows.length ? words.footer(created, merged) : s.capture.everyRowRemoved}
			</p>
			<Button label={s.discard} variant="quiet" onclick={discard} />
			<Button label={s.commit} variant="primary" disabled={!rows.length} onclick={commit} />
		{:else}
			<div class="ed-capture-note">
				<p>{phase === 'reading' ? providerLine : (blocked ?? providerLine)}</p>
				{@render notice?.()}
			</div>
			{#if phase === 'reading'}
				<Button label={s.gardener.stop} onclick={() => onstop?.()} />
			{:else}
				<Button label={s.discard} variant="quiet" onclick={discard} />
				{#if phase === 'collect'}
					<Button label={s.capture.read} variant="primary" disabled={!canRead} onclick={() => onread?.()} />
				{/if}
			{/if}
		{/if}
	{/snippet}
</Sheet>

<style>
	.ed-capture-title {
		margin: 0;
		font: var(--ed-t-title);
		letter-spacing: var(--ed-t-title-tracking);
		font-variation-settings: var(--ed-t-title-opsz);
		color: var(--text-primary);
	}
	/* The body takes focus only when a phase or a removal leaves it nowhere else to go, never from Tab: no ring. */
	.ed-capture-body {
		min-width: 0;
	}
	.ed-capture-body:focus {
		outline: none;
	}

	/* collect, reading, failed: one stage (the invitation, the spinner, the error) over the staged files */
	.ed-capture-collect {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
		min-width: 0;
	}
	.ed-capture-stage {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: var(--space-2);
		box-sizing: border-box;
		min-height: calc(var(--space-8) * 7);
		padding: var(--space-6) var(--space-4);
		border: 1px solid var(--ed-card-border);
		border-radius: var(--ed-radius-card);
		background: var(--surface-0);
		color: var(--text-secondary);
		text-align: center;
	}
	.ed-capture-invite {
		border: 1px dashed var(--stroke-hover);
	}
	.ed-capture-lead {
		margin: 0;
		font: var(--ed-t-title-sm);
		letter-spacing: var(--ed-t-title-sm-tracking);
		font-variation-settings: var(--ed-t-title-sm-opsz);
		color: var(--text-primary);
	}
	.ed-capture-hint {
		margin: 0;
		font: var(--ed-t-body-sm);
		letter-spacing: var(--ed-t-body-sm-tracking);
		color: var(--text-secondary);
	}
	.ed-capture-files {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
		min-width: 0;
	}
	.ed-capture-files li {
		display: inline-flex;
		min-width: 0;
		max-width: 100%;
	}

	/* rows: the sources beside the list, the first thumbnail large and the rest beneath it */
	.ed-capture-check {
		display: grid;
		grid-template-columns: calc(var(--space-8) * 5) minmax(0, 1fr);
		gap: var(--space-4);
		align-items: start;
	}
	.ed-capture-bare {
		grid-template-columns: minmax(0, 1fr);
	}
	.ed-capture-media {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		min-width: 0;
	}
	.ed-capture-thumbs {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: var(--space-2);
	}
	.ed-capture-thumb {
		aspect-ratio: 1;
		box-sizing: border-box;
		min-width: 0;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: var(--space-1);
		border: 1px solid var(--ed-card-border);
		border-radius: var(--ed-radius-control);
		background: var(--surface-2);
		color: var(--text-secondary);
		overflow: hidden;
	}
	.ed-capture-thumb:first-child {
		grid-column: 1 / -1;
		border-radius: var(--ed-radius-card);
	}
	.ed-capture-thumb img {
		display: block;
		width: 100%;
		height: 100%;
		object-fit: cover;
	}
	.ed-capture-thumb-name {
		box-sizing: border-box;
		max-width: 100%;
		padding: 0 var(--space-1);
		font: var(--ed-t-caption);
		letter-spacing: var(--ed-t-caption-tracking);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.ed-capture-provider {
		margin: 0;
		font: var(--ed-t-caption);
		letter-spacing: var(--ed-t-caption-tracking);
		color: var(--text-secondary);
	}
	.ed-capture-main {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: var(--space-2);
		min-width: 0;
	}

	/* The list owns the column tracks and each row subgrids into them, so names, quantities, units and dates align
	   down the list. A row is two lines, the fields over the chips, and a third when it may merge. */
	.ed-capture-rows {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		grid-template-columns:
			minmax(0, 1fr) calc(var(--space-8) * 2) calc(var(--space-8) * 2 + var(--space-2))
			calc(var(--space-8) * 4 + var(--space-4)) max-content;
		column-gap: var(--space-2);
		align-self: stretch;
		min-width: 0;
		border: 1px solid var(--ed-card-border);
		border-radius: var(--ed-radius-card);
		background: var(--surface-0);
		overflow: hidden;
	}
	.ed-capture-row {
		grid-column: 1 / -1;
		display: grid;
		grid-template-columns: subgrid;
		grid-template-areas:
			'name qty unit expiry actions'
			'locations locations locations meta meta'
			'merge merge merge merge merge';
		align-items: center;
		min-height: var(--ed-row);
		padding: var(--space-2) var(--space-2) var(--space-2) var(--space-3);
		border-bottom: 1px solid var(--ed-card-border);
		transition: background-color var(--ed-duration-micro) var(--ed-ease-out);
	}
	.ed-capture-row:last-child {
		border-bottom: 0;
	}
	.ed-capture-row-merge {
		background: var(--brand-muted);
	}
	.ed-capture-name {
		grid-area: name;
		display: flex;
		align-items: center;
		gap: var(--space-2);
		min-width: 0;
	}
	.ed-capture-name > :global(:not(.ed-capture-pic)) {
		flex: 1;
		min-width: 0;
	}
	/* the item's picture, cut from its photo: square, the height of the field beside it */
	.ed-capture-pic {
		flex: none;
		box-sizing: border-box;
		width: var(--ed-row);
		height: var(--ed-row);
		border: 1px solid var(--ed-card-border);
		border-radius: var(--ed-radius-control);
		object-fit: cover;
		background: var(--surface-2);
	}
	.ed-capture-nopic {
		display: inline-grid;
		place-items: center;
		color: var(--text-tertiary);
	}
	.ed-capture-qty {
		grid-area: qty;
		min-width: 0;
	}
	.ed-capture-unit {
		grid-area: unit;
		min-width: 0;
	}
	.ed-capture-expiry {
		grid-area: expiry;
		min-width: 0;
	}
	.ed-capture-actions {
		grid-area: actions;
		justify-self: end;
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
	}
	.ed-capture-locations {
		grid-area: locations;
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-1);
		margin-top: var(--space-2);
		min-width: 0;
	}
	.ed-capture-meta {
		grid-area: meta;
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-1);
		margin-top: var(--space-2);
		min-width: 0;
	}
	/* the switch sits beside its words, not at the far edge of the row */
	.ed-capture-merge {
		grid-area: merge;
		display: flex;
		margin-top: var(--space-1);
		min-width: 0;
	}
	.ed-capture-note {
		margin: 0 auto 0 0;
		align-self: center;
		min-width: 0;
		font: var(--ed-t-caption);
		letter-spacing: var(--ed-t-caption-tracking);
		color: var(--text-secondary);
		/* where the line must break beside the buttons, it breaks evenly, never before the last word alone */
		text-wrap: balance;
	}
	.ed-capture-note p {
		margin: 0;
	}

	/* stacked: the mobile sheet, full height, the thumbnails a strip above the rows and each row on several lines */
	.ed-capture-stacked .ed-capture-check {
		grid-template-columns: minmax(0, 1fr);
	}
	.ed-capture-stacked .ed-capture-thumbs {
		display: flex;
		flex-wrap: wrap;
	}
	.ed-capture-stacked .ed-capture-thumb {
		flex: none;
		width: calc(var(--space-8) * 2);
		border-radius: var(--ed-radius-control);
	}
	.ed-capture-stacked .ed-capture-rows {
		grid-template-columns:
			calc(var(--space-8) * 2 + var(--space-2)) calc(var(--space-8) * 3) minmax(0, 1fr)
			max-content;
	}
	.ed-capture-stacked .ed-capture-row {
		grid-template-areas:
			'name name name actions'
			'qty unit expiry expiry'
			'locations locations locations locations'
			'meta meta meta meta'
			'merge merge merge merge';
	}
	.ed-capture-stacked .ed-capture-qty,
	.ed-capture-stacked .ed-capture-unit,
	.ed-capture-stacked .ed-capture-expiry {
		margin-top: var(--space-2);
	}
</style>
