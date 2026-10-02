// An outing (product/domains/places.md; D-133, D-136): the `outing` Event a listing becomes when the owner marks it.
// Interested makes it tentative and going confirms it. The Event carries the listing's source and its id there,
// which is how a second mark finds the first, and a snapshot of the listing (D-37), so it renders on a device that
// never fetched it.
import type { EventInput, EventRow } from '../../data/index.js'
import { MEADOW, type Listing, type Outing, type OutingSnapshot } from './types.js'

export type OutingMark = 'interested' | 'going'

export const outingStatus = (mark: OutingMark): 'tentative' | 'confirmed' =>
	mark === 'going' ? 'confirmed' : 'tentative'

/** The Event a listing becomes. A time with no zone of its own is the owner's wall clock, as the listing wrote it. */
export function outingInput(id: string, listing: Listing, mark: OutingMark): EventInput {
	const snapshot: OutingSnapshot = {
		title: listing.title,
		startAt: listing.startAt,
		...(listing.endAt ? { endAt: listing.endAt } : {}),
		...(listing.venueName ? { venueName: listing.venueName } : {}),
		...(listing.point ? { point: listing.point } : {}),
		url: listing.url,
	}
	return {
		id,
		kind: MEADOW.outing,
		title: listing.title,
		startAt: listing.startAt,
		...(listing.endAt ? { endAt: listing.endAt } : {}),
		allDay: listing.allDay === true,
		...(listing.timezone ? { timezone: listing.timezone } : {}),
		status: outingStatus(mark),
		...(listing.venueName ? { notes: listing.venueName } : {}),
		source: listing.source,
		externalId: listing.externalId,
		snapshot,
	}
}

/** An outing as Meadow reads it from its Event; nothing for an Event that was cancelled. */
export function toOuting(row: EventRow): Outing | undefined {
	if (row.status === 'cancelled') return undefined
	const snapshot = row.snapshot as OutingSnapshot | null
	return {
		id: row.id,
		status: row.status === 'confirmed' ? 'confirmed' : 'tentative',
		title: row.title,
		startAt: row.startAt,
		...(row.source ? { source: row.source } : {}),
		...(row.externalId ? { externalId: row.externalId } : {}),
		...(snapshot && typeof snapshot === 'object' ? { snapshot } : {}),
	}
}

/** The outing a listing already is, if the owner marked it. */
export function outingOf(
	listing: Pick<Listing, 'source' | 'externalId'>,
	outings: readonly Outing[]
): Outing | undefined {
	return outings.find((outing) => outing.source === listing.source && outing.externalId === listing.externalId)
}

/** What a listing is marked as. */
export function markOf(
	listing: Pick<Listing, 'source' | 'externalId'>,
	outings: readonly Outing[]
): OutingMark | undefined {
	const outing = outingOf(listing, outings)
	return outing ? (outing.status === 'confirmed' ? 'going' : 'interested') : undefined
}
