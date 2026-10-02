<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf'
	import type { ComponentProps } from 'svelte'
	import { expect, fireEvent, fn, userEvent, waitFor, within } from 'storybook/test'
	import { canvasOf, hasCanvas } from '../../../storybook/play.js'
	import { formatBytes } from '$lib/files/check-files.js'
	import { defaultStrings } from '$lib/i18n/strings.js'
	import CaptureSheet, { type CaptureFile, type CapturePhase, type CaptureRow } from './CaptureSheet.svelte'
	import Button from '../Button/Button.svelte'
	import { haul, haulCategories } from '../../../stories/sample-data.js'

	type Args = ComponentProps<typeof CaptureSheet>

	const strings = defaultStrings
	const s = strings.capture

	/** A neutral stand-in for a photo, as a data URL: the app's CSP has no blob:, and a story needs no binary asset. */
	const picture = (ground: string, mark: string) =>
		'data:image/svg+xml,' +
		encodeURIComponent(
			`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 4 3"><rect width="4" height="3" fill="${ground}"/><circle cx="2" cy="1.5" r="0.6" fill="${mark}"/></svg>`
		)
	const thumbnails: Partial<Record<string, string>> = {
		'src-1': picture('#dcd8c8', '#c4c1b1'),
		'src-2': picture('#e6e3d6', '#7c8a7f'),
	}
	/** The haul's four sources: the two photos with a picture of themselves, the PDF and the pasted list without. */
	const sources: CaptureFile[] = haul.sources.map((source) => ({ ...source, thumbnail: thumbnails[source.key] }))
	const [photo, receipt, order, pasted] = sources as [CaptureFile, CaptureFile, CaptureFile, CaptureFile]

	const byId = (id: string) => haul.rows.find((row) => row.id === id)!
	/** Eggs merge into the eggs in stock; the spinach matches too, and the owner has turned its merge off. */
	const merging: CaptureRow[] = [
		byId('h-01'),
		byId('h-02'),
		{ ...byId('h-03'), merge: { name: 'Spinach', on: false } },
		byId('h-04'),
	]
	const chickenTip = 'Keep on the lowest shelf, and cook or freeze within two days of the date.'
	const tipped: CaptureRow[] = [{ ...byId('h-01'), tip: chickenTip }, byId('h-03'), byId('h-06')]
	const few = haul.rows.slice(0, 3)
	/** What a photo of the fridge found: two rows with a picture cut from it, one without; the eggs are in stock. */
	const taken: CaptureRow[] = [
		{
			...byId('h-02'),
			expiry: undefined,
			estimated: false,
			merge: { name: 'Eggs', on: true },
			thumbnail: picture('#e6e3d6', '#c9a227'),
		},
		{
			...byId('h-03'),
			expiry: undefined,
			estimated: false,
			merge: undefined,
			thumbnail: picture('#dcd8c8', '#7c8a7f'),
		},
		{ ...byId('h-04'), expiry: undefined, estimated: false, merge: undefined },
	]

	const line = `${haul.provider} · ${haul.model} · ${s.estimate(haul.cost)}`
	const trigger = 'Open the capture'
	const noKey = 'No key on this device. Add one to read a capture.'
	const unanswered = 'Anthropic did not answer. Nothing was read and nothing was stored.'

	/** A paste as the engine would send it, to whatever holds focus: text, files, or both. */
	function paste(content: { text?: string; files?: File[] }) {
		const data = new DataTransfer()
		if (content.text !== undefined) data.setData('text/plain', content.text)
		for (const file of content.files ?? []) data.items.add(file)
		const event = new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true })
		document.activeElement?.dispatchEvent(event)
		return event
	}
	/** The trigger pressed and the sheet up, under the title of its phase. */
	async function opened(canvasElement: HTMLElement, title: string) {
		const canvas = canvasOf(canvasElement)
		await userEvent.click(canvas.getByRole('button', { name: trigger }))
		const dialog = await canvas.findByRole('dialog', { name: title })
		// the panel has begun to unfurl, and the focus has moved into it; a full run under load can take past a second
		const settle = { timeout: 3000 }
		await waitFor(() => expect(within(dialog).getByRole('heading', { name: title })).toBeVisible(), settle)
		await waitFor(() => expect(dialog).toContainElement(document.activeElement as HTMLElement), settle)
		return { canvas, dialog }
	}

	const { Story } = defineMeta({
		title: 'Components/Sheets/CaptureSheet',
		component: CaptureSheet,
		tags: ['autodocs'],
		parameters: {
			platformFrame: 'inline',
			docs: {
				description: {
					component:
						'Capture in one sheet and two phases (D-13). First the sources are collected: a drop area with a file button, the staged files as chips, a paste anywhere in the sheet, and the provider, the model and the cost named beside Read. Then the rows are checked, each editable inline, before Commit. The sheet is controlled: `phase`, `files` and `rows` belong to the parent and every edit is a callback, so these stories hold the state as an app would.',
				},
			},
		},
		args: {
			phase: 'collect',
			files: [],
			rows: [],
			provider: haul.provider,
			model: haul.model,
			cost: haul.cost,
			categories: haulCategories,
			rules: { accept: ['image/*', 'application/pdf', '.pdf'], maxFiles: 6 },
			layout: 'auto',
			onfiles: fn(),
			onrejected: fn(),
			onpastetext: fn(),
			onremovefile: fn(),
			onread: fn(),
			onstop: fn(),
			onrowchange: fn(),
			onremoverow: fn(),
			onaddrow: fn(),
			onstorechange: fn(),
			oncommit: fn(),
			onclose: fn(),
		},
		argTypes: {
			phase: { control: 'inline-radio', options: ['collect', 'reading', 'rows', 'failed'] },
			kind: { control: 'inline-radio', options: ['haul', 'stock'] },
			layout: { control: 'inline-radio', options: ['auto', 'wide', 'stacked'] },
			files: { control: false },
			rows: { control: false },
		},
	})
</script>

<script lang="ts">
	// The sheet is controlled, so the stories hold its state as an app would: the trigger starts from the story's
	// args, and every callback changes the state and then reports to the story's spy.
	let open = $state(false)
	let phase = $state<CapturePhase>('collect')
	let files = $state<CaptureFile[]>([])
	let rows = $state<CaptureRow[]>([])
	let store = $state<string>()
	let serial = 0

	function start(args: Args) {
		phase = args.phase
		files = args.files
		rows = args.rows
		store = args.store
		open = true
	}
	const stage = (file: CaptureFile) => (files = [...files, file])
</script>

{#snippet settings()}
	<Button label="Open settings" variant="quiet" onclick={() => {}} />
{/snippet}

{#snippet template(args: Args)}
	<Button label={trigger} onclick={() => start(args)} />
	<CaptureSheet
		{...args}
		bind:open
		{phase}
		{files}
		{rows}
		{store}
		notice={args.blocked ? settings : undefined}
		onstorechange={(id) => {
			store = id
			args.onstorechange?.(id)
		}}
		onfiles={(picked) => {
			for (const file of picked) stage({ key: `new-${++serial}`, name: file.name, detail: formatBytes(file.size) })
			args.onfiles?.(picked)
		}}
		onpastetext={(text) => {
			stage({ key: `new-${++serial}`, name: 'Pasted text', detail: `${text.split('\n').length} lines` })
			args.onpastetext?.(text)
		}}
		onremovefile={(key) => {
			files = files.filter((file) => file.key !== key)
			args.onremovefile?.(key)
		}}
		onread={() => {
			phase = 'reading'
			args.onread?.()
		}}
		onstop={() => {
			phase = 'collect'
			args.onstop?.()
		}}
		onrowchange={(id, patch) => {
			rows = rows.map((row) => (row.id === id ? { ...row, ...patch } : row))
			args.onrowchange?.(id, patch)
		}}
		onremoverow={(id) => {
			rows = rows.filter((row) => row.id !== id)
			args.onremoverow?.(id)
		}}
		onaddrow={() => {
			rows = [...rows, { id: `new-${++serial}`, name: '', qty: '1', location: 'pantry' }]
			args.onaddrow?.()
		}}
		oncommit={() => {
			args.oncommit?.()
			open = false
		}}
	/>
{/snippet}

<!-- Nothing staged: the invitation, the file button, the provider line, and Read off. A pasted list is text for the
     app; a pasted photo is a file, held to the same rules as a drop, and a refusal is reported with its reason -->
<Story
	name="Collect empty"
	{template}
	play={async ({ canvasElement, args }) => {
		const { canvas } = await opened(canvasElement, s.collectTitle)
		await expect(canvas.getByText(s.invite)).toBeVisible()
		await expect(canvas.getByRole('button', { name: s.chooseFiles })).toBeVisible()
		await expect(canvas.getByText(line)).toBeVisible()
		const read = canvas.getByRole('button', { name: s.read })
		await expect(read).toBeDisabled()

		const list = paste({ text: 'eggs 12\nspinach 200 g' })
		await expect(list.defaultPrevented).toBe(true)
		await expect(args.onpastetext).toHaveBeenCalledWith('eggs 12\nspinach 200 g')
		await expect(await canvas.findByText('Pasted text')).toBeVisible()
		await expect(read).toBeEnabled()

		const png = new File(['1234'], 'bags.png', { type: 'image/png' })
		const clip = new File(['12'], 'clip.mp4', { type: 'video/mp4' })
		paste({ files: [png, clip] })
		await expect(args.onfiles).toHaveBeenLastCalledWith([png])
		await expect(args.onrejected).toHaveBeenLastCalledWith([{ file: clip, reason: 'type' }])
		await expect(await canvas.findByText('bags.png')).toBeVisible()
	}}
/>

<!-- A haul photo, a receipt photo, a PDF and pasted text, each with a cross; Read hands them over, and while the
     provider reads the sources stay, without their crosses, beside a status and Stop -->
<Story
	name="Staged"
	args={{ files: sources }}
	{template}
	play={async ({ canvasElement, args }) => {
		const { canvas, dialog } = await opened(canvasElement, s.collectTitle)
		const list = canvas.getByRole('list', { name: s.sources })
		await expect(within(list).getAllByRole('listitem')).toHaveLength(sources.length)
		// the cross takes a source back, and its focus goes to the one before it
		await userEvent.click(canvas.getByRole('button', { name: strings.remove(pasted.name) }))
		await expect(args.onremovefile).toHaveBeenCalledWith(pasted.key)
		await expect(within(list).getAllByRole('listitem')).toHaveLength(sources.length - 1)
		await waitFor(() => expect(canvas.getByRole('button', { name: strings.remove(order.name) })).toHaveFocus())

		await userEvent.click(canvas.getByRole('button', { name: s.read }))
		await expect(args.onread).toHaveBeenCalledTimes(1)
		await expect(await canvas.findByRole('status')).toHaveTextContent(s.reading)
		await expect(canvas.getByText(photo.name)).toBeVisible()
		await expect(canvas.queryByRole('button', { name: strings.remove(photo.name) })).toBeNull()
		// the pressed button is gone, and the focus it held stays in the sheet
		await waitFor(() => expect(dialog).toContainElement(document.activeElement as HTMLElement))

		await userEvent.click(canvas.getByRole('button', { name: strings.gardener.stop }))
		await expect(args.onstop).toHaveBeenCalledTimes(1)
		await expect(await canvas.findByRole('button', { name: s.read })).toBeEnabled()
	}}
/>

<!-- A file still being measured holds Read back -->
<Story
	name="Measuring"
	args={{ files: [photo, { ...receipt, detail: undefined, busy: true }] }}
	{template}
	play={async ({ canvasElement }) => {
		const { canvas } = await opened(canvasElement, s.collectTitle)
		await expect(canvas.getByText(receipt.name)).toBeVisible()
		await expect(canvas.getByRole('button', { name: s.read })).toBeDisabled()
	}}
/>

<!-- No key on this device: the reason stands where the provider line would, the app's own line beneath it, Read off -->
<Story
	name="Blocked"
	args={{ files: sources, blocked: noKey }}
	{template}
	play={async ({ canvasElement }) => {
		const { canvas } = await opened(canvasElement, s.collectTitle)
		await expect(canvas.getByText(noKey)).toBeVisible()
		await expect(canvas.queryByText(line)).toBeNull()
		await expect(canvas.getByRole('button', { name: 'Open settings' })).toBeVisible()
		await expect(canvas.getByRole('button', { name: s.read })).toBeDisabled()
	}}
/>

<!-- The provider has the sources: a spinner with its status, Stop, and no rows yet; Escape discards -->
<Story
	name="Reading"
	args={{ phase: 'reading', files: sources }}
	{template}
	play={async ({ canvasElement, args }) => {
		const { canvas, dialog } = await opened(canvasElement, s.collectTitle)
		await expect(canvas.getByRole('status')).toHaveTextContent(s.reading)
		await expect(canvas.getByRole('button', { name: strings.gardener.stop })).toBeVisible()
		await expect(canvas.queryByRole('button', { name: s.read })).toBeNull()
		await expect(canvas.queryByRole('list', { name: s.draftRows })).toBeNull()
		await userEvent.keyboard('{Escape}')
		// the sheet fades, closes, and only then reports
		await waitFor(() => expect(args.onclose).toHaveBeenCalledTimes(1))
		await expect(dialog).not.toBeVisible()
	}}
/>

<!-- The read did not come back: what went wrong beside Retry, the sources kept, Discard at the foot -->
<Story
	name="Failed"
	args={{ phase: 'failed', files: sources, error: unanswered }}
	{template}
	play={async ({ canvasElement, args }) => {
		const { canvas } = await opened(canvasElement, s.collectTitle)
		await expect(canvas.getByRole('alert')).toHaveTextContent(unanswered)
		await expect(canvas.getByText(photo.name)).toBeVisible()
		await expect(canvas.getByRole('button', { name: strings.discard })).toBeVisible()
		await userEvent.click(canvas.getByRole('button', { name: strings.retry }))
		await expect(args.onread).toHaveBeenCalledTimes(1)
		await expect(await canvas.findByRole('status')).toHaveTextContent(s.reading)
	}}
/>

<!-- The rows as read, the sources' thumbnails beside them. Every edit is a patch: a name, an expiry (which is then
     no longer a guess), a category from the chip's menu; removing a row updates the counts; Commit reports and
     leaves the closing to the parent -->
<Story
	name="Rows"
	args={{ phase: 'rows', files: sources, rows: haul.rows }}
	{template}
	play={async ({ canvasElement, args }) => {
		const { canvas, dialog } = await opened(canvasElement, s.title)
		await expect(canvas.getByText(s.readBy(line))).toBeVisible()
		await expect(canvas.getByRole('img', { name: photo.name })).toBeVisible()
		const list = canvas.getByRole('list', { name: s.draftRows })
		const items = within(list).getAllByRole('listitem')
		await expect(items).toHaveLength(haul.rows.length)
		const note = canvas.getByRole('status')
		await expect(note).toHaveTextContent('9 to create, 2 to merge')

		const chicken = within(items[0]!)
		const name = chicken.getByRole('textbox', { name: s.rowName })
		await userEvent.type(name, ', boneless')
		await expect(args.onrowchange).toHaveBeenLastCalledWith('h-01', { name: 'Chicken thighs, boneless' })
		await expect(name).toHaveValue('Chicken thighs, boneless')
		await expect(chicken.getByRole('textbox', { name: s.rowQty })).toHaveValue('900')
		await expect(chicken.getByRole('textbox', { name: s.rowUnit })).toHaveValue('g')

		const lemons = within(items[4]!)
		await expect(lemons.getByText(strings.access.estimated)).toBeVisible()
		const expiry = lemons.getByLabelText(s.rowExpiry)
		await expect(expiry).toHaveValue('2026-10-09')
		await fireEvent.input(expiry, { target: { value: '2026-10-12' } })
		await expect(args.onrowchange).toHaveBeenLastCalledWith('h-05', { expiry: '2026-10-12', estimated: false })
		await waitFor(() => expect(lemons.queryByText(strings.access.estimated)).toBeNull())

		// Escape in the category menu closes the menu, never the capture
		const chip = lemons.getByRole('button', { name: s.categoryNamed('Produce') })
		await userEvent.click(chip)
		const layer = (await canvas.findByRole('menu')).closest<HTMLElement>('[popover], dialog')!
		await waitFor(() => expect(layer).toContainElement(document.activeElement as HTMLElement))
		await userEvent.keyboard('{Escape}')
		await waitFor(() => expect(canvas.queryByRole('menu')).toBeNull())
		await expect(args.onclose).not.toHaveBeenCalled()
		await expect(list).toBeVisible()
		await userEvent.click(chip)
		await userEvent.click(await canvas.findByRole('menuitem', { name: 'Condiments and spices' }))
		await waitFor(() =>
			expect(args.onrowchange).toHaveBeenLastCalledWith('h-05', { category: 'condiments-and-spices' })
		)
		await expect(lemons.getByRole('button', { name: s.categoryNamed('Condiments and spices') })).toBeVisible()
		// the tofu has no category yet: the chip says so
		await expect(within(items[5]!).getByRole('button', { name: s.category })).toBeVisible()

		await userEvent.click(canvas.getByRole('button', { name: strings.remove('Napkins') }))
		await expect(args.onremoverow).toHaveBeenCalledWith('h-11')
		await expect(within(list).getAllByRole('listitem')).toHaveLength(haul.rows.length - 1)
		await expect(note).toHaveTextContent('8 to create, 2 to merge')

		await userEvent.click(canvas.getByRole('button', { name: strings.commit }))
		await expect(args.oncommit).toHaveBeenCalledTimes(1)
		await waitFor(() => expect(dialog).not.toBeVisible())
		await expect(args.onclose).not.toHaveBeenCalled()
	}}
/>

<!-- A haul read from a receipt: the store it was bought at under the provider line, behind a chip whose menu
     changes it, and on each row the brand, the package's size and what one cost. With no store picked the prices
     have nowhere to be remembered, and the sheet says so -->
<Story
	name="Bought at a store"
	args={{ phase: 'rows', files: [receipt], rows: haul.rows.slice(3, 6), stores: haul.stores, store: haul.store }}
	{template}
	play={async ({ canvasElement, args }) => {
		const { canvas } = await opened(canvasElement, s.title)
		const chip = canvas.getByRole('button', { name: s.boughtAt('H-E-B') })
		await expect(chip).toBeVisible()
		const items = within(canvas.getByRole('list', { name: s.draftRows })).getAllByRole('listitem')
		const yogurt = within(items[0]!)
		await expect(yogurt.getByRole('textbox', { name: s.rowBrand })).toHaveValue('Fage')
		await expect(yogurt.getByRole('textbox', { name: s.rowSize })).toHaveValue('500 g')
		const price = yogurt.getByRole('textbox', { name: s.rowPrice })
		await expect(price).toHaveValue('5.49')
		await fireEvent.input(price, { target: { value: '5,99' } })
		await expect(args.onrowchange).toHaveBeenLastCalledWith('h-04', { price: 5.99 })
		// the tofu was on no receipt line: its price is empty, and a brand typed for it is a patch like any other
		const tofu = within(items[2]!)
		await expect(tofu.getByRole('textbox', { name: s.rowPrice })).toHaveValue('')
		await userEvent.type(tofu.getByRole('textbox', { name: s.rowBrand }), 'Hodo')
		await expect(args.onrowchange).toHaveBeenLastCalledWith('h-06', { brand: 'Hodo' })

		await userEvent.click(chip)
		await userEvent.click(await canvas.findByRole('menuitem', { name: s.noStore }))
		await waitFor(() => expect(args.onstorechange).toHaveBeenLastCalledWith(undefined))
		await expect(canvas.getByRole('button', { name: s.pickStore })).toBeVisible()
		await expect(canvas.getByText(s.pricesNeedStore)).toBeVisible()
	}}
/>

<!-- The receipt names a shop that is not one of the owner's: no store is picked, and the name it read is said -->
<Story
	name="Store not known"
	args={{
		phase: 'rows',
		files: [receipt],
		rows: haul.rows.slice(3, 6),
		stores: haul.stores,
		storeHint: 'Costco Wholesale',
	}}
	{template}
	play={async ({ canvasElement }) => {
		const { canvas } = await opened(canvasElement, s.title)
		await expect(canvas.getByRole('button', { name: s.pickStore })).toBeVisible()
		await expect(canvas.getByText(s.storeRead('Costco Wholesale'))).toBeVisible()
	}}
/>

<!-- Taking stock shows no prices and no store: the shelves were not bought today -->
<Story
	name="Stock has no prices"
	args={{ kind: 'stock', phase: 'rows', files: [photo], rows: taken, stores: haul.stores }}
	{template}
	play={async ({ canvasElement }) => {
		const { canvas } = await opened(canvasElement, s.stock.title)
		await expect(canvas.queryByRole('textbox', { name: s.rowPrice })).toBeNull()
		await expect(canvas.queryByRole('button', { name: s.pickStore })).toBeNull()
		await expect(canvas.getAllByRole('textbox', { name: s.rowBrand }).length).toBeGreaterThan(0)
	}}
/>

<!-- A row that matches a stock item sits on brand-muted behind its merge switch; switched off it reads as a new
     item and counts as one. The location radios move with the arrow keys -->
<Story
	name="With merges"
	args={{ phase: 'rows', files: [photo], rows: merging }}
	{template}
	play={async ({ canvasElement, args }) => {
		const { canvas } = await opened(canvasElement, s.title)
		const note = canvas.getByRole('status')
		await expect(note).toHaveTextContent('3 to create, 1 to merge')
		const eggs = canvas.getByRole('switch', { name: s.mergeWith('Eggs') })
		const spinach = canvas.getByRole('switch', { name: s.mergeWith('Spinach') })
		await expect(eggs).toBeChecked()
		await expect(spinach).not.toBeChecked()
		await userEvent.click(spinach)
		await expect(args.onrowchange).toHaveBeenLastCalledWith('h-03', { merge: { name: 'Spinach', on: true } })
		await expect(spinach).toBeChecked()
		await expect(note).toHaveTextContent('2 to create, 2 to merge')
		await userEvent.click(eggs)
		await expect(note).toHaveTextContent('3 to create, 1 to merge')

		const group = canvas.getByRole('radiogroup', { name: s.location('Eggs') })
		const fridge = within(group).getByRole('radio', { name: s.locations.fridge })
		await expect(fridge).toHaveAttribute('aria-checked', 'true')
		await userEvent.click(fridge)
		await userEvent.keyboard('{ArrowRight}')
		const freezer = within(group).getByRole('radio', { name: s.locations.freezer })
		await expect(freezer).toHaveFocus()
		await expect(freezer).toHaveAttribute('aria-checked', 'true')
		await expect(fridge).toHaveAttribute('aria-checked', 'false')
		await expect(args.onrowchange).toHaveBeenLastCalledWith('h-02', { location: 'freezer' })
		await userEvent.keyboard('{End}')
		await expect(within(group).getByRole('radio', { name: s.locations.household })).toHaveAttribute(
			'aria-checked',
			'true'
		)
	}}
/>

<!-- Taking stock: the same sheet worded for photos of the shelves as they stand. A row that matches a stock item
     brings it up to date, and the foot counts updates. A row seen in a photo carries its picture, cut from it; once
     any row has one, a row without keeps the place, so the names stay in a column -->
<Story
	name="Take stock"
	args={{ kind: 'stock', phase: 'rows', files: [photo], rows: taken }}
	{template}
	play={async ({ canvasElement }) => {
		const { canvas, dialog } = await opened(canvasElement, s.stock.title)
		await expect(canvas.getByRole('status')).toHaveTextContent('2 to create, 1 to update')
		await expect(canvas.getByRole('switch', { name: s.stock.mergeWith('Eggs') })).toBeChecked()
		const pictures = dialog.querySelectorAll('.ed-capture-pic')
		await expect(pictures).toHaveLength(3)
		await expect(dialog.querySelectorAll('img.ed-capture-pic')).toHaveLength(2)
		await userEvent.click(canvas.getByRole('switch', { name: s.stock.mergeWith('Eggs') }))
		await expect(canvas.getByRole('status')).toHaveTextContent('3 to create')
	}}
/>

<!-- Taking stock, before anything is staged: the invitation asks for the shelves, not for a receipt -->
<Story
	name="Take stock, empty"
	args={{ kind: 'stock' }}
	{template}
	play={async ({ canvasElement }) => {
		const { canvas } = await opened(canvasElement, s.stock.collectTitle)
		await expect(canvas.getByText(s.stock.invite)).toBeVisible()
		await expect(canvas.getByRole('button', { name: s.read })).toBeDisabled()
	}}
/>

<!-- A row with a tip carries an info glyph named after it; its tooltip is the tip -->
<Story
	name="With tips"
	args={{ phase: 'rows', files: [photo, receipt], rows: tipped }}
	{template}
	play={async ({ canvasElement }) => {
		const { canvas } = await opened(canvasElement, s.title)
		const about = canvas.getByRole('button', { name: strings.about('Chicken thighs') })
		await expect(canvas.getByRole('button', { name: strings.about('Spinach') })).toBeVisible()
		await expect(canvas.queryByRole('button', { name: strings.about('Tofu') })).toBeNull()
		await userEvent.click(about)
		const tip = await within(document.body).findByText(chickenTip)
		await waitFor(() => expect(tip).toBeVisible())
		await expect(about).toHaveAttribute('aria-describedby', tip.closest('[role="tooltip"]')?.id)
		await userEvent.click(about)
	}}
/>

<!-- Once every row is removed the footer says so and Commit is off; a row can still be added, and its name takes
     focus; Discard calls onclose -->
<Story
	name="All removed"
	args={{ phase: 'rows', files: [photo], rows: few }}
	{template}
	play={async ({ canvasElement, args }) => {
		const { canvas, dialog } = await opened(canvasElement, s.title)
		for (const row of few) await userEvent.click(canvas.getByRole('button', { name: strings.remove(row.name) }))
		await expect(canvas.getByRole('status')).toHaveTextContent(s.everyRowRemoved)
		await expect(canvas.queryByRole('list', { name: s.draftRows })).toBeNull()
		const commit = canvas.getByRole('button', { name: strings.commit })
		await expect(commit).toBeDisabled()
		await waitFor(() => expect(dialog).toContainElement(document.activeElement as HTMLElement))

		await userEvent.click(canvas.getByRole('button', { name: s.addRow }))
		await expect(args.onaddrow).toHaveBeenCalledTimes(1)
		const name = await canvas.findByRole('textbox', { name: s.rowName })
		await waitFor(() => expect(name).toHaveFocus())
		await expect(canvas.getByRole('button', { name: strings.remove(s.unnamed) })).toBeVisible()
		await expect(commit).toBeEnabled()

		await userEvent.click(canvas.getByRole('button', { name: strings.discard }))
		await expect(args.onclose).toHaveBeenCalledTimes(1)
		await expect(args.oncommit).not.toHaveBeenCalled()
	}}
/>

<!-- The phone: a full-height sheet, the invitation without the drop, the staged files beneath it -->
<Story
	name="Mobile collect"
	args={{ files: sources }}
	parameters={{ platforms: ['mobile'] }}
	{template}
	play={async ({ canvasElement }) => {
		if (!hasCanvas(canvasElement)) return
		const { canvas } = await opened(canvasElement, s.collectTitle)
		await expect(canvas.getByText(s.inviteHintTouch)).toBeVisible()
		await expect(canvas.getByRole('button', { name: s.read })).toBeEnabled()
	}}
/>

<!-- The phone has no page to paste onto and nothing to drop: a haul's collect step carries a field for the text, and
     Add hands it to the same callback a paste feeds. The sheet opens without the keyboard, and the file button
     offers the camera -->
<Story
	name="Mobile paste"
	parameters={{ platforms: ['mobile'] }}
	{template}
	play={async ({ canvasElement, args }) => {
		if (!hasCanvas(canvasElement)) return
		const { canvas, dialog } = await opened(canvasElement, s.collectTitle)
		const field = canvas.getByRole('textbox', { name: s.pasteLabel })
		await expect(field).not.toHaveFocus()
		const add = canvas.getByRole('button', { name: strings.add })
		await expect(add).toBeDisabled()
		await userEvent.type(field, 'limes x6{Enter}oat milk')
		await userEvent.click(add)
		await expect(args.onpastetext).toHaveBeenLastCalledWith('limes x6\noat milk')
		await expect(field).toHaveValue('')
		await expect(await within(dialog).findByText('Pasted text')).toBeVisible()
		await expect(canvas.getByRole('button', { name: s.read })).toBeEnabled()
		// a paste into the field is the field's own: it is not taken as a source until Add
		const calls = (args.onpastetext as ReturnType<typeof fn>).mock.calls.length
		field.focus()
		paste({ text: 'eggs 12' })
		await expect(args.onpastetext).toHaveBeenCalledTimes(calls)
		// the file button's menu leads with the camera on the phone
		await userEvent.click(canvas.getByRole('button', { name: s.chooseFiles }))
		await waitFor(() => expect(canvas.getByText(strings.file.takePhoto)).toBeVisible())
		await expect(canvas.getByText(strings.file.fromLibrary)).toBeVisible()
	}}
/>

<!-- The wide layout keeps paste-anywhere and shows no field; taking stock reads photos only and shows none either -->
<Story
	name="No paste field"
	args={{ kind: 'stock' }}
	parameters={{ platforms: ['mobile'] }}
	{template}
	play={async ({ canvasElement }) => {
		if (!hasCanvas(canvasElement)) return
		const { canvas } = await opened(canvasElement, s.stock.collectTitle)
		await expect(canvas.queryByRole('textbox', { name: s.pasteLabel })).toBeNull()
	}}
/>

<!-- The phone: the thumbnails a strip above the rows, each row on several lines, nothing wider than the sheet -->
<Story
	name="Mobile rows"
	args={{ phase: 'rows', files: sources, rows: haul.rows }}
	parameters={{ platforms: ['mobile'] }}
	{template}
	play={async ({ canvasElement }) => {
		if (!hasCanvas(canvasElement)) return
		const { canvas, dialog } = await opened(canvasElement, s.title)
		const list = canvas.getByRole('list', { name: s.draftRows })
		await expect(within(list).getAllByRole('listitem')).toHaveLength(haul.rows.length)
		const body = dialog.querySelector<HTMLElement>('.ed-sheet-body')!
		await expect(body.scrollWidth).toBeLessThanOrEqual(body.clientWidth)
	}}
/>
