<script module lang="ts">
	import type { IconName } from '../../icons/icons.js'
	import type { BannerTone } from '../Banner/Banner.svelte'
	import type { InboxAction } from '../InboxCard/InboxCard.svelte'

	export type IntegrationStatus = 'healthy' | 'stale' | 'failed' | 'off'

	/** One connected service: a chip with its health dot that opens its detail and the one action that helps. */
	export interface StatusBarIntegration {
		id: string
		/** The service's name: "Google Work". */
		label: string
		status: IntegrationStatus
		/** One sentence on its state: "Synced 07:38". The word for the status stands in when it is missing. */
		detail?: string
		/** off only: what Connect does. Without it the popover shows the detail alone. */
		onconnect?: () => void
	}

	/** The strip that replaces the sync line: offline, a notice. */
	export interface StatusBarBanner {
		/** One sentence: "Offline. Showing the forecast from 07:40." */
		message: string
		/** info unless told otherwise. */
		tone?: BannerTone
		/** One quiet action inside the strip. */
		action?: { label: string; onclick?: () => void }
	}

	/** The Gardener chip: the model in honey with its budget meter, or grey when this device has no key. */
	export interface StatusBarGardener {
		/** The model's name: "claude-sonnet". */
		label: string
		/** This month's spend against the cap, already formatted, and the percentage the meter shows. */
		budget?: { used: string; cap: string; percent: number }
		/** No provider key on this device: the chip turns grey and says so. */
		noKey?: boolean
		/** Opens the Gardener, or the key setup when there is no key. Without it the chip is a plain label. */
		onopen?: () => void
		/** The current grade's id, marked in the grade menu. */
		grade?: string
		/** The grades to switch between; given, a caret beside the chip opens them as a menu (hidden without a key). */
		grades?: StatusBarGrade[]
		/** Called with the picked grade's id. */
		onchangegrade?: (id: string) => void
	}

	/** One grade in the Gardener chip's menu. */
	export interface StatusBarGrade {
		id: string
		/** The grade's name: "Standard". */
		label: string
		/** Its glyph in the menu. */
		icon?: IconName
	}

	/** A standing note about this build or device: an info button whose tooltip says it. */
	export interface StatusBarNotice {
		/** The sentence, which is the button's name and its tooltip. */
		label: string
		/** info unless told otherwise. */
		icon?: IconName
	}

	/** One notification behind the bell, shown as an InboxCard. */
	export interface InboxItem {
		id: string
		/** The domain glyph (domainGlyph(id)); the bell for the shell's own notices. */
		icon?: IconName
		/** The one line, in the voice. */
		line: string
		/** When it arrived, already formatted by the app. */
		when?: string
		/** The sending domain's themed name. */
		domain?: string
		/** Not yet seen: counts towards the bell's badge. */
		unread?: boolean
		/** Inline quiet actions, the first being what the line asks for. */
		actions?: InboxAction[]
	}
</script>

<script lang="ts">
	// The global strip at the bottom of the desktop window (substrate/shell.md). Left: the sync line, or the offline
	// banner in its place, and one chip per integration; a chip opens a small dialog with its detail and the one action
	// that helps (Connect when it is granted but not connected here, Sync now when it is stale or failed). Right: the
	// Gardener chip (the model and its budget meter in honey, grey without a key) that opens the Gardener, with a caret
	// beside it opening the grade menu when the app hands it grades, the notice when the app hands one (an info
	// button whose tooltip is the sentence, between the chip and the caret, first of the icon buttons), the bell that
	// opens the inbox as a stack of InboxCards (the cards keep their unread mark while it is open; the app hears it
	// close), and + that opens the embedded Quick Log. Every panel is a Popover dialog
	// unfurling upwards from the bar: Escape or a pointer outside closes it and focus returns to its button. On mobile
	// these live behind More and the floating button.
	import type { HTMLAttributes } from 'svelte/elements'
	import { domainGlyph } from '../../icons/domain-glyphs.js'
	import { useStrings } from '../../i18n/context.js'
	import Banner from '../Banner/Banner.svelte'
	import Button from '../Button/Button.svelte'
	import Chip from '../Chip/Chip.svelte'
	import IconButton from '../IconButton/IconButton.svelte'
	import InboxCard from '../InboxCard/InboxCard.svelte'
	import Menu, { type MenuItem } from '../Menu/Menu.svelte'
	import Popover from '../Popover/Popover.svelte'
	import QuickLogSheet, { type QuickLog } from '../QuickLogSheet/QuickLogSheet.svelte'

	type Props = HTMLAttributes<HTMLElement> & {
		/** The sync state, one short line: "Synced 07:38". */
		sync?: string
		/** Replaces the sync line while it is present: the offline strip, in info unless it says otherwise. */
		banner?: StatusBarBanner
		/** One chip per connected service, in order. */
		integrations?: StatusBarIntegration[]
		/** The Gardener chip; omit it to hide it. */
		gardener?: StatusBarGardener
		/** A standing note, first of the icon buttons on the right, before the grade caret: its sentence is the tooltip. */
		notice?: StatusBarNotice
		/** The notifications behind the bell; the unread ones make its count. */
		inbox?: InboxItem[]
		/** The enabled quick actions behind +. */
		logs?: QuickLog[]
		/** Called with the log and the value when a quick log is saved; the popover then closes. */
		onlog?: (log: QuickLog, value: string) => void
		/** Called with the action and its notification when an inline action is pressed; the popover then closes. */
		oninboxaction?: (action: InboxAction, item: InboxItem) => void
		/** Called once the inbox has closed, however it was closed: when the app marks what was shown as read. */
		oninboxclose?: () => void
		/** Called with the integration when Sync now is pressed. Without it a stale or failed chip shows its detail alone. */
		onsync?: (integration: StatusBarIntegration) => void
	}
	let {
		sync,
		banner,
		integrations = [],
		gardener,
		notice,
		inbox = [],
		logs = [],
		onlog,
		oninboxaction,
		oninboxclose,
		onsync,
		class: className = '',
		...rest
	}: Props = $props()

	const s = useStrings()
	const unread = $derived(inbox.filter((item) => item.unread).length)

	// One popover serves every integration, re-anchored to whichever chip opened it; the bell and + have their own.
	let anchors = $state<Record<string, HTMLElement | undefined>>({})
	let openId = $state<string | null>(null)
	let integrationOpen = $state(false)
	let bellAnchor = $state<HTMLElement>()
	let bellOpen = $state(false)
	let plusAnchor = $state<HTMLElement>()
	let plusOpen = $state(false)
	let gradeAnchor = $state<HTMLElement>()
	let gradeOpen = $state(false)

	const current = $derived(integrations.find((integration) => integration.id === openId))
	/** The sentence in an integration's popover: its detail, or the plain words for its state. */
	const detail = $derived.by(() => {
		if (!current) return ''
		if (current.detail) return current.detail
		if (current.status === 'off') return s.statusBar.grantedNotConnected
		if (current.status === 'failed') return s.statusBar.signInExpired
		return s.chip.status[current.status]
	})
	const canConnect = $derived(current?.status === 'off' && !!current.onconnect)
	const canSync = $derived((current?.status === 'stale' || current?.status === 'failed') && !!onsync)

	// The Gardener chip is a button only when it opens something; then its name carries the model and the budget.
	const gardenerName = $derived(
		gardener?.onopen && !gardener.noKey && gardener.budget
			? s.statusBar.gardenerBudget(gardener.label, s.gardener.budget(gardener.budget.used, gardener.budget.cap))
			: undefined
	)

	function toggleIntegration(id: string) {
		if (integrationOpen && openId === id) {
			integrationOpen = false
		} else {
			openId = id
			integrationOpen = true
		}
	}
	function connect() {
		current?.onconnect?.()
		integrationOpen = false
	}
	function syncNow() {
		if (current) onsync?.(current)
		integrationOpen = false
	}
	function openGardener() {
		gardener?.onopen?.()
	}
	// The grade menu: one item per grade with its glyph, the current one checked; picking one reports its id.
	const grades = $derived(gardener && !gardener.noKey ? (gardener.grades ?? []) : [])
	const gradeItems = $derived<MenuItem[]>(
		grades.map((grade) => ({
			id: grade.id,
			label: grade.label,
			icon: grade.icon,
			checked: grade.id === gardener?.grade,
		}))
	)
	const currentGradeIcon = $derived(grades.find((grade) => grade.id === gardener?.grade)?.icon ?? 'chevron-down')
	function pickGrade(item: MenuItem) {
		if (item.id) gardener?.onchangegrade?.(item.id)
	}
	/** The card's actions, each also reporting through `oninboxaction` and closing the inbox. */
	function inboxActions(item: InboxItem): InboxAction[] | undefined {
		return item.actions?.map((action) => ({
			...action,
			onclick: (event: MouseEvent) => {
				action.onclick?.(event)
				oninboxaction?.(action, item)
				bellOpen = false
			},
		}))
	}
	function save(log: QuickLog, value: string) {
		onlog?.(log, value)
		plusOpen = false
	}
</script>

<footer class={['ed-status', className]} aria-label={s.statusBar.label} {...rest}>
	{#if banner}
		<Banner
			class="ed-status-banner"
			placement="inline"
			tone={banner.tone ?? 'info'}
			message={banner.message}
			action={banner.action}
		/>
	{:else if sync}
		<span class="ed-status-sync">{sync}</span>
	{/if}

	{#each integrations as integration (integration.id)}
		<span class="ed-status-anchor" bind:this={anchors[integration.id]}>
			<Chip
				label={integration.label}
				tone={integration.status === 'off' ? 'grey' : 'neutral'}
				status={integration.status}
				aria-haspopup="dialog"
				aria-expanded={integrationOpen && openId === integration.id}
				onclick={() => toggleIntegration(integration.id)}
			/>
		</span>
	{/each}
	<Popover bind:open={integrationOpen} anchor={openId ? anchors[openId] : null} side="top" label={current?.label}>
		{#if current}
			<div class="ed-status-pop">
				<p class="ed-status-detail">{detail}</p>
				{#if canConnect}
					<div class="ed-status-actions">
						<Button label={s.statusBar.connect} variant="primary" onclick={connect} />
					</div>
				{:else if canSync}
					<div class="ed-status-actions">
						<Button label={s.statusBar.syncNow} onclick={syncNow} />
					</div>
				{/if}
			</div>
		{/if}
	</Popover>

	<div class="ed-status-right">
		{#if gardener}
			<Chip
				label={gardener.noKey ? s.gardener.noKeyOnDevice : gardener.label}
				tone="grey"
				icon={domainGlyph('gardener')}
				meter={gardener.noKey ? undefined : gardener.budget?.percent}
				aria-label={gardenerName}
				onclick={gardener.onopen ? openGardener : undefined}
			/>
		{/if}
		{#if notice}
			<IconButton icon={notice.icon ?? 'info'} label={notice.label} size="sm" tooltip />
		{/if}
		{#if gardener}
			{#if grades.length}
				<span class={['ed-status-anchor', !notice && 'ed-status-grade']} bind:this={gradeAnchor}>
					<IconButton
						icon={currentGradeIcon}
						label={s.gardener.switchGrade}
						size="sm"
						tooltip
						active={gradeOpen}
						aria-haspopup="menu"
						aria-expanded={gradeOpen}
						onclick={() => (gradeOpen = !gradeOpen)}
					/>
				</span>
				<Menu
					bind:open={gradeOpen}
					anchor={gradeAnchor}
					align="end"
					presentation="menu"
					label={s.gardener.grade}
					items={gradeItems}
					onselect={pickGrade}
				/>
			{/if}
		{/if}

		<span class="ed-status-anchor" bind:this={bellAnchor}>
			<IconButton
				icon="bell"
				label={s.statusBar.inbox}
				count={unread}
				size="sm"
				tooltip
				active={bellOpen}
				aria-haspopup="dialog"
				aria-expanded={bellOpen}
				onclick={() => (bellOpen = !bellOpen)}
			/>
		</span>
		<Popover
			bind:open={bellOpen}
			anchor={bellAnchor}
			side="top"
			align="end"
			label={s.statusBar.inbox}
			onclose={() => oninboxclose?.()}
		>
			<div class="ed-status-inbox">
				{#each inbox as item (item.id)}
					<InboxCard
						icon={item.icon}
						line={item.line}
						when={item.when}
						domain={item.domain}
						unread={item.unread}
						actions={inboxActions(item)}
					/>
				{:else}
					<p class="ed-status-empty">{s.nothingYet}</p>
				{/each}
			</div>
		</Popover>

		<span class="ed-status-anchor" bind:this={plusAnchor}>
			<IconButton
				icon="plus"
				label={s.statusBar.quickLog}
				size="sm"
				tooltip
				active={plusOpen}
				aria-haspopup="dialog"
				aria-expanded={plusOpen}
				onclick={() => (plusOpen = !plusOpen)}
			/>
		</span>
		<Popover bind:open={plusOpen} anchor={plusAnchor} side="top" align="end" label={s.statusBar.quickLog}>
			<div class="ed-status-quicklog">
				<QuickLogSheet {logs} embedded onsave={save} />
			</div>
		</Popover>
	</div>
</footer>

<style>
	.ed-status {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		height: var(--status-bar);
		padding: 0 var(--ed-gutter);
		border-top: 1px solid var(--stroke-subtle);
		background: var(--surface-1);
		color: var(--text-secondary);
		box-sizing: border-box;
		min-width: 0;
	}
	.ed-status-sync {
		font: var(--ed-t-caption);
		letter-spacing: var(--ed-t-caption-tracking);
		font-variation-settings: var(--ed-t-caption-opsz);
		color: var(--text-secondary);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		min-width: 0;
	}
	/* The offline strip takes the sync line's place and gives way before the chips do */
	.ed-status > :global(.ed-status-banner) {
		flex: 0 1 auto;
		min-width: 0;
	}
	/* An anchor wraps each control so the popover can hang from it; focus returns to the control inside */
	.ed-status-anchor {
		display: inline-flex;
		flex: none;
	}
	.ed-status-right {
		margin-left: auto;
		display: flex;
		align-items: center;
		gap: var(--space-2);
		flex: none;
	}
	/* The caret sits tight against the model chip, as one control in two parts, unless the notice stands between */
	.ed-status-grade {
		margin-left: calc(-1 * var(--space-1));
	}

	/* An integration's popover: the sentence in the voice and the one action beneath */
	.ed-status-pop {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: var(--space-3);
		width: calc(var(--sheet-sm) * 0.75);
		max-width: 100%;
		padding: var(--space-3) var(--space-4);
		box-sizing: border-box;
	}
	.ed-status-detail {
		margin: 0;
		font: var(--ed-t-voice);
		letter-spacing: var(--ed-t-voice-tracking);
		font-variation-settings: var(--ed-t-voice-opsz);
		color: var(--text-primary);
		text-wrap: pretty;
	}
	.ed-status-actions {
		display: flex;
		gap: var(--space-2);
	}

	/* The inbox: a stack of cards; the Quick Log: the embedded panel with room for its sparkline */
	.ed-status-inbox {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		width: var(--sheet-sm);
		max-width: 100%;
		padding: var(--space-2);
		box-sizing: border-box;
	}
	.ed-status-empty {
		margin: 0;
		padding: var(--space-2) var(--space-3);
		font: var(--ed-t-body-sm);
		letter-spacing: var(--ed-t-body-sm-tracking);
		font-variation-settings: var(--ed-t-body-sm-opsz);
		color: var(--text-secondary);
	}
	.ed-status-quicklog {
		width: var(--sheet-sm);
		max-width: 100%;
		padding: var(--space-4);
		box-sizing: border-box;
	}
</style>
