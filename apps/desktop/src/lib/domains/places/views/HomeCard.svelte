<script lang="ts">
	// The home, read from its pin (D-143): what it is called, its address as its country writes one, and the way to
	// change it. A home the owner has not chosen yet is the sample, and says so.
	import { Button, IconButton } from '@eden/ui-kit'
	import { formatAddress } from '@eden/shared/address'
	import { home } from '@eden/shared/home'
	import { locale, t } from '@eden/shared/i18n'
	import { homeUi } from '@eden/shared/shell/home'

	type Props = {
		closable?: boolean
		onclose?: () => void
	}
	let { closable = false, onclose }: Props = $props()

	const uid = $props.id()
	const lines = $derived(formatAddress(home.current.address, { style: 'lines', locale: $locale ?? 'en' }))
</script>

<article class="detail" aria-labelledby="{uid}-name">
	<div class="head">
		<h2 class="title" id="{uid}-name">{home.current.label}</h2>
		{#if closable}
			<IconButton icon="x" size="sm" label={$t('common.close')} onclick={onclose} />
		{/if}
	</div>
	{#if !home.chosen}
		<p class="meta">{$t('home.card.sample')}</p>
	{:else if lines}
		<p class="meta address">{lines}</p>
	{:else}
		<p class="meta">{$t('home.card.noAddress')}</p>
	{/if}
	<div class="actions">
		<Button
			label={$t(home.chosen ? 'home.card.change' : 'home.card.set')}
			icon="pencil"
			variant={home.chosen ? 'secondary' : 'primary'}
			onclick={() => homeUi.show()}
		/>
	</div>
</article>

<style>
	.detail {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
		box-sizing: border-box;
		min-width: 0;
		padding: var(--space-4);
		border: 1px solid var(--ed-card-border);
		border-radius: var(--ed-radius-card);
		background: var(--surface-0);
	}
	.head {
		display: flex;
		align-items: start;
		gap: var(--space-1);
	}
	.title {
		flex: 1;
		margin: 0;
		font: var(--ed-t-display-sm);
		letter-spacing: var(--ed-t-display-sm-tracking);
		font-variation-settings: var(--ed-t-display-sm-opsz);
		text-wrap: balance;
	}
	.meta {
		margin: 0;
		color: var(--text-secondary);
		font: var(--ed-t-body-sm);
		letter-spacing: var(--ed-t-body-sm-tracking);
	}
	.address {
		white-space: pre-line;
		user-select: text;
	}
	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
	}
</style>
