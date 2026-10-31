<script lang="ts">
	// Settings → Gardener (product/substrate/settings-utilities.md; docs/engineering/gardener.md): the key on this
	// device, present or absent and never shown back; the provider's map from grade to model, edited over the seed,
	// a dearer choice than the seed's saying by how much and asking first (`priceRatio`), and beside each the effort
	// its model works at, where the model takes one (D-146); the per-domain and per-tool
	// overrides; the monthly cap and the per-request token cap; this month's spend; the development clamp; and the
	// ways to the audit log and the tools page. On desktop the Gardener runs on the owner's Claude Code (D-178): the
	// key row gives way to Claude Code's status and a path override kept on this device, and the monthly cap and the
	// spend give way to the thresholds of the usage-window gate (D-180).
	import { onMount } from 'svelte'
	import {
		Button,
		ConfirmSheet,
		Field,
		IconButton,
		InlineError,
		Menu,
		Notice,
		Skeleton,
		type MenuItem,
	} from '@eden/ui-kit'
	import {
		effortEdit,
		formatUsd,
		GRADES,
		parseThresholds,
		priceRatio,
		seedOf,
		toolIndex,
		validateProvider,
		type ModelGrade,
		type ModelRef,
	} from '../../../gardener/index.js'
	import { t } from '../../../i18n/index.js'
	import { declarations } from '../../../domains/index.js'
	import { navigation } from '../../../navigation/index.js'
	import { gardenerSetup } from '../../gardener/setup.svelte.js'
	import { settingsUi } from '../settings-ui.svelte.js'
	import SettingsRow from '../SettingsRow.svelte'

	let key = $state('')
	let keyBusy = $state(false)
	let keyFailed = $state(false)
	let cap = $state('')
	let tokenCap = $state('')
	// Claude Code's row: the override being typed, a status read in flight, and the gate's thresholds as percentages
	let claudePath = $state('')
	let checking = $state(false)
	let warnAt = $state('')
	let stopAt = $state('')
	let thresholdsRefused = $state(false)
	const percentOf = (share: number) => String(Math.round(share * 100))
	// the menu for a grade or an override, anchored to the button that opened it; pressed again, the button closes it
	let menuOpen = $state(false)
	let menuFor = $state<{ id: string; anchor: HTMLElement } | undefined>()
	function openMenu(id: string, e: MouseEvent) {
		if (menuOpen && menuFor?.anchor === e.currentTarget) {
			menuOpen = false
			return
		}
		menuFor = { id, anchor: e.currentTarget as HTMLElement }
		menuOpen = true
	}
	// a choice dearer than the seed's for its grade, waiting for the owner's yes
	let dearer = $state<{ grade: ModelGrade; model: string; ratio: number } | undefined>()

	const tools = toolIndex(declarations).filter((tool) => tool.domain !== 'substrate' && tool.declaration.grade !== null)
	const domains = [...new Set(tools.map((tool) => tool.domain))]
	/** The seed of the provider this build runs on: the API's on the phone, Claude Code's on desktop (D-178). */
	const providerSeed = $derived(seedOf(gardenerSetup.providerId))
	const seedFor = (grade: ModelGrade) => providerSeed.models.find((model) => model.id === providerSeed.grades[grade])
	/** The override names a path that is not an executable file: the status reads not found, and says why. */
	const rejected = $derived(!!gardenerSetup.claudePath && !!gardenerSetup.claude && !gardenerSetup.claude.found)
	/** The account line: signed in, how, and on which plan; never the email or the organisation. */
	const account = $derived(
		gardenerSetup.claude?.signedIn
			? [$t('settings.gardener.claude.signedIn'), gardenerSetup.claude.authMethod, gardenerSetup.claude.subscription]
					.filter(Boolean)
					.join(' · ')
			: $t('settings.gardener.claude.notSignedIn')
	)

	const modelItems = $derived<MenuItem[]>(
		gardenerSetup.provider.models.map((model) => ({ id: model.id, label: model.id }))
	)
	const modelOf = (id: string) => gardenerSetup.provider.models.find((model) => model.id === id)
	const effortName = (level: string) => $t(`settings.gardener.effort.levels.${level}`, { default: level })
	const effortItems = $derived<MenuItem[]>(
		menuFor?.id.startsWith('effort:')
			? (modelOf(menuFor.id.slice(7))?.efforts ?? []).map((level) => ({ id: level, label: effortName(level) }))
			: []
	)
	const overrideItems = $derived<MenuItem[]>([
		{ id: '', label: $t('settings.gardener.overrides.none'), icon: 'x' },
		...modelItems,
	])

	onMount(() => {
		void gardenerSetup.load().then(() => {
			cap = formatUsd(gardenerSetup.policy.monthlyCapUsd)
			tokenCap = gardenerSetup.policy.requestTokenCap ? String(gardenerSetup.policy.requestTokenCap) : ''
			claudePath = gardenerSetup.claudePath
			warnAt = percentOf(gardenerSetup.policy.usageWarnAt)
			stopAt = percentOf(gardenerSetup.policy.usageStopAt)
		})
	})

	/** Reads Claude Code's status again: after an install, a sign-in, or a change of the override. */
	async function recheck() {
		checking = true
		try {
			await gardenerSetup.refreshClaude()
		} finally {
			checking = false
		}
	}
	async function savePath(path: string) {
		checking = true
		try {
			await gardenerSetup.setClaudePath(path)
			claudePath = gardenerSetup.claudePath
		} finally {
			checking = false
		}
	}

	async function saveKey() {
		if (!key.trim()) return
		keyBusy = true
		keyFailed = false
		try {
			await gardenerSetup.setKey(key)
			key = ''
		} catch {
			keyFailed = true
		} finally {
			keyBusy = false
		}
	}
	async function clearKey() {
		keyBusy = true
		try {
			await gardenerSetup.clearKey()
		} catch {
			keyFailed = true
		} finally {
			keyBusy = false
		}
	}

	/** A grade's model: dearer than the seed's asks first; the edit is a sparse overlay on the seed. */
	async function chooseGrade(grade: ModelGrade, modelId: string) {
		const candidate = gardenerSetup.provider.models.find((model) => model.id === modelId)
		const seed = seedFor(grade)
		if (!candidate || !seed) return
		const ratio = priceRatio(candidate, seed)
		if (ratio > 1 && !dearer) {
			dearer = { grade, model: modelId, ratio }
			return
		}
		dearer = undefined
		const edits = { ...gardenerSetup.policy.edits, grades: { ...gardenerSetup.policy.edits.grades, [grade]: modelId } }
		if (modelId === providerSeed.grades[grade]) delete edits.grades[grade]
		const problems = validateProvider({
			...gardenerSetup.provider,
			grades: { ...gardenerSetup.provider.grades, [grade]: modelId },
		})
		if (problems.length) return
		await gardenerSetup.savePolicy({ edits })
	}

	/** The effort a model works at, whichever grades it runs: an edit over the seed, gone where it says the same. */
	async function chooseEffort(modelId: string, effort: string) {
		if (!modelOf(modelId)?.efforts?.includes(effort)) return
		await gardenerSetup.savePolicy({ edits: effortEdit(providerSeed, gardenerSetup.policy.edits, modelId, effort) })
	}

	async function chooseOverride(kind: 'tool' | 'domain', id: string, modelId: string) {
		const ref: ModelRef | undefined = modelId ? { provider: gardenerSetup.provider.id, model: modelId } : undefined
		const overrides = {
			tools: { ...gardenerSetup.policy.overrides.tools },
			domains: { ...gardenerSetup.policy.overrides.domains },
		}
		const table = kind === 'tool' ? overrides.tools : overrides.domains
		if (ref) table[id] = ref
		else delete table[id]
		await gardenerSetup.savePolicy({ overrides })
	}

	function pick(item: MenuItem) {
		const target = menuFor
		menuOpen = false
		if (!target || item.id === undefined) return
		if (target.id.startsWith('grade:')) void chooseGrade(target.id.slice(6) as ModelGrade, item.id)
		else if (target.id.startsWith('effort:')) void chooseEffort(target.id.slice(7), item.id)
		else if (target.id.startsWith('tool:')) void chooseOverride('tool', target.id.slice(5), item.id)
		else if (target.id.startsWith('domain:')) void chooseOverride('domain', target.id.slice(7), item.id)
	}

	async function saveCaps() {
		const usd = Number.parseFloat(cap)
		const tokens = tokenCap.trim() ? Number.parseInt(tokenCap, 10) : null
		if (gardenerSetup.onClaude) {
			// the windows are the budget here (D-180): whole percentages, Warn at no higher than Stop at, or nothing saved
			const thresholds = parseThresholds(warnAt, stopAt)
			thresholdsRefused = !thresholds
			if (!thresholds) return
			await gardenerSetup.savePolicy({ ...thresholds, requestTokenCap: tokens && tokens > 0 ? tokens : null })
			warnAt = percentOf(gardenerSetup.policy.usageWarnAt)
			stopAt = percentOf(gardenerSetup.policy.usageStopAt)
			return
		}
		await gardenerSetup.savePolicy({
			monthlyCapUsd:
				Number.isFinite(usd) && usd >= 0 ? Math.round(usd * 100) / 100 : gardenerSetup.policy.monthlyCapUsd,
			requestTokenCap: tokens && tokens > 0 ? tokens : null,
		})
		cap = formatUsd(gardenerSetup.policy.monthlyCapUsd)
	}

	function openAudit() {
		settingsUi.hide()
		void navigation.open({ place: 'gardener', tab: 'audit' })
	}
	function openTools() {
		settingsUi.hide()
		void navigation.open({ place: 'gardener', tab: 'tools' })
	}
</script>

{#if gardenerSetup.clamped}
	<Notice
		tone="info"
		title={$t('gardener.devClamp', {
			values: { model: gardenerSetup.map.light.model, deep: gardenerSetup.map.deep.model },
		})}
	/>
{/if}

{#if gardenerSetup.onClaude}
	<SettingsRow label={$t('settings.gardener.claude.label')} help={$t('settings.gardener.claude.help')}>
		<div class="stack">
			<div class="status">
				{#if gardenerSetup.claudeFailed}
					<InlineError message={$t('settings.gardener.claude.statusError')} onretry={recheck} live />
				{:else if !gardenerSetup.claude}
					<div class="lines loading"><Skeleton rows={2} icon={false} /></div>
				{:else}
					{@const status = gardenerSetup.claude}
					<div class="lines">
						{#if status.found}
							<p class="line">
								{$t('settings.gardener.claude.found')} · <code class="mono">{status.path}</code>
								{#if status.version}· <code class="mono">{status.version}</code>{/if}
							</p>
							<p class="line">{account}</p>
						{:else}
							<p class="line">{$t('settings.gardener.claude.notFound')}</p>
						{/if}
						{#if !status.found || !status.signedIn}
							<p class="line">{$t('settings.gardener.claude.install')}</p>
						{/if}
					</div>
				{/if}
				<!-- always here: it helps after an install, a sign-in, a Save or a Clear; the arrows turn while it reads -->
				<span class={['recheck', (checking || !gardenerSetup.claude) && 'recheck-busy']}>
					<IconButton
						icon="refresh-cw"
						size="xs"
						label={$t('settings.gardener.claude.check')}
						tooltip
						aria-busy={checking || !gardenerSetup.claude}
						disabled={checking}
						onclick={() => void recheck()}
					/>
				</span>
			</div>
			<form class="row" onsubmit={(e) => (e.preventDefault(), void savePath(claudePath))}>
				<Field
					bind:value={claudePath}
					type="text"
					mono
					placeholder="/usr/local/bin/claude"
					label={$t('settings.gardener.claude.override')}
				/>
				<Button
					type="submit"
					variant="secondary"
					label={$t('settings.gardener.claude.save')}
					disabled={checking || !claudePath.trim() || claudePath.trim() === gardenerSetup.claudePath}
				/>
				{#if gardenerSetup.claudePath}
					<Button
						variant="quiet"
						label={$t('settings.gardener.claude.clear')}
						disabled={checking}
						onclick={() => void savePath('')}
					/>
				{/if}
			</form>
			{#if rejected}
				<InlineError message={$t('settings.gardener.claude.notExecutable')} live />
			{/if}
		</div>
	</SettingsRow>
{:else}
	<SettingsRow label={$t('settings.gardener.key.label')} help={$t('settings.gardener.key.help')}>
		<div class="stack">
			{#if gardenerSetup.hasKey}
				<p class="line">{$t('settings.gardener.key.present')}</p>
			{/if}
			<form class="row" onsubmit={(e) => (e.preventDefault(), void saveKey())}>
				<Field bind:value={key} type="password" mono placeholder="sk-ant-…" label={$t('settings.gardener.key.field')} />
				<Button
					type="submit"
					variant="primary"
					icon="key-round"
					label={gardenerSetup.hasKey ? $t('settings.gardener.key.replace') : $t('settings.gardener.key.save')}
					disabled={keyBusy || !key.trim()}
				/>
				{#if gardenerSetup.hasKey}
					<Button
						variant="danger"
						icon="trash"
						label={$t('settings.gardener.key.remove')}
						disabled={keyBusy}
						onclick={() => void clearKey()}
					/>
				{/if}
			</form>
			{#if keyFailed}
				<InlineError message={$t('settings.gardener.key.failed')} live />
			{/if}
		</div>
	</SettingsRow>
{/if}

<SettingsRow label={$t('settings.gardener.grades.label')} help={$t('settings.gardener.grades.help')}>
	<dl class="grades">
		{#each GRADES as grade (grade)}
			<dt>{$t(`settings.gardener.grades.${grade}`)}</dt>
			{@const model = modelOf(gardenerSetup.provider.grades[grade])}
			<dd class="row">
				<Button
					variant="secondary"
					iconRight="chevron-down"
					label={gardenerSetup.provider.grades[grade]}
					disabled={gardenerSetup.clamped}
					onclick={(e) => openMenu(`grade:${grade}`, e)}
				/>
				{#if model?.efforts?.length}
					<Button
						variant="quiet"
						iconRight="chevron-down"
						label={model.effort
							? $t('settings.gardener.effort.at', { values: { level: effortName(model.effort) } })
							: $t('settings.gardener.effort.unset')}
						onclick={(e) => openMenu(`effort:${model.id}`, e)}
					/>
				{:else}
					<span class="quiet">{$t('settings.gardener.effort.none')}</span>
				{/if}
			</dd>
		{/each}
	</dl>
	{#if gardenerSetup.refused.length}
		<p class="quiet">{gardenerSetup.refused.join(' ')}</p>
	{/if}
</SettingsRow>

<SettingsRow label={$t('settings.gardener.overrides.label')} help={$t('settings.gardener.overrides.help')}>
	<dl class="grades">
		{#each domains as domain (domain)}
			<dt>{$t(`domains.${domain}.name`)}</dt>
			<dd>
				<Button
					variant="secondary"
					iconRight="chevron-down"
					label={gardenerSetup.policy.overrides.domains?.[domain]?.model ?? $t('settings.gardener.overrides.none')}
					disabled={gardenerSetup.clamped}
					onclick={(e) => openMenu(`domain:${domain}`, e)}
				/>
			</dd>
		{/each}
		{#each tools as tool (`${tool.domain}.${tool.declaration.id}`)}
			<dt>
				<code class="tool">{tool.domain}.{tool.declaration.id}</code>
				<span class="grade">{$t(`settings.gardener.grades.${tool.declaration.grade}`)}</span>
			</dt>
			<dd>
				<Button
					variant="quiet"
					iconRight="chevron-down"
					label={gardenerSetup.policy.overrides.tools?.[`${tool.domain}.${tool.declaration.id}`]?.model ??
						$t('settings.gardener.overrides.none')}
					disabled={gardenerSetup.clamped}
					onclick={(e) => openMenu(`tool:${tool.domain}.${tool.declaration.id}`, e)}
				/>
			</dd>
		{/each}
	</dl>
</SettingsRow>

<SettingsRow
	label={$t('settings.gardener.budget.label')}
	help={gardenerSetup.onClaude ? $t('settings.gardener.claude.windowsHelp') : $t('settings.gardener.budget.help')}
>
	<form class="row" onsubmit={(e) => (e.preventDefault(), void saveCaps())}>
		{#if gardenerSetup.onClaude}
			<!-- the USD cap is not applied on desktop (D-180): the subscription's windows are the budget -->
			<Field
				bind:value={warnAt}
				type="text"
				inputmode="numeric"
				unit="%"
				label={$t('settings.gardener.claude.warnAt')}
			/>
			<Field
				bind:value={stopAt}
				type="text"
				inputmode="numeric"
				unit="%"
				label={$t('settings.gardener.claude.stopAt')}
			/>
		{:else}
			<Field bind:value={cap} type="text" unit="USD" label={$t('settings.gardener.budget.cap')} />
		{/if}
		<Field
			bind:value={tokenCap}
			type="text"
			label={$t('settings.gardener.budget.tokens')}
			placeholder={$t('settings.gardener.budget.tokensDefault')}
		/>
		<Button type="submit" variant="secondary" label={$t('common.save')} />
	</form>
	{#if gardenerSetup.onClaude}
		{#if thresholdsRefused}
			<InlineError message={$t('settings.gardener.claude.thresholdsError')} live />
		{/if}
	{:else}
		<p class="line">
			{$t('settings.gardener.budget.spent', {
				values: { spent: formatUsd(gardenerSetup.spentThisMonth), cap: formatUsd(gardenerSetup.capUsd) },
			})}
		</p>
	{/if}
</SettingsRow>

<SettingsRow label={$t('settings.gardener.audit.label')} help={$t('settings.gardener.audit.help')}>
	<Button variant="secondary" icon="external-link" label={$t('settings.gardener.audit.open')} onclick={openAudit} />
</SettingsRow>

<SettingsRow label={$t('settings.gardener.tools.label')} help={$t('settings.gardener.tools.help')}>
	<Button variant="secondary" icon="external-link" label={$t('settings.gardener.tools.open')} onclick={openTools} />
</SettingsRow>

<Menu
	items={menuFor?.id.startsWith('grade:')
		? modelItems
		: menuFor?.id.startsWith('effort:')
			? effortItems
			: overrideItems}
	bind:open={menuOpen}
	anchor={menuFor?.anchor}
	label={menuFor?.id.startsWith('effort:')
		? $t('settings.gardener.effort.label')
		: $t('settings.gardener.grades.label')}
	onselect={pick}
/>

{#if dearer}
	<ConfirmSheet
		open={true}
		title={$t('settings.gardener.dearer.title')}
		subject={dearer.model}
		resource={$t(`settings.gardener.grades.${dearer.grade}`)}
		text={$t('settings.gardener.dearer.text', { values: { ratio: dearer.ratio.toFixed(1) } })}
		verb={$t('settings.gardener.dearer.verb')}
		onconfirm={() => dearer && void chooseGrade(dearer.grade, dearer.model)}
		oncancel={() => (dearer = undefined)}
	/>
{/if}

<style>
	.stack {
		display: grid;
		gap: var(--space-2);
		width: 100%;
	}
	.row {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-end;
		gap: var(--space-2);
	}
	.line,
	.quiet {
		margin: 0;
		font: var(--ed-t-body-sm);
		color: var(--text-secondary);
	}
	/* the status lines with Check again at their end */
	.status {
		display: flex;
		align-items: flex-start;
		gap: var(--space-2);
	}
	.lines {
		display: grid;
		flex: 0 1 auto;
		gap: var(--space-1);
		min-width: 0;
	}
	/* the skeleton takes the room the lines will */
	.loading {
		flex: 1;
	}
	.mono {
		font: var(--ed-t-data-sm);
		color: var(--text-primary);
		overflow-wrap: anywhere;
	}
	/* The arrows turn while the status is read; under reduced motion the duration is zero and they stand still */
	.recheck-busy :global(.ed-icon) {
		animation: recheck-turn var(--ed-duration-spin) linear infinite;
	}
	@keyframes recheck-turn {
		to {
			transform: rotate(1turn);
		}
	}
	.grades {
		display: grid;
		grid-template-columns: max-content auto;
		gap: var(--space-2) var(--space-4);
		align-items: center;
		margin: 0;
	}
	.grades dt {
		font: var(--ed-t-label);
		color: var(--text-primary);
	}
	.grades dd {
		margin: 0;
		align-items: center;
	}
	/* narrow page */
	@container page (max-width: 48rem) {
		/* a dated model id is wider than what a phone leaves beside a name: the name sits over its choice */
		.grades {
			grid-template-columns: minmax(0, 1fr);
			gap: var(--space-1);
		}
		.grades dd {
			margin-bottom: var(--space-2);
		}
	}
	.tool {
		font: var(--ed-t-data-sm);
		color: var(--text-primary);
	}
	.grade {
		margin-left: var(--space-2);
		font: var(--ed-t-body-sm);
		color: var(--text-secondary);
	}
</style>
