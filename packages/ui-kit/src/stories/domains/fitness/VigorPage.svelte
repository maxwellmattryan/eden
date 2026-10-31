<script module lang="ts">
	export const VIGOR_TABS = ['Workouts', 'History', 'Body', 'Gyms', 'Supplements'] as const
	export type VigorTab = (typeof VIGOR_TABS)[number]

	/** A sample day (`MM-DD`) as the page writes it: "Mon 28 Sep", in the dataset's year. */
	export function dayLabel(day: string): string {
		const [month, date] = day.split('-').map(Number) as [number, number]
		const at = new Date(2026, month - 1, date)
		return `${WEEKDAYS[at.getDay()]} ${date} ${MONTHS[month - 1]}`
	}
	const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
	const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
</script>

<script lang="ts">
	// What every Vigor page shares (product/domains/fitness.md): the shell, the page header with the domain's five
	// tabs, the page's error above the body when a write failed or the rows could not be read, and the body. No header
	// motif yet (D-123, a handoff). Story-only.
	import type { Snippet } from 'svelte'
	import { InlineError, PageHeader, Segmented, domainGlyph, type PageHeaderAction, type Platform } from '$lib/index.js'
	import AppFrame from '../_frame/AppFrame.svelte'
	import { sidebar } from '../../sample-data.js'

	type Props = {
		tab: VigorTab
		actions?: PageHeaderAction[]
		/** A write failed or the rows could not be read: the error with Retry above the body. */
		error?: boolean
		onretry?: () => void
		onnavigate?: (id: string) => void
		children: Snippet<[Platform]>
	}
	let { tab, actions = [], error = false, onretry, onnavigate, children: body }: Props = $props()

	const vigor = sidebar.items.find((entry) => entry.id === 'fitness')!
</script>

<AppFrame current="fitness" {onnavigate}>
	{#snippet children(platform)}
		<div class="page">
			<PageHeader name={vigor.name} subtitle={vigor.subtitle} icon={domainGlyph('fitness')} {actions}>
				{#snippet filters()}
					<Segmented items={[...VIGOR_TABS]} selected={VIGOR_TABS.indexOf(tab)} label="Vigor sections" />
				{/snippet}
			</PageHeader>
			{#if error}
				<div class="notice">
					<InlineError message="Vigor could not save your last change." {onretry} live />
				</div>
			{/if}
			{@render body(platform)}
		</div>
	{/snippet}
</AppFrame>

<style>
	.page {
		display: flex;
		flex-direction: column;
		padding-bottom: var(--space-8);
	}
	.notice {
		padding: 0 var(--ed-gutter) var(--space-4);
	}
</style>
