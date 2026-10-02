// What is on (product/domains/places.md, "Listings"): the stretch of days a search looks over, what it is asked, the
// shape its answer is held to and how that answer is read. A listing is found by the same two requests a place is
// (D-132) and kept as a mirror of this device; its addresses are held to the ones the search returned, whole
// (D-135). Nothing here reaches out to anything.
import { addDays } from '../../dates/days.js'
import { normalLink, untrusted } from '../../gardener/links.js'
import { answer, type JsonSchema } from '../../gardener/tools.js'
import type { DiscoveryResult, SourceFailure, Availability } from './discovery.js'
import type { ListingPayload, SourceLink } from './types.js'

export interface ListingsQuery {
	/** The first and the last day, `YYYY-MM-DD`. */
	from: string
	to: string
	/** Where, in words: a city and its region. Never a coordinate (D-60). */
	area: string
	/** The vibes the owner leans to, as words. */
	vibes: string[]
	/** What the owner is in the mood for, when they said. */
	interests?: string
	lang: string
}

export interface ListingsResult {
	listings: ListingPayload[]
	failure?: SourceFailure
	detail?: string
}

export interface ListingsSource {
	id: string
	available(query: ListingsQuery): Promise<Availability>
	fetch(query: ListingsQuery): Promise<ListingsResult>
}

export type { DiscoveryResult }

export const LISTINGS_LIMIT = 8
export const LISTINGS_SEARCHES = 4

/** The day of the week of a calendar date: Monday is 0. */
export function weekdayOf(isoDate: string): number {
	return (new Date(`${isoDate}T12:00:00Z`).getUTCDay() + 6) % 7
}

/**
 * The days a search for listings looks over, from a day: today through the coming Sunday, so the weekend is whole
 * whenever it is asked. On a Sunday the weekend is all but over, so it reaches through the next one: that is the
 * week the Sunday search finds for (D-134).
 */
export function listingWindow(today: string): { from: string; to: string } {
	const weekday = weekdayOf(today)
	return { from: today, to: addDays(today, weekday === 6 ? 7 : 6 - weekday) }
}

/** The Sunday a weekly search belongs to: today's when it is one, else the one before. */
export function sundayOf(today: string): string {
	return addDays(today, -((weekdayOf(today) + 1) % 7))
}

/** What the weekly search has done, as it is kept on the device. */
export interface WeeklyState {
	/** The Sunday the search last ran for. */
	doneFor?: string
}

/**
 * Whether the weekly search runs this morning (D-134): once for each Sunday, on that Sunday, or on the Monday after
 * when Sunday's did not run (the app was closed, or the Gardener was busy). Never later in the week: by then the
 * owner has looked, or has not missed it.
 */
export function weeklyDue(today: string, state: WeeklyState): boolean {
	const sunday = sundayOf(today)
	if (state.doneFor === sunday) return false
	return today === sunday || today === addDays(sunday, 1)
}

/** The research request's message. */
export function listingsResearchPrompt(query: ListingsQuery): string {
	return [
		`Find up to ${LISTINGS_LIMIT} things that are on in or near ${query.area} from ${query.from} to ${query.to}: shows, concerts, markets, festivals, exhibitions, openings, talks, screenings, classes.`,
		query.interests?.trim() ? `The owner is in the mood for: ${query.interests.trim()}.` : undefined,
		query.vibes.length ? `They lean to places and things that are: ${query.vibes.join(', ')}.` : undefined,
		'The context holds what is already in their calendar on those days, where it is shared: leave out what would clash with something there, and what they are already going to.',
		'For each, note its title, where it is (the venue and its street address when a result gives it), the day and the time it starts and ends as the result states them, what it costs when a result says, and the web address of its own page or its listing. Only events a result dates inside those days.',
	]
		.filter(Boolean)
		.join('\n')
}

export function listingsSchema(): JsonSchema {
	return answer.object({
		listings: answer.list(
			answer.object({
				title: answer.text('What it is called, as the notes write it.'),
				venue: answer.text('Where it is held, by name; an empty string when the notes do not say.'),
				address: answer.text('The venue’s street address when the notes give one; an empty string otherwise.'),
				start: answer.text(
					'When it starts, as the notes state it: `YYYY-MM-DDTHH:MM` in the place’s own time, or `YYYY-MM-DD` when the notes give no time.'
				),
				end: answer.text('When it ends, in the same form; an empty string when the notes do not say.'),
				category: answer.text('One or two words for what it is: Music, Food, Art, Market, Film, Talk.'),
				price: answer.text('What it costs as the notes state it ("Free", "$15"); an empty string when they do not.'),
				why: answer.text('One sentence on why it might suit the owner, from what the notes say of it.'),
				url: answer.text('The web address of its own page or listing, exactly as the notes give it.'),
				sources: answer.list(
					answer.text(),
					'The web addresses in the notes that the facts came from, each exactly as written.'
				),
			})
		),
	})
}

export function listingsReadingPrompt(query: ListingsQuery, notes: string): string {
	return [
		`Below are notes from a web search for what is on in or near ${query.area} from ${query.from} to ${query.to}.`,
		`Read them into listings, ${LISTINGS_LIMIT} at most, the soonest first. A listing is an event the notes name with a day inside that stretch: do not add one they do not name, and do not fill a field from memory. A field the notes say nothing on stays empty.`,
		untrusted('web-search', notes),
	].join('\n')
}

const line = (value: unknown, max = 200): string =>
	typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : ''

const DAY = /^\d{4}-\d{2}-\d{2}$/
const DAY_TIME = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/

/** A start or an end as it is kept: a date for a day with no time, a local date and time otherwise; nothing for the rest. */
function when(value: unknown): { at: string; day: string; allDay: boolean } | undefined {
	const text = line(value, 40)
	if (DAY.test(text)) return { at: text, day: text, allDay: true }
	const match = DAY_TIME.exec(text)
	return match ? { at: `${match[1]}T${match[2]}:00`, day: match[1]!, allDay: false } : undefined
}

/**
 * The listings of an answer. Each needs a title, a start inside the days asked for and a page that is, whole, one the
 * search returned: a listing is opened in the browser from its address, so one the model composed is never kept.
 */
export function parseListings(
	raw: unknown,
	context: {
		sources: readonly SourceLink[]
		from: string
		to: string
		timezone?: string
		foundAt: string
		limit?: number
	}
): ListingPayload[] {
	const list = (raw as { listings?: unknown } | null)?.listings
	if (!Array.isArray(list)) return []
	const returned = new Map<string, SourceLink>()
	for (const source of context.sources) {
		const key = normalLink(source.url)
		if (key && !returned.has(key)) returned.set(key, { url: key, title: line(source.title, 160) })
	}
	const known = (value: unknown) => {
		const key = typeof value === 'string' ? normalLink(value) : undefined
		return key ? returned.get(key) : undefined
	}
	const out: ListingPayload[] = []
	const seen = new Set<string>()
	for (const entry of list as Record<string, unknown>[]) {
		const title = line(entry?.title, 160)
		const start = when(entry?.start)
		if (!title || !start || start.day < context.from || start.day > context.to) continue
		const sources = (Array.isArray(entry.sources) ? entry.sources : []).flatMap((url) => known(url) ?? [])
		const page = known(entry.url) ?? sources[0]
		if (!page) continue
		const key = `${title.toLowerCase()}|${start.day}`
		if (seen.has(key)) continue
		seen.add(key)
		const end = when(entry.end)
		const venue = line(entry.venue, 120)
		const category = line(entry.category, 40)
		const price = line(entry.price, 40)
		const why = line(entry.why, 300)
		const unique = [page, ...sources].filter(
			(source, at, all) => all.findIndex((other) => other.url === source.url) === at
		)
		out.push({
			title,
			...(venue ? { venueName: venue } : {}),
			startAt: start.at,
			...(end && end.at >= start.at ? { endAt: end.at } : {}),
			...(start.allDay ? { allDay: true } : {}),
			...(context.timezone ? { timezone: context.timezone } : {}),
			...(category ? { category } : {}),
			...(price ? { price } : {}),
			url: page.url,
			...(why ? { why } : {}),
			sources: unique.slice(0, 4),
			foundAt: context.foundAt,
		})
		if (out.length >= (context.limit ?? LISTINGS_LIMIT)) break
	}
	return out.sort((a, b) => a.startAt.localeCompare(b.startAt))
}

/** The name a listing's mirror is kept under at its source: the same event found twice is one row. */
export function listingKey(listing: Pick<ListingPayload, 'title' | 'startAt'>): string {
	const slug = listing.title
		.normalize('NFD')
		.replace(/[̀-ͯ]/g, '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-|-$/g, '')
		.slice(0, 60)
	return `${listing.startAt.slice(0, 10)}-${slug || 'listing'}`
}
