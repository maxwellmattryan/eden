<script module lang="ts">
	import type { IconName } from '../../icons/icons.js'
	import type { UiStrings } from '../../i18n/strings.js'

	export type BadgeKind =
		| 'read'
		| 'write-draft'
		| 'write'
		| 'act-external'
		| 'tier'
		| 'estimated'
		| 'origin'
		| 'warning'
		| 'ai'
		| 'danger'
		| 'neutral'

	/** The glyph and the default word per kind; the word is a key into strings.access. */
	const KINDS: Record<BadgeKind, { icon?: IconName; word?: keyof UiStrings['access'] }> = {
		read: {},
		'write-draft': { icon: 'pencil', word: 'writeDraft' },
		write: { icon: 'check', word: 'write' },
		'act-external': { icon: 'arrow-up-right', word: 'actExternal' },
		tier: { icon: 'lock', word: 'tier' },
		estimated: { word: 'estimated' },
		origin: { word: 'origin' },
		warning: { icon: 'clock' },
		ai: { icon: 'sparkles' },
		danger: {},
		neutral: {},
	}
</script>

<script lang="ts">
	// The access-level badges and the small qualifiers on rows. `read` renders nothing at all. A badge is Inter, data
	// the app holds, and never carries meaning by colour alone: every kind has a glyph or a word.
	import type { HTMLAttributes } from 'svelte/elements'
	import Icon from '../../icons/Icon.svelte'
	import { useStrings } from '../../i18n/context.js'

	type Props = HTMLAttributes<HTMLSpanElement> & {
		/** read shows nothing; write-draft a pencil, write a check, act-external an arrow in the warning colour; tier the T2 lock; estimated a dashed edge; origin a mono source; warning a clock with a date; ai anything the Gardener produced. */
		kind?: BadgeKind
		/** The word. Access kinds default to their word from strings; warning, danger and neutral need one. */
		label?: string
	}
	let { kind = 'neutral', label, class: className = '', ...rest }: Props = $props()

	const s = useStrings()
	const def = $derived(KINDS[kind])
	const text = $derived(label ?? (def.word ? s.access[def.word] : kind === 'ai' ? s.gardener.name : ''))
</script>

{#if kind !== 'read'}
	<span class={['ed-badge', `ed-badge-${kind}`, className]} {...rest}>
		{#if def.icon}<Icon name={def.icon} size="sm" class="ed-badge-icon" />{/if}
		{#if text}<span class="ed-badge-text">{text}</span>{/if}
	</span>
{/if}

<style>
	.ed-badge {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		padding: 0 calc(var(--space-1) + 2px);
		border: 1px solid transparent;
		border-radius: var(--ed-radius-control);
		font: var(--ed-t-caption);
		letter-spacing: var(--ed-t-caption-tracking);
		font-variation-settings: var(--ed-t-caption-opsz);
		background: var(--surface-2);
		color: var(--text-secondary);
		white-space: nowrap;
		vertical-align: middle;
		box-sizing: border-box;
	}
	.ed-badge :global(.ed-badge-icon) {
		width: var(--space-3);
		height: var(--space-3);
		stroke-width: var(--icon-stroke);
	}
	.ed-badge-write-draft,
	.ed-badge-act-external,
	.ed-badge-tier {
		color: var(--text-primary);
	}
	.ed-badge-write {
		background: var(--brand-muted);
		color: var(--brand-hover);
	}
	.ed-badge-act-external :global(.ed-badge-icon) {
		color: var(--warning);
	}
	.ed-badge-estimated {
		background: transparent;
		border-style: dashed;
		border-color: var(--stroke);
	}
	.ed-badge-origin {
		font-family: var(--ed-font-mono);
	}
	.ed-badge-ai {
		background: var(--ai-muted);
		color: var(--ai);
		font-weight: 500;
	}
	.ed-badge-warning {
		background: transparent;
		border-color: var(--stroke);
		color: var(--text-primary);
	}
	.ed-badge-warning :global(.ed-badge-icon) {
		color: var(--warning);
	}
	.ed-badge-danger {
		background: transparent;
		border-color: var(--stroke);
		color: var(--danger);
	}
</style>
