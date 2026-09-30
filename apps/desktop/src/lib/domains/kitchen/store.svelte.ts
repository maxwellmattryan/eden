// Hearth's store (product/domains/kitchen.md): stock by location, the recipes and the active grocery list. The rows
// live in the data layer (`@eden/shared/data`), one per stock item, recipe, list and list item; the store is what
// the page sees of them. A write changes the store at once and is sent after, in order (`WriteQueue`), and every
// write hands back an undo, so the page can show the undo toast in place of a confirm sheet (D-12); each write also
// lands in the Garden's activity feed.
import { logError } from '@eden/shared/api'
import {
	applyBatch,
	createEntity,
	deleteRows,
	importLegacyDocument,
	newId,
	queryEntities,
	restoreRows,
	toUri,
	updateEntity,
	WriteQueue,
	type BatchOp,
	type Write,
} from '@eden/shared/data'
import { daysUntil, nowIso } from '@eden/shared/dates'
import {
	EMPTY_LIST,
	KITCHEN,
	kitchenFromRows,
	kitchenRows,
	kitchenUris,
	LOCATIONS,
	type GroceryItem,
	type GroceryItemPayload,
	type GroceryList,
	type GroceryListPayload,
	type GroceryOrigin,
	type KitchenData,
	type Recipe,
	type RecipePayload,
	type StockItem,
	type StockLocation,
	type StockPayload,
} from '@eden/shared/domains/kitchen'
import { feed } from '../../shell/feed.svelte.js'
import { parseGrocery, parseStock } from './parse.js'
import { seedData } from './seed.js'

export { LOCATIONS }
export type {
	GroceryItem,
	GroceryList,
	GroceryOrigin,
	KitchenData,
	Recipe,
	StockItem,
	StockLocation,
	StockSource,
} from '@eden/shared/domains/kitchen'

export type Undo = () => void

/** One change: what the page sees of it and the way back, and the write that stores each. */
interface Change {
	apply: () => void
	revert: () => void
	write: Write
	unwrite: Write
}

const DOCUMENT = 'kitchen'
/** Dated on or before the day after tomorrow counts as expiring (the mockup's "on or before Friday" on a Wednesday). */
const SOON_DAYS = 2

const byExpiry = (a: StockItem, b: StockItem) => (a.expiry ?? '~').localeCompare(b.expiry ?? '~')

export class KitchenStore {
	ready = $state(false)
	/** A write failed, or the rows could not be read; the page shows it and offers a retry. */
	saveFailed = $state(false)
	stock = $state<StockItem[]>([])
	recipes = $state<Recipe[]>([])
	grocery = $state<GroceryList>({ ...EMPTY_LIST })

	/** The row of the grocery list, made with its first item. */
	#listId: string | undefined
	#loading: Promise<void> | undefined
	readonly #queue = new WriteQueue(
		(failed) => (this.saveFailed = failed),
		(error) => void logError('data', 'A Hearth write failed', String(error)).catch(() => null)
	)

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

	/** Reads the rows, once; the first time, what the old document held is brought over before. */
	load(): Promise<void> {
		return (this.#loading ??= this.#read())
	}

	async #read() {
		try {
			await importLegacyDocument<KitchenData>(DOCUMENT, (data) => kitchenRows(data, newId).ops)
			const [stock, recipes, lists, items] = await Promise.all([
				queryEntities<StockPayload>({ type: KITCHEN.stock }),
				queryEntities<RecipePayload>({ type: KITCHEN.recipe }),
				queryEntities<GroceryListPayload>({ type: KITCHEN.list }),
				queryEntities<GroceryItemPayload>({ type: KITCHEN.item }),
			])
			const { data, listId } = kitchenFromRows({ stock, recipes, lists, items })
			this.stock = data.stock
			this.recipes = data.recipes
			this.grocery = data.grocery
			this.#listId = listId
			this.saveFailed = this.#queue.failed
		} catch (error) {
			// nothing was read: say so, and let the retry read again
			this.#loading = undefined
			this.saveFailed = true
			await logError('data', 'Could not read the Hearth rows', String(error)).catch(() => null)
		}
		this.ready = true
	}

	/** Reads the rows again, after an import changed them under the store. What is waiting to be sent is sent first. */
	async reload() {
		await this.#queue.settled()
		this.#loading = undefined
		await this.load()
	}

	/** What the store holds, as plain data. */
	data(): KitchenData {
		return $state.snapshot({ stock: kitchen.stock, recipes: kitchen.recipes, grocery: kitchen.grocery })
	}

	/** The retry after a failure: reads again if the rows were never read, and sends what is waiting. */
	async flush() {
		if (!this.#loading) await this.load()
		await this.#queue.retry()
	}

	addStock(text: string): { item: StockItem; undo: Undo } {
		const parsed = parseStock(text)
		const item: StockItem = {
			id: newId(),
			name: parsed.name,
			qty: parsed.qty,
			unit: parsed.unit,
			location: parsed.location ?? 'pantry',
			source: 'manual',
			sourcedAt: nowIso(),
		}
		const undo = this.#commit(this.#added('stock', KITCHEN.stock, item), 'garden.feed.stockAdded', {
			name: item.name,
		})
		return { item, undo }
	}

	removeStock(id: string): { item: StockItem | undefined; undo: Undo } {
		const item = this.stock.find((entry) => entry.id === id)
		const undo = this.#commit(this.#removed('stock', KITCHEN.stock, [id]), 'garden.feed.stockRemoved', {
			name: item?.name ?? '',
		})
		return { item, undo }
	}

	moveStock(id: string, location: StockLocation, locationLabel: string): { item: StockItem | undefined; undo: Undo } {
		const item = this.stock.find((entry) => entry.id === id)
		const undo = this.#commit(
			this.#changed<StockItem>('stock', KITCHEN.stock, id, (target) => ({ ...target, location })),
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
		const item: GroceryItem = { id: newId(), name, qty, origin, note, done: false }
		const undo = this.#commit(this.#added('grocery', KITCHEN.item, item), 'garden.feed.groceryAdded', { name })
		return { item, undo }
	}

	addGrocery(text: string): { item: GroceryItem; undo: Undo } {
		const parsed = parseGrocery(text)
		return this.addToGrocery(parsed.name, parsed.qty)
	}

	toggleGrocery(id: string): { item: GroceryItem | undefined; undo: Undo } {
		const item = this.grocery.items.find((entry) => entry.id === id)
		const checking = !item?.done
		const undo = this.#commit(
			this.#changed<GroceryItem>('grocery', KITCHEN.item, id, (target) => ({ ...target, done: !target.done })),
			checking ? 'garden.feed.groceryChecked' : undefined,
			{ name: item?.name ?? '' }
		)
		return { item, undo }
	}

	removeGrocery(id: string): { item: GroceryItem | undefined; undo: Undo } {
		const item = this.grocery.items.find((entry) => entry.id === id)
		const undo = this.#commit(this.#removed('grocery', KITCHEN.item, [id]))
		return { item, undo }
	}

	clearChecked(): { count: number; undo: Undo } {
		const checked = this.grocery.items.filter((item) => item.done).map((item) => item.id)
		const undo = this.#commit(this.#removed('grocery', KITCHEN.item, checked), 'garden.feed.groceryCleared', {
			count: checked.length,
		})
		return { count: checked.length, undo }
	}

	/** Fills the store from the kit's sample dataset; the undo puts back whatever was there. */
	seed(domainName: string): Undo {
		const before = { data: this.data(), listId: this.#listId }
		const after = kitchenRows(seedData(), newId)
		const remove = (uris: string[]): BatchOp[] => uris.map((uri) => ({ op: 'delete', uri }))
		const restore = (uris: string[]): BatchOp[] => uris.map((uri) => ({ op: 'restore', uri }))
		const old = kitchenUris(before.data, before.listId)
		const sample = kitchenUris(after.data, after.listId)
		const show = ({ data, listId }: typeof before) => {
			this.stock = data.stock
			this.recipes = data.recipes
			this.grocery = data.grocery
			this.#listId = listId
		}
		return this.#commit(
			{
				apply: () => show(after),
				revert: () => show(before),
				write: () => applyBatch([...remove(old), ...after.ops]),
				unwrite: () => applyBatch([...remove(sample), ...restore(old)]),
			},
			'garden.feed.sampleAdded',
			{ domain: domainName }
		)
	}

	/** The list a name stands for: the stock, or the items of the grocery list. */
	#list(name: 'stock' | 'grocery'): (StockItem | GroceryItem)[] {
		return name === 'stock' ? this.stock : this.grocery.items
	}

	#show(name: 'stock' | 'grocery', records: (StockItem | GroceryItem)[]) {
		if (name === 'stock') this.stock = records as StockItem[]
		else this.grocery.items = records as GroceryItem[]
	}

	/** A record's payload: itself without its id, and with its list when it is on one. */
	#payload(type: string, record: StockItem | GroceryItem): object {
		const { id: _id, ...payload } = $state.snapshot(record)
		return type === KITCHEN.item ? { ...payload, listId: this.#listId } : payload
	}

	/** The grocery list's row is made with the first item put on it, in a write of its own ahead of the item's. */
	#ensureList() {
		if (this.#listId) return
		const id = (this.#listId = newId())
		const { items: _items, ...payload } = this.data().grocery
		this.#queue.enqueue(() => createEntity({ id, type: KITCHEN.list, payload }))
	}

	#added(name: 'stock' | 'grocery', type: string, record: StockItem | GroceryItem): Change {
		if (type === KITCHEN.item) this.#ensureList()
		const payload = this.#payload(type, record)
		const uri = toUri(type, record.id)
		return {
			apply: () => this.#list(name).push(record),
			revert: () =>
				this.#show(
					name,
					this.#list(name).filter((entry) => entry.id !== record.id)
				),
			write: () => createEntity({ id: record.id, type, payload }),
			unwrite: () => deleteRows([uri]),
		}
	}

	/** The undo puts the list back as it was, so what was removed returns to its place. */
	#removed(name: 'stock' | 'grocery', type: string, ids: string[]): Change {
		const before = $state.snapshot(this.#list(name))
		const uris = ids.map((id) => toUri(type, id))
		return {
			apply: () =>
				this.#show(
					name,
					this.#list(name).filter((entry) => !ids.includes(entry.id))
				),
			revert: () => this.#show(name, before),
			write: () => deleteRows(uris),
			unwrite: () => restoreRows(uris),
		}
	}

	#changed<T extends StockItem | GroceryItem>(
		name: 'stock' | 'grocery',
		type: string,
		id: string,
		change: (record: T) => T
	): Change {
		const found = this.#list(name).find((entry) => entry.id === id) as T | undefined
		const nothing = async () => {}
		if (!found) return { apply: () => {}, revert: () => {}, write: nothing, unwrite: nothing }
		const before = $state.snapshot(found) as T
		const after = change(before)
		const put = (record: T) =>
			this.#show(
				name,
				this.#list(name).map((entry) => (entry.id === id ? record : entry))
			)
		return {
			apply: () => put(after),
			revert: () => put(before),
			write: () => updateEntity(id, this.#payload(type, after)),
			unwrite: () => updateEntity(id, this.#payload(type, before)),
		}
	}

	/** Shows the change, queues its write and records it; the undo shows the way back and queues that. */
	#commit(change: Change, feedKey?: string, values?: Record<string, string | number>): Undo {
		change.apply()
		this.#queue.enqueue(change.write)
		const entry = feedKey ? feed.record('kitchen', feedKey, values) : undefined
		return () => {
			change.revert()
			this.#queue.enqueue(change.unwrite)
			if (entry) feed.forget(entry.id)
		}
	}
}

export const kitchen = new KitchenStore()
