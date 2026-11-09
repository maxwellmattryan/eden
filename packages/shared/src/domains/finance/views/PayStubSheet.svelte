<script lang="ts">
	// The pay stub sheet (product/domains/finance.md §6, #85, D-201), laid out as the bill form is: Reading while the
	// Gardener reads the stub, then Review, the pay day and a row per deduction (its name, kind and amount, and a way to
	// remove it), with what the insurance premiums come to a paycheck; or why there is nothing, with a way to enter them
	// by hand. Each row needs a name and a positive amount; errors show on their field and the first one takes focus on
	// Save. Save keeps the deductions on the income source (with the stub's `file-import` row, for a read) and shows an
	// undo toast; an edit saved with no rows clears them. Cancel writes nothing.
	import { Button, Field, IconButton, InlineError, Select, Sheet, Spinner } from '@eden/ui-kit'
	import { tick } from 'svelte'
	import { todayIso } from '../../../dates/index.js'
	import { t } from '../../../i18n/index.js'
	import { formatMoney, parseMoney, toDecimal, type Money } from '../../../money/index.js'
	import { amountText, settings } from '../../../settings/index.js'
	import { undoToast } from '../../../shell/index.js'
	import { payStubRead } from '../paystub.svelte.js'
	import { finance } from '../store.svelte.js'
	import { DEDUCTION_KINDS, INSURANCE_DEDUCTIONS, type Deduction, type DeductionKind } from '../types.js'
	import { dayLine, moneyError } from '../words.js'

	type Props = { open: boolean }
	let { open = $bindable() }: Props = $props()

	const uid = $props.id()
	const lang = $derived(settings.language)
	// the sheet is made afresh each time it opens (`opened` keys it), so it reads the session once
	const source = finance.incomeById(payStubRead.sourceId)
	const currency = source?.expected.currency ?? settings.homeCurrency
	// a read has the stub's fingerprint; an edit opens on the stored deductions and has none
	const reading = !!payStubRead.fingerprint
	const stored = source?.payStub

	type Row = { key: number; name: string; kind: DeductionKind; amount: string }
	let next = 0
	const rowOf = (entry?: Deduction): Row => ({
		key: (next += 1),
		name: entry?.name ?? '',
		kind: entry?.kind ?? 'medical',
		amount: entry ? toDecimal(entry.amount) : '',
	})
	const given = payStubRead.draft
	let day = $state(given?.day || todayIso())
	let rows = $state<Row[]>(given?.deductions.length ? given.deductions.map(rowOf) : [rowOf()])
	let errors = $state<Record<string, string>>({})
	let listError = $state<string | undefined>()

	const phase = $derived(payStubRead.phase)
	const kinds = $derived(
		DEDUCTION_KINDS.map((kind) => ({ value: kind, label: $t(`domains.finance.payStub.kinds.${kind}`) }))
	)
	const title = $derived($t(reading ? 'domains.finance.payStub.title' : 'domains.finance.payStub.titleEdit'))
	const failure = $derived.by(() => {
		const key = `domains.finance.payStub.failure.${payStubRead.failure ?? 'network'}`
		const text = $t(key)
		return text === key ? $t('domains.finance.payStub.failure.network') : text
	})
	const money = (amount: Money) => amountText(formatMoney(amount, lang), settings.hideAmounts)
	/** What the insurance rows that read come to, as the owner types. */
	const premiums = $derived.by(() => {
		let minor = 0
		let any = false
		for (const row of rows) {
			if (!INSURANCE_DEDUCTIONS.includes(row.kind)) continue
			const amount = parseMoney(row.amount, currency, lang)
			if ('error' in amount || amount.minor <= 0) continue
			minor += amount.minor
			any = true
		}
		return any ? money({ minor, currency }) : undefined
	})

	const rowLabel = (row: Row, at: number) =>
		row.name.trim() || $t('domains.finance.payStub.rowLabel', { values: { n: at + 1 } })
	const removeLabel = (row: Row) =>
		row.name.trim()
			? $t('domains.finance.payStub.remove', { values: { name: row.name.trim() } })
			: $t('domains.finance.payStub.removeEmpty')

	async function focus(id: string) {
		await tick()
		document.getElementById(id)?.focus()
	}

	function add() {
		const row = rowOf()
		rows.push(row)
		listError = undefined
		void focus(`${uid}-name-${row.key}`)
	}

	function remove(key: number) {
		const at = rows.findIndex((row) => row.key === key)
		if (at < 0) return
		rows.splice(at, 1)
		const { [`name-${key}`]: _name, [`amount-${key}`]: _amount, ...rest } = errors
		errors = rest
		const after = rows[at]
		void focus(after ? `${uid}-name-${after.key}` : `${uid}-add`)
	}

	function close() {
		open = false
		void payStubRead.cancel()
	}

	async function save(event: SubmitEvent) {
		event.preventDefault()
		if (phase !== 'review' || !source) return
		const found: Record<string, string> = {}
		const deductions: Deduction[] = []
		let first: string | undefined
		for (const row of rows) {
			if (!row.name.trim()) {
				found[`name-${row.key}`] = $t('domains.finance.payStub.errors.name')
				first ??= `name-${row.key}`
			}
			const amount = parseMoney(row.amount, currency, lang)
			if ('error' in amount) found[`amount-${row.key}`] = moneyError(amount.error, currency, $t, lang)
			else if (amount.minor <= 0) found[`amount-${row.key}`] = $t('domains.finance.payStub.errors.positive')
			else deductions.push({ name: row.name.trim(), kind: row.kind, amount })
			if (found[`amount-${row.key}`]) first ??= `amount-${row.key}`
		}
		errors = found
		listError = reading && !rows.length ? $t('domains.finance.payStub.errors.none') : undefined
		if (first) return focus(`${uid}-${first}`)
		if (listError) return focus(`${uid}-add`)
		const stub = deductions.length ? { day: day || todayIso(), deductions } : undefined
		const fingerprint = reading ? payStubRead.fingerprint : undefined
		const undo = finance.savePayStub(source.id, stub, fingerprint ? { fingerprint } : undefined)
		if (!undo) return
		undoToast(
			$t(stub ? 'domains.finance.toasts.payStubSaved' : 'domains.finance.toasts.payStubCleared', {
				values: { employer: source.name },
			}),
			undo
		)
		payStubRead.saved()
		open = false
	}
</script>

<Sheet
	bind:open={
		() => open,
		(value) => {
			if (!value) close()
		}
	}
	size="md"
	labelledby="{uid}-title"
>
	{#snippet header()}
		<h2 class="title" id="{uid}-title">{title}</h2>
	{/snippet}
	{#if phase === 'reading'}
		<div class="reading" role="status">
			<Spinner size="md" />
			<p class="line">{$t('domains.finance.payStub.reading')}</p>
		</div>
	{:else if phase === 'failed'}
		<div class="failed">
			<InlineError message={failure} live />
			<div>
				<Button label={$t('domains.finance.payStub.byHand')} onclick={() => payStubRead.byHand()} />
			</div>
		</div>
	{:else}
		<form class="form" id="{uid}-form" onsubmit={save} novalidate>
			{#if reading && stored}
				<p class="line quiet">
					{$t('domains.finance.payStub.replaces', { values: { day: dayLine(stored.day, lang) } })}
				</p>
			{/if}
			<Field id="{uid}-day" label={$t('domains.finance.payStub.payDay')} type="date" bind:value={day} />
			<div class="list" role="group" aria-labelledby="{uid}-list">
				<p class="caption" id="{uid}-list">{$t('domains.finance.payStub.list')}</p>
				{#each rows as row, at (row.key)}
					<div class="row" role="group" aria-label={rowLabel(row, at)}>
						<div class="name">
							<Field
								id="{uid}-name-{row.key}"
								label={$t('domains.finance.payStub.name')}
								bind:value={row.name}
								error={errors[`name-${row.key}`]}
							/>
						</div>
						<div class="figures">
							<Select label={$t('domains.finance.payStub.kind')} options={kinds} bind:value={row.kind} />
							<Field
								id="{uid}-amount-{row.key}"
								label={$t('domains.finance.payStub.amount')}
								unit={currency}
								bind:value={row.amount}
								error={errors[`amount-${row.key}`]}
								mono
								inputmode="decimal"
							/>
						</div>
						<div class="remove">
							<span class="control">
								<IconButton icon="x" size="sm" label={removeLabel(row)} tooltip onclick={() => remove(row.key)} />
							</span>
						</div>
					</div>
				{/each}
			</div>
			<div>
				<Button id="{uid}-add" label={$t('domains.finance.payStub.add')} variant="quiet" icon="plus" onclick={add} />
			</div>
			{#if listError}
				<InlineError message={listError} />
			{/if}
			{#if premiums}
				<p class="line quiet small">{$t('domains.finance.payStub.premiums', { values: { amount: premiums } })}</p>
			{/if}
		</form>
	{/if}
	{#snippet footer()}
		<Button label={$t('domains.finance.cancel')} variant="quiet" onclick={close} />
		{#if phase === 'review'}
			<Button label={$t('domains.finance.save')} variant="primary" type="submit" form="{uid}-form" />
		{/if}
	{/snippet}
</Sheet>

<style>
	.title {
		margin: 0;
		font: var(--ed-t-title);
		letter-spacing: var(--ed-t-title-tracking);
		font-variation-settings: var(--ed-t-title-opsz);
	}
	.form,
	.failed,
	.list {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}
	.list {
		container: deductions / inline-size;
	}
	.reading {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		padding: var(--space-4) 0;
	}
	.line {
		margin: 0;
		font: var(--ed-t-body);
	}
	.small {
		font: var(--ed-t-body-sm);
	}
	.caption {
		margin: 0;
		font: var(--ed-t-label);
		color: var(--text-secondary);
	}
	.quiet {
		color: var(--text-secondary);
	}
	/* one line on a wide sheet: name | kind | amount | remove */
	.row {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(0, 18rem) auto;
		align-items: start;
		gap: var(--space-3);
	}
	.figures {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
		gap: var(--space-3);
	}
	/* the remove button sits on the fields' line: below a label's height, centred on the control */
	.remove {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
	}
	.remove::before {
		content: '';
		height: 1lh;
		font: var(--ed-t-label);
	}
	.control {
		display: flex;
		align-items: center;
		min-height: var(--ed-control);
	}
	/* stacked on a narrow sheet: the name full width, kind and amount as a pair, remove at the row's end, a hairline
	   between rows */
	@container deductions (max-width: 34rem) {
		.row {
			grid-template-columns: minmax(0, 1fr) auto;
			padding-bottom: var(--space-3);
			border-bottom: 1px solid var(--border-subtle);
		}
		.name {
			grid-column: 1 / -1;
		}
		.row:last-child {
			padding-bottom: 0;
			border-bottom: none;
		}
	}
</style>
