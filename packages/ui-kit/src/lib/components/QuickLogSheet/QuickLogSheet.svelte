<script module lang="ts">
	import type { IconName } from '../../icons/icons.js'

	export type QuickLogKind = 'number' | 'text' | 'check'

	/** One quick action: a numeric log with a unit and a trend, a one-line text, or a check with options. */
	export interface QuickLog {
		id: string
		/** The tab and the field's label. */
		label: string
		/** The tab's glyph. */
		icon?: IconName
		kind: QuickLogKind
		/** number: the unit, as a mono chip inside the field. */
		unit?: string
		placeholder?: string
		/** text: one line beneath the field; "Enter to save" when omitted. */
		helper?: string
		/** check: the options, as selectable chips. A single option starts selected. */
		options?: string[]
		/** A value to start from, before the owner types. */
		value?: string
		/** The last saved value and when: "82.6 kg", "yesterday 06:48". */
		last?: { value: string; when: string }
		/** number: the recent values, oldest first, for the sparkline. */
		series?: readonly number[]
		/** number: the average or goal, as the sparkline's dashed line. */
		reference?: number
	}

	/** Where a log's field starts before the owner types: its value, or a check's only option. */
	function initialValue(log: QuickLog): string {
		if (log.value !== undefined) return log.value
		if (log.kind === 'check' && log.options?.length === 1) return log.options[0]!
		return ''
	}
</script>

<script lang="ts">
	// One-field logging (D-12): the field, the unit as a chip, the last value and time beneath, a sparkline for a
	// numeric log, and Enter to save. With more than one log the logs are tabs across the top. Each tab keeps its own
	// draft, keyed by the log's id, so switching away and back loses nothing; a save clears that draft and, unless the
	// panel is embedded (the status bar's popover), closes the sheet. The caller writes with undo and shows the toast.
	import type { HTMLAttributes } from 'svelte/elements'
	import { useStrings } from '../../i18n/context.js'
	import Button from '../Button/Button.svelte'
	import Chip from '../Chip/Chip.svelte'
	import Field from '../Field/Field.svelte'
	import Segmented from '../Segmented/Segmented.svelte'
	import Sheet from '../Sheet/Sheet.svelte'
	import Sparkline from '../Sparkline/Sparkline.svelte'

	type Props = Omit<HTMLAttributes<HTMLElement>, 'children' | 'onclose' | 'oncancel' | 'onkeydown'> & {
		/** Bindable. Set it to open; every close path sets it back to false. Ignored when embedded. */
		open?: boolean
		/** The enabled quick actions; with more than one they become tabs. */
		logs: QuickLog[]
		/** The selected tab, as an index into `logs`. Bindable. */
		selected?: number
		/** Renders the panel without the Sheet, for a popover; a save then clears the field and stays. */
		embedded?: boolean
		/** Called with the log and the value on Enter or the primary button. */
		onsave?: (log: QuickLog, value: string) => void
	}
	const uid = $props.id()
	let {
		open = $bindable(false),
		logs,
		selected = $bindable(0),
		embedded = false,
		onsave,
		class: className = '',
		...rest
	}: Props = $props()

	const s = useStrings()
	const tabs = $derived(logs.map((log) => ({ id: log.id, label: log.label, icon: log.icon })))
	const log = $derived(logs[selected])
	// One draft per log, keyed by id. No effect: the field reads the draft (or the log's starting value) and its
	// oninput writes it, so a tab switch simply reads another key.
	let drafts = $state<Record<string, string>>({})
	const value = $derived(log ? (drafts[log.id] ?? initialValue(log)) : '')
	const canSave = $derived(value.trim().length > 0)
	const labelId = `${uid}-label`

	function setDraft(next: string) {
		if (log) drafts[log.id] = next
	}
	function input(e: Event & { currentTarget: EventTarget & HTMLInputElement }) {
		setDraft(e.currentTarget.value)
	}
	function keydown(e: KeyboardEvent) {
		if (e.key !== 'Enter' || e.isComposing) return
		e.preventDefault()
		save()
	}
	function save() {
		if (!log || !canSave) return
		const saved = log
		onsave?.(saved, value)
		delete drafts[saved.id]
		if (!embedded) open = false
	}
</script>

{#snippet tabsRow()}
	<Segmented items={tabs} bind:selected label={s.quickLog.quickActions} />
{/snippet}

{#snippet body()}
	{#if log}
		<div class="ed-quicklog-body">
			{#if log.kind === 'number'}
				<Field
					label={log.label}
					large
					mono
					unit={log.unit}
					placeholder={log.placeholder}
					helper={s.enterToSave}
					autofocus={!embedded}
					{value}
					oninput={input}
					onkeydown={keydown}
				/>
				{#if log.last}<p class="ed-quicklog-last">{s.quickLog.last(log.last.value, log.last.when)}</p>{/if}
				{#if log.series?.length}
					<Sparkline values={log.series} reference={log.reference} width={312} height={48} legend={s.quickLog.series} />
				{/if}
			{:else if log.kind === 'text'}
				<Field
					label={log.label}
					placeholder={log.placeholder}
					helper={log.helper ?? s.enterToSave}
					autofocus={!embedded}
					{value}
					oninput={input}
					onkeydown={keydown}
				/>
			{:else}
				<div class="ed-quicklog-check" role="group" aria-labelledby={labelId}>
					<span class="ed-quicklog-label" id={labelId}>{log.label}</span>
					<div class="ed-quicklog-options">
						{#each log.options ?? [] as option (option)}
							<Chip
								label={option}
								selectable
								selected={value === option}
								onselect={(on) => setDraft(on ? option : '')}
							/>
						{/each}
					</div>
				</div>
				{#if log.last}<p class="ed-quicklog-last">{s.quickLog.last(log.last.value, log.last.when)}</p>{/if}
			{/if}
		</div>
	{/if}
{/snippet}

{#snippet actions()}
	<Button
		label={log?.kind === 'check' ? s.quickLog.tookIt : s.save}
		variant="primary"
		disabled={!canSave}
		onclick={save}
	/>
{/snippet}

{#if embedded}
	<div class="ed-quicklog ed-quicklog-embedded {className}" role="group" aria-label={s.quickLog.title} {...rest}>
		{#if logs.length > 1}{@render tabsRow()}{/if}
		{@render body()}
		<div class="ed-quicklog-actions">{@render actions()}</div>
	</div>
{:else}
	<Sheet
		bind:open
		size="sm"
		label={s.quickLog.title}
		header={logs.length > 1 ? tabsRow : undefined}
		footer={actions}
		class="ed-quicklog {className}"
		{...rest}
	>
		{@render body()}
	</Sheet>
{/if}

<style>
	.ed-quicklog-embedded {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
		min-width: 0;
	}
	.ed-quicklog-body {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
		min-width: 0;
	}
	.ed-quicklog-last {
		margin: 0;
		font: var(--ed-t-caption);
		letter-spacing: var(--ed-t-caption-tracking);
		color: var(--text-secondary);
	}
	.ed-quicklog-check {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
	}
	.ed-quicklog-label {
		font: var(--ed-t-label);
		letter-spacing: var(--ed-t-label-tracking);
		color: var(--text-primary);
	}
	.ed-quicklog-options {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-1);
	}
	.ed-quicklog-actions {
		display: flex;
		justify-content: flex-end;
		gap: var(--space-2);
	}
</style>
