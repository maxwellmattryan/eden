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
	// leading edge only, as on a Banner; the words stay in the text colours. With `ondismiss` it carries a quiet
	// cross at its top corner: the owner has read it and wants it gone. It leaves as things in Eden settle: it fades
	// while the Breeze plays once beside its glyph (D-42), and `ondismissed` says when it has gone, which is when the
	// parent takes it away. Under reduced motion that is at once. With `breeze` off it leaves plainly, and at once: for
	// a notice in a list whose own control carries the settle.
	import type { HTMLAttributes } from 'svelte/elements'
	import Icon from '../../icons/Icon.svelte'
	import { useStrings } from '../../i18n/context.js'
	import Button from '../Button/Button.svelte'
	import Breeze from '../Breeze/Breeze.svelte'
	import IconButton from '../IconButton/IconButton.svelte'

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
		/** Shows the cross that dismisses the notice. Called at the press, as the notice starts to leave. */
		ondismiss?: () => void
		/** Called once the notice has faded and its Breeze has played: the parent takes it away. */
		ondismissed?: () => void
		/** Whether the Breeze plays as it leaves. Off, there is no effect and `ondismissed` follows `ondismiss` at once. */
		breeze?: boolean
	}
	let {
		tone = 'warning',
		icon,
		title,
		detail,
		meta,
		action,
		ondismiss,
		ondismissed,
		breeze = true,
		class: className = '',
		...rest
	}: Props = $props()

	const s = useStrings()
	let leaving = $state(false)

	function leave() {
		if (leaving) return
		leaving = true
		ondismiss?.()
		if (!breeze) ondismissed?.()
	}

	const glyph = $derived(icon ?? TONE_ICON[tone])
</script>

<div
	class={['ed-notice', `ed-notice-${tone}`, { 'ed-notice-leaving': leaving }, className]}
	role={tone === 'info' ? 'status' : 'alert'}
	{...rest}
>
	<span class="ed-notice-icon">
		<Icon name={glyph} size="sm" />
		{#if leaving && breeze}<Breeze onend={ondismissed} />{/if}
	</span>
	<div class="ed-notice-text">
		<p class="ed-notice-title">{title}</p>
		{#if detail}<p class="ed-notice-detail">{detail}</p>{/if}
		{#if meta}<p class="ed-notice-meta">{meta}</p>{/if}
	</div>
	{#if action}
		<Button class="ed-notice-action" variant="quiet" size="md" label={action.label} onclick={action.onclick} />
	{/if}
	{#if ondismiss}
		<IconButton class="ed-notice-dismiss" icon="x" size="sm" label={s.dismissNamed(title)} onclick={leave} />
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
	/* Leaving: the notice fades where it stands and takes no more presses; the Breeze beside its glyph is what moves */
	.ed-notice > :global(*) {
		transition: opacity var(--ed-duration-settle) var(--ed-ease-out);
	}
	.ed-notice-leaving {
		pointer-events: none;
	}
	.ed-notice-leaving > :global(:not(.ed-notice-icon)),
	.ed-notice-leaving > .ed-notice-icon > :global(.ed-icon) {
		opacity: 0;
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
		position: relative;
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
	.ed-notice > :global(.ed-notice-dismiss) {
		flex: none;
	}
</style>
