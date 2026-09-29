// Hearth's store (product/domains/kitchen.md): stock by location, the recipes, and the active grocery list, one
// `kitchen` document. Every write snapshots first and hands back an undo, so the page can show the undo toast in
// place of a confirm sheet (D-12); each write also lands in the Garden's activity feed.
import { load, save } from '@eden/shared/persistence'
import { daysUntil, nowIso } from '@eden/shared/dates'
import { garden } from '../garden/store.svelte.js'
import { parseGrocery, parseStock } from './parse.js'
import { seedData } from './seed.js'

export type StockLocation = 'fridge' | 'freezer' | 'pantry' | 'counter'
/** The four locations, fixed so capture can place items without a picker (kitchen.md, "Entities"). */
export const LOCATIONS: readonly StockLocation[] = ['fridge', 'freezer', 'pantry', 'counter']
export type StockSource = 'manual' | 'capture' | 'sample'

export interface StockItem {
	id: string
	name: string
	qty: string
	unit?: string
	location: StockLocation
	/** The expiry as an ISO date; absent for what keeps. */
	expiry?: string
	/** The expiry was estimated by capture rather than read from a label. */
	estimated?: boolean
	lowStock?: boolean
	threshold?: number
	category?: string
	/** The storage tip for this item, bundled with the sample data until Tips exist. */
	tip?: string
	source: StockSource
	/** When it entered stock, as an ISO timestamp. */
	sourcedAt: string
}

export interface Recipe {
	id: string
	name: string
	serves: number
	minutes: number
	tags: string[]
}

export type GroceryOrigin = 'manual' | 'recipe' | 'low-stock'

export interface GroceryItem {
	id: string
	name: string
	qty: string
	store?: string
	origin: GroceryOrigin
	/** What the origin points at: the recipe's name. */
	note?: string
	done: boolean
}

export interface GroceryList {
	name: string
	/** The default store; an item may name its own. */
	store: string
	/** The shop-day Event, as an ISO timestamp. */
	shopDay?: string
	items: GroceryItem[]
}

export interface KitchenData {
	stock: StockItem[]
	recipes: Recipe[]
	grocery: GroceryList
}

export type Undo = () => void

const DOCUMENT = 'kitchen'
const VERSION = 1
/** Dated on or before the day after tomorrow counts as expiring (the mockup's "on or before Friday" on a Wednesday). */
const SOON_DAYS = 2
const EMPTY_LIST: GroceryList = { name: '', store: '', items: [] }

const byExpiry = (a: StockItem, b: StockItem) => (a.expiry ?? '~').localeCompare(b.expiry ?? '~')

export class KitchenStore {
	ready = $state(false)
	/** The last save failed; the page shows it and offers a retry. */
	saveFailed = $state(false)
	stock = $state<StockItem[]>([])
	recipes = $state<Recipe[]>([])
	grocery = $state<GroceryList>(EMPTY_LIST)

	readonly expiring = $derived(this.stock.filter((item) => this.soon(item)).sort(byExpiry))
	/** The item that expires tomorrow, which the cook-tonight tile names. */
	readonly expiringTomorrow = $derived(this.stock.find((item) => item.expiry && daysUntil(item.expiry) === 1))
	readonly suggestedRecipe = $derived(this.expiringTomorrow ? this.recipes[0] : undefined)
	readonly checked = $derived(this.grocery.items.filter((item) => item.done).length)

	soon(item: StockItem): boolean {
		return !!item.expiry && daysUntil(item.expiry) <= SOON_DAYS
	}

	/** The stock in its four sections, sorted by expiry with what never expires last; empty sections dropped. */
	sections(filter: (item: StockItem) => boolean = () => true) {
		return LOCATIONS.map((location) => ({
			location,
			items: this.stock.filter((item) => item.location === location && filter(item)).sort(byExpiry),
		})).filter((section) => section.items.length)
	}

	async load() {
		const document = await load<KitchenData>(DOCUMENT)
		if (document) {
			this.stock = document.data.stock ?? []
			this.recipes = document.data.recipes ?? []
			this.grocery = document.data.grocery ?? EMPTY_LIST
		}
		this.ready = true
	}

	/** Writes the document again after a failed save. */
	async flush() {
		await this.persist()
	}

	addStock(text: string): { item: StockItem; undo: Undo } {
		const parsed = parseStock(text)
		const item: StockItem = {
			id: crypto.randomUUID(),
			name: parsed.name,
			qty: parsed.qty,
			unit: parsed.unit,
			location: parsed.location ?? 'pantry',
			source: 'manual',
			sourcedAt: nowIso(),
		}
		const undo = this.commit(() => this.stock.push(item), 'garden.feed.stockAdded', { name: item.name })
		return { item, undo }
	}

	removeStock(id: string): { item: StockItem | undefined; undo: Undo } {
		const item = this.stock.find((entry) => entry.id === id)
		const undo = this.commit(
			() => (this.stock = this.stock.filter((entry) => entry.id !== id)),
			'garden.feed.stockRemoved',
			{ name: item?.name ?? '' }
		)
		return { item, undo }
	}

	moveStock(id: string, location: StockLocation, locationLabel: string): { item: StockItem | undefined; undo: Undo } {
		const item = this.stock.find((entry) => entry.id === id)
		const undo = this.commit(
			() => {
				const target = this.stock.find((entry) => entry.id === id)
				if (target) target.location = location
			},
			'garden.feed.stockMoved',
			{ name: item?.name ?? '', location: locationLabel }
		)
		return { item, undo }
	}

	addToGrocery(
		name: string,
		qty = '',
		origin: GroceryOrigin = 'manual',
		note?: string
	): { item: GroceryItem; undo: Undo } {
		const item: GroceryItem = { id: crypto.randomUUID(), name, qty, origin, note, done: false }
		const undo = this.commit(() => this.grocery.items.push(item), 'garden.feed.groceryAdded', { name })
		return { item, undo }
	}

	addGrocery(text: string): { item: GroceryItem; undo: Undo } {
		const parsed = parseGrocery(text)
		return this.addToGrocery(parsed.name, parsed.qty)
	}

	toggleGrocery(id: string): { item: GroceryItem | undefined; undo: Undo } {
		const item = this.grocery.items.find((entry) => entry.id === id)
		const checking = !item?.done
		const undo = this.commit(
			() => {
				const target = this.grocery.items.find((entry) => entry.id === id)
				if (target) target.done = !target.done
			},
			checking ? 'garden.feed.groceryChecked' : undefined,
			{ name: item?.name ?? '' }
		)
		return { item, undo }
	}

	removeGrocery(id: string): { item: GroceryItem | undefined; undo: Undo } {
		const item = this.grocery.items.find((entry) => entry.id === id)
		const undo = this.commit(() => (this.grocery.items = this.grocery.items.filter((entry) => entry.id !== id)))
		return { item, undo }
	}

	clearChecked(): { count: number; undo: Undo } {
		const count = this.checked
		const undo = this.commit(
			() => (this.grocery.items = this.grocery.items.filter((item) => !item.done)),
			'garden.feed.groceryCleared',
			{ count }
		)
		return { count, undo }
	}

	/** Fills the document from the kit's sample dataset; the undo puts back whatever was there. */
	seed(domainName: string): Undo {
		const data = seedData()
		return this.commit(
			() => {
				this.stock = data.stock
				this.recipes = data.recipes
				this.grocery = data.grocery
			},
			'garden.feed.sampleAdded',
			{ domain: domainName }
		)
	}

	/** Snapshots, mutates, persists and records; the undo restores the snapshot and forgets the feed entry. */
	private commit(mutate: () => void, feedKey?: string, values?: Record<string, string | number>): Undo {
		const before = $state.snapshot({ stock: this.stock, recipes: this.recipes, grocery: this.grocery })
		mutate()
		void this.persist()
		const entry = feedKey ? garden.record('kitchen', feedKey, values) : undefined
		return () => {
			this.stock = before.stock
			this.recipes = before.recipes
			this.grocery = before.grocery
			void this.persist()
			if (entry) garden.forget(entry.id)
		}
	}

	private async persist() {
		try {
			await save<KitchenData>(DOCUMENT, {
				version: VERSION,
				data: $state.snapshot({ stock: this.stock, recipes: this.recipes, grocery: this.grocery }),
			})
			this.saveFailed = false
		} catch {
			this.saveFailed = true
		}
	}
}

export const kitchen = new KitchenStore()
