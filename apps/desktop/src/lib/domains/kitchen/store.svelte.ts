// Hearth's store (product/domains/kitchen.md): stock by location, the recipes and the active grocery list. The rows
// live in the data layer (`@eden/shared/data`), one per stock item, recipe, list and list item; the store is what
// the page sees of them. A write changes the store at once and is sent after, in order (`WriteQueue`), and every
// write hands back an undo, so the page can show the undo toast in place of a confirm sheet (D-12); each write also
// lands in the Garden's activity feed. A change to several rows (a haul, a recipe cooked, a bulk move) is one batch
// and one undo.
import { SvelteMap } from 'svelte/reactivity'
import { logError } from '@eden/shared/api'
import {
	applyBatch,
	attachBytes,
	createEntity,
	deleteRows,
	importLegacyDocument,
	newId,
	queryAttachments,
	queryEntities,
	restoreRows,
	toUri,
	updateEntity,
	WriteQueue,
	type BatchOp,
	type Write,
} from '@eden/shared/data'
import { nowIso } from '@eden/shared/dates'
import {
	EMPTY_LIST,
	ensureShopDay,
	expiresSoon,
	isLow,
	ITEM_PHOTO,
	KITCHEN,
	kitchenFromRows,
	kitchenRows,
	kitchenUris,
	LOCATIONS,
	mergeInto,
	parseGrocery,
	parseStock,
	type CaptureMode,
	type GroceryItem,
	type GroceryItemPayload,
	type GroceryList,
	type GroceryListPayload,
	type GroceryOrigin,
	type HaulRow,
	type KitchenData,
	type Recipe,
	type RecipeDraft,
	type RecipePayload,
	type StockItem,
	type StockLocation,
	type StockPayload,
} from '@eden/shared/domains/kitchen'
import { feed } from '../../shell/feed.svelte.js'
import { seedData } from './seed.js'

export { LOCATIONS }
export type {
	GroceryItem,
	GroceryList,
	GroceryOrigin,
	HaulRow,
	Ingredient,
	KitchenData,
	Recipe,
	RecipeDraft,
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

/** A photo a haul was read from, kept with the stock it made (`haul-photo`, D-86). */
export interface HaulImage {
	file: Blob
	name: string
	mime: string
	thumbnail?: string
	width?: number
	height?: number
}

/** How the stock is ordered within a location. */
export type StockSort = 'expiry' | 'name' | 'added'

/** What the owner may change of a stock item; `undefined` for a field clears it. */
export type StockPatch = Partial<
	Pick<StockItem, 'name' | 'qty' | 'unit' | 'location' | 'expiry' | 'category' | 'threshold' | 'tip'>
>
export type GroceryPatch = Partial<Pick<GroceryItem, 'name' | 'qty' | 'store' | 'note'>>

type ListName = 'stock' | 'grocery' | 'recipes'
type Kept = StockItem | GroceryItem | Recipe

const DOCUMENT = 'kitchen'
const TYPE: Record<ListName, string> = { stock: KITCHEN.stock, grocery: KITCHEN.item, recipes: KITCHEN.recipe }

/** Sorts after every date: what never expires comes last. (A tilde would not: a locale's order puts it before digits.) */
const UNDATED = '9999-12-31'

const SORTS: Record<StockSort, (a: StockItem, b: StockItem) => number> = {
	expiry: (a, b) => (a.expiry ?? UNDATED).localeCompare(b.expiry ?? UNDATED),
	name: (a, b) => a.name.localeCompare(b.name),
	added: (a, b) => b.sourcedAt.localeCompare(a.sourcedAt),
}

const photoUri = (id: string) => toUri('attachment', id)

/** The bytes a data URL holds. */
function bytesOf(dataUrl: string): Uint8Array {
	const binary = atob(dataUrl.slice(dataUrl.indexOf(',') + 1))
	return Uint8Array.from(binary, (char) => char.charCodeAt(0))
}

/** A record without the fields a patch cleared: a payload never carries `undefined`. */
function without<T extends object>(record: T): T {
	return Object.fromEntries(Object.entries(record).filter(([, value]) => value !== undefined && value !== '')) as T
}

export class KitchenStore {
	ready = $state(false)
	/** A write failed, or the rows could not be read; the page shows it and offers a retry. */
	saveFailed = $state(false)
	stock = $state<StockItem[]>([])
	recipes = $state<Recipe[]>([])
	grocery = $state<GroceryList>({ ...EMPTY_LIST })
	/** The items' pictures (D-90): the small image of each `item-photo` Attachment, by the Attachment's id. */
	readonly photos = new SvelteMap<string, string>()

	/** The row of the grocery list, made with its first item. */
	#listId: string | undefined
	#loading: Promise<void> | undefined
	readonly #queue = new WriteQueue(
		(failed) => (this.saveFailed = failed),
		(error) => void logError('data', 'A Hearth write failed', String(error)).catch(() => null)
	)

	readonly expiring = $derived(this.stock.filter((item) => this.soon(item)).sort(SORTS.expiry))
	readonly lowItems = $derived(this.stock.filter((item) => isLow(item)))
	readonly checked = $derived(this.grocery.items.filter((item) => item.done).length)
	/** The stores the list's items name, with the list's own first: what an item's store may be set to. */
	readonly stores = $derived(
		[this.grocery.store, ...this.grocery.items.map((item) => item.store ?? '')].filter(
			(store, index, all) => store && all.indexOf(store) === index
		)
	)

	/** Expiring, by the rule the morning's digest counts by (`@eden/shared/domains/kitchen`). */
	soon(item: StockItem): boolean {
		return expiresSoon(item)
	}

	/** An item's picture, when it has one. */
	photoOf(item: Pick<StockItem, 'photo'>): string | undefined {
		return item.photo ? this.photos.get(item.photo) : undefined
	}

	/** Low, by the rule the low-stock digest counts by: holding no more than its threshold. */
	low(item: StockItem): boolean {
		return isLow(item)
	}

	/** The stock in its four sections, sorted, with what never expires last; empty sections dropped. */
	sections(filter: (item: StockItem) => boolean = () => true, sort: StockSort = 'expiry') {
		return LOCATIONS.map((location) => ({
			location,
			items: this.stock.filter((item) => item.location === location && filter(item)).sort(SORTS[sort]),
		})).filter((section) => section.items.length)
	}

	/** Reads the rows, once; the first time, what the old document held is brought over before. */
	load(): Promise<void> {
		return (this.#loading ??= this.#read())
	}

	async #read() {
		try {
			await importLegacyDocument<KitchenData>(DOCUMENT, (data) => kitchenRows(data, newId).ops)
			const [stock, recipes, lists, items, pictures] = await Promise.all([
				queryEntities<StockPayload>({ type: KITCHEN.stock }),
				queryEntities<RecipePayload>({ type: KITCHEN.recipe }),
				queryEntities<GroceryListPayload>({ type: KITCHEN.list }),
				queryEntities<GroceryItemPayload>({ type: KITCHEN.item }),
				// the pictures are what the rows are shown with, never what they stand on
				queryAttachments({ kinds: [ITEM_PHOTO] }).catch(() => []),
			])
			this.photos.clear()
			for (const picture of pictures) if (picture.thumbnail) this.photos.set(picture.id, picture.thumbnail)
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
		this.#remind()
	}

	/** Sets the shop-day reminder again from the list as it is stored, once what is waiting has been sent. */
	#remind() {
		void this.#queue
			.settled()
			.then(() => ensureShopDay())
			.catch(() => null)
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

	recipeById(id: string): Recipe | undefined {
		return this.recipes.find((recipe) => recipe.id === id)
	}

	stockById(id: string): StockItem | undefined {
		return this.stock.find((item) => item.id === id)
	}

	// Stock

	addStock(text: string): { item: StockItem; undo: Undo } {
		const parsed = parseStock(text)
		return this.addStockItem({ ...parsed, location: parsed.location ?? 'pantry' })
	}

	/** Adds one item from its fields: what a quick-add line parses to, and what a product's link names (D-91). */
	addStockItem(fields: { name: string; qty?: string; unit?: string; location?: StockLocation }): {
		item: StockItem
		undo: Undo
	} {
		const item: StockItem = without({
			id: newId(),
			name: fields.name,
			qty: fields.qty || '1',
			unit: fields.unit,
			location: fields.location ?? 'pantry',
			source: 'manual' as const,
			sourcedAt: nowIso(),
		})
		const undo = this.#commit(this.#added('stock', item), 'garden.feed.stockAdded', { name: item.name })
		return { item, undo }
	}

	/** Adds several stock items in one batch, one feed entry and one undo: what the Gardener's `add-stock` writes. */
	addStockRows(
		rows: { name: string; qty: string; unit?: string; location: StockLocation; expiry?: string; estimated?: boolean }[]
	): { items: StockItem[]; undo: Undo } {
		const items: StockItem[] = rows.map((row) => ({
			id: newId(),
			name: row.name,
			qty: row.qty,
			unit: row.unit || undefined,
			location: row.location,
			expiry: row.expiry || undefined,
			estimated: row.estimated || undefined,
			source: 'manual',
			sourcedAt: nowIso(),
		}))
		if (!items.length) return { items, undo: () => {} }
		const ids = items.map((item) => item.id)
		const undo = this.#commit(
			{
				apply: () => (this.stock = [...this.stock, ...items]),
				revert: () => (this.stock = this.stock.filter((entry) => !ids.includes(entry.id))),
				write: () => applyBatch(items.map((item) => this.#create('stock', item))),
				unwrite: () => deleteRows(ids.map((id) => toUri(KITCHEN.stock, id))),
			},
			'garden.feed.stockAddedMany',
			{ count: items.length }
		)
		return { items, undo }
	}

	/**
	 * Commits a captured haul (D-13, D-86): the rows that merge are added to the items they land on, the rest become
	 * stock, and the photos the haul was read from are kept with what they made. One batch, one feed entry, one undo,
	 * which takes back the new items, the merges and the photos alike. `linked` names files already in the workspace
	 * (the ones on a Gardener message), which are linked to the stock rather than stored again. Taking stock (`mode`
	 * `stock`, D-89) sets a matched item's quantity where a haul adds to it. A row's picture, cut from its photo, is
	 * kept as the item's (D-90), unless the item it merges into has one already.
	 */
	commitHaul(
		rows: readonly HaulRow[],
		images: readonly HaulImage[] = [],
		linked: readonly string[] = [],
		mode: CaptureMode = 'haul'
	): { created: number; merged: number; undo: Undo } {
		const before = $state.snapshot(this.stock)
		const at = nowIso()
		const created: StockItem[] = []
		const merged: { before: StockItem; after: StockItem }[] = []
		const pictures: { id: string; stockId: string; name: string; image: string }[] = []
		const picture = (row: HaulRow, stockId: string): string | undefined => {
			if (!row.image) return undefined
			const id = newId()
			pictures.push({ id, stockId, name: row.name.trim(), image: row.image })
			return id
		}
		for (const row of rows) {
			if (!row.name.trim()) continue
			// a second row for the same item is added to what the first left
			const held = row.merge?.on
				? (merged.find((entry) => entry.after.id === row.merge?.id)?.after ??
					before.find((item) => item.id === row.merge?.id))
				: undefined
			const after = held ? mergeInto(held, row, mode) : null
			if (held && after) {
				if (!after.photo) {
					const photo = picture(row, after.id)
					if (photo) after.photo = photo
				}
				const earlier = merged.find((entry) => entry.after.id === held.id)
				if (earlier) earlier.after = after
				else merged.push({ before: held, after })
				continue
			}
			const id = newId()
			created.push(
				without({
					id,
					photo: picture(row, id),
					name: row.name.trim(),
					qty: row.qty.trim() || '1',
					unit: row.unit?.trim(),
					location: row.location,
					expiry: row.expiry,
					estimated: row.expiry && row.estimated ? true : undefined,
					category: row.category,
					tip: row.tip?.trim(),
					source: 'capture' as const,
					sourcedAt: at,
				})
			)
		}
		if (!created.length && !merged.length) return { created: 0, merged: 0, undo: () => {} }
		const touched = [...created.map((item) => item.id), ...merged.map((entry) => entry.after.id)]
		const links = touched.map((id) => ({ uri: toUri(KITCHEN.stock, id), relation: 'from' as const }))
		const photos = images.map((image) => ({ ...image, id: newId() }))
		// a write that failed part-way is sent again from where it stopped: the rows are never created twice
		let rowsWritten = false
		let photosWritten = 0
		let picturesWritten = 0
		const undo = this.#commit(
			{
				apply: () => {
					for (const entry of pictures) this.photos.set(entry.id, entry.image)
					this.stock = [
						...this.stock.map((item) => merged.find((entry) => entry.after.id === item.id)?.after ?? item),
						...created,
					]
				},
				revert: () => {
					this.stock = before
					for (const entry of pictures) this.photos.delete(entry.id)
				},
				write: async () => {
					if (!rowsWritten) {
						await applyBatch([
							...created.map((item) => this.#create('stock', item)),
							...merged.map(({ after }) => this.#update('stock', after)),
						])
						rowsWritten = true
						// a file that is already in the workspace is linked, on its own: one that has since been deleted
						// (its conversation was) must not take the rows down with it
						if (linked.length) {
							await applyBatch(
								linked.flatMap((owner) => links.map((link): BatchOp => ({ op: 'link', owner, link })))
							).catch((error) =>
								logError('data', "A haul's files could not be linked", String(error)).catch(() => null)
							)
						}
					}
					for (; photosWritten < photos.length; photosWritten += 1) {
						const photo = photos[photosWritten]!
						try {
							await attachBytes(
								{
									id: photo.id,
									kind: 'haul-photo',
									fileName: photo.name,
									mime: photo.mime,
									...(photo.thumbnail ? { thumbnail: photo.thumbnail } : {}),
									captured: {
										...(photo.width && photo.height ? { width: photo.width, height: photo.height } : {}),
										via: 'capture',
									},
									links,
								},
								new Uint8Array(await photo.file.arrayBuffer())
							)
						} catch (error) {
							// the photo is the record of where the rows came from, never what they stand on
							await logError('data', "A haul's photo could not be kept", String(error)).catch(() => null)
						}
					}
					for (; picturesWritten < pictures.length; picturesWritten += 1) {
						const entry = pictures[picturesWritten]!
						await this.#keepPicture(entry.id, entry.stockId, entry.name, entry.image)
					}
				},
				unwrite: () =>
					applyBatch([
						...created.map((item): BatchOp => ({ op: 'delete', uri: toUri(KITCHEN.stock, item.id) })),
						...merged.map(({ before: was }) => this.#update('stock', was)),
						...photos.slice(0, photosWritten).map((photo): BatchOp => ({ op: 'delete', uri: photoUri(photo.id) })),
					]).then(() =>
						// a picture that could not be kept has no row to take back
						deleteRows(pictures.slice(0, picturesWritten).map((entry) => photoUri(entry.id))).catch(() => null)
					),
			},
			mode === 'stock' ? 'garden.feed.stockTaken' : 'garden.feed.haulCaptured',
			{ count: created.length + merged.length }
		)
		return { created: created.length, merged: merged.length, undo }
	}

	/** Writes an item's picture as its Attachment; a picture that cannot be kept leaves the item standing. */
	async #keepPicture(id: string, stockId: string, name: string, image: string): Promise<void> {
		try {
			await attachBytes(
				{
					id,
					kind: ITEM_PHOTO,
					fileName: `${name.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '') || 'item'}.jpg`,
					mime: 'image/jpeg',
					thumbnail: image,
					links: [{ uri: toUri(KITCHEN.stock, stockId), relation: 'from' }],
				},
				bytesOf(image)
			)
		} catch (error) {
			await logError('data', "An item's picture could not be kept", String(error)).catch(() => null)
		}
	}

	/**
	 * Gives an item a picture (a small image as a data URL), or takes its picture away (D-90). The one it had is
	 * deleted with the change and comes back with the undo.
	 */
	setStockPhoto(id: string, image: string | undefined): { item: StockItem | undefined; undo: Undo } {
		const item = this.stockById(id)
		if (!item) return { item, undo: () => {} }
		const before = $state.snapshot(item) as StockItem
		const photo = image ? newId() : undefined
		const after: StockItem = without({ ...before, photo })
		const put = (record: StockItem) => (this.stock = this.stock.map((entry) => (entry.id === id ? record : entry)))
		const undo = this.#commit({
			apply: () => {
				if (photo && image) this.photos.set(photo, image)
				put(after)
			},
			revert: () => {
				put(before)
				if (photo) this.photos.delete(photo)
			},
			write: async () => {
				if (photo && image) await this.#keepPicture(photo, id, before.name, image)
				await updateEntity(id, this.#payload('stock', after))
				if (before.photo) await deleteRows([photoUri(before.photo)]).catch(() => null)
			},
			unwrite: async () => {
				if (before.photo) await restoreRows([photoUri(before.photo)]).catch(() => null)
				await updateEntity(id, this.#payload('stock', before))
				if (photo) await deleteRows([photoUri(photo)]).catch(() => null)
			},
		})
		return { item, undo }
	}

	/** Changes an item's fields. An expiry the owner set is no longer an estimate. */
	updateStock(id: string, patch: StockPatch): { item: StockItem | undefined; undo: Undo } {
		const item = this.stockById(id)
		const undo = this.#commit(
			this.#changed<StockItem>('stock', id, (target) =>
				without({
					...target,
					...patch,
					// a name and a quantity are never cleared: an empty one leaves what was there
					name: patch.name?.trim() || target.name,
					qty: patch.qty?.trim() || target.qty,
					estimated: 'expiry' in patch && patch.expiry !== target.expiry ? undefined : target.estimated,
				})
			),
			'garden.feed.stockEdited',
			{ name: patch.name ?? item?.name ?? '' }
		)
		return { item, undo }
	}

	removeStock(id: string): { item: StockItem | undefined; undo: Undo } {
		const item = this.stockById(id)
		const undo = this.#commit(this.#removed('stock', [id], this.#pictures([id])), 'garden.feed.stockRemoved', {
			name: item?.name ?? '',
		})
		return { item, undo }
	}

	removeStockMany(ids: string[]): { count: number; undo: Undo } {
		const undo = this.#commit(this.#removed('stock', ids, this.#pictures(ids)), 'garden.feed.stockRemovedMany', {
			count: ids.length,
		})
		return { count: ids.length, undo }
	}

	moveStock(id: string, location: StockLocation, locationLabel: string): { item: StockItem | undefined; undo: Undo } {
		const item = this.stockById(id)
		const undo = this.#commit(
			this.#changed<StockItem>('stock', id, (target) => ({ ...target, location })),
			'garden.feed.stockMoved',
			{ name: item?.name ?? '', location: locationLabel }
		)
		return { item, undo }
	}

	moveStockMany(ids: string[], location: StockLocation, locationLabel: string): { count: number; undo: Undo } {
		const moved = this.stock.filter((item) => ids.includes(item.id) && item.location !== location)
		if (!moved.length) return { count: 0, undo: () => {} }
		const undo = this.#commit(
			this.#replaced(
				'stock',
				moved.map((item) => ({ ...$state.snapshot(item), location }))
			),
			'garden.feed.stockMovedMany',
			{ count: moved.length, location: locationLabel }
		)
		return { count: moved.length, undo }
	}

	// Grocery

	addToGrocery(
		name: string,
		qty = '',
		origin: GroceryOrigin = 'manual',
		note?: string
	): { item: GroceryItem; undo: Undo } {
		const item: GroceryItem = without({ id: newId(), name, qty, origin, note, done: false })
		// an empty quantity is the item's, not a cleared field
		item.qty = qty
		const undo = this.#commit(this.#added('grocery', item), 'garden.feed.groceryAdded', { name })
		return { item, undo }
	}

	addGrocery(text: string): { item: GroceryItem; undo: Undo } {
		const parsed = parseGrocery(text)
		return this.addToGrocery(parsed.name, parsed.qty)
	}

	/** Puts several items on the grocery list at once: what a drafted list, a plan or a recipe's missing lines commit. */
	addGroceryItems(
		rows: { name: string; qty?: string; note?: string }[],
		origin: GroceryOrigin = 'manual'
	): { items: GroceryItem[]; undo: Undo } {
		const items: GroceryItem[] = rows.map((row) => ({
			id: newId(),
			name: row.name,
			qty: row.qty ?? '',
			origin,
			...(row.note ? { note: row.note } : {}),
			done: false,
		}))
		if (!items.length) return { items, undo: () => {} }
		this.#ensureList()
		const ids = items.map((item) => item.id)
		const undo = this.#commit(
			{
				apply: () => (this.grocery.items = [...this.grocery.items, ...items]),
				revert: () => (this.grocery.items = this.grocery.items.filter((entry) => !ids.includes(entry.id))),
				write: () => applyBatch(items.map((item) => this.#create('grocery', item))),
				unwrite: () => deleteRows(ids.map((id) => toUri(KITCHEN.item, id))),
			},
			'garden.feed.groceryAddedMany',
			{ count: items.length }
		)
		return { items, undo }
	}

	updateGrocery(id: string, patch: GroceryPatch): { item: GroceryItem | undefined; undo: Undo } {
		const item = this.grocery.items.find((entry) => entry.id === id)
		const undo = this.#commit(
			this.#changed<GroceryItem>('grocery', id, (target) => ({
				...without({ ...target, ...patch }),
				name: patch.name?.trim() || target.name,
				qty: patch.qty ?? target.qty,
			}))
		)
		return { item, undo }
	}

	toggleGrocery(id: string): { item: GroceryItem | undefined; undo: Undo } {
		const item = this.grocery.items.find((entry) => entry.id === id)
		const checking = !item?.done
		const undo = this.#commit(
			this.#changed<GroceryItem>('grocery', id, (target) => ({ ...target, done: !target.done })),
			checking ? 'garden.feed.groceryChecked' : undefined,
			{ name: item?.name ?? '' }
		)
		return { item, undo }
	}

	removeGrocery(id: string): { item: GroceryItem | undefined; undo: Undo } {
		const item = this.grocery.items.find((entry) => entry.id === id)
		const undo = this.#commit(this.#removed('grocery', [id]))
		return { item, undo }
	}

	clearChecked(): { count: number; undo: Undo } {
		const checked = this.grocery.items.filter((item) => item.done).map((item) => item.id)
		const undo = this.#commit(this.#removed('grocery', checked), 'garden.feed.groceryCleared', {
			count: checked.length,
		})
		return { count: checked.length, undo }
	}

	/**
	 * Changes the list itself: its name, the store its items are bought at unless they say otherwise, its shop day.
	 * A shop day set or cleared moves the morning's reminder with it (docs/engineering/signals.md).
	 */
	updateList(patch: Partial<Pick<GroceryList, 'name' | 'store' | 'shopDay'>>): Undo {
		const created = !this.#listId
		this.#ensureList()
		const id = this.#listId!
		const { items: _items, ...before } = $state.snapshot(this.grocery)
		const after = { ...before, ...patch }
		const payload = (list: typeof before): GroceryListPayload => ({
			name: list.name,
			store: list.store,
			...(list.shopDay ? { shopDay: list.shopDay } : {}),
		})
		const show = (list: typeof before) => {
			this.grocery.name = list.name
			this.grocery.store = list.store
			this.grocery.shopDay = list.shopDay || undefined
		}
		const undo = this.#commit({
			apply: () => show(after),
			revert: () => show(before),
			write: () => updateEntity(id, payload(after)),
			// a list this change made stays, empty of what the change set: its row is what the items name
			unwrite: () => updateEntity(id, payload(created ? { name: '', store: '' } : before)),
		})
		if ('shopDay' in patch) this.#remind()
		return () => {
			undo()
			if ('shopDay' in patch) this.#remind()
		}
	}

	// Recipes

	/** Saves a recipe the owner checked: a draft from a page, a photo, pasted text or the Gardener. */
	addRecipe(draft: RecipeDraft): { recipe: Recipe; undo: Undo } {
		const recipe: Recipe = {
			...without(draft),
			tags: draft.tags,
			ingredients: draft.ingredients,
			steps: draft.steps,
			id: newId(),
		}
		const undo = this.#commit(this.#added('recipes', recipe), 'garden.feed.recipeSaved', { name: recipe.name })
		return { recipe, undo }
	}

	updateRecipe(id: string, draft: RecipeDraft): { recipe: Recipe | undefined; undo: Undo } {
		const recipe = this.recipeById(id)
		const undo = this.#commit(
			this.#changed<Recipe>('recipes', id, () => ({
				...without(draft),
				tags: draft.tags,
				ingredients: draft.ingredients,
				steps: draft.steps,
				id,
			}))
		)
		return { recipe, undo }
	}

	removeRecipe(id: string): { recipe: Recipe | undefined; undo: Undo } {
		const recipe = this.recipeById(id)
		const undo = this.#commit(this.#removed('recipes', [id]), 'garden.feed.recipeRemoved', {
			name: recipe?.name ?? '',
		})
		return { recipe, undo }
	}

	/**
	 * "I cooked this" (kitchen.md, "Cooking decrements stock"): each change sets what an item holds after, in its own
	 * unit. An item left with nothing is removed, unless it has a low-stock threshold: that one stays at zero, where
	 * it reads as low and can go on the list. One batch, one undo.
	 */
	cookRecipe(id: string, changes: { stockId: string; qty: string }[]): { count: number; undo: Undo } {
		const recipe = this.recipeById(id)
		const after: StockItem[] = []
		const gone: string[] = []
		for (const change of changes) {
			const item = this.stockById(change.stockId)
			if (!item) continue
			const empty = Number(change.qty) === 0
			if (empty && item.threshold === undefined) gone.push(item.id)
			else after.push({ ...$state.snapshot(item), qty: change.qty })
		}
		const undo = this.#commit(this.#replaced('stock', after, gone, this.#pictures(gone)), 'garden.feed.recipeCooked', {
			name: recipe?.name ?? '',
		})
		return { count: after.length + gone.length, undo }
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
		const undo = this.#commit(
			{
				apply: () => show(after),
				revert: () => show(before),
				write: () => applyBatch([...remove(old), ...after.ops]),
				unwrite: () => applyBatch([...remove(sample), ...restore(old)]),
			},
			'garden.feed.sampleAdded',
			{ domain: domainName }
		)
		// the list was replaced under the reminder, and the undo replaces it again
		this.#remind()
		return () => {
			undo()
			this.#remind()
		}
	}

	/** The URIs of the pictures of some stock items: they go, and come back, with the items. */
	#pictures(ids: readonly string[]): string[] {
		return this.stock.flatMap((item) => (ids.includes(item.id) && item.photo ? [photoUri(item.photo)] : []))
	}

	/** The list a name stands for: the stock, the recipes, or the items of the grocery list. */
	#list(name: ListName): Kept[] {
		return name === 'stock' ? this.stock : name === 'recipes' ? this.recipes : this.grocery.items
	}

	#show(name: ListName, records: Kept[]) {
		if (name === 'stock') this.stock = records as StockItem[]
		else if (name === 'recipes') this.recipes = records as Recipe[]
		else this.grocery.items = records as GroceryItem[]
	}

	/** A record's payload: itself without its id, and with its list when it is on one. */
	#payload(name: ListName, record: Kept): object {
		const { id: _id, ...payload } = $state.snapshot(record) as Kept
		return name === 'grocery' ? { ...payload, listId: this.#listId } : payload
	}

	#create(name: ListName, record: Kept): BatchOp {
		return { op: 'createEntity', input: { id: record.id, type: TYPE[name], payload: this.#payload(name, record) } }
	}

	#update(name: ListName, record: Kept): BatchOp {
		return { op: 'updateEntity', id: record.id, payload: this.#payload(name, record) }
	}

	/** The grocery list's row is made with the first item put on it, in a write of its own ahead of the item's. */
	#ensureList() {
		if (this.#listId) return
		const id = (this.#listId = newId())
		const { items: _items, ...payload } = this.data().grocery
		this.#queue.enqueue(() => createEntity({ id, type: KITCHEN.list, payload }))
	}

	#added(name: ListName, record: Kept): Change {
		if (name === 'grocery') this.#ensureList()
		const payload = this.#payload(name, record)
		const uri = toUri(TYPE[name], record.id)
		return {
			apply: () => this.#show(name, [...this.#list(name), record]),
			revert: () =>
				this.#show(
					name,
					this.#list(name).filter((entry) => entry.id !== record.id)
				),
			write: () => createEntity({ id: record.id, type: TYPE[name], payload }),
			unwrite: () => deleteRows([uri]),
		}
	}

	/** The undo puts the list back as it was, so what was removed returns to its place. */
	#removed(name: ListName, ids: string[], also: string[] = []): Change {
		const before = $state.snapshot(this.#list(name)) as Kept[]
		const uris = [...ids.map((id) => toUri(TYPE[name], id)), ...also]
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

	#changed<T extends Kept>(name: ListName, id: string, change: (record: T) => T): Change {
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
			write: () => updateEntity(id, this.#payload(name, after)),
			unwrite: () => updateEntity(id, this.#payload(name, before)),
		}
	}

	/** Several records replaced, and some removed, as one batch: the undo puts the list back as it was. */
	#replaced(name: ListName, after: Kept[], gone: string[] = [], also: string[] = []): Change {
		const before = $state.snapshot(this.#list(name)) as Kept[]
		const was = before.filter((entry) => after.some((record) => record.id === entry.id))
		const uris = [...gone.map((id) => toUri(TYPE[name], id)), ...also]
		const nothing = async () => {}
		if (!after.length && !gone.length) return { apply: () => {}, revert: () => {}, write: nothing, unwrite: nothing }
		return {
			apply: () =>
				this.#show(
					name,
					this.#list(name)
						.filter((entry) => !gone.includes(entry.id))
						.map((entry) => after.find((record) => record.id === entry.id) ?? entry)
				),
			revert: () => this.#show(name, before),
			write: () =>
				applyBatch([
					...after.map((record) => this.#update(name, record)),
					...uris.map((uri): BatchOp => ({ op: 'delete', uri })),
				]),
			unwrite: () =>
				applyBatch([
					...uris.map((uri): BatchOp => ({ op: 'restore', uri })),
					...was.map((record) => this.#update(name, record)),
				]),
		}
	}

	/** Shows the change, queues its write and records it; the undo shows the way back and queues that. */
	#commit(change: Change, feedKey?: string, values?: Record<string, string | number>): Undo {
		change.apply()
		this.#queue.enqueue(change.write)
		const entry = feedKey ? feed.record('kitchen', feedKey, values) : undefined
		// an undo is taken once: a second press of the same toast must not send the way back twice
		let undone = false
		return () => {
			if (undone) return
			undone = true
			change.revert()
			this.#queue.enqueue(change.unwrite)
			if (entry) feed.forget(entry.id)
		}
	}
}

export const kitchen = new KitchenStore()
