<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf'
	import { expect } from 'storybook/test'
	import { canvasOf } from '../../../storybook/play.js'
	import DataTable, { type DataTableColumn } from './DataTable.svelte'
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

<Story name="Muted column" args={{ label: 'Audit log', columns: auditColumns, rows: auditRows, showCaption: true }} />
