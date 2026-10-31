// The readers the context pack is built over (docs/engineering/gardener.md, "The context pack"): the facts, the
// entities and the primitives from `@eden/shared/data` and `@eden/shared/profile`, and the grant check from the
// shell's store, and what is sent of an attached file from its bytes. The pack itself is pure and tested in Node; this is the one place it touches the workspace.
import { queryEntities, queryEvents, queryPlaces, queryTasks } from '../../data/index.js'
import type { PackReaders } from '../../gardener/index.js'
import { queryFacts } from '../../profile/index.js'
import type { FactId } from '../../registry/index.js'
import { logic } from '../../domains/index.js'
import { grants } from '../grants.svelte.js'
import { readForPack } from './files.js'

/** The rows of a type as its domain's `pack` binding shapes them (D-85); a type without one is sent whole. */
async function entities(type: string) {
	const rows = await queryEntities({ type })
	const project = logic.find((domain) => domain.pack?.[type])?.pack?.[type]
	return project ? rows.flatMap((row) => project(row) ?? []) : rows
}

export const readers: PackReaders = {
	facts: (types) => queryFacts({ types: types as FactId[] }),
	entities,
	primitives: (primitive, query) => {
		if (primitive === 'task') return queryTasks(query)
		if (primitive === 'event') return queryEvents(query)
		return queryPlaces(query)
	},
	check: (check) => grants.allows(check),
	attachment: (block) => readForPack(block),
}
