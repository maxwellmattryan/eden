<script lang="ts">
	// What Eden knows about me (product/substrate/profile.md, "Surfaces"; docs/design/screens.md, `profile`): every
	// fact grouped by the owner the registry names, with its value, who wrote it, when it holds, the lock on T2, and
	// how many Gardener requests read it. Add, edit, set a window, renew and delete, each with an undo. The
	// Gardener's proposals sit above the groups until the owner accepts or dismisses them.
	import {
		EmptyState,
		InlineError,
		List,
		PageHeader,
		ProposalCard,
		type ListRowData,
		type MenuItem,
	} from '@eden/ui-kit'
	import { goto } from '$app/navigation'
	import { resolve } from '$app/paths'
	import { locale, t } from '@eden/shared/i18n'
	import { todayIso } from '@eden/shared/dates'
	import { formatValue, type Fact, type FactProposal } from '@eden/shared/profile'
	import { undoToast } from '$lib/shell/undo'
	import FactEditor from './FactEditor.svelte'
	import { rowOf, type RowContext } from './rows'
	import { profile } from './store.svelte'

	const lang = $derived($locale ?? 'en')
	const today = todayIso()

	/** The owner's name over its group: Eden for the substrate, the domain's themed name, or the doc's for one that
	 * has not shipped. */
	function ownerName(owner: string): string {
		if (owner === 'substrate' || owner === 'health') return $t(`profile.owners.${owner}`)
		return $t(`domains.${owner}.name`)
	}
	const name = (fact: Pick<Fact, 'type'>) => $t(`profile.facts.${fact.type}`)

	const context = $derived<RowContext>({
		t: $t,
		lang,
		today,
		usage: profile.usage,
		ownerName: (type) =>
			ownerName(String(profile.groups.find((group) => group.facts.some((f) => f.type === type))?.owner)),
	})
	const groups = $derived(
		profile.groups.map((group) => ({
			owner: group.owner,
			label: ownerName(group.owner),
			rows: group.facts.map((fact) => rowOf(fact, context)),
		}))
	)

	// The editor is made anew each time it opens, so it starts from the fact it is given.
	let editorKey = $state(0)
	let editorOpen = $state(false)
	let editing = $state<Fact | undefined>()
	let editingWindow = $state(false)

	/** The audit log, where "used by N requests" leads (product/substrate/ai.md, "Audit log"). */
	function openAudit() {
		void goto(resolve('/gardener/audit'))
	}

	function openAdd() {
		editing = undefined
		editingWindow = false
		editorKey += 1
		editorOpen = true
	}
	function openEdit(fact: Fact, window = false) {
		editing = fact
		editingWindow = window
		editorKey += 1
		editorOpen = true
	}
	function onopen(row: ListRowData) {
		const fact = profile.facts.find((entry) => entry.id === row.id)
		if (fact && fact.provenance !== 'system-derived') openEdit(fact)
	}
	function onaction(item: MenuItem, row: ListRowData) {
		const fact = profile.facts.find((entry) => entry.id === row.id)
		if (!fact) return
		const values = { values: { name: name(fact) } }
		if (item.id === 'edit') openEdit(fact)
		else if (item.id === 'window') openEdit(fact, true)
		else if (item.id === 'renew')
			undoToast($t('profile.toast.renewed', values), profile.renew(fact.id, null, name(fact)))
		else if (item.id === 'delete') undoToast($t('profile.toast.deleted', values), profile.remove(fact.id, name(fact)))
	}
	function accept(proposal: FactProposal) {
		const result = profile.accept(proposal.id, name(proposal))
		if (result) undoToast($t('profile.toast.accepted', { values: { name: name(proposal) } }), result.undo)
	}
	function seed() {
		undoToast($t('common.sampleAdded'), profile.seed($t('shell.profile')))
	}
</script>

<div class="page">
	<PageHeader
		name={$t('shell.profile')}
		subtitle={$t('shell.profileSubtitle')}
		icon="id-card"
		actions={[
			{ id: 'add', label: $t('profile.add'), icon: 'plus', onclick: openAdd },
			{ id: 'audit', label: $t('settings.gardener.audit.open'), icon: 'external-link', onclick: openAudit },
		]}
	/>

	{#if profile.saveFailed}
		<div class="notice">
			<InlineError message={$t('profile.saveFailed')} onretry={() => profile.flush()} live />
		</div>
	{/if}

	{#if profile.proposals.length}
		<section class="proposals" aria-label={$t('profile.proposals')}>
			{#each profile.proposals as proposal (proposal.id)}
				<ProposalCard
					fact={proposal.type}
					value={formatValue(proposal.type, proposal.value, $t)}
					text={proposal.text}
					onaccept={() => accept(proposal)}
					ondismiss={() => profile.dismiss(proposal.id)}
				/>
			{/each}
		</section>
	{/if}

	{#if profile.ready && !profile.facts.length && !profile.proposals.length}
		<EmptyState
			title={$t('empty.profile.title')}
			text={$t('empty.profile.text')}
			action={{ label: $t('empty.profile.action'), icon: 'plus', onclick: openAdd }}
			sample={{ onclick: seed }}
		/>
	{:else}
		<div class="groups">
			{#each groups as group (group.owner)}
				<List header={group.label} count={group.rows.length} rows={group.rows} {onopen} {onaction} />
			{/each}
		</div>
	{/if}

	<footer class="foot">{$t('profile.retention')}</footer>
</div>

{#key editorKey}
	<FactEditor bind:open={editorOpen} fact={editing} focusWindow={editingWindow} />
{/key}

<style>
	.page {
		flex: 1 0 auto;
		display: flex;
		flex-direction: column;
		min-height: 100%;
		padding-bottom: var(--space-8);
	}
	.notice,
	.proposals {
		padding: 0 var(--ed-gutter) var(--space-4);
	}
	.proposals {
		display: grid;
		gap: var(--space-3);
		max-width: 640px;
	}
	.groups {
		display: grid;
		gap: var(--space-6);
		padding: 0 var(--ed-gutter);
	}
	.foot {
		margin-top: auto;
		padding: var(--space-8) var(--ed-gutter) 0;
		font: var(--ed-t-body-sm);
		color: var(--text-secondary);
		max-width: 640px;
	}
</style>
