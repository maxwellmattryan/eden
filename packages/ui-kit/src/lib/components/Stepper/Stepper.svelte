<script module lang="ts">
	import { spacing } from '$lib/tokens/tokens.js'

	// Room one step needs before the bars give way to dots: a bar and its gap, or twice that with a label beneath.
	const px = (value: string) => parseInt(value, 10)
	const BAR = px(spacing['space-8']) + px(spacing['space-1'])
	const LABELLED = px(spacing['space-8']) * 2 + px(spacing['space-2'])
</script>

<script lang="ts">
	// The onboarding wizard's step indicator (product/substrate/onboarding.md). Purely presentational: the wizard's own
	// Back and Continue move between steps, nothing here is clickable. Completed steps fill with the accent, the current
	// one is ringed, the rest wait in stroke-hover; the nav's name and a live line say "Step 3 of 10" for a screen reader.
	import type { HTMLAttributes } from 'svelte/elements'
	import { useStrings } from '$lib/i18n/context.js'
	import { measure } from '$lib/internal/measure.js'
	import { platformOf } from '$lib/internal/platform.js'

	type Props = Omit<HTMLAttributes<HTMLElement>, 'aria-label'> & {
		/** How many steps the wizard has. */
		steps: number
		/** The step the owner is on, 1-based. */
		current: number
		/** One short name per step, shown beneath the bars where there is room and read out in the list everywhere. */
		labels?: string[]
		/** The indicator's accessible name; "Step 3 of 10" by default, which is also announced as `current` changes. */
		label?: string
		/** bars, dots, or auto: dots on mobile and wherever the bars would not fit. */
		shape?: 'bars' | 'dots' | 'auto'
	}
	let { steps, current, labels, label, shape = 'auto', class: className = '', ...rest }: Props = $props()
	const s = useStrings()

	let root = $state<HTMLElement>()
	// layout width, not the rect: a scaled ancestor (the gallery's zoomed desktop frame) shrinks the rect and would
	// flip the bars to dots
	let width = $state(0)
	const platform = $derived(platformOf(root))
	const items = $derived(Array.from({ length: Math.max(0, steps) }, (_, i) => i + 1))
	const needed = $derived(steps * (labels?.length ? LABELLED : BAR))
	const dots = $derived(
		shape === 'dots' || (shape === 'auto' && (platform === 'mobile' || (width > 0 && width < needed)))
	)
	const live = $derived(s.step(current, steps))
</script>

<nav
	class="ed-stepper {className}"
	class:ed-stepper-dots={dots}
	aria-label={label ?? live}
	bind:this={root}
	{@attach measure((_, el) => (width = el.clientWidth))}
	{...rest}
>
	<p class="ed-sr-only" aria-live="polite">{live}</p>
	<ol class="ed-stepper-list">
		{#each items as n (n)}
			<li
				class="ed-stepper-step"
				data-state={n < current ? 'done' : n === current ? 'current' : 'todo'}
				aria-current={n === current ? 'step' : undefined}
			>
				<span class="ed-stepper-mark"></span>
				{#if labels?.[n - 1]}
					<span class="ed-stepper-label" class:ed-sr-only={dots}>{labels[n - 1]}</span>
				{:else}
					<span class="ed-sr-only">{s.step(n, steps)}</span>
				{/if}
			</li>
		{/each}
	</ol>
	{#if dots && labels?.[current - 1]}
		<p class="ed-stepper-current" aria-hidden="true">{labels[current - 1]}</p>
	{/if}
</nav>

<style>
	.ed-stepper {
		display: block;
		min-width: 0;
	}
	.ed-stepper-list {
		display: flex;
		align-items: flex-start;
		gap: var(--space-1);
		margin: 0;
		/* room for the current step's ring */
		padding: var(--space-1) 0;
		list-style: none;
	}
	.ed-stepper-step {
		display: flex;
		flex: 0 1 var(--space-8);
		flex-direction: column;
		gap: var(--space-2);
		min-width: var(--space-4);
	}
	.ed-stepper-step:has(.ed-stepper-label) {
		flex: 1 1 0;
		min-width: 0;
	}
	.ed-stepper-mark {
		display: block;
		height: var(--space-1);
		border-radius: var(--radius-full);
		background: var(--stroke-hover);
		transition: background-color var(--ed-duration-micro) var(--ed-ease-out);
	}
	.ed-stepper-step[data-state='done'] .ed-stepper-mark {
		background: var(--brand-primary);
	}
	.ed-stepper-step[data-state='current'] .ed-stepper-mark {
		background: var(--brand-primary);
		outline: 1.5px solid var(--brand-primary);
		outline-offset: 2px;
	}
	.ed-stepper-label {
		overflow: hidden;
		font: var(--ed-t-caption);
		letter-spacing: var(--ed-t-caption-tracking);
		font-variation-settings: var(--ed-t-caption-opsz);
		color: var(--text-secondary);
		white-space: nowrap;
		text-overflow: ellipsis;
	}
	.ed-stepper-step[data-state='current'] .ed-stepper-label {
		color: var(--text-primary);
	}

	/* dots: mobile, or wherever the bars would not fit */
	.ed-stepper-dots .ed-stepper-list {
		justify-content: center;
		gap: var(--space-2);
	}
	.ed-stepper-dots .ed-stepper-step,
	.ed-stepper-dots .ed-stepper-step:has(.ed-stepper-label) {
		flex: none;
		min-width: 0;
	}
	.ed-stepper-dots .ed-stepper-mark {
		width: var(--space-2);
		height: var(--space-2);
	}
	.ed-stepper-current {
		margin: var(--space-1) 0 0;
		font: var(--ed-t-caption);
		letter-spacing: var(--ed-t-caption-tracking);
		font-variation-settings: var(--ed-t-caption-opsz);
		color: var(--text-secondary);
		text-align: center;
	}
</style>
