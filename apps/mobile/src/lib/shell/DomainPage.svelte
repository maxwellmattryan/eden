<script lang="ts">
	// A route's page until its area is built: the PageHeader with the glyph and the themed name, and the EmptyState
	// with the copy from the locale. Every route the phone has not built yet composes this and nothing else.
	import { EmptyState, PageHeader, domainGlyph, type GlyphId, type IconName } from '@eden/ui-kit'
	import { t } from '@eden/shared/i18n'

	type Props = {
		/** The plain id: a domain (kitchen) or a shell surface (garden, today, gardener, profile). */
		id: string
		/** The locale key of the name and subtitle, `shell.<id>` for a shell surface, `domains.<id>` for a domain. */
		shell?: boolean
		/** The header's icon, for a surface the kit has no glyph for (the profile). */
		icon?: IconName
	}
	let { id, shell = false, icon }: Props = $props()

	const name = $derived(shell ? $t(`shell.${id}`) : $t(`domains.${id}.name`))
	const subtitle = $derived(shell ? $t(`shell.${id}Subtitle`) : $t(`domains.${id}.subtitle`))
	const actionKey = $derived(`empty.${id}.action`)
	const action = $derived($t(actionKey) === actionKey ? undefined : { label: $t(actionKey) })
</script>

<PageHeader {name} {subtitle} icon={icon ?? domainGlyph(id as GlyphId)} />
<EmptyState title={$t(`empty.${id}.title`)} text={$t(`empty.${id}.text`)} {action} />
