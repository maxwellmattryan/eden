// What a row id in the "can see" chip or the audit log stands for (product/substrate/ai.md: the chip is literal and
// opens to the exact rows): a fact's value as the profile shows it, an entity's name or title, a primitive's title.
// Ids that resolve to nothing keep their id, so the list never lies about what was read.
import { get } from 'svelte/store'
import { getRow, type Entity, type PrimitiveRow } from '@eden/shared/data'
import { t } from '@eden/shared/i18n'
import { formatValue, queryFacts } from '@eden/shared/profile'
import { resource } from '@eden/shared/registry'

export interface RowLabel {
	id: string
	uri: string
	label: string
}

const NAME_KEYS = ['name', 'title', 'label'] as const

function nameOf(row: Entity | PrimitiveRow): string | undefined {
	const source =
		'payload' in row ? (row.payload as Record<string, unknown>) : (row as unknown as Record<string, unknown>)
	for (const key of NAME_KEYS) {
		const value = source[key]
		if (typeof value === 'string' && value.trim()) return value
	}
	return undefined
}

/** The rows behind one registry id, labelled; a fact by its value, an entity or a primitive by its name. */
export async function labelRows(registryId: string, ids: string[]): Promise<RowLabel[]> {
	const row = resource(registryId)
	if (!row || !ids.length) return ids.map((id) => ({ id, uri: id, label: id }))
	if (row.category === 'fact') {
		const facts = await queryFacts({ includeExpired: true, includeDeleted: true }).catch(() => [])
		const label = (key: string) => get(t)(key)
		return ids.map((id) => {
			const fact = facts.find((entry) => entry.id === id)
			return { id, uri: `eden://fact/${id}`, label: fact ? formatValue(fact.type, fact.value, label) : id }
		})
	}
	const type = row.category === 'kind' ? (row.primitive ?? registryId) : registryId
	return Promise.all(
		ids.map(async (id) => {
			const uri = `eden://${type}/${id}`
			const found = await getRow(uri).catch(() => null)
			return { id, uri, label: (found && nameOf(found)) ?? id }
		})
	)
}

/**
 * The registry id's own name for a heading: the fact's name where the profile has one, else the id read as words
 * ("stock-item" as "Stock item"), so every row is a name and none is a slug.
 */
export function registryLabel(registryId: string): string {
	const row = resource(registryId)
	if (row?.category === 'fact') {
		const key = `profile.facts.${registryId}`
		const label = get(t)(key)
		if (label !== key) return label
	}
	const words = registryId.replace(/-/g, ' ')
	return words.charAt(0).toUpperCase() + words.slice(1)
}
