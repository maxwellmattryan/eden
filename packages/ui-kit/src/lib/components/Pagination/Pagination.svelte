<script lang="ts">
	// The pager under a table that is one page of a longer list: which rows are showing of how many, between the
	// buttons that move a page at a time or to either end. It holds no rows of its own: the page is a number the
	// caller turns into a query. A total that fits one page still says its range, with every button at rest; a total
	// of nothing renders nothing, since an empty table has its own words.
	import type { HTMLAttributes } from 'svelte/elements'
	import { useStrings } from '../../i18n/context.js'
	import IconButton from '../IconButton/IconButton.svelte'

	type Props = Omit<HTMLAttributes<HTMLElement>, 'onchange' | 'aria-label'> & {
		/** The page showing, from one (bindable). A page past the end reads as the last. */
		page?: number
		/** How many rows a page holds. */
		pageSize: number
		/** How many rows there are in all. */
		total: number
		/** The pager's accessible name, when a page has more than one. */
		label?: string
		/** Called with the page moved to. */
		onchange?: (page: number) => void
	}
	let { page = $bindable(1), pageSize, total, label, onchange, class: className = '', ...rest }: Props = $props()

	const s = useStrings()
	const size = $derived(Math.max(1, Math.floor(pageSize)))
	const pages = $derived(Math.max(1, Math.ceil(total / size)))
	const at = $derived(Math.min(Math.max(1, Math.floor(page) || 1), pages))
	const from = $derived((at - 1) * size + 1)
	const to = $derived(Math.min(at * size, total))

	function go(next: number) {
		const clamped = Math.min(Math.max(1, next), pages)
		if (clamped === at) return
		page = clamped
		onchange?.(clamped)
	}
</script>

{#if total > 0}
	<nav class={['ed-pagination', className]} aria-label={label ?? s.pagination.label} {...rest}>
		<IconButton icon="chevrons-left" size="sm" label={s.pagination.first} disabled={at === 1} onclick={() => go(1)} />
		<IconButton
			icon="chevron-left"
			size="sm"
			label={s.pagination.previous}
			disabled={at === 1}
			onclick={() => go(at - 1)}
		/>
		<span class="ed-pagination-range" aria-live="polite">{s.pagination.range(from, to, total)}</span>
		<IconButton
			icon="chevron-right"
			size="sm"
			label={s.pagination.next}
			disabled={at === pages}
			onclick={() => go(at + 1)}
		/>
		<IconButton
			icon="chevrons-right"
			size="sm"
			label={s.pagination.last}
			disabled={at === pages}
			onclick={() => go(pages)}
		/>
	</nav>
{/if}

<style>
	.ed-pagination {
		display: flex;
		align-items: center;
		justify-content: flex-end;
		gap: var(--space-1);
	}
	.ed-pagination-range {
		padding: 0 var(--space-2);
		font: var(--ed-t-data-sm);
		letter-spacing: var(--ed-t-data-sm-tracking);
		font-variant-numeric: tabular-nums;
		color: var(--text-secondary);
		white-space: nowrap;
	}
</style>
