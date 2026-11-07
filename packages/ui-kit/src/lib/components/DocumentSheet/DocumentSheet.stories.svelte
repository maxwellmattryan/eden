<script module lang="ts">
	import { tick, type ComponentProps } from 'svelte'
	import { defineMeta } from '@storybook/addon-svelte-csf'
	import { expect, fn, userEvent, waitFor, within } from 'storybook/test'
	import { hasCanvas } from '../../../storybook/play.js'
	import { defaultStrings, type UiStringsOverride } from '$lib/i18n/strings.js'
	import UiKitProvider from '$lib/i18n/UiKitProvider.svelte'
	import { platformOf } from '$lib/internal/platform.js'
	import { orchardLetter } from '../../../stories/sample-data.js'
	import DocumentSheet from './DocumentSheet.svelte'

	const s = defaultStrings.document
	const confirmLabel = 'Draft the bill'
	const next = 'The Gardener drafts a bill from this text. Nothing is saved until you confirm the draft.'
	const file = { name: orchardLetter.file, detail: orchardLetter.detail }

	const ja: UiStringsOverride = {
		cancel: 'キャンセル',
		close: '閉じる',
		document: {
			title: '書類を読み取る',
			invite: '手紙、明細書、給与明細をドロップ',
			inviteHint: 'PDFまたは画像',
			choose: 'ファイルを選ぶ',
			onDevice: 'このデバイスで読み取ります。確認するまで外には出ません。',
			reading: 'このデバイスで読み取り中',
			textLabel: '書類から読み取ったテキスト',
			masked: (n) => `${n}件の番号を下4桁だけ残して伏せました`,
			cutShort: (read, total) => `全${total}ページのうち最初の${read}ページを読み取りました`,
			nextTitle: 'このあとのこと',
			readBadly: '一部をうまく読み取れませんでした。テキストを確認するか、代わりに画像を送ってください。',
			sendPicture: '代わりに画像を送る',
		},
	}

	/** The sheet, once it is up under its title. */
	async function sheet(canvasElement: HTMLElement, title = s.title) {
		const dialog = await within(canvasElement.ownerDocument.body).findByRole('dialog', { name: title })
		await waitFor(() => expect(within(dialog).getByRole('heading', { name: title })).toBeVisible())
		return { dialog, pane: within(dialog) }
	}

	/** The footer's buttons, by name, in the order they are laid out. */
	function footer(dialog: HTMLElement) {
		const actions = dialog.querySelector<HTMLElement>('.ed-document-actions')!
		return within(actions)
			.getAllByRole('button')
			.map((button) => button.textContent?.trim())
	}

	/** A drag over the zone and its drop, as the engine would send them (as the Dropzone's own stories send them). */
	async function drop(target: HTMLElement, files: File[]) {
		for (const type of ['dragenter', 'drop'] as const) {
			const event = new DragEvent(type, { bubbles: true, cancelable: true })
			const dataTransfer = {
				types: ['Files'],
				items: files.map((f) => ({ kind: 'file', type: f.type })),
				files,
				dropEffect: 'none',
			}
			Object.defineProperty(event, 'dataTransfer', { value: dataTransfer })
			target.dispatchEvent(event)
			await tick()
		}
	}
	const pdf = (name: string) => new File(['%PDF-1.7'], name, { type: 'application/pdf' })

	const { Story } = defineMeta({
		title: 'Components/Sheets/DocumentSheet',
		component: DocumentSheet,
		tags: ['autodocs'],
		parameters: {
			// a sheet is in the top layer, which no frame can contain
			platformFrame: 'inline',
			docs: {
				description: {
					component:
						'The document reader’s sheet (D-190). A letter, statement or pay stub is dropped or chosen, read on this device with its account numbers masked to their last four digits, and shown as editable text to check before the caller acts on it. Where it read badly, or could not be read, the picture can go instead; a file read before is known by its fingerprint and not read again. The sheet is controlled: `phase` and the rest belong to the parent, every act is a callback, and the parent closes it.',
				},
			},
		},
		args: {
			open: true,
			phase: 'collect',
			confirmLabel,
			next,
			onfiles: fn(),
			onconfirm: fn(),
			onsendpicture: fn(),
			oncancel: fn(),
			onclose: fn(),
		},
	})
</script>

{#snippet template(args: ComponentProps<typeof DocumentSheet>)}
	<DocumentSheet {...args} />
{/snippet}

<!-- Nothing chosen yet: drop or choose one document, read on this device -->
<Story
	name="Collect"
	{template}
	play={async ({ canvasElement }) => {
		if (!hasCanvas(canvasElement)) return
		const { dialog, pane } = await sheet(canvasElement)
		await expect(pane.getByText(s.invite)).toBeVisible()
		await expect(pane.getByText(s.inviteHint)).toBeVisible()
		await expect(pane.getByRole('button', { name: s.choose })).toBeVisible()
		await expect(pane.getByText(s.onDevice)).toBeVisible()
		await expect(footer(dialog)).toEqual(['Cancel'])
	}}
/>

<!-- Two files dropped at once: none is read, the sheet says one at a time, and one dropped next goes through -->
<Story
	name="Several files"
	{template}
	play={async ({ canvasElement, args }) => {
		if (!hasCanvas(canvasElement)) return
		const { dialog, pane } = await sheet(canvasElement)
		const zone = dialog.querySelector<HTMLElement>('.ed-dropzone')!
		await drop(zone, [pdf('one.pdf'), pdf('two.pdf')])
		await waitFor(() => expect(pane.getByText(s.failures.several)).toBeVisible())
		await expect(args.onfiles).not.toHaveBeenCalled()
		await drop(zone, [pdf('one.pdf')])
		await waitFor(() => expect(pane.queryByText(s.failures.several)).toBeNull())
		await expect(args.onfiles).toHaveBeenCalledTimes(1)
	}}
/>

<!-- A type the reader refuses: its own line under the zone, which stays usable -->
<Story
	name="Refused type"
	{template}
	args={{ failure: 'unsupported' }}
	play={async ({ canvasElement }) => {
		if (!hasCanvas(canvasElement)) return
		const { pane } = await sheet(canvasElement)
		await expect(pane.getByText(s.failures.unsupported)).toBeVisible()
		await expect(pane.getByRole('button', { name: s.choose })).toBeEnabled()
	}}
/>

<!-- The letter being read on the device: its chip busy, a status, only Cancel -->
<Story
	name="Reading"
	{template}
	args={{ phase: 'reading', file }}
	play={async ({ canvasElement }) => {
		if (!hasCanvas(canvasElement)) return
		const { dialog, pane } = await sheet(canvasElement)
		const live = pane.getByText(s.reading).closest<HTMLElement>('[role="status"]')!
		await expect(within(live).getByText(s.reading)).toBeVisible()
		await expect(within(live).getByText(orchardLetter.file)).toBeVisible()
		await expect(footer(dialog)).toEqual(['Cancel'])
	}}
/>

<!-- The text read, two numbers masked, ready for the caller; the phone stacks the buttons, the primary first -->
<Story
	name="Read"
	{template}
	args={{
		phase: 'read',
		file,
		text: orchardLetter.text,
		masked: orchardLetter.masked,
		pages: { read: 1, total: 1 },
		provider: orchardLetter.provider,
		cost: orchardLetter.cost,
	}}
	play={async ({ canvasElement, args }) => {
		if (!hasCanvas(canvasElement)) return
		const { dialog, pane } = await sheet(canvasElement)
		const field = pane.getByRole('textbox', { name: s.textLabel }) as HTMLTextAreaElement
		await expect(field.value).toContain('Account number: ••••7781')
		await expect(pane.getByText(s.masked(2))).toBeVisible()
		await expect(pane.queryByText(/^Read the first/)).toBeNull()
		await expect(pane.getByRole('heading', { name: s.nextTitle })).toBeVisible()
		await expect(pane.getByText(next)).toBeVisible()
		await expect(pane.getByText('Claude Sonnet · about $0.01')).toBeVisible()

		// the canvas names the platform the project pins; the phone stacks the buttons, the primary first
		const phone = canvasElement.querySelector('.ed-canvas')?.getAttribute('data-platform') === 'mobile'
		await expect(platformOf(dialog)).toBe(phone ? 'mobile' : 'desktop')
		const order = phone ? [confirmLabel, s.sendPicture, 'Cancel'] : [s.sendPicture, 'Cancel', confirmLabel]
		await expect(footer(dialog)).toEqual(order)
		await expect(dialog.querySelector('.ed-document-actions')!.classList.contains('ed-document-stacked')).toBe(phone)
		const confirm = pane.getByRole('button', { name: confirmLabel })
		await expect(confirm).toHaveClass('ed-btn-primary')

		await userEvent.type(field, '\nChecked.')
		await userEvent.click(confirm)
		await expect(args.onconfirm).toHaveBeenCalledWith(`${orchardLetter.text}\nChecked.`)
		await userEvent.click(pane.getByRole('button', { name: s.sendPicture }))
		await expect(args.onsendpicture).toHaveBeenCalledTimes(1)

		await userEvent.clear(field)
		await expect(confirm).toBeDisabled()
		await userEvent.type(field, '   ')
		await expect(confirm).toBeDisabled()
	}}
/>

<!-- Read badly: the warning, the picture offered first, the caller's button still there -->
<Story
	name="Read badly"
	{template}
	args={{ phase: 'read', quality: 'poor', file, text: orchardLetter.garbled, masked: orchardLetter.masked }}
	play={async ({ canvasElement }) => {
		if (!hasCanvas(canvasElement)) return
		const { pane } = await sheet(canvasElement)
		await expect(pane.getByText(s.readBadly)).toBeVisible()
		await expect(pane.getByRole('button', { name: s.sendPicture })).toHaveClass('ed-btn-primary')
		await expect(pane.getByRole('button', { name: confirmLabel })).toHaveClass('ed-btn-secondary')
	}}
/>

<!-- Could not read: no text was found, so the picture is offered, and Cancel -->
<Story
	name="Could not read"
	{template}
	args={{ phase: 'failed', failure: 'no-text', file }}
	play={async ({ canvasElement, args }) => {
		if (!hasCanvas(canvasElement)) return
		const { dialog, pane } = await sheet(canvasElement)
		await expect(pane.getByText(s.failures.noText)).toBeVisible()
		await expect(pane.queryByRole('textbox')).toBeNull()
		await expect([...footer(dialog)].sort()).toEqual(['Cancel', s.sendPicture].sort())
		await expect(pane.getByRole('button', { name: s.sendPicture })).toHaveClass('ed-btn-primary')
		await userEvent.click(pane.getByRole('button', { name: s.sendPicture }))
		await expect(args.onsendpicture).toHaveBeenCalledTimes(1)
	}}
/>

<!-- A PDF behind a password: the picture would not help, so only Cancel -->
<Story
	name="Locked"
	{template}
	args={{ phase: 'failed', failure: 'locked', file }}
	play={async ({ canvasElement, args }) => {
		if (!hasCanvas(canvasElement)) return
		const { dialog, pane } = await sheet(canvasElement)
		await expect(pane.getByText(s.failures.locked)).toBeVisible()
		await expect(footer(dialog)).toEqual(['Cancel'])
		await userEvent.click(pane.getByRole('button', { name: 'Cancel' }))
		await expect(args.oncancel).toHaveBeenCalledTimes(1)
	}}
/>

<!-- The same file read before: its fingerprint is known, so it is not read again; only Close -->
<Story
	name="Already imported"
	{template}
	args={{
		phase: 'imported',
		file,
		imported: { day: 'Tue 22 Sep', detail: 'It made the Austin Energy bill for September.' },
	}}
	play={async ({ canvasElement, args }) => {
		if (!hasCanvas(canvasElement)) return
		const { dialog, pane } = await sheet(canvasElement)
		await expect(pane.getByText(s.importedOn('Tue 22 Sep'))).toBeVisible()
		await expect(pane.getByText('It made the Austin Energy bill for September.')).toBeVisible()
		await expect(footer(dialog)).toEqual(['Close'])
		await userEvent.click(pane.getByRole('button', { name: 'Close' }))
		await expect(args.onclose).toHaveBeenCalled()
	}}
/>

<!-- A long scan read only to the cap: the line says how far; nothing was masked, so that line is left out -->
<Story
	name="Cut short"
	{template}
	args={{
		phase: 'read',
		file: { name: 'statement-2026.pdf', detail: 'PDF · 34 pages' },
		text: 'Statement for the year\nOpening balance carried forward',
		masked: 0,
		pages: { read: 20, total: 34 },
	}}
	play={async ({ canvasElement }) => {
		if (!hasCanvas(canvasElement)) return
		const { pane } = await sheet(canvasElement)
		await expect(pane.getByText(s.cutShort(20, 34))).toBeVisible()
		await expect(pane.queryByText(/masked to/)).toBeNull()
	}}
/>

<!-- The kit's own words in Japanese, through UiKitProvider as the app passes them -->
<Story
	name="Japanese strings"
	args={{
		phase: 'read',
		file,
		text: orchardLetter.text,
		masked: 2,
		pages: { read: 20, total: 34 },
		confirmLabel: '請求書を下書きする',
		next: '庭師がこのテキストから請求書を下書きします。',
	}}
	play={async ({ canvasElement }) => {
		if (!hasCanvas(canvasElement)) return
		const { pane } = await sheet(canvasElement, '書類を読み取る')
		await expect(pane.getByRole('textbox', { name: '書類から読み取ったテキスト' })).toBeVisible()
		await expect(pane.getByText('2件の番号を下4桁だけ残して伏せました')).toBeVisible()
		await expect(pane.getByText('全34ページのうち最初の20ページを読み取りました')).toBeVisible()
		await expect(pane.getByRole('button', { name: '代わりに画像を送る' })).toBeVisible()
		await expect(pane.getByRole('button', { name: 'キャンセル' })).toBeVisible()
	}}
>
	{#snippet template(args)}
		<UiKitProvider strings={ja}>
			<DocumentSheet {...args} />
		</UiKitProvider>
	{/snippet}
</Story>
