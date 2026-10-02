<script lang="ts">
	// The phone's top bar (product/substrate/shell.md, "Mobile"; D-TBD(phone-chrome)): pinned over every page, under
	// the notch. The back arrow leads when the page is not a tab's root; two quiet buttons end it, the Gardener (its
	// chat sheet) and the bell (the inbox, with its unread count). It is the phone's twin of the desktop's back row
	// and status bar, composed of the kit's pieces and nothing else; the page's own header sits under it.
	import { BackButton, IconButton } from '@eden/ui-kit'
	import { t } from '@eden/shared/i18n'
	import { gardenerUi } from '@eden/shared/shell/gardener'
	import { inbox } from '@eden/shared/shell/inbox'
	import { tap } from './haptics'
	import { inboxUi } from './inbox-ui.svelte'

	type Props = {
		/** Goes back; without it the page is a tab's root and the arrow is not drawn. */
		onback?: () => void
	}
	let { onback }: Props = $props()

	function openGardener() {
		tap()
		gardenerUi.show()
	}
	function openInbox() {
		tap()
		inboxUi.show()
	}
</script>

<header class="top-bar">
	<div class="top-bar-lead"><BackButton {onback} /></div>
	<div class="top-bar-actions">
		<IconButton icon="gardener" label={$t('shell.gardener')} aria-haspopup="dialog" onclick={openGardener} />
		<IconButton
			icon="bell"
			label={$t('shell.inbox.title')}
			count={inbox.unread}
			aria-haspopup="dialog"
			onclick={openInbox}
		/>
	</div>
</header>

<style>
	.top-bar {
		position: sticky;
		top: 0;
		z-index: var(--ed-z-sticky);
		display: flex;
		align-items: center;
		justify-content: space-between;
		box-sizing: border-box;
		min-height: calc(var(--ed-safe-top) + var(--ed-control));
		/* each glyph stands on the page's gutter: a button's box is wider than its glyph by the ring around it */
		padding: var(--ed-safe-top) calc(var(--ed-safe-right) + var(--ed-gutter) - (var(--ed-control) - var(--icon-md)) / 2)
			0 calc(var(--ed-safe-left) + var(--ed-gutter) - (var(--ed-control) - var(--icon-lg)) / 2);
		background: var(--surface-0);
	}
	.top-bar-lead {
		display: flex;
		min-width: var(--ed-control);
	}
	.top-bar-actions {
		display: flex;
		align-items: center;
		gap: var(--space-1);
	}
</style>
