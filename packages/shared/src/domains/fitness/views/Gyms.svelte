<script lang="ts">
	// Vigor's Gyms tab, ported from Domains/Vigor/Gyms: the gyms with how much equipment each has, and the open one in
	// the pane (pushed in a narrow page, D-112) with its equipment as chips, its hours and notes, and the venue Place it
	// is linked to with its address. Edit opens the page's sheet; Delete comes with undo.
	import { BackButton, Button, Chip, EmptyState, List, type ListRowData, type MenuItem } from '@eden/ui-kit'
	import { t } from '../../../i18n/index.js'
	import { holdBack } from '../../../navigation/index.js'
	import { showPushed, undoToast } from '../../../shell/index.js'
	import { fitness } from '../store.svelte.js'
	import type { Gym } from '../types.js'

	type Props = {
		onedit: (gym?: Gym) => void
		onsample: () => void
	}
	let { onedit, onsample }: Props = $props()

	const uid = $props.id()
	const actions = $derived<MenuItem[]>([
		{ id: 'edit', label: $t('domains.fitness.edit'), icon: 'pencil' },
		{ id: 'delete', label: $t('domains.fitness.delete'), icon: 'trash', destructive: true },
	])
	const rows = $derived<ListRowData[]>(
		fitness.gyms.map((gym) => ({
			id: gym.id,
			primary: gym.name,
			icon: 'dumbbell',
			meta: $t('domains.fitness.gyms.equipmentCount', { values: { count: gym.equipment.length } }),
			actions,
		}))
	)
	let selected = $state<string>()
	const detail = $derived(fitness.gymById(selected) ?? fitness.gyms[0])
	const place = $derived(fitness.venueById(detail?.placeId))
	const picked = $derived(fitness.gyms.some((gym) => gym.id === selected))
	let back = $state<HTMLElement>()
	function open(id: string) {
		selected = id
		void showPushed(() => back)
	}
	$effect(() => (picked ? holdBack(() => ((selected = undefined), true)) : undefined))

	function act(id: string | undefined, gym: Gym) {
		if (id === 'edit') onedit(gym)
		if (id === 'delete') {
			if (selected === gym.id) selected = undefined
			undoToast($t('garden.feed.gymRemoved', { values: { name: gym.name } }), fitness.removeGym(gym.id))
		}
	}
</script>

{#if !fitness.gyms.length}
	<EmptyState
		title={$t('domains.fitness.gyms.empty.title')}
		text={$t('domains.fitness.gyms.empty.text')}
		action={{ label: $t('domains.fitness.gyms.add'), icon: 'plus', onclick: () => onedit() }}
		sample={{ onclick: onsample }}
	/>
{:else}
	<div class={['body', { 'body-wide': detail, 'body-open': picked }]}>
		<div class="lists">
			<List
				header={$t('domains.fitness.gyms.list')}
				count={rows.length}
				{rows}
				current={detail?.id}
				onpick={(row) => open(row.id)}
				onopen={(row) => open(row.id)}
				onaction={(item, row) => {
					const gym = fitness.gymById(row.id)
					if (gym) act(item.id, gym)
				}}
			/>
		</div>
		{#if detail}
			<aside class="detail" aria-labelledby="{uid}-detail">
				<div class="back" bind:this={back}><BackButton onback={() => (selected = undefined)} /></div>
				<h2 class="detail-title" id="{uid}-detail">{detail.name}</h2>
				{#if detail.equipment.length}
					<ul class="chips" aria-label={$t('domains.fitness.gyms.equipment')}>
						{#each detail.equipment as piece (piece)}
							<li><Chip label={piece} /></li>
						{/each}
					</ul>
				{/if}
				<dl class="fields">
					{#if detail.hours}
						<dt>{$t('domains.fitness.gyms.hours')}</dt>
						<dd>{detail.hours}</dd>
					{/if}
					{#if detail.notes}
						<dt>{$t('domains.fitness.gyms.notes')}</dt>
						<dd>{detail.notes}</dd>
					{/if}
					{#if place}
						<dt>{$t('domains.fitness.gyms.place')}</dt>
						<dd class="place">
							<span>{place.name}</span>
							{#if place.address}<span class="address">{place.address}</span>{/if}
						</dd>
					{/if}
				</dl>
				<div class="detail-actions">
					<Button label={$t('domains.fitness.edit')} icon="pencil" onclick={() => act('edit', detail)} />
					<Button
						label={$t('domains.fitness.delete')}
						variant="danger"
						icon="trash"
						onclick={() => act('delete', detail)}
					/>
				</div>
			</aside>
		{/if}
	</div>
{/if}

<style>
	.body {
		display: grid;
		gap: var(--space-6);
		padding: 0 var(--ed-gutter);
	}
	.body-wide {
		grid-template-columns: minmax(0, 1fr) var(--sheet-sm);
		align-items: start;
	}
	.back {
		display: none;
	}
	@container page (max-width: 48rem) {
		.body-wide {
			grid-template-columns: minmax(0, 1fr);
		}
		.body:not(.body-open) .detail,
		.body-open .lists {
			display: none;
		}
		.back {
			display: block;
		}
	}
	.lists {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
		min-width: 0;
	}
	.detail {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
		box-sizing: border-box;
		min-width: 0;
		padding: var(--space-4);
		border: 1px solid var(--ed-card-border);
		border-radius: var(--ed-radius-card);
		background: var(--surface-1);
		box-shadow: var(--shadow-card);
	}
	.detail-title {
		margin: 0;
		font: var(--ed-t-display-sm);
		letter-spacing: var(--ed-t-display-sm-tracking);
		font-variation-settings: var(--ed-t-display-sm-opsz);
	}
	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.fields {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr);
		gap: var(--space-2) var(--space-4);
		margin: 0;
	}
	.fields dt {
		font: var(--ed-t-body-sm);
		letter-spacing: var(--ed-t-body-sm-tracking);
		color: var(--text-secondary);
	}
	.fields dd {
		margin: 0;
		font: var(--ed-t-body);
		letter-spacing: var(--ed-t-body-tracking);
		overflow-wrap: anywhere;
	}
	.place {
		display: flex;
		flex-direction: column;
	}
	.address {
		color: var(--text-secondary);
		font: var(--ed-t-body-sm);
		letter-spacing: var(--ed-t-body-sm-tracking);
	}
	.detail-actions {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
	}
</style>
