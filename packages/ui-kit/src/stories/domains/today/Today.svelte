<script module lang="ts">
	import type { ParsedChip } from '$lib/index.js'

	/**
	 * The demonstration parser of the mockup: today or tomorrow as the day and a 3pm-style time, the rest as the
	 * title, which is what the app's quick-add reads from "Call dentist tomorrow 3pm". The app's parser is
	 * `@eden/shared/tasks`; this only draws the same chips.
	 */
	export function parseLine(text: string): ParsedChip[] {
		let rest = ` ${text} `
		const day = /\b(today|tomorrow)\b/i.exec(rest)
		if (day) rest = rest.replace(day[0], ' ')
		const time = /\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i.exec(rest)
		let clock = ''
		if (time) {
			let hours = parseInt(time[1]!, 10)
			if (time[3]!.toLowerCase() === 'pm' && hours < 12) hours += 12
			if (time[3]!.toLowerCase() === 'am' && hours === 12) hours = 0
			clock = `${String(hours).padStart(2, '0')}:${time[2] ?? '00'}`
			rest = rest.replace(time[0], ' ')
		}
		const title = rest.replace(/\s+/g, ' ').trim() || text.trim()
		const when = [day ? day[1]![0]!.toUpperCase() + day[1]!.slice(1).toLowerCase() : '', clock]
			.filter(Boolean)
			.join(' ')
		return when ? [{ label: title }, { label: when, icon: clock ? 'clock' : 'calendar' }] : [{ label: title }]
	}
</script>

<script lang="ts">
	// Today (product/substrate/tasks.md, "Today view"), the mirror of the page built in apps/desktop under the owner's
	// exception to D-54: the Quick Log strip with the enabled domains' quick actions, the quick-add line with its
	// parsed chips, then Overdue (closed until opened, its count in view), Due today, Routines and Habits, one list
	// each. Done is Enter, a double-click or the first item of a row's menu (no checkboxes, D-41); a done routine
	// stays, struck through with its time. On the phone a swipe to the right is Done and a swipe to the left Delete.
	import {
		Chip,
		EmptyState,
		IconButton,
		List,
		PageHeader,
		QuickAdd,
		domainGlyph,
		type IconName,
		type ListRowData,
		type MenuItem,
	} from '$lib/index.js'
	import AppFrame from '../_frame/AppFrame.svelte'
	import { sidebar, todayHabit, todayRoutine, todayTasks } from '../../sample-data.js'

	type Props = {
		/** The Overdue section open, its rows shown. */
		overdueOpen?: boolean
		/** Nothing to do: the empty state. */
		empty?: boolean
		/** A line in the quick-add field, with its parsed chips beneath. */
		typed?: string
		onadd?: (text: string) => void
		ondone?: (row: ListRowData) => void
		ondelete?: (row: ListRowData) => void
		onopen?: (row: ListRowData) => void
		onaction?: (item: MenuItem, row: ListRowData) => void
		onquicklog?: (id: string) => void
		onsample?: () => void
		onnavigate?: (id: string) => void
	}
	let {
		overdueOpen = false,
		empty = false,
		typed = '',
		onadd,
		ondone,
		ondelete,
		onopen,
		onaction,
		onquicklog,
		onsample,
		onnavigate,
	}: Props = $props()

	const uid = $props.id()
	const today = sidebar.items.find((entry) => entry.id === 'today')!
	const name = (id: string) => sidebar.items.find((entry) => entry.id === id)?.name ?? id

	/** The strip: the quick actions the enabled domains declare, each with its domain's name (D-12). */
	const strip: { id: string; label: string; icon: IconName }[] = [
		{ id: 'kitchen.capture-haul', label: `Capture a haul · ${name('kitchen')}`, icon: 'camera' },
		{ id: 'kitchen.add-to-grocery', label: `Add · ${name('kitchen')}`, icon: 'plus' },
		{ id: 'toolbench.capture-idea', label: `Capture an idea · ${name('toolbench')}`, icon: 'lightbulb' },
	]

	const remove: MenuItem = { id: 'delete', label: 'Delete', icon: 'trash', destructive: true }
	const todoActions: MenuItem[] = [
		{ id: 'done', label: 'Done', icon: 'check' },
		{ id: 'later', label: 'Later today', icon: 'clock' },
		{ id: 'tomorrow', label: 'Tomorrow', icon: 'calendar' },
		{ id: 'nextWeek', label: 'Next week', icon: 'calendar' },
		remove,
	]
	const doneRoutineActions: MenuItem[] = [{ id: 'reopen', label: 'Not done', icon: 'rotate-ccw' }, remove]
	const habitActions: MenuItem[] = [{ id: 'log', label: 'Log one', icon: 'plus' }, remove]

	const overdue = todayTasks.find((task) => task.state === 'overdue')!
	const due = todayTasks.find((task) => task.state === 'due')!

	interface Section {
		id: 'overdue' | 'due' | 'routines' | 'habits'
		title: string
		rows: ListRowData[]
	}
	const sections: Section[] = [
		{
			id: 'overdue',
			title: 'Overdue',
			rows: [{ id: overdue.id, primary: overdue.title, meta: overdue.when, metaWarn: true, actions: todoActions }],
		},
		{ id: 'due', title: 'Due today', rows: [{ id: due.id, primary: due.title, actions: todoActions }] },
		{
			id: 'routines',
			title: 'Routines',
			rows: [
				{
					id: todayRoutine.id,
					primary: todayRoutine.title,
					secondary: 'Every day',
					meta: todayRoutine.doneAt,
					done: true,
					actions: doneRoutineActions,
				},
			],
		},
		{
			id: 'habits',
			title: 'Habits',
			rows: [
				{
					id: todayHabit.id,
					primary: todayHabit.title,
					chips: [
						{ id: 'tally', label: todayHabit.tally, mono: true },
						{ id: 'period', label: 'this week' },
						{ id: 'streak', label: `${todayHabit.streak} in a row`, icon: 'flame' },
					],
					actions: habitActions,
				},
			],
		},
	]

	/** Overdue is closed until the owner opens it (the story may open it); the chevron flips it either way. */
	let flipped = $state(false)
	const open = $derived(overdueOpen !== flipped)
</script>

<AppFrame current="today" {onnavigate}>
	{#snippet children(platform)}
		<div class="page">
			<PageHeader name={today.name} subtitle="Wednesday 30 September" icon={domainGlyph('today')} />

			<div class="body">
				<nav class="strip" aria-label="Quick Log">
					{#each strip as entry (entry.id)}
						<Chip label={entry.label} icon={entry.icon} tone="outline" onclick={() => onquicklog?.(entry.id)} />
					{/each}
				</nav>

				<div class="add">
					<QuickAdd
						placeholder="Add a task, a routine or a habit"
						value={typed}
						parse={parseLine}
						onadd={(text) => onadd?.(text)}
					/>
				</div>

				{#if empty}
					<EmptyState
						title="Nothing due today"
						text="Tasks and routines from every domain gather here."
						sample={{ onclick: onsample }}
					/>
				{:else}
					{#each sections as section (section.id)}
						{@const closed = section.id === 'overdue' && !open}
						<section class="section" aria-labelledby="{uid}-{section.id}">
							<header class="section-head">
								<h2 class="section-title" id="{uid}-{section.id}">{section.title}</h2>
								<span class="section-count">{section.rows.length}</span>
								{#if section.id === 'overdue'}
									<IconButton
										icon={open ? 'chevron-up' : 'chevron-down'}
										size="xs"
										label={open ? 'Hide overdue' : 'Show overdue'}
										tooltip
										aria-expanded={open}
										aria-controls="{uid}-overdue-list"
										onclick={() => (flipped = !flipped)}
									/>
								{/if}
							</header>
							{#if !closed}
								{#if platform === 'desktop'}
									<List
										id={section.id === 'overdue' ? `${uid}-overdue-list` : undefined}
										rows={section.rows}
										{onopen}
										{onaction}
									/>
								{:else}
									<!-- the phone: the same list, its rows swiping; a tap does nothing, the ⋯ menu holds the rest -->
									<List
										id={section.id === 'overdue' ? `${uid}-overdue-list` : undefined}
										labelledby="{uid}-{section.id}"
										rows={section.rows}
										leading={(row) => ({ label: 'Done', icon: 'check', onaction: () => ondone?.(row) })}
										trailing={(row) => ({ label: 'Delete', icon: 'trash', onaction: () => ondelete?.(row) })}
										{onaction}
									/>
								{/if}
							{/if}
						</section>
					{/each}
				{/if}
			</div>
		</div>
	{/snippet}
</AppFrame>

<style>
	.page {
		display: flex;
		flex-direction: column;
		padding-bottom: var(--space-8);
	}
	.body {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
		padding: 0 var(--ed-gutter);
	}
	/* The quick-add line keeps a reading width while the lists below take the page */
	.add {
		max-width: calc(var(--sheet-max) * 0.8);
	}
	/* The strip: the quick actions as a row of chips, wrapping when the window is narrow */
	.strip {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
	}
	/* One section per list: its name, its count in mono, and for Overdue the chevron that opens it */
	.section {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}
	.section-head {
		display: flex;
		align-items: center;
		gap: var(--space-2);
	}
	.section-title {
		margin: 0;
		font: var(--ed-t-title-lg);
		letter-spacing: var(--ed-t-title-lg-tracking);
		font-variation-settings: var(--ed-t-title-lg-opsz);
	}
	.section-count {
		font: var(--ed-t-data-sm);
		letter-spacing: var(--ed-t-data-sm-tracking);
		font-variant-numeric: tabular-nums;
		color: var(--text-secondary);
	}
</style>
