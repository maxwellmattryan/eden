<script module lang="ts">
	import type { IconName } from '../../icons/icons.js'

	export type NoticeTone = 'info' | 'warning' | 'danger'

	/** The glyph each tone carries when none is given. */
	const TONE_ICON: Record<NoticeTone, IconName> = { info: 'info', warning: 'triangle-alert', danger: 'triangle-alert' }
</script>

<script lang="ts">
	// A notice with a hierarchy: what it is, in a few words; then what it means for the owner, in a sentence; then who
	// said so and when, quietly. For the top right of a page (PageHeader's `aside`), where a Banner's single sentence
	// would bury the one thing that matters: a weather alert, a nudge before a plan. The tone colours the icon and the
	// leading edge only, as on a Banner; the words stay in the text colours.
	import type { HTMLAttributes } from 'svelte/elements'
	import Icon from '../../icons/Icon.svelte'
	import Button from '../Button/Button.svelte'

	type Props = Omit<HTMLAttributes<HTMLDivElement>, 'title'> & {
		/** info for a notice, warning for something to plan around, danger for something to act on. */
		tone?: NoticeTone
		/** The glyph; each tone has its own by default. */
		icon?: IconName
		/** What it is, in a few words: "Flood Watch". */
		title: string
		/** What it means, in a sentence: when it holds, what it touches. */
		detail?: string
		/** Who said so and when, in the quiet line. */
		meta?: string
		/** One quiet action. */
		action?: { label: string; onclick?: () => void }
	}
	let { tone = 'warning', icon, title, detail, meta, action, class: className = '', ...rest }: Props = $props()

	const glyph = $derived(icon ?? TONE_ICON[tone])
</script>

<div class={['ed-notice', `ed-notice-${tone}`, className]} role={tone === 'info' ? 'status' : 'alert'} {...rest}>
	<span class="ed-notice-icon"><Icon name={glyph} size="sm" /></span>
	<div class="ed-notice-text">
		<p class="ed-notice-title">{title}</p>
		{#if detail}<p class="ed-notice-detail">{detail}</p>{/if}
		{#if meta}<p class="ed-notice-meta">{meta}</p>{/if}
	</div>
	{#if action}
		<Button class="ed-notice-action" variant="quiet" size="md" label={action.label} onclick={action.onclick} />
	{/if}
</div>

<style>
	.ed-notice {
		--ed-notice-tone: var(--warning);
		display: flex;
		align-items: flex-start;
		gap: var(--space-2);
		box-sizing: border-box;
		min-width: 0;
		padding: var(--space-2) var(--space-2) var(--space-2) var(--space-3);
		border: 1px solid var(--ed-card-border);
		border-inline-start: 2px solid var(--ed-notice-tone);
		border-radius: var(--ed-radius-control);
		background: var(--surface-1);
		color: var(--text-primary);
	}
	.ed-notice-info {
		--ed-notice-tone: var(--info);
	}
	.ed-notice-danger {
		--ed-notice-tone: var(--danger);
	}
	.ed-notice-icon {
		display: inline-flex;
		align-items: center;
		flex: none;
		height: 1lh;
		font: var(--ed-t-body);
		color: var(--ed-notice-tone);
	}
	.ed-notice-text {
		display: flex;
		flex: 1 1 auto;
		flex-direction: column;
		gap: 2px;
		min-width: 0;
	}
	.ed-notice-title,
	.ed-notice-detail,
	.ed-notice-meta {
		margin: 0;
	}
	.ed-notice-title {
		font: var(--ed-t-body);
		letter-spacing: var(--ed-t-body-tracking);
		font-weight: 600;
	}
	.ed-notice-detail {
		font: var(--ed-t-body-sm);
		letter-spacing: var(--ed-t-body-sm-tracking);
	}
	.ed-notice-meta {
		font: var(--ed-t-body-sm);
		letter-spacing: var(--ed-t-body-sm-tracking);
		color: var(--text-secondary);
	}
	.ed-notice > :global(.ed-notice-action) {
		flex: none;
		align-self: center;
	}
</style>
