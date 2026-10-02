// The details of a place as slots (D-128, the pattern of D-59): each source registers for one slot and answers what
// it knows, or nothing. A slot is tried source by source, in order, until one answers; a source that fails never
// blocks the panel, and the slot then reads "unavailable". `rating` and `card` have no source yet: they are declared
// so a keyed one (OQ-24) is a file and a line in the registry.
import type { Destination } from '../../../egress/types.js'
import type { SizedPicture } from '../../../api/picture.js'
import type { WeekHours } from '../hours.js'
import type { DetailSlot } from '../types.js'

/** What a source is told of the place it is asked about. */
export interface PlaceRef {
	/** The saved place's id, or the suggestion's. */
	key: string
	name: string
	/** Its OpenStreetMap id, type and number together: `W929874401`. */
	osmId?: string
	/**
	 * Its own page. Only ever an address the search returned whole, the place's OpenStreetMap `website`, or one the
	 * owner typed (D-135): a candidate's website is held to that when it is read, so no address a model composed
	 * reaches here.
	 */
	url?: string
	/** Hours as a search wrote them. */
	hoursText?: string
}

export interface HoursDetail {
	/** The hours as the source wrote them. */
	text: string
	/** The week, when the words parsed. */
	spec?: WeekHours
	/** What the source says the place's own page is, when it says. */
	website?: string
	phone?: string
}

export interface PhotoDetail {
	/** Where the picture came from. */
	url: string
	picture: SizedPicture
}

export interface DetailData {
	hours: HoursDetail
	photo: PhotoDetail
	rating: { value: number }
	card: unknown
}

export interface DetailSource<S extends DetailSlot = DetailSlot> {
	id: string
	slot: S
	/** The source's name as the page says where a detail came from; a locale key under `domains.places.sources`. */
	name: string
	/** Where its requests are counted in the egress ledger; none for a source that asks nothing. */
	destination?: Destination
	/** The name of the secret it needs, when it needs one. */
	secret?: string
	/** Whether it can say anything of this place. */
	covers(place: PlaceRef): boolean
	/** What it knows, or nothing; it rejects when it could not be asked. */
	fetch(place: PlaceRef, context: { lang: string }): Promise<DetailData[S] | null>
}
