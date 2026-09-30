// The resource registry (D-35) on the frontend: the generated rows with their types and the questions asked of them.
// It is the same table the crate holds (`src-tauri/src/substrate/registry.rs`), made by `yarn registry` from the
// domains' manifests. A declared read, a grant or an audit entry names one of these ids and nothing else (D-31); a
// write names a live one, a resource of Phase 1.
import { RESOURCES } from './generated.js'

export { RESOURCES }

type Row = (typeof RESOURCES)[number]

export type ResourceId = Row['id']
export type FactId = Extract<Row, { category: 'fact' }>['id']
export type EntityTypeId = Extract<Row, { category: 'entity' }>['id']
export type KindId = Extract<Row, { category: 'kind' }>['id']
export type PrimitiveId = Extract<Row, { category: 'primitive' }>['id']
/** The kinds of one primitive. */
export type KindOf<P extends PrimitiveId> = Extract<Row, { category: 'kind'; primitive: P }>['id']
/** A domain id, or `substrate`. */
export type OwnerId = Row['owner']

export type Category = 'fact' | 'primitive' | 'entity' | 'kind'
/** The privacy tier; a primitive's rows take their kind's, a mirrored Event its calendar source's. */
export type Tier = 'T0' | 'T1' | 'T2' | 'T3' | 'by-kind' | 'by-source'
export type Phase = 1 | 2 | 3 | 'later'

export interface Resource {
	id: ResourceId
	category: Category
	/** The primitive a kind belongs to. */
	primitive: PrimitiveId | null
	owner: OwnerId
	tier: Tier
	/** When the resource first exists. */
	phase: Phase
	/** Whether a write may create it: the resources of Phase 1. */
	live: boolean
}

const rows: readonly Resource[] = RESOURCES
const byId = new Map<string, Resource>(rows.map((row) => [row.id, row]))

/** The row of an id, live or not; `undefined` for what the registry does not hold. */
export function resource(id: string): Resource | undefined {
	return byId.get(id)
}

export function isResource(id: string): id is ResourceId {
	return byId.has(id)
}

export function ownerOf(id: ResourceId): OwnerId {
	return byId.get(id)!.owner
}

export function tierOf(id: ResourceId): Tier {
	return byId.get(id)!.tier
}

/** Whether a row of this entity type may be created. */
export function isEntityType(id: string): boolean {
	const row = byId.get(id)
	return row !== undefined && row.category === 'entity' && row.live
}

/** Whether a row of the primitive may be created with this kind. */
export function isKind(primitive: string, kind: string): boolean {
	const row = byId.get(kind)
	return row !== undefined && row.category === 'kind' && row.primitive === primitive && row.live
}

/** The live kinds of one primitive, whoever owns them. */
export function kindsOf(primitive: PrimitiveId): ResourceId[] {
	return rows.filter((row) => row.category === 'kind' && row.primitive === primitive && row.live).map((row) => row.id)
}

/** Everything an owner holds, live or not. */
export function resourcesOf(owner: string): Resource[] {
	return rows.filter((row) => row.owner === owner)
}
