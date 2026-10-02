// What a place's own page says (D-135): its opening hours, where it describes itself in schema.org JSON-LD, and the
// picture it shows of itself. The page and the picture are fetched by the crate (`fetch_page`, `fetch_image`) under
// its checks and counted under `web-page` and `web-image`; nothing is fetched in a plain browser, where there is no
// crate. The page is fetched once for a place and both slots read it.
import { fetchImage, fetchPage, type FetchedPage } from '../../../api/web.js'
import { businessDetails, pageImage } from '../../../api/html.js'
import { sizedPicture } from '../../../api/picture.js'
import { normalLink } from '../../../gardener/links.js'
import { parseSchemaHours } from '../hours.js'
import type { DetailSource, PlaceRef } from './types.js'

/** The schema.org types a place to go describes itself as. */
export const PLACE_TYPES =
	/(?:LocalBusiness|FoodEstablishment|Restaurant|CafeOrCoffeeShop|BarOrPub|Bakery|Brewery|Winery|NightClub|Store|Museum|Library|Park|TouristAttraction|EntertainmentBusiness|MusicVenue|PerformingArtsTheater|MovieTheater|Place)$/

/** A page being fetched or already fetched, by its address, for as long as the app runs: two slots, one request. */
const pages = new Map<string, Promise<FetchedPage>>()

function pageOf(url: string): Promise<FetchedPage> {
	let page = pages.get(url)
	if (!page) {
		page = fetchPage(url)
		pages.set(url, page)
		// a page that could not be fetched is asked for again the next time
		page.catch(() => pages.delete(url))
	}
	return page
}

/** The place's page as an address that may be fetched: `https`, whole, in one form. */
export const pageAddress = (place: PlaceRef): string | undefined => (place.url ? normalLink(place.url) : undefined)

/** The hours a page's HTML states, or nothing. */
export function hoursFromPage(html: string) {
	const rules = businessDetails(html, PLACE_TYPES).openingHours
	if (!rules?.length) return null
	const spec = parseSchemaHours(rules)
	return { text: rules.join('; ').slice(0, 400), ...(spec ? { spec } : {}) }
}

export const websiteHours: DetailSource<'hours'> = {
	id: 'website',
	slot: 'hours',
	name: 'website',
	destination: 'web-page',
	covers: (place) => pageAddress(place) !== undefined,
	async fetch(place) {
		const url = pageAddress(place)
		if (!url) return null
		return hoursFromPage((await pageOf(url)).html)
	},
}

export const websitePhoto: DetailSource<'photo'> = {
	id: 'website-photo',
	slot: 'photo',
	name: 'website',
	destination: 'web-image',
	covers: (place) => pageAddress(place) !== undefined,
	async fetch(place) {
		const url = pageAddress(place)
		if (!url) return null
		const page = await pageOf(url)
		const named = pageImage(page.html, page.url)
		if (!named) return null
		const bytes = await fetchImage(named)
		const picture = await sizedPicture(new Blob([bytes as Uint8Array<ArrayBuffer>]))
		return picture ? { url: named, picture } : null
	},
}
