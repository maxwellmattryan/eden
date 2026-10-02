<script lang="ts">
	// The inbox on the phone (substrate/signals-notifications.md, "Notification center"; D-TBD(phone-chrome)): a
	// sheet over whatever page is open, so the place is kept, with the cards the desktop shows behind its bell, the
	// latest first. A card opens its domain, and the latest one that would have been an OS notification offers to
	// turn those on. Closing the sheet is the moment what it showed is read, as the bell's closing is on desktop.
	// Snooze, grouping and clearing are the notification center's, and not built on either app.
	import { EmptyState, InboxCard, Sheet } from '@eden/ui-kit'
	import { locale, t } from '@eden/shared/i18n'
	import { settings } from '@eden/shared/settings'
	import { inbox, inboxItems } from '@eden/shared/shell/inbox'
	import { inboxUi } from './inbox-ui.svelte'

	const uid = $props.id()
	const titleId = `${uid}-title`

	const items = $derived(
		inboxItems(inbox.cards, {
			tr: $t,
			format: { lang: $locale ?? 'en', clock: settings.clock },
			asks: inbox.asks,
			allow: () => void inbox.allowNotifications(),
			// the sheet gives way to the domain's page
			onopen: () => inboxUi.hide(),
		})
	)
</script>

<Sheet
	bind:open={inboxUi.open}
	placement="auto"
	size="lg"
	labelledby={titleId}
	initialFocus="container"
	onclose={() => void inbox.markRead()}
>
	{#snippet header()}
		<h2 id={titleId} class="title">{$t('shell.inbox.title')}</h2>
	{/snippet}
	{#if items.length}
		<ul class="cards">
			{#each items as item (item.id)}
				<li>
					<InboxCard
						icon={item.icon}
						line={item.line}
						when={item.when}
						domain={item.domain}
						unread={item.unread}
						actions={item.actions}
					/>
				</li>
			{/each}
		</ul>
	{:else}
		<EmptyState title={$t('shell.inbox.empty.title')} text={$t('shell.inbox.empty.text')} motif={false} />
	{/if}
</Sheet>

<style>
	.title {
		margin: 0;
		font: var(--ed-t-title-lg);
		color: var(--text-primary);
	}
	.cards {
		display: grid;
		gap: var(--space-2);
		margin: 0;
		padding: 0;
		list-style: none;
	}
</style>
