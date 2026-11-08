<script lang="ts">
	// Orchard's Accounts tab (product/domains/finance.md, "Accounts"): what is owned, what is owed and the net worth in
	// the home currency, with a line for what is left out and how old the oldest counted balance is; then a group per
	// bank link on this device, the banks with no link here, the accounts entered by hand, the assets and the closed
	// accounts. A bank's heading carries its colour, how fresh it is and its menu. Rows do not act (D-118); their menus
	// do, offering only what applies: a linked account is read from its bank, so it cannot be edited, given a balance or
	// deleted here. Every figure is the account's own currency, through `formatMoney` in the app's language. An asset
	// valued more than 90 days ago says it is out of date and its menu leads with Update value (D-195).
	import {
		Button,
		EmptyState,
		Icon,
		IconButton,
		List,
		Menu,
		Skeleton,
		Stat,
		type IconName,
		type ListRowData,
		type MenuItem,
	} from '@eden/ui-kit'
	import { dateIn } from '../../../dates/index.js'
	import { t } from '../../../i18n/index.js'
	import { formatMoney, type Money } from '../../../money/index.js'
	import { settings } from '../../../settings/index.js'
	import { undoToast } from '../../../shell/index.js'
	import { dayOfInstant, type AccountGroup } from '../accounts.js'
	import { aged } from '../investments.js'
	import { finance } from '../store.svelte.js'
	import { isDebt, type Account, type Asset, type ProviderLink } from '../types.js'
	import { accountDetail, dayLine, freshnessLine, leftOutLine } from '../words.js'

	type Props = {
		onaddaccount: () => void
		onedit: (account: Account) => void
		onbalance: (account: Account) => void
		onreplace: (account: Account) => void
		oneditasset: (asset: Asset) => void
		onremovelink: (link: ProviderLink) => void
		/** Signs a stale or expiring link in again; absent while no provider is bound. */
		onreconnect?: (link: ProviderLink) => void
		/** A Sandbox provider's "Ask to sign in again", which proves the reconnect path; absent elsewhere. */
		onresetlogin?: (link: ProviderLink) => void
		onsample: () => void
	}
	let {
		onaddaccount,
		onedit,
		onbalance,
		onreplace,
		oneditasset,
		onremovelink,
		onreconnect,
		onresetlogin,
		onsample,
	}: Props = $props()

	const uid = $props.id()
	const lang = $derived(settings.language)
	const home = $derived(settings.homeCurrency)
	const format = $derived({ lang, clock: settings.clock })
	const money = (amount: Money) => formatMoney(amount, lang)
	const day = (iso: string) => dayLine(iso, lang)

	const totals = $derived(finance.totals)
	const leftOut = $derived(leftOutLine(totals.left, $t, lang))

	/** What a balance reads as: the amount, an amount owed, or that there is none yet. */
	function balanceLine(account: Account): string {
		if (!account.balance) return $t('domains.finance.row.noBalance')
		const amount = money(account.balance)
		return isDebt(account.kind) ? $t('domains.finance.row.owed', { values: { amount } }) : amount
	}
	const away = (currency: string) => (currency === home ? [] : [$t('domains.finance.row.notInTotals')])

	function accountActions(account: Account): MenuItem[] {
		const manual = !account.linkId
		const items: MenuItem[] = []
		if (account.closedOn) {
			items.push({ id: 'reopen', label: $t('domains.finance.menu.reopen'), icon: 'undo-2' })
			items.push({ id: 'replace', label: $t('domains.finance.menu.replaces'), icon: 'link' })
		} else {
			if (manual) {
				items.push({ id: 'edit', label: $t('domains.finance.menu.edit'), icon: 'pencil' })
				items.push({ id: 'balance', label: $t('domains.finance.menu.updateBalance'), icon: 'refresh-cw' })
			}
			items.push({ id: 'replace', label: $t('domains.finance.menu.replaces'), icon: 'link' })
			items.push({ id: 'close', label: $t('domains.finance.menu.close'), icon: 'lock' })
		}
		if (manual) items.push({ id: 'delete', label: $t('domains.finance.menu.delete'), icon: 'trash', destructive: true })
		return items
	}
	const today = $derived(dateIn(undefined, finance.clock))
	/** An asset's menu: an out-of-date one leads with Update value, which opens the same sheet as Edit (D-195). */
	function assetActions(asset: Asset): MenuItem[] {
		return [
			...(aged(asset.valuedOn, today)
				? [{ id: 'update-value', label: $t('domains.finance.menu.updateValue'), icon: 'refresh-cw' as const }]
				: []),
			{ id: 'edit', label: $t('domains.finance.menu.edit'), icon: 'pencil' },
			{ id: 'delete', label: $t('domains.finance.menu.delete'), icon: 'trash', destructive: true },
		]
	}

	function accountRow(account: Account): ListRowData {
		const detail = [accountDetail(account, finance.accounts, $t)]
		if (account.closedOn)
			return {
				id: account.id,
				primary: account.name,
				secondary: [...detail, balanceLine(account)].join(' · '),
				meta: $t('domains.finance.row.closedOn', { values: { day: day(account.closedOn) } }),
				actions: accountActions(account),
			}
		return {
			id: account.id,
			primary: account.name,
			secondary: [...detail, ...away(account.currency)].join(' · '),
			meta: balanceLine(account),
			metaDanger: Boolean(account.balance && isDebt(account.kind) && account.balance.minor > 0),
			actions: accountActions(account),
		}
	}
	function assetRow(asset: Asset): ListRowData {
		const amount = money(asset.value)
		const quantity = asset.quantity ? `${asset.quantity} ${asset.unit ?? ''}`.trim() : undefined
		const valued = $t('domains.finance.row.valued', { values: { day: day(asset.valuedOn) } })
		// out of date: the words say so, and the meta rises to primary ink
		const old = aged(asset.valuedOn, today)
		const when = old ? [valued, $t('domains.finance.investments.outOfDate')] : quantity ? [] : [valued]
		return {
			id: asset.id,
			primary: asset.name,
			secondary: [...(quantity ? [quantity] : []), ...when, ...away(asset.value.currency)].join(' · '),
			meta: quantity ? $t('domains.finance.row.approx', { values: { amount } }) : amount,
			metaWarn: old,
			actions: assetActions(asset),
		}
	}

	interface Section {
		id: string
		title: string
		icon?: IconName
		/** The bank's colour, `#RRGGBB`, for the swatch. */
		colour?: string
		/** The bank's logo, a `data:image/png` URL, drawn in the swatch's place. */
		logo?: string
		freshness?: string
		link?: ProviderLink
		expiring?: string
		reconnect: boolean
		quiet: boolean
		rows: ListRowData[]
	}
	const COLOUR = /^#[0-9a-fA-F]{6}$/
	const LOGO = /^data:image\/png;base64,[A-Za-z0-9+/=]+$/
	/** The groups whose logo would not draw: they show the swatch. */
	const broken: Record<string, boolean> = $state({})

	function section(group: AccountGroup): Section {
		const base = { reconnect: false, quiet: false }
		switch (group.kind) {
			case 'link': {
				const { link, state } = group
				const { colour, logo } = link.institution
				return {
					...base,
					id: group.id,
					title: link.institution.name,
					colour: colour && COLOUR.test(colour) ? colour : undefined,
					logo: logo && LOGO.test(logo) ? logo : undefined,
					freshness: freshnessLine(link, state, finance.clock, $t, format),
					link,
					expiring:
						state === 'expiring' && link.consentExpiresAt
							? $t('domains.finance.groups.expiring', {
									values: { name: link.institution.name, day: day(dayOfInstant(link.consentExpiresAt)) },
								})
							: undefined,
					reconnect: Boolean(onreconnect) && state !== 'ok',
					rows: group.accounts.map(accountRow),
				}
			}
			case 'institution': {
				const days = group.accounts.flatMap((account) => (account.balanceAt ? [dayOfInstant(account.balanceAt)] : []))
				const earliest = days.sort()[0]
				return {
					...base,
					id: group.id,
					title: group.name,
					freshness: earliest ? $t('domains.finance.groups.asOf', { values: { day: day(earliest) } }) : undefined,
					rows: group.accounts.map(accountRow),
				}
			}
			case 'manual':
				return {
					...base,
					id: group.id,
					title: $t('domains.finance.groups.byHand'),
					icon: 'pencil',
					rows: group.accounts.map(accountRow),
				}
			case 'assets':
				return {
					...base,
					id: group.id,
					title: $t('domains.finance.groups.assets'),
					icon: 'package',
					rows: group.assets.map(assetRow),
				}
			case 'closed':
				return {
					...base,
					id: group.id,
					title: $t('domains.finance.groups.closed'),
					quiet: true,
					rows: group.accounts.map(accountRow),
				}
		}
	}
	const sections = $derived(finance.groups.map(section))

	// the open link menu: one at a time, anchored to its own button
	let menuFor = $state<string>()
	let menuOpen = $state(false)
	const anchors: Record<string, HTMLElement | undefined> = $state({})
	// the Sandbox's reset sits above Remove link, which stays last
	const linkItems = $derived<MenuItem[]>([
		...(onresetlogin
			? [{ id: 'reset-login', label: $t('domains.finance.plaid.resetLogin'), icon: 'rotate-ccw' as const }]
			: []),
		{ id: 'remove', label: $t('domains.finance.groups.removeLink'), icon: 'trash', destructive: true },
	])

	function act(id: string | undefined, rowId: string) {
		const account = finance.accountById(rowId)
		if (account) {
			const name = account.name
			if (id === 'edit') onedit(account)
			else if (id === 'balance') onbalance(account)
			else if (id === 'replace') onreplace(account)
			else if (id === 'close') {
				const undo = finance.closeAccount(account.id)
				if (undo) undoToast($t('domains.finance.toasts.closed', { values: { name } }), undo)
			} else if (id === 'reopen') {
				const undo = finance.reopenAccount(account.id)
				if (undo) undoToast($t('domains.finance.toasts.reopened', { values: { name } }), undo)
			} else if (id === 'delete') {
				const undo = finance.deleteAccount(account.id)
				if (undo) undoToast($t('domains.finance.toasts.deleted', { values: { name } }), undo)
			}
			return
		}
		const asset = finance.assetById(rowId)
		if (!asset) return
		if (id === 'edit' || id === 'update-value') oneditasset(asset)
		else if (id === 'delete') {
			const undo = finance.deleteAsset(asset.id)
			if (undo) undoToast($t('domains.finance.toasts.deleted', { values: { name: asset.name } }), undo)
		}
	}
</script>

{#if !finance.ready}
	<div class="body" aria-busy="true">
		<div class="figures-loading"><Skeleton rows={1} icon={false} /></div>
		<Skeleton rows={3} />
		<Skeleton rows={3} />
	</div>
{:else if finance.empty}
	<EmptyState
		title={$t('domains.finance.empty.title')}
		text={$t('domains.finance.empty.text')}
		action={{ label: $t('domains.finance.actions.addAccount'), icon: 'plus', onclick: onaddaccount }}
		sample={{ label: $t('domains.finance.empty.sample'), onclick: onsample }}
	/>
{:else}
	<div class="body">
		<section class="totals" aria-labelledby="{uid}-totals">
			<h2 class="ed-sr-only" id="{uid}-totals">{$t('domains.finance.totals.label')}</h2>
			<dl class="figures">
				<div class="figure">
					<dt>{$t('domains.finance.totals.assets')}</dt>
					<dd><Stat value={money(totals.assets)} size="md" /></dd>
				</div>
				<div class="figure">
					<dt>{$t('domains.finance.totals.debts')}</dt>
					<dd><Stat value={money(totals.debts)} size="md" /></dd>
				</div>
				<div class="figure">
					<dt>{$t('domains.finance.totals.netWorth')}</dt>
					<dd><Stat value={money(totals.netWorth)} size="md" /></dd>
				</div>
			</dl>
			{#if leftOut}<p class="caption">{leftOut}</p>{/if}
			{#if totals.staleSince}
				<p class="caption">{$t('domains.finance.totals.staleSince', { values: { day: day(totals.staleSince) } })}</p>
			{/if}
		</section>

		{#each sections as group (group.id)}
			<section class="group" aria-labelledby="{uid}-{group.id}">
				<div class="heading">
					<h2 class={['title', { quiet: group.quiet }]} id="{uid}-{group.id}">
						{#if group.logo && !broken[group.id]}
							<span class="mark" aria-hidden="true">
								<img class="logo" src={group.logo} alt="" onerror={() => (broken[group.id] = true)} />
							</span>
						{:else if group.colour}
							<span class="mark" aria-hidden="true"><span class="swatch" style:--bank={group.colour}></span></span>
						{:else if group.icon}
							<span class="mark"><Icon name={group.icon} size="sm" class="glyph" /></span>
						{/if}
						<span class="name">{group.title}</span>
					</h2>
					{#if group.freshness}<span class="freshness">{group.freshness}</span>{/if}
					{#if group.link}
						{@const link = group.link}
						<span class="tools">
							{#if group.reconnect && onreconnect}
								<Button
									label={$t('domains.finance.actions.reconnect')}
									variant="quiet"
									onclick={() => onreconnect(link)}
								/>
							{/if}
							<span class="anchor" bind:this={anchors[link.id]}>
								<IconButton
									icon="ellipsis"
									size="sm"
									label={$t('domains.finance.groups.actionsFor', { values: { name: link.institution.name } })}
									aria-haspopup="menu"
									aria-expanded={menuOpen && menuFor === link.id}
									active={menuOpen && menuFor === link.id}
									onclick={() => {
										menuFor = link.id
										menuOpen = !menuOpen
									}}
								/>
							</span>
						</span>
					{/if}
				</div>
				{#if group.expiring}
					<p class="expiring"><Icon name="triangle-alert" size="sm" />{group.expiring}</p>
				{/if}
				{#if group.rows.length}
					<List labelledby="{uid}-{group.id}" rows={group.rows} onaction={(item, row) => act(item.id, row.id)} />
				{/if}
			</section>
		{/each}
	</div>
{/if}

{#if menuFor}
	<Menu
		bind:open={menuOpen}
		anchor={anchors[menuFor]}
		align="end"
		label={$t('domains.finance.groups.actionsFor', {
			values: { name: finance.linkById(menuFor)?.institution.name ?? '' },
		})}
		items={linkItems}
		onselect={(item) => {
			const link = finance.linkById(menuFor)
			if (item.id === 'remove' && link) onremovelink(link)
			else if (item.id === 'reset-login' && link) onresetlogin?.(link)
		}}
	/>
{/if}

<style>
	.body {
		display: flex;
		flex-direction: column;
		gap: var(--space-6);
		padding: 0 var(--ed-gutter);
	}
	.figures-loading {
		max-width: 24rem;
	}
	.totals {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
	}
	.figures {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-3) var(--space-6);
		margin: 0 0 var(--space-2);
	}
	.figure {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		min-width: 0;
	}
	.figure dt {
		font: var(--ed-t-label);
		letter-spacing: var(--ed-t-label-tracking);
		color: var(--text-secondary);
	}
	.figure dd {
		margin: 0;
		font-variant-numeric: tabular-nums;
	}
	.caption {
		margin: 0;
		font: var(--ed-t-caption);
		letter-spacing: var(--ed-t-caption-tracking);
		color: var(--text-secondary);
	}
	.group {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		min-width: 0;
	}
	.heading {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-1) var(--space-3);
		min-width: 0;
	}
	.title {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		min-width: 0;
		margin: 0;
		font: var(--ed-t-title-sm);
		letter-spacing: var(--ed-t-title-sm-tracking);
		color: var(--text-primary);
	}
	.title.quiet {
		color: var(--text-secondary);
	}
	.title :global(.glyph) {
		color: var(--text-secondary);
	}
	.name {
		overflow-wrap: anywhere;
	}
	/* one 16px slot for every group's mark, so a logo, a swatch and a glyph line up */
	.mark {
		flex: none;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: var(--space-4);
		height: var(--space-4);
	}
	.logo {
		width: 100%;
		height: 100%;
		object-fit: contain;
		border-radius: var(--ed-radius-sm);
	}
	.swatch {
		flex: none;
		width: var(--space-3);
		height: var(--space-3);
		border-radius: var(--ed-radius-control);
		background: var(--bank);
	}
	.freshness {
		margin-inline-end: auto;
		font: var(--ed-t-caption);
		letter-spacing: var(--ed-t-caption-tracking);
		color: var(--text-secondary);
	}
	.tools {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		margin-inline-start: auto;
	}
	.anchor {
		display: inline-flex;
	}
	.expiring {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		margin: 0;
		font: var(--ed-t-body-sm);
		letter-spacing: var(--ed-t-body-sm-tracking);
		color: var(--warning);
	}
</style>
