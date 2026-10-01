<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf'
	import { expect, fn, waitFor, within } from 'storybook/test'
	import { canvasOf, hasCanvas } from '../../../storybook/play.js'
	import DetailSection from '../DetailPopover/DetailSection.svelte'
	import DataTable, { type DataTableCell, type DataTableColumn } from './DataTable.svelte'
	import { audit, haul, integrations, stock } from '../../../stories/sample-data.js'

	// The egress ledger for the audit day: where bytes went, by destination.
	const day = audit.when.slice(0, 5)
	const egressLabel = 'Egress by destination'
	const egressColumns: DataTableColumn[] = [
		{ label: 'Destination' },
		{ label: 'Day', muted: true },
		{ label: 'Requests', numeric: true },
		{ label: 'Bytes out', numeric: true },
	]
	const egressRows = [
		[`Anthropic (${audit.surface})`, day, '4', '18.2 kB'],
		[integrations[1]!.label, day, '12', '41.0 kB'],
		[integrations[0]!.label, day, '2', '3.1 kB'],
		['Vault → AI', day, '0', '0 B'],
	]

	// The fridge and counter, as quantities.
	const stockColumns: DataTableColumn[] = [
		{ label: 'Item' },
		{ label: 'Quantity', numeric: true },
		{ label: 'Unit', muted: true },
		{ label: 'Expiry', numeric: true },
	]
	const stockRows = stock
		.filter((item) => item.location === 'fridge' || item.location === 'counter')
		.map((item) => [item.name, item.qty, item.unit ?? '', item.expiry ?? '—'])

	// The audit log, its time column quiet.
	const auditColumns: DataTableColumn[] = [
		{ label: 'When', muted: true },
		{ label: 'Surface' },
		{ label: 'Model' },
		{ label: 'Tokens in', numeric: true },
		{ label: 'Tokens out', numeric: true },
		{ label: 'Cost', numeric: true },
	]
	const auditRows = [
		[audit.when, audit.surface, audit.model, String(audit.tokensIn), String(audit.tokensOut), audit.cost],
		[haul.capturedAt, 'Capture', audit.model, '1,980', '240', haul.cost],
	]

	// The audit log with an outcome column: a glyph and a tone say how each request ended.
	const outcomeColumns: DataTableColumn[] = [
		{ label: 'When', muted: true },
		{ label: 'Surface' },
		{ label: 'Outcome' },
		{ label: 'Tokens', numeric: true },
		{ label: 'Cost', numeric: true },
	]
	const ok: DataTableCell = { text: 'ok', icon: 'check', tone: 'positive' }
	const error: DataTableCell = { text: 'error', icon: 'triangle-alert', tone: 'danger' }
	const cutShort: DataTableCell = { text: 'cut short', icon: 'clock', tone: 'warning' }
	const outcomeRows: (string | DataTableCell)[][] = [
		[audit.when, audit.surface, ok, String(audit.tokensIn + audit.tokensOut), audit.cost],
		[haul.capturedAt, 'Capture', cutShort, '2,220', haul.cost],
		['09-29 18:04', 'Toolbench chat', error, '0', { text: '$0.00', mono: true }],
	]

	// What each outcome row unfolds to.
	const outcomeDetail = [
		[
			{ label: 'Model', value: audit.model, mono: true },
			{ label: 'Tokens', value: `${audit.tokensIn} / ${audit.tokensOut}`, mono: true },
		],
		[
			{ label: 'Model', value: audit.model, mono: true },
			{ label: 'Outcome', value: cutShort.text, icon: cutShort.icon, tone: cutShort.tone },
		],
		[{ label: 'Outcome', value: error.text, icon: error.icon, tone: error.tone }],
	]

	const { Story } = defineMeta({
		title: 'Components/Data/DataTable',
		component: DataTable,
		tags: ['autodocs'],
		args: { label: egressLabel, columns: egressColumns, rows: egressRows, showCaption: false },
	})
</script>

<Story
	name="Egress ledger"
	play={async ({ canvasElement }) => {
		const canvas = canvasOf(canvasElement)
		const table = canvas.getByRole('table', { name: egressLabel })
		await expect(table).toBeVisible()
		await expect(canvas.getAllByRole('columnheader')).toHaveLength(4)
		await expect(canvas.getAllByRole('row')).toHaveLength(5)
	}}
/>

<Story
	name="Stock quantities"
	args={{ label: 'Stock in the fridge and on the counter', columns: stockColumns, rows: stockRows }}
/>

<!-- Wider than its room (a panel open beside the page): the table scrolls inside itself -->
<Story
	name="Narrow"
	parameters={{ platforms: ['desktop'] }}
	args={{ label: 'Audit log', columns: auditColumns, rows: auditRows }}
	play={async ({ canvasElement }) => {
		if (!hasCanvas(canvasElement)) return
		const scroller = canvasElement.querySelector<HTMLElement>('.ed-table-scroll')!
		await expect(scroller.scrollWidth).toBeGreaterThan(scroller.clientWidth)
		await expect(scroller.clientWidth).toBeLessThanOrEqual(240)
	}}
>
	{#snippet template(args)}
		<div style="width: 240px">
			<DataTable {...args} />
		</div>
	{/snippet}
</Story>

<Story name="Muted column" args={{ label: 'Audit log', columns: auditColumns, rows: auditRows, showCaption: true }} />

<!-- An outcome column: the glyph and its text share a tone, and one cost cell asks for mono on its own -->
<Story
	name="Outcome cells"
	args={{ label: 'Audit log', columns: outcomeColumns, rows: outcomeRows, showCaption: true }}
	play={async ({ canvasElement }) => {
		const canvas = canvasOf(canvasElement)
		await expect(canvas.getByText(ok.text)).toBeVisible()
		await expect(canvas.getByText(error.text)).toBeVisible()
		await expect(canvas.getByText(cutShort.text)).toBeVisible()
	}}
/>

<!-- With onrow each row is a focusable target: a click, Enter or Space opens it, with its index and its element -->
<Story
	name="Clickable rows"
	args={{ label: 'Audit log', columns: outcomeColumns, rows: outcomeRows, onrow: fn() }}
	play={async ({ canvasElement, userEvent, args }) => {
		const canvas = canvasOf(canvasElement)
		const second = canvas.getByText(cutShort.text).closest('tr')!
		await expect(second).toHaveAttribute('tabindex', '0')
		await userEvent.click(second)
		await expect(args.onrow).toHaveBeenCalledTimes(1)
		await expect(args.onrow).toHaveBeenLastCalledWith(1, second)
		second.focus()
		await userEvent.keyboard('{Enter}')
		await expect(args.onrow).toHaveBeenCalledTimes(2)
		await expect(args.onrow).toHaveBeenLastCalledWith(1, expect.any(HTMLTableRowElement))
	}}
/>

<!-- With detail a row unfolds beneath itself, one at a time: a click on the row or its chevron opens and folds it -->
<Story
	name="Expandable rows"
	args={{ label: 'Audit log', columns: outcomeColumns, rows: outcomeRows }}
	play={async ({ canvasElement, userEvent }) => {
		const canvas = canvasOf(canvasElement)
		const first = canvas.getByText(ok.text).closest('tr')!
		const second = canvas.getByText(cutShort.text).closest('tr')!
		const chevron = (row: HTMLElement) => within(row).getByRole('button')
		await expect(chevron(first)).toHaveAttribute('aria-expanded', 'false')
		await userEvent.click(first)
		await expect(chevron(first)).toHaveAttribute('aria-expanded', 'true')
		await waitFor(() => expect(canvas.getByRole('group', { name: 'Request' })).toBeVisible())
		// another row opens and the first folds
		await userEvent.click(second)
		await expect(chevron(first)).toHaveAttribute('aria-expanded', 'false')
		await expect(chevron(second)).toHaveAttribute('aria-expanded', 'true')
		await waitFor(() => expect(canvas.getAllByRole('group', { name: 'Request' })).toHaveLength(1))
		// the chevron is the keyboard's way in
		chevron(second).focus()
		await userEvent.keyboard('{Enter}')
		await expect(chevron(second)).toHaveAttribute('aria-expanded', 'false')
		await waitFor(() => expect(canvas.queryByRole('group', { name: 'Request' })).toBeNull())
	}}
>
	{#snippet template(args)}
		<DataTable {...args}>
			{#snippet detail(index)}
				<DetailSection label="Request" rows={outcomeDetail[index]} />
			{/snippet}
		</DataTable>
	{/snippet}
</Story>
