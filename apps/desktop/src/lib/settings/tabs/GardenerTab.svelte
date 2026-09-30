<script lang="ts">
	// Settings → Gardener (product/substrate/settings-utilities.md; docs/engineering/gardener.md): the key on this
	// device, present or absent and never shown back; the provider's map from grade to model, edited over the seed,
	// a dearer choice than the seed's saying by how much and asking first (`priceRatio`); the per-domain and per-tool
	// overrides; the monthly cap and the per-request token cap; this month's spend; the development clamp; and the
	// way to the audit log.
	import { onMount } from 'svelte'
	import { goto } from '$app/navigation'
	import { resolve } from '$app/paths'
	import { Button, ConfirmSheet, Field, InlineError, Menu, Notice, type MenuItem } from '@eden/ui-kit'
	import {
		ANTHROPIC_SEED,
		formatUsd,
		GRADES,
		priceRatio,
		toolIndex,
		validateProvider,
		type ModelGrade,
		type ModelRef,
	} from '@eden/shared/gardener'
	import { t } from '@eden/shared/i18n'
	import { declarations } from '$lib/domains'
	import { gardenerSetup } from '$lib/shell/gardener/setup.svelte'
	import { settingsUi } from '../settings-ui.svelte'
	import SettingsRow from './SettingsRow.svelte'

	let key = $state('')
	let keyBusy = $state(false)
	let keyFailed = $state(false)
	let cap = $state('')
	let tokenCap = $state('')
	// the menu for a grade or an override, anchored to the button that opened it
	let menuOpen = $state(false)
	let menuFor = $state<{ id: string; anchor: HTMLElement } | undefined>()
	function openMenu(id: string, e: MouseEvent) {
		menuFor = { id, anchor: e.currentTarget as HTMLElement }
		menuOpen = true
	}
	// a choice dearer than the seed's for its grade, waiting for the owner's yes
	let dearer = $state<{ grade: ModelGrade; model: string; ratio: number } | undefined>()

	const tools = toolIndex(declarations).filter((tool) => tool.domain !== 'substrate' && tool.declaration.grade !== null)
	const domains = [...new Set(tools.map((tool) => tool.domain))]
	const seedFor = (grade: ModelGrade) =>
		ANTHROPIC_SEED.models.find((model) => model.id === ANTHROPIC_SEED.grades[grade])

	const modelItems = $derived<MenuItem[]>(
		gardenerSetup.provider.models.map((model) => ({ id: model.id, label: model.id }))
	)
	const overrideItems = $derived<MenuItem[]>([
		{ id: '', label: $t('settings.gardener.overrides.none'), icon: 'x' },
		...modelItems,
	])

	onMount(() => {
		void gardenerSetup.load().then(() => {
			cap = formatUsd(gardenerSetup.policy.monthlyCapUsd)
			tokenCap = gardenerSetup.policy.requestTokenCap ? String(gardenerSetup.policy.requestTokenCap) : ''
		})
	})

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
		if (modelId === ANTHROPIC_SEED.grades[grade]) delete edits.grades[grade]
		const problems = validateProvider({
			...gardenerSetup.provider,
			grades: { ...gardenerSetup.provider.grades, [grade]: modelId },
		})
		if (problems.length) return
		await gardenerSetup.savePolicy({ edits })
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
		else if (target.id.startsWith('tool:')) void chooseOverride('tool', target.id.slice(5), item.id)
		else if (target.id.startsWith('domain:')) void chooseOverride('domain', target.id.slice(7), item.id)
	}

	async function saveCaps() {
		const usd = Number.parseFloat(cap)
		const tokens = tokenCap.trim() ? Number.parseInt(tokenCap, 10) : null
		await gardenerSetup.savePolicy({
			monthlyCapUsd:
				Number.isFinite(usd) && usd >= 0 ? Math.round(usd * 100) / 100 : gardenerSetup.policy.monthlyCapUsd,
			requestTokenCap: tokens && tokens > 0 ? tokens : null,
		})
		cap = formatUsd(gardenerSetup.policy.monthlyCapUsd)
	}

	function openAudit() {
		settingsUi.hide()
		void goto(resolve('/gardener/audit'))
	}
</script>

{#if gardenerSetup.clamped}
	<Notice tone="info" title={$t('gardener.devClamp', { values: { model: gardenerSetup.map.light.model } })} />
{/if}

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
					variant="quiet"
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

<SettingsRow label={$t('settings.gardener.grades.label')} help={$t('settings.gardener.grades.help')}>
	<dl class="grades">
		{#each GRADES as grade (grade)}
			<dt>{$t(`settings.gardener.grades.${grade}`)}</dt>
			<dd>
				<Button
					variant="secondary"
					iconRight="chevron-down"
					label={gardenerSetup.provider.grades[grade]}
					disabled={gardenerSetup.clamped}
					onclick={(e) => openMenu(`grade:${grade}`, e)}
				/>
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

<SettingsRow label={$t('settings.gardener.budget.label')} help={$t('settings.gardener.budget.help')}>
	<form class="row" onsubmit={(e) => (e.preventDefault(), void saveCaps())}>
		<Field bind:value={cap} type="text" unit="USD" label={$t('settings.gardener.budget.cap')} />
		<Field
			bind:value={tokenCap}
			type="text"
			label={$t('settings.gardener.budget.tokens')}
			placeholder={$t('settings.gardener.budget.tokensDefault')}
		/>
		<Button type="submit" variant="secondary" label={$t('common.save')} />
	</form>
	<p class="line">
		{$t('settings.gardener.budget.spent', {
			values: { spent: formatUsd(gardenerSetup.spentThisMonth), cap: formatUsd(gardenerSetup.capUsd) },
		})}
	</p>
</SettingsRow>

<SettingsRow label={$t('settings.gardener.audit.label')} help={$t('settings.gardener.audit.help')}>
	<Button variant="secondary" icon="external-link" label={$t('settings.gardener.audit.open')} onclick={openAudit} />
</SettingsRow>

<Menu
	items={menuFor?.id.startsWith('grade:') ? modelItems : overrideItems}
	bind:open={menuOpen}
	anchor={menuFor?.anchor}
	label={$t('settings.gardener.grades.label')}
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
