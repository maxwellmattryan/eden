<script module lang="ts">
	/** What a card that runs something shows at the end of its title line. */
	export type ToolStatus = 'running' | 'waiting' | 'done' | 'failed' | 'cancelled'
</script>

<script lang="ts">
	// The frame a tool card and a proposal card share: a compact card on one of the Gardener's two tints, honey when it
	// acts and green when it speaks (D-40), with a leading glyph, a title line that carries the badge, a body, an
	// action row while the card is pending, and a result line once it has settled. A card that runs something carries
	// its `status` at the end of the title line: a Spinner while it runs (D-79), a success check once it is done, a
	// danger x when it failed or was cancelled, and a warning triangle while what it drafted waits on the
	// owner; the glyph fades in over the settle duration, and the badge fades out when the card stops passing one. On `done`
	// the ground fades from the tint to the plain card ground and a Breeze plays once on the check (D-42), never for a
	// card that mounts already done and never for a failure. Nothing pops.
	import { untrack, type Snippet } from 'svelte'
	import { fade } from 'svelte/transition'
	import type { HTMLAttributes } from 'svelte/elements'
	import type { IconName } from '../../icons/icons.js'
	import Icon from '../../icons/Icon.svelte'
	import { useStrings } from '../../i18n/context.js'
	import Breeze from '../Breeze/Breeze.svelte'
	import IconButton from '../IconButton/IconButton.svelte'
	import Spinner from '../Spinner/Spinner.svelte'
	import { motion } from '../../tokens/tokens.js'

	type Props = HTMLAttributes<HTMLDivElement> & {
		/** honey: the Gardener acting; ai: the Gardener speaking. */
		tone: 'honey' | 'ai'
		/** The leading glyph. */
		icon: IconName
		/** The title line, which names the card. */
		heading: string
		/** The badge at the end of the title line. */
		badge?: Snippet
		/** An info glyph after the title, named "About this tool"; called with the button, for a popover to hang on. */
		oninfo?: (anchor: HTMLElement) => void
		/** The body: what the card says and shows. */
		children?: Snippet
		/** The action row, shown while there is no result. */
		actions?: Snippet
		/** The result line; its presence means the card has settled and the actions are gone. */
		result?: string
		/** The settle that grew something: the ground fades, the result takes a check and the Breeze plays once. */
		done?: boolean
		/** The status glyph at the end of the title line; with it the result line is words alone. */
		status?: ToolStatus
		/** What ends the title line, after the status: the chevron of a card that folds. */
		end?: Snippet
	}
	let {
		tone,
		icon,
		heading,
		badge,
		oninfo,
		children,
		actions,
		result,
		done = false,
		status,
		end,
		class: className = '',
		...rest
	}: Props = $props()

	const s = useStrings()
	const uid = $props.id()
	// A card that mounts already done is history: it shows the settled state but does not play the Breeze again.
	const doneAtMount = untrack(() => done)
	let breezeEnded = $state(false)
	const breeze = $derived(done && !doneAtMount && !breezeEnded)
	// A status the card mounted with is history too: its glyph is simply there, it does not fade in.
	const statusAtMount = untrack(() => status)
	const duration = parseInt(motion['duration-settle'], 10)
	const statusWord = $derived(
		status === 'running'
			? s.gardener.toolRunning
			: status === 'waiting'
				? s.gardener.toolWaiting
				: status === 'done'
					? s.gardener.toolDone
					: status === 'failed'
						? s.gardener.toolFailed
						: s.gardener.toolCancelled
	)
</script>

<div
	class={['ed-tool', `ed-tool-${tone}`, { 'ed-tool-done': done }, className]}
	role="group"
	aria-labelledby="{uid}-title"
	{...rest}
>
	<div class="ed-tool-head">
		<Icon name={icon} size="sm" class="ed-tool-icon" />
		<span class="ed-tool-title" id="{uid}-title">{heading}</span>
		{#if oninfo}
			<IconButton
				class="ed-tool-info"
				icon="info"
				size="xs"
				label={s.gardener.aboutTool}
				tooltip
				onclick={(e) => oninfo(e.currentTarget)}
			/>
		{/if}
		<span class="ed-tool-end">
			{#if badge}<span class="ed-tool-badge" out:fade={{ duration }}>{@render badge()}</span>{/if}
			{#if status}
				<!-- one live region, so the change from running to its outcome is announced -->
				<span class={['ed-tool-status', `ed-tool-status-${status}`]} role="status">
					{#if status === 'running'}
						<Spinner role="none" label={statusWord} />
					{:else}
						<span class={['ed-tool-status-glyph', { 'ed-tool-status-settling': status !== statusAtMount }]}>
							<Icon name={status === 'done' ? 'check' : status === 'waiting' ? 'triangle-alert' : 'x'} size="sm" />
							{#if breeze}<Breeze onend={() => (breezeEnded = true)} />{/if}
						</span>
						<span class="ed-sr-only">{statusWord}</span>
					{/if}
				</span>
			{/if}
			{@render end?.()}
		</span>
	</div>
	{@render children?.()}
	{#if actions || result !== undefined}
		<!-- one live region for the foot, so the result is announced when it replaces the buttons -->
		<div class="ed-tool-foot" aria-live="polite">
			{#if result !== undefined}
				<p class="ed-tool-result">
					{#if !status}
						<span class="ed-tool-result-icon">
							<Icon name={done ? 'check' : 'x'} size="sm" />
							{#if breeze}<Breeze onend={() => (breezeEnded = true)} />{/if}
						</span>
					{/if}
					<span>{result}</span>
				</p>
			{:else if actions}
				<div class="ed-tool-actions">{@render actions()}</div>
			{/if}
		</div>
	{/if}
</div>

<style>
	.ed-tool {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		padding: var(--space-3);
		border-radius: var(--ed-radius-control);
		border: 1px solid var(--ed-tool-edge);
		background: var(--ed-tool-ground);
		color: var(--text-primary);
		box-sizing: border-box;
		min-width: 0;
		transition:
			background-color var(--ed-duration-settle) var(--ed-ease-out),
			border-color var(--ed-duration-settle) var(--ed-ease-out);
	}
	.ed-tool-honey {
		--ed-tool-ink: var(--honey);
		--ed-tool-ground: var(--honey-muted);
		--ed-tool-edge: color-mix(in srgb, var(--honey) 30%, transparent);
	}
	.ed-tool-ai {
		--ed-tool-ink: var(--ai);
		--ed-tool-ground: var(--ai-muted);
		--ed-tool-edge: color-mix(in srgb, var(--ai) 25%, transparent);
	}
	/* Settled: the tint gives way to the plain card ground; the title keeps its colour, since it still says what acted */
	.ed-tool-done {
		--ed-tool-ground: var(--surface-1);
		--ed-tool-edge: var(--ed-card-border);
	}
	.ed-tool-head {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		min-width: 0;
		color: var(--ed-tool-ink);
	}
	.ed-tool :global(.ed-tool-icon) {
		flex: none;
	}
	.ed-tool-title {
		font: var(--ed-t-title-sm);
		letter-spacing: var(--ed-t-title-sm-tracking);
		font-variation-settings: var(--ed-t-title-sm-opsz);
		min-width: 0;
		overflow-wrap: anywhere;
	}
	.ed-tool :global(.ed-tool-info) {
		flex: none;
		color: var(--ed-tool-ink);
	}
	.ed-tool-end {
		margin-left: auto;
		flex: none;
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
	}
	.ed-tool-badge {
		flex: none;
		display: inline-flex;
	}
	.ed-tool-status {
		display: inline-flex;
		flex: none;
		color: var(--text-secondary);
		transition: color var(--ed-duration-settle) var(--ed-ease-out);
	}
	.ed-tool-status-waiting {
		color: var(--warning);
	}
	.ed-tool-status-done {
		color: var(--success);
	}
	.ed-tool-status-failed,
	.ed-tool-status-cancelled {
		color: var(--danger);
	}
	.ed-tool-status-glyph {
		position: relative;
		display: inline-flex;
	}
	.ed-tool-status-settling {
		animation: ed-tool-status-in var(--ed-duration-settle) var(--ed-ease-out);
	}
	@keyframes ed-tool-status-in {
		from {
			opacity: 0;
		}
	}
	.ed-tool-actions {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
	}
	.ed-tool-result {
		margin: 0;
		display: flex;
		align-items: center;
		gap: var(--space-1);
		font: var(--ed-t-caption);
		letter-spacing: var(--ed-t-caption-tracking);
		color: var(--text-secondary);
	}
	.ed-tool-result-icon {
		position: relative;
		display: inline-flex;
		flex: none;
		color: var(--text-secondary);
	}
	.ed-tool-done .ed-tool-result-icon {
		color: var(--brand-hover);
	}
</style>
