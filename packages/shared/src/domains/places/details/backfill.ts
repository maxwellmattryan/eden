// Finding a picture for a saved place that has none (engineering/meadow.md, "Details"): which places may be asked
// about, and what asking came to. The asking itself is the store's, since it writes.

/** What asking after one place's picture came to. */
export type PictureOutcome = 'found' | 'had' | 'noWebsite' | 'failed'

/** Whether a place has no picture: neither a stored one nor a thumbnail. */
export function lacksPicture(place: { photoId?: string; thumb?: string }): boolean {
	return !place.photoId && !place.thumb
}
