<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf'
	import type { ComponentProps } from 'svelte'
	import { expect, fn, userEvent, waitFor, within } from 'storybook/test'
	import { canvasOf } from '../../../storybook/play.js'
	import { defaultStrings } from '$lib/i18n/strings.js'
	import { domainGlyph } from '$lib/icons/domain-glyphs.js'
	import { budget, inbox, integrations, quickLogs, skyToday } from '../../../stories/sample-data.js'
	import StatusBar, { type InboxItem, type StatusBarIntegration } from './StatusBar.svelte'

	const strings = defaultStrings
	/** The themed names of the domains the sample notifications come from (product/domains/README.md). */
	const NAMES = { kitchen: 'Hearth', weather: 'Sky', fitness: 'Vigor' } as const

	const googleWork: StatusBarIntegration = integrations[0]!
	const openMeteo: StatusBarIntegration = integrations[1]!
	const googleFamily: StatusBarIntegration = integrations[2]!
	const healthy = [googleWork, openMeteo]
	const weight = quickLogs[0]!
	/** The sync line is the first integration's last good time. */
	const sync = googleWork.detail!
	const offline = `Offline. Showing the forecast from ${skyToday.lastGood}.`

	/** The sample notifications as inbox items: the domain glyph, its themed name, one quiet action to snooze. */
	const notices: InboxItem[] = inbox.map((notice) => ({
		id: notice.id,
		icon: domainGlyph(notice.domain),
		line: notice.line,
		when: notice.when,
		domain: NAMES[notice.domain],
		unread: notice.unread,
		actions: [{ id: 'snooze', label: 'Snooze', icon: 'clock', onclick: fn() }],
	}))
	const unreadNotices = notices.filter((notice) => notice.unread)
	const gardener = {
		label: budget.model,
		budget: { used: budget.used, cap: budget.cap, percent: budget.percent },
		onopen: fn(),
	}

	/** A status chip's name is its label followed by the spoken status word. */
	const chipNamed = (integration: StatusBarIntegration) => (name: string) => name.startsWith(integration.label)
	/** Desktop only: under the mobile project the frame shows a note instead of the bar, and there is nothing to drive. */
	const framed = (canvasElement: HTMLElement) => !!canvasElement.querySelector('.ed-canvas')

	const { Story } = defineMeta({
		title: 'Components/Shell/StatusBar',
		component: StatusBar,
		tags: ['autodocs'],
		parameters: {
			platforms: ['desktop'],
			platformFrame: 'inline',
			docs: {
				description: {
					component:
						'The global strip at the bottom of the desktop window. Left: the sync state (or the offline banner in its place) and one chip per integration, each opening a small dialog with its detail and the one action that helps. Right: the Gardener chip with its budget meter (grey without a key), the bell with the unread count opening the inbox, and + opening the embedded Quick Log. Every panel unfurls upwards from the bar and closes on Escape or a pointer outside, handing focus back to its button. On mobile these live behind More and the floating button.',
				},
			},
		},
		args: {
			sync,
			integrations: healthy,
			gardener,
			inbox: unreadNotices,
			logs: quickLogs,
			onlog: fn(),
			oninboxaction: fn(),
			oninboxclose: fn(),
			onsync: fn(),
		},
		argTypes: {
			sync: { control: 'text' },
			banner: { control: 'object' },
		},
	})
</script>

{#snippet template(args: ComponentProps<typeof StatusBar>)}
	<div class="sb-bottom"><StatusBar {...args} /></div>
{/snippet}

<!-- Every integration healthy, the Gardener at 28 % of its budget, two unread behind the bell -->
<Story
	name="Default"
	{template}
	play={async ({ canvasElement, args }) => {
		if (!framed(canvasElement)) return
		const canvas = canvasOf(canvasElement)
		await expect(canvas.getByRole('contentinfo', { name: strings.statusBar.label })).toBeVisible()
		await expect(canvas.getByText(sync)).toBeVisible()
		// the Gardener chip names the model and the budget in one breath; its meter reads the percentage
		const model = canvas.getByRole('button', {
			name: strings.statusBar.gardenerBudget(budget.model, strings.gardener.budget(budget.used, budget.cap)),
		})
		await expect(within(model).getByRole('meter')).toHaveAttribute('aria-valuenow', String(budget.percent))
		// the bell opens the inbox as a dialog of cards; Escape closes it and focus comes back
		const bell = canvas.getByRole('button', {
			name: strings.iconButton.withCount(strings.statusBar.inbox, unreadNotices.length),
		})
		await expect(bell).toHaveAttribute('aria-expanded', 'false')
		await userEvent.click(bell)
		const inboxDialog = await canvas.findByRole('dialog', { name: strings.statusBar.inbox })
		await waitFor(() => expect(inboxDialog).toBeVisible())
		await expect(bell).toHaveAttribute('aria-expanded', 'true')
		await expect(within(inboxDialog).getAllByRole('article')).toHaveLength(unreadNotices.length)
		// the app hears the inbox close, and not before: the cards keep their unread mark while it is open
		await expect(args.oninboxclose).not.toHaveBeenCalled()
		await userEvent.keyboard('{Escape}')
		await waitFor(() => expect(inboxDialog).not.toBeVisible())
		await waitFor(() => expect(bell).toHaveFocus())
		await waitFor(() => expect(args.oninboxclose).toHaveBeenCalledTimes(1))
		// + opens the embedded Quick Log with the weight field first
		const plus = canvas.getByRole('button', { name: strings.statusBar.quickLog })
		await userEvent.click(plus)
		const quickLog = await canvas.findByRole('dialog', { name: strings.statusBar.quickLog })
		await waitFor(() => expect(quickLog).toBeVisible())
		await expect(within(quickLog).getByRole('textbox', { name: weight.label })).toBeVisible()
		await userEvent.keyboard('{Escape}')
		await waitFor(() => expect(quickLog).not.toBeVisible())
		await waitFor(() => expect(plus).toHaveFocus())
	}}
/>

<!-- Offline: the banner takes the sync line's place, in info, with the time of the last good data -->
<Story
	name="Offline banner"
	{template}
	args={{ banner: { message: offline } }}
	play={async ({ canvasElement }) => {
		if (!framed(canvasElement)) return
		const canvas = canvasOf(canvasElement)
		await expect(canvas.getByRole('status')).toHaveTextContent(offline)
		await expect(canvas.queryByText(sync)).toBeNull()
	}}
/>

<!-- No provider key on this device: the Gardener chip turns grey and says so; opening it leads to the key setup -->
<Story
	name="No key"
	{template}
	args={{ gardener: { label: budget.model, noKey: true, onopen: fn() } }}
	play={async ({ canvasElement, args }) => {
		if (!framed(canvasElement)) return
		const canvas = canvasOf(canvasElement)
		const chip = canvas.getByRole('button', { name: strings.gardener.noKeyOnDevice })
		await expect(within(chip).queryByRole('meter')).toBeNull()
		await userEvent.click(chip)
		await expect(args.gardener?.onopen).toHaveBeenCalledTimes(1)
	}}
/>

<!-- Google Family is granted but not connected on this device: a grey chip whose popover offers Connect -->
<Story
	name="Granted, not connected here"
	{template}
	args={{ integrations: [googleWork, openMeteo, { ...googleFamily, onconnect: fn() }] }}
	play={async ({ canvasElement, args }) => {
		if (!framed(canvasElement)) return
		const canvas = canvasOf(canvasElement)
		const chip = canvas.getByRole('button', { name: chipNamed(googleFamily) })
		await userEvent.click(chip)
		const dialog = await canvas.findByRole('dialog', { name: googleFamily.label })
		await waitFor(() => expect(dialog).toBeVisible())
		await expect(dialog).toHaveAttribute('data-side', 'top')
		await expect(within(dialog).getByText(googleFamily.detail!)).toBeVisible()
		await userEvent.click(within(dialog).getByRole('button', { name: strings.statusBar.connect }))
		await expect(args.integrations?.[2]?.onconnect).toHaveBeenCalledTimes(1)
		await waitFor(() => expect(dialog).not.toBeVisible())
		await waitFor(() => expect(chip).toHaveFocus())
	}}
/>

<!-- Google Work is stale: the warning dot, and Sync now in its popover -->
<Story
	name="Stale"
	{template}
	args={{ integrations: [{ ...googleWork, status: 'stale', detail: undefined }, openMeteo], onsync: fn() }}
	play={async ({ canvasElement, args }) => {
		if (!framed(canvasElement)) return
		const canvas = canvasOf(canvasElement)
		const chip = canvas.getByRole('button', { name: chipNamed(googleWork) })
		await userEvent.click(chip)
		const dialog = await canvas.findByRole('dialog', { name: googleWork.label })
		await waitFor(() => expect(dialog).toBeVisible())
		// without a detail sentence the popover says the state in one word
		await expect(within(dialog).getByText(strings.chip.status.stale)).toBeVisible()
		await userEvent.click(within(dialog).getByRole('button', { name: strings.statusBar.syncNow }))
		await expect(args.onsync).toHaveBeenCalledWith(expect.objectContaining({ id: googleWork.id, status: 'stale' }))
		await waitFor(() => expect(dialog).not.toBeVisible())
		await waitFor(() => expect(chip).toHaveFocus())
	}}
/>

<!-- The whole sample inbox: two unread and one read; an inline action reports and closes the panel -->
<Story
	name="With unread"
	{template}
	args={{ inbox: notices }}
	play={async ({ canvasElement, args }) => {
		if (!framed(canvasElement)) return
		const canvas = canvasOf(canvasElement)
		const bell = canvas.getByRole('button', {
			name: strings.iconButton.withCount(strings.statusBar.inbox, unreadNotices.length),
		})
		await userEvent.click(bell)
		const dialog = await canvas.findByRole('dialog', { name: strings.statusBar.inbox })
		await waitFor(() => expect(dialog).toBeVisible())
		await expect(within(dialog).getAllByRole('article')).toHaveLength(notices.length)
		await expect(within(dialog).getAllByText(strings.unread)).toHaveLength(unreadNotices.length)
		await userEvent.click(within(dialog).getAllByRole('button', { name: 'Snooze' })[0]!)
		await expect(args.oninboxaction).toHaveBeenCalledWith(
			expect.objectContaining({ id: 'snooze' }),
			expect.objectContaining({ id: notices[0]!.id })
		)
		await waitFor(() => expect(dialog).not.toBeVisible())
		await waitFor(() => expect(bell).toHaveFocus())
		// an action closes the inbox too, so the app hears that as well
		await waitFor(() => expect(args.oninboxclose).toHaveBeenCalledTimes(1))
	}}
/>

<style>
	/* The bar sits at the foot of the canvas, as it does in the window, so its panels unfurl upwards from it */
	.sb-bottom {
		display: flex;
		flex-direction: column;
		justify-content: flex-end;
		min-height: calc(100dvh - 2 * var(--space-6));
	}
</style>
