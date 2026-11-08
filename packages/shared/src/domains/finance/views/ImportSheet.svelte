<script lang="ts">
	// Import a statement (#74, D-195; product/domains/finance.md, "Statement import"): the account and one file, read
	// as soon as both are there; the rows found, matched against what the account already holds; then one write with
	// one undo. A PDF or a picture is read in the document reader's sheet first, and this one opens again on the rows.
	// The sheet holds nothing of its own: every step is `statementImport`'s, and this view only shows it. Its body
	// follows `DocumentSheet`'s: the zone, the footer order and, on the phone, the footer stacked with the primary first.
	import {
		Button,
		Dropzone,
		FileButton,
		FileChip,
		InlineError,
		List,
		Notice,
		Select,
		Sheet,
		Spinner,
		Toggle,
		type ListRowData,
		type SelectOption,
		type SheetCloseReason,
	} from '@eden/ui-kit'
	import { t } from '../../../i18n/index.js'
	import { formatMoney, type Money } from '../../../money/index.js'
	import { amountText, settings } from '../../../settings/index.js'
	import { undoToast } from '../../../shell/index.js'
	import { IMPORT_ACCEPT } from '../statement.js'
	import { statementImport as session } from '../statement.svelte.js'
	import { finance } from '../store.svelte.js'
	import { dayLine, importAccountName, periodLine } from '../words.js'

	type Props = {
		/** Bindable: the session's `open`. */
		open?: boolean
	}
	let { open = $bindable(false) }: Props = $props()

	const uid = $props.id()
	const titleId = `${uid}-title`
	/** How many of the new rows the preview lists. */
	const PREVIEW = 10

	const lang = $derived(settings.language)
	const hidden = $derived(settings.hideAmounts)
	const shown = (amount: Money, sign?: 'never') => amountText(formatMoney(amount, lang, { sign }), hidden)
	const day = (iso: string) => dayLine(iso, lang)

	let body = $state<HTMLElement>()
	const stacked = $derived(!!body && body.closest('[data-platform]')?.getAttribute('data-platform') === 'mobile')

	// open accounts first, then closed ones, each with its last four and, away from home, its currency
	const options = $derived.by<SelectOption[]>(() => {
		const accounts = [
			...finance.accounts.filter((account) => !account.closedOn),
			...finance.accounts.filter((account) => account.closedOn),
		]
		return accounts.map((account) => ({
			value: account.id,
			label: [
				account.name,
				account.last4 ? $t('domains.finance.row.last4', { values: { last4: account.last4 } }) : undefined,
				account.currency === settings.homeCurrency ? undefined : account.currency,
			]
				.filter(Boolean)
				.join(' · '),
		}))
	})
	const account = $derived(finance.accountById(session.accountId))

	const title = $derived(
		session.phase === 'reading'
			? $t('domains.finance.import.titleReading')
			: session.phase === 'imported'
				? $t('domains.finance.import.titleImported')
				: session.phase === 'failed'
					? $t('domains.finance.import.titleFailed')
					: $t('domains.finance.import.title')
	)

	const refusal = $derived(
		session.refusal === 'several'
			? $t('domains.finance.import.refusals.several')
			: session.refusal === 'unsupported'
				? $t('domains.finance.import.refusals.unsupported')
				: session.refusal === 'too-large'
					? $t('domains.finance.import.refusals.tooLarge')
					: undefined
	)

	const failure = $derived.by(() => {
		const key = `domains.finance.import.failures.${session.failure ?? 'failed'}`
		const text = $t(key)
		return text === key ? $t('domains.finance.import.failures.failed') : text
	})

	// ---- Review
	const parsed = $derived(session.parsed)
	const currency = $derived(account?.currency ?? settings.homeCurrency)
	const totals = $derived.by(() => {
		let into = 0
		let out = 0
		for (const row of session.fresh) {
			if (row.amount.minor > 0) into += row.amount.minor
			else out += row.amount.minor
		}
		return { into: { minor: into, currency }, out: { minor: out, currency } }
	})
	const otherAccount = $derived(
		parsed?.kind === 'ofx' && parsed.last4 && account?.last4 && parsed.last4 !== account.last4
			? parsed.last4
			: undefined
	)
	const previewRows = $derived<ListRowData[]>(
		session.fresh.slice(0, PREVIEW).map((row, at) => ({
			id: `${at}`,
			primary: row.description,
			secondary: day(row.day),
			meta: shown(row.amount),
		}))
	)
	const more = $derived(Math.max(0, session.fresh.length - PREVIEW))

	function take(files: File[]) {
		session.take(files)
	}

	async function confirm() {
		const done = await session.confirm()
		if (done) undoToast(done.message, done.undo)
	}

	// Escape and the scrim close the dialog themselves; a close through `open` (the reader's hand-off) is the session's
	function closed(reason: SheetCloseReason) {
		if (reason !== 'api') session.cancel()
	}

	let seen: typeof session.phase | undefined
	$effect(() => {
		// effect: imperative DOM. A new phase takes the pressed control away, and the focus it held would fall out of
		// the sheet: the body takes it so the new heading is read, or the notice or the error that says why it stopped.
		const now = session.phase
		const was = seen
		seen = now
		const el = body
		if (was === undefined || was === now || !el || !open) return
		const target = el.querySelector<HTMLElement>('[data-import-focus]') ?? el
		target.focus({ preventScroll: true })
	})
</script>

<Sheet bind:open size="lg" labelledby={titleId} initialFocus="first" onclose={closed} class="ed-import">
	{#snippet header()}
		<h2 class="ed-import-title" id={titleId}>{title}</h2>
	{/snippet}
	<div class="ed-import-body" bind:this={body} tabindex="-1">
		{#if session.phase === 'collect'}
			<Select
				label={$t('domains.finance.import.account')}
				placeholder={$t('domains.finance.import.accountPlaceholder')}
				{options}
				bind:value={() => session.accountId, (value) => session.choose(value ?? '')}
			/>
			<Dropzone
				accept={IMPORT_ACCEPT}
				ondrop={(accepted, rejected) => take([...accepted, ...rejected.map(({ file }) => file)])}
			>
				<div class="ed-import-zone">
					{#if session.file}
						<FileChip name={session.file.name} icon="file-text" onremove={() => session.drop()} />
					{:else}
						<p class="ed-import-invite">{$t('domains.finance.import.invite')}</p>
					{/if}
					<FileButton
						label={$t('domains.finance.import.choose')}
						icon="file-up"
						accept={IMPORT_ACCEPT}
						multiple={false}
						camera
						tooltip
						autofocus={!!session.accountId}
						onfiles={take}
					/>
					{#if !session.accountId}
						<!-- nothing is read until there is an account: the zone says so, and no error is shown -->
						<p class="ed-import-note">{$t('domains.finance.import.needAccount')}</p>
					{/if}
				</div>
			</Dropzone>
			{#if refusal}
				<InlineError message={refusal} />
			{/if}
			<p class="ed-import-note">{$t('domains.finance.import.caption')}</p>
		{:else if session.phase === 'reading'}
			<div class="ed-import-file" role="status">
				{#if session.file}
					<FileChip name={session.file.name} icon="file-text" state="busy" />
				{/if}
				<span class="ed-import-reading">
					<Spinner size="sm" label={$t('domains.finance.import.reading')} />
					{$t('domains.finance.import.reading')}
				</span>
			</div>
		{:else if session.phase === 'imported'}
			<Notice
				tone="info"
				title={$t('domains.finance.import.titleImported')}
				detail={[
					$t('domains.finance.import.knownOn', { values: { day: session.imported?.day ?? '' } }),
					session.imported?.detail,
				]
					.filter(Boolean)
					.join(' · ')}
				tabindex={-1}
				data-import-focus
			/>
		{:else if session.phase === 'failed'}
			<InlineError message={failure} tabindex={-1} data-import-focus />
		{:else if parsed}
			{#if otherAccount}
				<Notice tone="warning" title={$t('domains.finance.import.otherAccount', { values: { last4: otherAccount } })} />
			{/if}
			<div class="ed-import-card" aria-live="polite">
				<dl class="ed-import-pairs">
					<div class="ed-import-pair">
						<dt>{$t('domains.finance.import.accountLabel')}</dt>
						<dd>{account ? importAccountName(account, $t) : ''}</dd>
					</div>
					{#if parsed.from && parsed.to}
						<div class="ed-import-pair">
							<dt>{$t('domains.finance.import.period')}</dt>
							<dd>
								{periodLine(parsed.from, parsed.to, lang, $t)}
							</dd>
						</div>
					{/if}
					<div class="ed-import-pair">
						<dt>{$t('domains.finance.import.rows')}</dt>
						<dd>
							{$t('domains.finance.import.rowsValue', {
								values: { fresh: session.fresh.length, matched: session.matched },
							})}
						</dd>
					</div>
				</dl>
				<dl class="ed-import-totals">
					<div class="ed-import-total">
						<dt>{$t('domains.finance.import.moneyIn')}</dt>
						<dd class="ed-import-amount">{shown(totals.into)}</dd>
					</div>
					<div class="ed-import-total">
						<dt>{$t('domains.finance.import.moneyOut')}</dt>
						<dd class="ed-import-amount">{shown(totals.out, 'never')}</dd>
					</div>
				</dl>
				{#if parsed.skipped > 0}
					<p class="ed-import-note">{$t('domains.finance.import.skipped', { values: { count: parsed.skipped } })}</p>
				{/if}
			</div>
			{#if parsed.kind !== 'ofx'}
				<Toggle
					label={$t('domains.finance.import.flip')}
					checked={session.flip}
					onchange={(on) => void session.setFlip(on)}
				/>
			{/if}
			{#if session.fresh.length}
				<div class="ed-import-preview">
					<List headless labelledby={titleId} compact={false} rows={previewRows} />
					{#if more > 0}
						<p class="ed-import-note">{$t('domains.finance.import.more', { values: { count: more } })}</p>
					{/if}
				</div>
			{:else}
				<p class="ed-import-nothing">{$t('domains.finance.import.nothingNew')}</p>
			{/if}
		{/if}
	</div>
	{#snippet footer()}
		<div class={['ed-import-actions', { 'ed-import-stacked': stacked }]}>
			{#if session.phase === 'imported' || session.phase === 'failed'}
				<Button label={$t('domains.finance.import.close')} variant="primary" onclick={() => session.cancel()} />
			{:else if session.phase === 'review'}
				{@const primary = {
					label: session.fresh.length
						? $t('domains.finance.import.confirm', { values: { count: session.fresh.length } })
						: $t('domains.finance.import.done'),
					disabled: session.saving,
					onclick: () => void confirm(),
				}}
				{#if stacked}
					<!-- the phone stacks them full width, the primary first -->
					<Button {...primary} variant="primary" />
					<Button label={$t('domains.finance.cancel')} variant="quiet" onclick={() => session.cancel()} />
				{:else}
					<Button label={$t('domains.finance.cancel')} variant="quiet" onclick={() => session.cancel()} />
					<Button {...primary} variant="primary" />
				{/if}
			{:else}
				<Button label={$t('domains.finance.cancel')} variant="quiet" onclick={() => session.cancel()} />
			{/if}
		</div>
	{/snippet}
</Sheet>

<style>
	.ed-import-title {
		margin: 0;
		font: var(--ed-t-title);
		letter-spacing: var(--ed-t-title-tracking);
		font-variation-settings: var(--ed-t-title-opsz);
	}
	.ed-import-body {
		display: flex;
		flex-direction: column;
		align-items: stretch;
		gap: var(--space-3);
		outline: none;
	}
	.ed-import-zone {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--space-2);
		padding: var(--space-8) var(--space-4);
		border: 1px dashed var(--stroke);
		border-radius: var(--ed-radius-card);
		color: var(--text-secondary);
		text-align: center;
	}
	.ed-import-invite {
		margin: 0;
		font: var(--ed-t-text);
		color: var(--text-primary);
	}
	.ed-import-note {
		margin: 0;
		font: var(--ed-t-caption);
		letter-spacing: var(--ed-t-caption-tracking);
		color: var(--text-secondary);
	}
	.ed-import-file {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-3);
	}
	.ed-import-reading {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		font: var(--ed-t-body-sm);
	}
	.ed-import-card {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
		padding: var(--space-3);
		background: var(--surface-1);
		border: 1px solid var(--ed-card-border);
		border-radius: var(--ed-radius-card);
	}
	.ed-import-pairs,
	.ed-import-totals {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		margin: 0;
	}
	.ed-import-totals {
		flex-direction: row;
		gap: var(--space-3);
	}
	.ed-import-pair {
		display: flex;
		justify-content: space-between;
		gap: var(--space-3);
	}
	.ed-import-total {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
	}
	dt {
		font: var(--ed-t-label);
		letter-spacing: var(--ed-t-label-tracking);
		color: var(--text-secondary);
	}
	dd {
		margin: 0;
		font: var(--ed-t-body);
		letter-spacing: var(--ed-t-body-tracking);
		color: var(--text-primary);
		text-align: end;
	}
	.ed-import-total dd {
		text-align: start;
	}
	.ed-import-amount {
		font-variant-numeric: tabular-nums;
	}
	.ed-import-preview {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}
	.ed-import-nothing {
		margin: 0;
		font: var(--ed-t-body);
		letter-spacing: var(--ed-t-body-tracking);
		color: var(--text-secondary);
	}
	.ed-import-actions {
		display: flex;
		flex-wrap: wrap;
		justify-content: flex-end;
		gap: var(--space-2);
		width: 100%;
	}
	.ed-import-stacked {
		flex-direction: column;
		align-items: stretch;
	}
	:global([data-platform='mobile']) .ed-import-zone {
		padding: var(--space-6) var(--space-4);
	}
	:global([data-platform='mobile']) .ed-import-totals {
		flex-direction: column;
	}
</style>
