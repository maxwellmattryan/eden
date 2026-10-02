<script lang="ts">
	// The picture of an item, a recipe or a place, with the buttons that change it: the picture, or a glyph on a tile of the
	// same size; one button whose menu offers a file or a link (on the phone the camera first, D-TBD(file-camera));
	// and Remove, last. A link is typed into a small panel
	// that hangs from the button, fetched as soon as it is pasted, and the panel stays open until a picture came of it,
	// so a wrong address can be corrected. The
	// form says what a file or a link becomes; nothing is written here. A dropped or pasted picture comes in through
	// PictureDrop, around the form.
	import { Field, FileButton, Icon, IconButton, Popover, type IconName } from '@eden/ui-kit'
	import { PICTURE_ACCEPT } from '../api/index.js'
	import { t } from '../i18n/index.js'

	type Props = {
		/** The picture as it stands, as a URL the page may load. */
		picture?: string
		/** What the tile shows when there is no picture. */
		glyph: IconName
		chooseLabel: string
		removeLabel: string
		/** What a link may be, under its field. */
		linkHelp: string
		/** A line beside the buttons: a picture is on its way. */
		note?: string
		onfile: (file: File) => void
		/** A link to fetch the picture from; true when a picture came of it. */
		onlink: (link: string) => Promise<boolean>
		/** Absent, or with no picture, there is nothing to remove. */
		onremove?: () => void
	}
	let { picture, glyph, chooseLabel, removeLabel, linkHelp, note, onfile, onlink, onremove }: Props = $props()

	let anchor = $state<HTMLElement>()
	let linkOpen = $state(false)
	let link = $state('')
	let fetching = $state(false)

	async function fetchLink() {
		if (fetching || !link.trim()) return
		fetching = true
		const taken = await onlink(link)
		fetching = false
		if (!taken) return
		link = ''
		linkOpen = false
	}
	/** A pasted address is fetched at once: nothing more is asked of the owner than the paste. */
	function pasteLink(event: ClipboardEvent) {
		const text = event.clipboardData?.getData('text/plain').trim() ?? ''
		if (fetching || !/^https:\/\/\S+$/.test(text)) return
		event.preventDefault()
		// a picture's own paste handler, around the form, is not asked about text
		event.stopPropagation()
		link = text
		void fetchLink()
	}
</script>

<div class="picture-row">
	{#if picture}
		<img class="picture" src={picture} alt="" />
	{:else}
		<span class="picture picture-glyph" aria-hidden="true"><Icon name={glyph} /></span>
	{/if}
	<span class="anchor" bind:this={anchor}>
		<FileButton
			label={chooseLabel}
			icon="image-plus"
			accept={PICTURE_ACCEPT}
			multiple={false}
			camera
			tooltip
			onfiles={(files) => files[0] && onfile(files[0])}
			sources={[
				{
					id: 'link',
					label: $t('common.picture.fromLink'),
					icon: 'link',
					onselect: () => (linkOpen = true),
				},
			]}
		/>
	</span>
	<Popover bind:open={linkOpen} {anchor} align="start" label={$t('common.picture.link')}>
		<div class="link">
			<Field
				label={$t('common.picture.link')}
				helper={linkHelp}
				placeholder="https://"
				type="url"
				bind:value={link}
				disabled={fetching}
				onpaste={pasteLink}
				onkeydown={(event: KeyboardEvent) => {
					if (event.key !== 'Enter') return
					// the panel sits inside the form: Enter fetches the picture, it does not save the form
					event.preventDefault()
					void fetchLink()
				}}
			>
				{#snippet trailing()}
					<IconButton
						icon="arrow-right"
						size="sm"
						label={$t('common.picture.fetch')}
						tooltip
						disabled={fetching || !link.trim()}
						onclick={() => void fetchLink()}
					/>
				{/snippet}
			</Field>
		</div>
	</Popover>
	{#if picture && onremove}
		<IconButton icon="trash" size="sm" label={removeLabel} danger tooltip onclick={onremove} />
	{/if}
	{#if note}
		<span class="note" role="status">{note}</span>
	{/if}
</div>

<style>
	.picture-row {
		display: flex;
		align-items: center;
		gap: var(--space-2);
	}
	.picture {
		flex: none;
		box-sizing: border-box;
		width: calc(var(--space-8) * 2);
		height: calc(var(--space-8) * 2);
		border: 1px solid var(--ed-card-border);
		border-radius: var(--ed-radius-control);
		object-fit: cover;
		background: var(--surface-2);
	}
	.picture-glyph {
		display: inline-grid;
		place-items: center;
		color: var(--text-secondary);
	}
	.anchor {
		display: inline-flex;
	}
	.link {
		box-sizing: border-box;
		width: var(--sheet-sm);
		max-width: 100%;
		padding: var(--space-3);
	}
	.note {
		font: var(--ed-t-body-sm);
		letter-spacing: var(--ed-t-body-sm-tracking);
		color: var(--text-secondary);
	}
</style>
