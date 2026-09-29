<script lang="ts">
	// A route's page until its domain is built: the PageHeader with the glyph and the themed name, and the EmptyState
	// with the copy from the locale. Every Phase 1 route composes this and nothing else for now.
	import { EmptyState, PageHeader, domainGlyph, type GlyphId } from '@eden/ui-kit'
	import { t } from '@eden/shared/i18n'

	type Props = {
		/** The plain id: a domain (kitchen) or a shell surface (garden, today). */
		id: GlyphId
		/** The locale key of the name and subtitle, `shell.<id>` for a shell surface, `domains.<id>` for a domain. */
		shell?: boolean
	}
	let { id, shell = false }: Props = $props()

	const name = $derived(shell ? $t(`shell.${id}`) : $t(`domains.${id}.name`))
	const subtitle = $derived(shell ? $t(`shell.${id}Subtitle`) : $t(`domains.${id}.subtitle`))
	const actionKey = $derived(`empty.${id}.action`)
	const action = $derived($t(actionKey) === actionKey ? undefined : { label: $t(actionKey) })
</script>

<PageHeader {name} {subtitle} icon={domainGlyph(id)} />
<EmptyState title={$t(`empty.${id}.title`)} text={$t(`empty.${id}.text`)} {action} />
