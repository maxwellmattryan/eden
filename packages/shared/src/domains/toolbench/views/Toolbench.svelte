<script lang="ts">
	// Toolbench's page (product/domains/toolbench.md, "Surfaces"): the header with the domain's tabs and, on Ideas,
	// the status chips beneath it, then the tab's view. Ideas is ported from its approved mockup; Projects, Lab,
	// Studio and Notes show their empty states until their surfaces are built. The tab lives in the address: each
	// app's route hands its `tab` parameter in, and a pick goes back through the navigation seam. Both apps mount this
	// page; the phone reaches it from More.
	import {
		Chip,
		EmptyState,
		InlineError,
		PageHeader,
		Segmented,
		domainGlyph,
		type PageHeaderAction,
	} from '@eden/ui-kit'
	import { t } from '../../../i18n/index.js'
	import { navigation } from '../../../navigation/index.js'
	import { IDEA_STATUSES, type IdeaStatus } from '../types.js'
	import { TOOLBENCH_TABS, toolbenchTab, type ToolbenchTab } from '../tabs.js'
	import { toolbench } from '../store.svelte.js'
	import Ideas from './Ideas.svelte'

	type Props = {
		/** The route's `tab` parameter as the address has it; anything that is not a tab is Ideas. */
		tab?: string
	}
	let { tab: requested }: Props = $props()

	const uid = $props.id()
	const quickAddId = `${uid}-quick-add`

	const tab = $derived<ToolbenchTab>(toolbenchTab(requested))
	const tabItems = $derived(TOOLBENCH_TABS.map((id) => $t(`domains.toolbench.tabs.${id}`)))
	function selectTab(index: number) {
		void navigation.open({ place: 'toolbench', tab: TOOLBENCH_TABS[index] }, { replace: true, noScroll: true })
	}

	/** The status chip that is on; none shows every idea but the archived. */
	let status = $state<IdeaStatus>()

	function focusQuickAdd() {
		document.getElementById(quickAddId)?.focus()
	}

	const actions = $derived<PageHeaderAction[]>(
		tab === 'ideas'
			? [
					{
						label: $t('domains.toolbench.ideas.capture'),
						icon: 'lightbulb',
						variant: toolbench.ideas.length ? undefined : 'secondary',
						onclick: focusQuickAdd,
					},
				]
			: []
	)
</script>

<div class="page">
	<PageHeader
		name={$t('domains.toolbench.name')}
		subtitle={$t('domains.toolbench.subtitle')}
		icon={domainGlyph('toolbench')}
		{actions}
	>
		{#snippet filters()}
			<Segmented
				items={tabItems}
				selected={TOOLBENCH_TABS.indexOf(tab)}
				label={$t('domains.toolbench.tabsLabel')}
				onchange={selectTab}
			/>
			{#if tab === 'ideas'}
				{#each IDEA_STATUSES as id (id)}
					<Chip
						label={$t(`domains.toolbench.ideas.status.${id}`)}
						count={toolbench.countFor(id)}
						tone="outline"
						selectable
						selected={status === id}
						onselect={(on) => (status = on ? id : undefined)}
					/>
				{/each}
			{/if}
		{/snippet}
	</PageHeader>

	{#if toolbench.saveFailed}
		<div class="notice">
			<InlineError message={$t('domains.toolbench.saveFailed')} onretry={() => toolbench.flush()} live />
		</div>
	{/if}

	{#if tab === 'ideas'}
		<Ideas {quickAddId} {status} oncapture={focusQuickAdd} />
	{:else}
		<EmptyState title={$t(`domains.toolbench.${tab}.empty.title`)} text={$t(`domains.toolbench.${tab}.empty.text`)} />
	{/if}
</div>

<style>
	.page {
		flex: 1 0 auto;
		display: flex;
		flex-direction: column;
		padding-bottom: var(--space-8);
	}
	.notice {
		padding: 0 var(--ed-gutter) var(--space-4);
	}
</style>
