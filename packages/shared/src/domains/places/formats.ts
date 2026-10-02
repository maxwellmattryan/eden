// Meadow's data in formats made for reading, for its bundle (product/substrate/data.md, "Export"): the places as CSV
// and as Markdown with their notes and visits, the collections as Markdown. The headings are part of the format and
// are not translated. A distance and a price as the page writes them are here too.
import { formatAddress, countryName, regionName, type Address } from '../../address/index.js'
import type { BundleExtra } from '../../data/bundle.js'
import { inline, toCsv, toMarkdown } from '../../data/text.js'
import type { MeadowData, PriceLevel } from './types.js'

/** A price level as it is written: one to four signs. */
export const priceLabel = (price: PriceLevel | undefined): string => (price ? '$'.repeat(price) : '')

/** A distance as it is written: metres under a kilometre, one decimal under ten, whole kilometres beyond. */
export function distanceLabel(km: number | undefined, unit: 'km' | 'mi' = 'km'): string {
	if (km === undefined || !Number.isFinite(km)) return ''
	const value = unit === 'mi' ? km * 0.621371 : km
	if (unit === 'km' && value < 1) return `${Math.max(10, Math.round((value * 1000) / 10) * 10)} m`
	return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${unit}`
}

/**
 * Where a saved place is, in a line: its address as its country writes one, and the part of town when the address
 * does not already say it.
 */
export function placeAddress(place: { address?: Address; locality?: string }, locale = 'en'): string {
	const line = formatAddress(place.address, { locale })
	const part = place.locality && !line.toLowerCase().includes(place.locality.toLowerCase()) ? place.locality : ''
	return [line, part].filter(Boolean).join(' · ')
}

/**
 * A link that opens a place in a maps app: by its coordinates where it has them, by its name otherwise. A saved
 * place gives its address in parts, a found one the line its source wrote.
 */
export function mapsLink(
	place: {
		name: string
		point?: { lng: number; lat: number }
		address?: Address
		addressLine?: string
		locality?: string
	},
	app: 'apple' | 'google' | 'osm' = 'apple'
): string {
	const line = place.address ? formatAddress(place.address) : place.addressLine
	const query = [place.name, line, line?.includes(place.locality ?? '\n') ? undefined : place.locality]
		.filter(Boolean)
		.join(', ')
	const at = place.point ? `${place.point.lat.toFixed(5)},${place.point.lng.toFixed(5)}` : undefined
	if (app === 'google') {
		return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(at && !line ? at : query)}`
	}
	if (app === 'osm') {
		return at
			? `https://www.openstreetmap.org/?mlat=${place.point!.lat.toFixed(5)}&mlon=${place.point!.lng.toFixed(5)}#map=17/${place.point!.lat.toFixed(5)}/${place.point!.lng.toFixed(5)}`
			: `https://www.openstreetmap.org/search?query=${encodeURIComponent(query)}`
	}
	return `https://maps.apple.com/?q=${encodeURIComponent(place.name)}${at ? `&ll=${at}` : `&address=${encodeURIComponent(query)}`}`
}

export function meadowExtras(data: MeadowData, vibeName: (id: string) => string = (id) => id): BundleExtra[] {
	const visitsOf = (id: string) => data.visits.filter((visit) => visit.placeId === id)
	const csv = toCsv(
		[
			'name',
			'category',
			'address',
			'locality',
			'city',
			'region',
			'postal code',
			'country',
			'latitude',
			'longitude',
			'price',
			'vibes',
			'favourite',
			'alcohol-free',
			'website',
			'notes',
		],
		data.places.map((place) => [
			place.name,
			place.category ?? '',
			formatAddress(place.address),
			place.locality ?? '',
			place.address?.city ?? '',
			regionName(place.address?.country, place.address?.region),
			place.address?.postalCode ?? '',
			place.address?.country ? countryName(place.address.country) : '',
			place.point?.lat ?? '',
			place.point?.lng ?? '',
			priceLabel(place.price),
			place.vibes.map(vibeName).join('; '),
			place.favourite ? 'yes' : '',
			place.alcoholFree === undefined ? '' : place.alcoholFree ? 'yes' : 'no',
			place.url ?? '',
			place.notes ?? '',
		])
	)
	const places = toMarkdown(
		'Places',
		data.places.map((place) => ({
			heading: place.name,
			lines: [
				place.category ? `- Category: ${inline(place.category)}` : undefined,
				placeAddress(place) ? `- Address: ${inline(placeAddress(place))}` : undefined,
				place.price ? `- Price: ${priceLabel(place.price)}` : undefined,
				place.vibes.length ? `- Vibes: ${inline(place.vibes.map(vibeName).join(', '))}` : undefined,
				place.favourite ? '- Favourite' : undefined,
				place.hours?.text ? `- Hours: ${inline(place.hours.text)} (${inline(place.hours.source)})` : undefined,
				place.url ? `- Website: ${inline(place.url)}` : undefined,
				place.notes ? `- Notes: ${inline(place.notes)}` : undefined,
				...(visitsOf(place.id).length
					? [
							'',
							'### Visits',
							'',
							...visitsOf(place.id).map(
								(visit) =>
									`- ${visit.day}${visit.rating ? `, ${visit.rating}/5` : ''}${visit.note ? `: ${inline(visit.note)}` : ''}`
							),
						]
					: []),
			],
		}))
	)
	const collections = toMarkdown(
		'Collections',
		data.collections.map((collection) => ({
			heading: collection.name,
			lines: [
				collection.note ? inline(collection.note) : undefined,
				collection.note ? '' : undefined,
				...collection.placeIds.flatMap((id) => {
					const place = data.places.find((entry) => entry.id === id)
					return place ? [`- ${inline(place.name)}`] : []
				}),
			],
		}))
	)
	return [
		{ path: 'places/places.csv', content: csv },
		{ path: 'places/places.md', content: places },
		{ path: 'places/collections.md', content: collections },
	]
}
