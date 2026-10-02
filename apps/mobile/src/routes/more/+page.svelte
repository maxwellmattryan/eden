<script lang="ts">
	// More: what the tab bar has no room for (product/substrate/shell.md, "Mobile"; D-158), composed
	// from the manifests: the domains that are not pinned, then the Gardener's page, the profile, and Settings, which
	// opens the drawer. A row is a place unless the shell declares it an action (`place` in shell.json).
	import { List, PageHeader, domainGlyph, type GlyphId, type ListRowData } from '@eden/ui-kit'
	import { t } from '@eden/shared/i18n'
	import { navigation, type PlaceId } from '@eden/shared/navigation'
	import { settingsUi } from '@eden/shared/shell/settings'
	import { manifestFor, phoneTabBar } from '$lib/domains'

	const uid = $props.id()
	const nameId = `${uid}-name`

	// what the tab bar has no room for on this device, after the owner's pinned pair
	const more = $derived(phoneTabBar().more)
	/** Where the Gardener's entry ends: the profile sits between its page and Settings. */
	const actionsFrom = $derived(more.findIndex((item) => !item.place))

	const rows = $derived.by<ListRowData[]>(() => {
		const entries = more.map((item) => ({
			id: item.id,
			primary: $t(item.name),
			secondary: $t(item.subtitle),
			// the registry builder checked each id against the kit's glyphs
			icon: manifestFor(item.id)?.glyph ?? domainGlyph(item.id as GlyphId),
		}))
		const profile: ListRowData = {
			id: 'profile',
			primary: $t('shell.profile'),
			secondary: $t('shell.profileSubtitle'),
			icon: 'id-card',
		}
		const at = actionsFrom < 0 ? entries.length : actionsFrom
		return [...entries.slice(0, at), profile, ...entries.slice(at)]
	})

	function open(row: ListRowData) {
		const item = more.find((entry) => entry.id === row.id)
		// Settings is the one action behind More: the drawer, not a page
		if (item && !item.place) {
			if (item.id === 'settings') settingsUi.show()
			return
		}
		const manifest = manifestFor(row.id)
		if (manifest) manifest.routes.open()
		else void navigation.open({ place: row.id as PlaceId })
	}
</script>

<PageHeader name={$t('shell.more')} icon="menu" />
<div class="more">
	<!-- the grid is named by the page's name; a hidden element still names what points at it -->
	<span id={nameId} hidden>{$t('shell.more')}</span>
	<List headless labelledby={nameId} {rows} onopen={open} />
</div>

<style>
	.more {
		padding: 0 var(--ed-gutter);
	}
</style>
