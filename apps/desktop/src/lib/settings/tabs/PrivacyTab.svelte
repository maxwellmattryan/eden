<script lang="ts">
	// Privacy and grants (product/substrate/settings-utilities.md, product/substrate/privacy.md): the four tiers in
	// plain words, the egress ledger of the last seven days with the Vault → AI row at zero (D-71), the never-automated
	// list (D-8), and how many standing grants there are. The grants ledger with revoke and history arrives in Phase 2.
	import { onMount } from 'svelte'
	import { Badge, DataTable, InlineError, type DataTableColumn } from '@eden/ui-kit'
	import { formatDateOf, todayIso } from '@eden/shared/dates'
	import {
		DESTINATIONS,
		VAULT_AI,
		firstOfLast,
		formatBytes,
		lastDays,
		queryEgress,
		withVaultRow,
		type EgressRow,
	} from '@eden/shared/egress'
	import { t } from '@eden/shared/i18n'
	import { settings } from '@eden/shared/settings'
	import { grants } from '$lib/shell/grants.svelte'
	import SettingsRow from './SettingsRow.svelte'

	const DAYS = 7
	const TIERS = [
		{ id: 't0', badge: 'T0', locked: false },
		{ id: 't1', badge: 'T1', locked: false },
		{ id: 't2', badge: 'T2', locked: true },
		{ id: 't3', badge: 'T3', locked: true },
	] as const
	const NEVER = ['messages', 'payments', 'deleteExternal', 'externalSettings', 'acceptTerms'] as const
	const KNOWN = new Set<string>([...DESTINATIONS, VAULT_AI])

	let rows = $state<EgressRow[]>([])
	let failed = $state(false)

	const today = todayIso()
	const columns = $derived<DataTableColumn[]>([
		{ label: $t('settings.privacy.egress.columns.destination') },
		{ label: $t('settings.privacy.egress.columns.day'), muted: true },
		{ label: $t('settings.privacy.egress.columns.requests'), numeric: true },
		{ label: $t('settings.privacy.egress.columns.bytes'), numeric: true },
	])
	// A destination the locale does not name (one added before its label) shows as its id.
	const label = (destination: string) =>
		KNOWN.has(destination) ? $t(`settings.privacy.destinations.${destination}`) : destination
	const table = $derived(
		withVaultRow(lastDays(rows, DAYS, today), today).map((row) => [
			label(row.destination),
			formatDateOf(row.day, settings.language),
			String(row.requests),
			formatBytes(row.bytesOut),
		])
	)

	async function read() {
		failed = false
		try {
			rows = await queryEgress({ from: firstOfLast(DAYS) })
		} catch {
			failed = true
		}
	}

	onMount(() => {
		void grants.load()
		void read()
	})
</script>

<SettingsRow label={$t('settings.privacy.tiers.label')} help={$t('settings.privacy.tiers.help')}>
	<dl class="tiers">
		{#each TIERS as tier (tier.id)}
			<dt>
				<Badge kind={tier.locked ? 'tier' : 'neutral'} label={tier.badge} />
				<span>{$t(`settings.privacy.tiers.${tier.id}.name`)}</span>
			</dt>
			<dd>{$t(`settings.privacy.tiers.${tier.id}.text`)}</dd>
		{/each}
	</dl>
</SettingsRow>

<SettingsRow label={$t('settings.privacy.egress.label')} help={$t('settings.privacy.egress.help')}>
	<div class="ledger">
		{#if failed}
			<InlineError message={$t('settings.privacy.error')} onretry={read} live />
		{:else}
			<DataTable {columns} rows={table} label={$t('settings.privacy.egress.label')} />
		{/if}
		<p class="quiet">{$t('settings.privacy.egress.retention')}</p>
	</div>
</SettingsRow>

<SettingsRow label={$t('settings.privacy.never.label')} help={$t('settings.privacy.never.help')}>
	<ul class="never">
		{#each NEVER as item (item)}
			<li>{$t(`settings.privacy.never.items.${item}`)}</li>
		{/each}
	</ul>
</SettingsRow>

<SettingsRow label={$t('settings.privacy.grants.label')} help={$t('settings.privacy.grants.help')}>
	<p class="count">
		{#if grants.ready}
			{$t('settings.privacy.grants.count', { values: { count: grants.standingCount } })}
		{:else}
			…
		{/if}
	</p>
</SettingsRow>

<style>
	.tiers {
		display: grid;
		grid-template-columns: max-content 1fr;
		gap: 10px 16px;
		margin: 0;
		max-width: 640px;
	}
	.tiers dt {
		display: flex;
		align-items: center;
		gap: 8px;
		font: var(--ed-t-label);
		color: var(--text-primary);
	}
	.tiers dd {
		margin: 0;
		font: var(--ed-t-body-sm);
		color: var(--text-secondary);
	}
	.ledger {
		display: grid;
		gap: 8px;
		width: 100%;
	}
	.quiet,
	.count {
		margin: 0;
		font: var(--ed-t-body-sm);
		color: var(--text-secondary);
	}
	.count {
		font: var(--ed-t-body);
		color: var(--text-primary);
	}
	.never {
		display: grid;
		gap: var(--space-1);
		margin: 0;
		padding: 0;
		list-style: none;
		font: var(--ed-t-body);
		letter-spacing: var(--ed-t-body-tracking);
		color: var(--text-primary);
	}
</style>
