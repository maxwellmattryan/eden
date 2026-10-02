// Hearth's store (product/domains/kitchen.md): stock by location, the recipes and a grocery list per store. The rows
// live in the data layer (`@eden/shared/data`), one per stock item, recipe, store, list and list item; the store is what
// the page sees of them. A write changes the store at once and is sent after, in order (`WriteQueue`), and every
// write hands back an undo, so the page can show the undo toast in place of a confirm sheet (D-12); each write also
// lands in the Garden's activity feed. A change to several rows (a haul, a recipe cooked, a bulk move) is one batch
// and one undo.
import { SvelteMap } from 'svelte/reactivity'
import { logError } from '../../api/index.js'
import {
	applyBatch,
	attachBytes,
	createEntity,
	deleteRows,
	importLegacyDocument,
	newId,
	queryAttachments,
	queryEntities,
	readAttachment,
	restoreRows,
	toUri,
	updateEntity,
	WriteQueue,
	type AttachmentKind,
	type BatchOp,
	type Write,
} from '../../data/index.js'
import { nowIso } from '../../dates/index.js'
import { buyAgain, lapsed, ranOut, recentlyOut } from './out.js'
import { emptyGrocery, kitchenFromRows, kitchenRows, kitchenUris } from './rows.js'
import { ensureShopDay } from './signals.js'
import { expiresSoon } from './digest.js'
import { groceryBlocks, remember, reorderStores, storeFor } from './filing.js'
import { groceryUpgrade } from './upgrade.js'
import { isLow, isOut } from './quantity.js'
import {
	ITEM_PHOTO,
	STORE_PHOTO,
	KITCHEN,
	LOCATIONS,
	RECIPE_PHOTO,
	type CaptureMode,
	type Grocery,
	type GroceryItem,
	type GroceryItemPayload,
	type GroceryList,
	type GroceryListPayload,
	type GroceryOrigin,
	type GroceryStore,
	type GroceryStorePayload,
	type KitchenData,
	type Recipe,
	type RecipePayload,
	type StockItem,
	type StockLocation,
	type StockPayload,
	type StorePlace,
	type StoreSells,
} from './types.js'
import { mergeInto, type HaulRow } from './capture.js'
import { mergeTarget } from './match.js'
import { parseGrocery } from './parse.js'
import { type RecipeDraft } from './recipe-import.js'
import { feed } from '../../shell/index.js'
import { seedData } from './seed.js'
import type { RecipePicture } from './staging.svelte.js'

export { LOCATIONS }
export type {
	Grocery,
	GroceryItem,
	GroceryList,
	GroceryOrigin,
	GroceryStore,
	Ingredient,
	KitchenData,
	Recipe,
	StockItem,
	StockLocation,
	StockSource,
	StoreSells,
} from './types.js'
export type { GroceryBlock } from './filing.js'
export type { HaulRow } from './capture.js'
export type { RecipeDraft } from './recipe-import.js'

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
	Pick<StockItem, 'name' | 'brand' | 'size' | 'qty' | 'unit' | 'location' | 'expiry' | 'category' | 'threshold' | 'tip'>
>
/** What the owner may change of a grocery item; `storeId` moves it to that store's list, `null` to the unfiled one. */
export type GroceryPatch = Partial<Pick<GroceryItem, 'name' | 'brand' | 'size' | 'price' | 'qty' | 'note'>> & {
	storeId?: string | null
}
/** A line as it is put on a list: its name, and what else is known of it. */
export type GroceryRow = Pick<GroceryItem, 'name'> &
	Partial<Pick<GroceryItem, 'brand' | 'size' | 'price' | 'qty' | 'note'>>
/** Where and when a captured haul was bought (D-105): the store that learns its prices, and the receipt's day. */
export interface HaulFrom {
	storeId: string
	/** An ISO date; none when the files show no day, which reads as now. */
	boughtOn?: string
}
/**
 * Where an added item goes: a store's id puts it on that store's list, `null` on the unfiled one, and nothing files
 * it where it was last bought (D-97).
 */
export type GroceryTarget = string | null | undefined
/** What a store's form changes; an empty note or an empty field of its place clears it. */
export type StorePatch = Partial<Pick<GroceryStore, 'name' | 'sells' | 'note' | 'place'>>

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
	grocery = $state<Grocery>(emptyGrocery())
	/**
	 * The items' pictures (D-90) and the stores' (D-103): the small image of each `item-photo` and `store-photo`
	 * Attachment, by the Attachment's id.
	 */
	readonly photos = new SvelteMap<string, string>()
	/** The recipes' pictures in full (D-93), by the Attachment's id: object URLs, read when a recipe is first opened. */
	readonly #images = new SvelteMap<string, string>()
	// a plain set, never read reactively: a picture is asked for from inside a `$derived`, where writing state is
	// forbidden (state_unsafe_mutation)
	// eslint-disable-next-line svelte/prefer-svelte-reactivity
	readonly #reading = new Set<string>()

	#loading: Promise<void> | undefined
	readonly #queue = new WriteQueue(
		(failed) => (this.saveFailed = failed),
		(error) => void logError('data', 'A Hearth write failed', String(error)).catch(() => null)
	)

	readonly expiring = $derived(this.stock.filter((item) => this.soon(item)).sort(SORTS.expiry))
	readonly lowItems = $derived(this.stock.filter((item) => isLow(item)))
	/** What ran out lately (D-92): Stock's own list of it, the newest first. */
	readonly recentlyOut = $derived(recentlyOut(this.stock, Date.now()))
	/** "Buy it again": everything that ran out, less what is already on a grocery list. */
	readonly buyAgain = $derived(buyAgain(this.stock, this.grocery.items))
	/** The page's lists (D-96): one per store, then what is not filed while there is any. */
	readonly blocks = $derived(groceryBlocks(this.grocery))

	/** Expiring, by the rule the morning's digest counts by (`@eden/shared/domains/kitchen`). */
	soon(item: StockItem): boolean {
		return expiresSoon(item)
	}

	/** An item's picture, when it has one. */
	photoOf(item: Pick<StockItem, 'photo'>): string | undefined {
		return item.photo ? this.photos.get(item.photo) : undefined
	}

	/** A store's picture, when it has one (D-103). */
	storePhotoOf(store: Pick<GroceryStore, 'photo'> | undefined): string | undefined {
		return store?.photo ? this.photos.get(store.photo) : undefined
	}

	/** Low, by the rule the low-stock digest counts by: holding no more than its threshold. */
	low(item: StockItem): boolean {
		return isLow(item)
	}

	/** Ran out (D-92): holding nothing. The item stays, to be shown as run out and bought again. */
	out(item: StockItem): boolean {
		return isOut(item)
	}

	/** What is there, in its four sections, sorted, with what never expires last; empty sections dropped. */
	sections(filter: (item: StockItem) => boolean = () => true, sort: StockSort = 'expiry') {
		return LOCATIONS.map((location) => ({
			location,
			items: this.stock.filter((item) => item.location === location && !isOut(item) && filter(item)).sort(SORTS[sort]),
		})).filter((section) => section.items.length)
	}

	/** Reads the rows, once; the first time, what the old document held is brought over before. */
	load(): Promise<void> {
		return (this.#loading ??= this.#read())
	}

	async #read() {
		try {
			await importLegacyDocument<KitchenData>(DOCUMENT, (data) => kitchenRows(data, newId).ops)
			const groceryRows = () =>
				Promise.all([
					queryEntities<GroceryStorePayload>({ type: KITCHEN.store }),
					queryEntities<GroceryListPayload>({ type: KITCHEN.list }),
					queryEntities<GroceryItemPayload>({ type: KITCHEN.item }),
				])
			const [stock, recipes, pictures] = await Promise.all([
				queryEntities<StockPayload>({ type: KITCHEN.stock }),
				queryEntities<RecipePayload>({ type: KITCHEN.recipe }),
				// the pictures are what the rows are shown with, never what they stand on
				queryAttachments({ kinds: [ITEM_PHOTO, RECIPE_PHOTO, STORE_PHOTO] }).catch(() => []),
			])
			// rows from before there was a list per store (D-96) are brought over once, then read again
			let [stores, lists, items] = await groceryRows()
			const upgrade = groceryUpgrade({ stores, lists, items }, newId, nowIso())
			if (upgrade.length) {
				await applyBatch(upgrade)
				;[stores, lists, items] = await groceryRows()
			}
			this.photos.clear()
			for (const picture of pictures) if (picture.thumbnail) this.photos.set(picture.id, picture.thumbnail)
			const data = kitchenFromRows({ stock, recipes, stores, lists, items })
			this.stock = data.stock
			this.recipes = data.recipes
			this.grocery = data.grocery
			this.saveFailed = this.#queue.failed
			this.#letGo()
		} catch (error) {
			// nothing was read: say so, and let the retry read again
			this.#loading = undefined
			this.saveFailed = true
			await logError('data', 'Could not read the Hearth rows', String(error)).catch(() => null)
		}
		this.ready = true
	}

	/** Lets go of what ran out long ago and was never bought again (D-92), with its picture: quietly, no undo. */
	#letGo() {
		const gone = lapsed(this.stock, Date.now())
		if (!gone.length) return
		const ids = gone.map((item) => item.id)
		const uris = [...ids.map((id) => toUri(KITCHEN.stock, id)), ...this.#pictures(ids)]
		this.stock = this.stock.filter((item) => !ids.includes(item.id))
		this.#queue.enqueue(() => deleteRows(uris))
	}

	/** Reads the rows again, after an import changed them under the store. What is waiting to be sent is sent first. */
	async reload() {
		await this.#queue.settled()
		this.#loading = undefined
		await this.load()
		this.#remind()
	}

	/** Sets the shop-day reminder again from the lists as they are stored, once what is waiting has been sent. */
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

	/** A recipe's small picture, for its row; nothing when it has none. */
	recipeThumb(recipe: Pick<Recipe, 'photo'>): string | undefined {
		return recipe.photo ? this.photos.get(recipe.photo) : undefined
	}

	/**
	 * A recipe's picture for its page: the whole of it once it has been read from the workspace, the small one until
	 * then and wherever the file is not on this device.
	 */
	recipeImage(recipe: Pick<Recipe, 'photo'>): string | undefined {
		const id = recipe.photo
		if (!id) return undefined
		const full = this.#images.get(id)
		if (full) return full
		if (!this.#reading.has(id)) {
			this.#reading.add(id)
			void readAttachment(id)
				.then((bytes) => {
					if (bytes?.length && !this.#images.has(id))
						this.#images.set(
							id,
							URL.createObjectURL(new Blob([bytes as Uint8Array<ArrayBuffer>], { type: 'image/jpeg' }))
						)
				})
				.catch(() => null)
		}
		return this.photos.get(id)
	}

	recipeById(id: string): Recipe | undefined {
		return this.recipes.find((recipe) => recipe.id === id)
	}

	stockById(id: string): StockItem | undefined {
		return this.stock.find((item) => item.id === id)
	}

	// Stock

	/**
	 * Adds one item from its fields: what the Add to stock form holds (D-109). A name that ran out (D-92) brings
	 * that item back, with its picture, where it was kept unless the fields say where, and what the form filled of
	 * its date, category, threshold and tip is laid over what the item kept.
	 */
	addStockItem(fields: {
		name: string
		brand?: string
		size?: string
		qty?: string
		unit?: string
		location?: StockLocation
		expiry?: string
		category?: string
		threshold?: number
		tip?: string
	}): {
		item: StockItem
		undo: Undo
	} {
		const row = {
			id: '',
			name: fields.name,
			...(fields.brand ? { brand: fields.brand } : {}),
			...(fields.size ? { size: fields.size } : {}),
			qty: fields.qty || '1',
			unit: fields.unit,
			location: 'pantry' as const,
		}
		const empty = this.stock.filter((entry) => isOut(entry))
		const held = mergeTarget(row, empty)
		const extra = {
			...(fields.expiry ? { expiry: fields.expiry } : {}),
			...(fields.category ? { category: fields.category } : {}),
			...(fields.threshold === undefined ? {} : { threshold: fields.threshold }),
			...(fields.tip ? { tip: fields.tip } : {}),
		}
		const merged = held
			? mergeInto($state.snapshot(held), { ...row, location: fields.location ?? held.location })
			: undefined
		const back = merged ? { ...merged, ...extra } : undefined
		if (held && back) {
			const undo = this.#commit(
				this.#changed<StockItem>('stock', held.id, () => back),
				'garden.feed.stockAdded',
				{ name: back.name }
			)
			return { item: back, undo }
		}
		const item: StockItem = without({
			id: newId(),
			name: fields.name,
			brand: fields.brand || undefined,
			size: fields.size || undefined,
			qty: fields.qty || '1',
			unit: fields.unit,
			location: fields.location ?? 'pantry',
			...extra,
			source: 'manual' as const,
			sourcedAt: nowIso(),
		})
		const undo = this.#commit(this.#added('stock', item), 'garden.feed.stockAdded', { name: item.name })
		return { item, undo }
	}

	/**
	 * Adds several stock items in one batch, one feed entry and one undo: what the Gardener's `add-stock` writes. A
	 * row whose name ran out (D-92) brings that item back, as the Add to stock form does, and the rest are new. The items
	 * answer in the order of their rows.
	 */
	addStockRows(
		rows: {
			name: string
			brand?: string
			size?: string
			qty: string
			unit?: string
			location: StockLocation
			expiry?: string
			estimated?: boolean
			category?: string
			tip?: string
		}[]
	): { items: StockItem[]; undo: Undo } {
		const empty = this.stock.filter((entry) => isOut(entry))
		const taken: string[] = []
		const back: StockItem[] = []
		const fresh: StockItem[] = []
		const items = rows.map((row) => {
			const held = mergeTarget(row, empty)
			const revived = held && !taken.includes(held.id) ? mergeInto($state.snapshot(held), { ...row, id: '' }) : null
			if (held && revived) {
				taken.push(held.id)
				back.push(revived)
				return revived
			}
			const item: StockItem = without({
				id: newId(),
				name: row.name,
				brand: row.brand || undefined,
				size: row.size || undefined,
				qty: row.qty,
				unit: row.unit || undefined,
				location: row.location,
				expiry: row.expiry || undefined,
				estimated: row.estimated || undefined,
				category: row.category || undefined,
				tip: row.tip || undefined,
				source: 'manual' as const,
				sourcedAt: nowIso(),
			})
			fresh.push(item)
			return item
		})
		if (!items.length) return { items, undo: () => {} }
		const ids = fresh.map((item) => item.id)
		const before = $state.snapshot(this.stock.filter((entry) => taken.includes(entry.id)))
		const show = (records: StockItem[]) =>
			this.stock.map((entry) => records.find((record) => record.id === entry.id) ?? entry)
		const undo = this.#commit(
			{
				apply: () => (this.stock = [...show(back), ...fresh]),
				revert: () => (this.stock = show(before).filter((entry) => !ids.includes(entry.id))),
				write: () =>
					applyBatch([
						...fresh.map((item) => this.#create('stock', item)),
						...back.map((item) => this.#update('stock', item)),
					]),
				unwrite: () =>
					applyBatch([
						...ids.map((id): BatchOp => ({ op: 'delete', uri: toUri(KITCHEN.stock, id) })),
						...before.map((item) => this.#update('stock', item)),
					]),
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
	 * kept as the item's (D-90), unless the item it merges into has one already. A haul bought at a store Hearth has
	 * (`from`, D-105) teaches that store every row, with the price of each that has one, and counts as its last
	 * trip; the same undo takes that back.
	 */
	commitHaul(
		rows: readonly HaulRow[],
		images: readonly HaulImage[] = [],
		linked: readonly string[] = [],
		mode: CaptureMode = 'haul',
		from?: HaulFrom
	): { created: number; merged: number; undo: Undo } {
		const before = $state.snapshot(this.stock)
		const at = nowIso()
		const shop = mode === 'haul' ? $state.snapshot(this.storeById(from?.storeId)) : undefined
		// a receipt's day at noon, so a day's trip sorts among the day's other writes; never after now
		const boughtAt = from?.boughtOn && `${from.boughtOn}T12:00:00.000Z` < at ? `${from.boughtOn}T12:00:00.000Z` : at
		const taught = shop
			? remember(
					shop,
					rows.filter((row) => row.name.trim()).map(({ name, brand, size, price }) => ({ name, brand, size, price })),
					boughtAt
				)
			: undefined
		const shopped = taught
			? { ...taught, shoppedAt: shop?.shoppedAt && shop.shoppedAt > boughtAt ? shop.shoppedAt : boughtAt }
			: undefined
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
					brand: row.brand?.trim() || undefined,
					size: row.size?.trim() || undefined,
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
					this.#showStore(shopped)
				},
				revert: () => {
					this.stock = before
					if (shopped) this.#showStore(shop)
					for (const entry of pictures) this.photos.delete(entry.id)
				},
				write: async () => {
					if (!rowsWritten) {
						await applyBatch([
							...created.map((item) => this.#create('stock', item)),
							...merged.map(({ after }) => this.#update('stock', after)),
							...this.#storeOp(shopped),
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
						...(shopped ? this.#storeOp(shop) : []),
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

	/**
	 * Writes a picture as its Attachment, an item's unless `of` says a store's; a picture that cannot be kept leaves
	 * what it is of standing.
	 */
	async #keepPicture(
		id: string,
		ownerId: string,
		name: string,
		image: string,
		of: { kind: AttachmentKind; type: string } = { kind: ITEM_PHOTO, type: KITCHEN.stock }
	): Promise<void> {
		try {
			await attachBytes(
				{
					id,
					kind: of.kind,
					fileName: `${name.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '') || 'item'}.jpg`,
					mime: 'image/jpeg',
					thumbnail: image,
					links: [{ uri: toUri(of.type, ownerId), relation: 'from' }],
				},
				bytesOf(image)
			)
		} catch (error) {
			await logError('data', 'A picture could not be kept', String(error)).catch(() => null)
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
			this.#changed<StockItem>('stock', id, (target) => {
				const next: StockItem = without({
					...target,
					...patch,
					// a name and a quantity are never cleared: an empty one leaves what was there
					name: patch.name?.trim() || target.name,
					qty: patch.qty?.trim() || target.qty,
					estimated: 'expiry' in patch && patch.expiry !== target.expiry ? undefined : target.estimated,
				})
				// a quantity set to nothing is running out, and one set above it is the item back (D-92)
				if (isOut(next)) return ranOut(next, nowIso())
				const { outAt: _outAt, ...held } = next
				return held
			}),
			'garden.feed.stockEdited',
			{ name: patch.name ?? item?.name ?? '' }
		)
		return { item, undo }
	}

	/** The item ran out (D-92): it stays, holding nothing, to be bought again. Deleting is what forgets it. */
	ranOutStock(id: string): { item: StockItem | undefined; undo: Undo } {
		const item = this.stockById(id)
		const at = nowIso()
		const undo = this.#commit(
			this.#changed<StockItem>('stock', id, (target) => ranOut(target, at)),
			'garden.feed.stockRanOut',
			{ name: item?.name ?? '' }
		)
		return { item, undo }
	}

	ranOutStockMany(ids: string[]): { count: number; undo: Undo } {
		const at = nowIso()
		const after = this.stock
			.filter((item) => ids.includes(item.id) && !isOut(item))
			.map((item) => ranOut($state.snapshot(item), at))
		if (!after.length) return { count: 0, undo: () => {} }
		const undo = this.#commit(this.#replaced('stock', after), 'garden.feed.stockRanOutMany', { count: after.length })
		return { count: after.length, undo }
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

	storeById(id: string | undefined): GroceryStore | undefined {
		return id ? this.grocery.stores.find((store) => store.id === id) : undefined
	}

	/** The store whose list an item is on; none for one that is not filed. */
	storeOf(item: Pick<GroceryItem, 'listId'> | undefined): GroceryStore | undefined {
		return this.storeById(this.grocery.lists.find((list) => list.id === item?.listId)?.storeId)
	}

	/**
	 * A store's list, or with no store the list of what is not filed. Its row is made with the first thing put on
	 * it, in a write of its own ahead of that thing's, and stays: an undo takes back the thing, not the list.
	 */
	#listFor(storeId: string | undefined): string {
		const found = this.grocery.lists.find((list) => list.storeId === storeId)
		if (found) return found.id
		const list: GroceryList = { id: newId(), ...(storeId ? { storeId } : {}) }
		this.grocery.lists = [...this.grocery.lists, list]
		const { id, ...payload } = list
		this.#queue.enqueue(() => createEntity({ id, type: KITCHEN.list, payload }))
		return id
	}

	#showStore(store: GroceryStore | undefined) {
		if (store) this.grocery.stores = this.grocery.stores.map((entry) => (entry.id === store.id ? store : entry))
	}

	#showList(list: GroceryList) {
		this.grocery.lists = this.grocery.lists.map((entry) => (entry.id === list.id ? list : entry))
	}

	#storeOp(store: GroceryStore | undefined): BatchOp[] {
		if (!store) return []
		const { id, ...payload } = store
		return [{ op: 'updateEntity', id, payload }]
	}

	#listOp(list: GroceryList): BatchOp {
		const { id, ...payload } = list
		return { op: 'updateEntity', id, payload }
	}

	/**
	 * Puts rows on the lists as one batch and one undo. A store the owner named takes them all and remembers them;
	 * with none named, each goes where it was last bought, and what no store remembers is left unfiled.
	 */
	#put(
		rows: GroceryRow[],
		origin: GroceryOrigin,
		target: GroceryTarget,
		feedKey: string,
		values: Record<string, string | number>
	): { items: GroceryItem[]; undo: Undo } {
		const stores = $state.snapshot(this.grocery.stores)
		const named = typeof target === 'string' ? stores.find((store) => store.id === target) : undefined
		const storeIdFor = (name: string) => (target === undefined ? storeFor(name, stores)?.id : named?.id)
		const items: GroceryItem[] = rows.map((row) => ({
			id: newId(),
			name: row.name,
			...(row.brand ? { brand: row.brand } : {}),
			...(row.size ? { size: row.size } : {}),
			...(row.price === undefined ? {} : { price: row.price }),
			qty: row.qty ?? '',
			listId: this.#listFor(storeIdFor(row.name)),
			origin,
			...(row.note ? { note: row.note } : {}),
			done: false,
		}))
		const ids = items.map((item) => item.id)
		const remembered = named
			? // putting a thing on a store's list teaches where it is filed, and no price: it is not bought yet
				remember(
					named,
					rows.map((row) => ({ name: row.name })),
					nowIso()
				)
			: undefined
		const undo = this.#commit(
			{
				apply: () => {
					this.grocery.items = [...this.grocery.items, ...items]
					this.#showStore(remembered)
				},
				revert: () => {
					this.grocery.items = this.grocery.items.filter((entry) => !ids.includes(entry.id))
					if (remembered) this.#showStore(named)
				},
				write: () => applyBatch([...items.map((item) => this.#create('grocery', item)), ...this.#storeOp(remembered)]),
				unwrite: () =>
					applyBatch([
						...ids.map((id): BatchOp => ({ op: 'delete', uri: toUri(KITCHEN.item, id) })),
						...(remembered ? this.#storeOp(named) : []),
					]),
			},
			feedKey,
			values
		)
		return { items, undo }
	}

	/** Adds one item; the answer names the store whose list it landed on, none when it is not filed. */
	addToGrocery(
		row: GroceryRow,
		origin: GroceryOrigin = 'manual',
		target?: GroceryTarget
	): { item: GroceryItem; store: GroceryStore | undefined; undo: Undo } {
		const { items, undo } = this.#put([row], origin, target, 'garden.feed.groceryAdded', { name: row.name })
		const item = items[0]!
		return { item, store: this.storeOf(item), undo }
	}

	addGrocery(text: string, target?: GroceryTarget): { item: GroceryItem; store: GroceryStore | undefined; undo: Undo } {
		const parsed = parseGrocery(text)
		return this.addToGrocery(parsed, 'manual', target)
	}

	/** Puts several items on the lists at once: what a drafted list, a plan or a recipe's missing lines commit. */
	addGroceryItems(
		rows: GroceryRow[],
		origin: GroceryOrigin = 'manual',
		target?: GroceryTarget
	): { items: GroceryItem[]; undo: Undo } {
		if (!rows.length) return { items: [], undo: () => {} }
		return this.#put(rows, origin, target, 'garden.feed.groceryAddedMany', { count: rows.length })
	}

	/**
	 * Changes an item's fields, and with `storeId` in the patch moves it to that store's list, which then remembers
	 * it: the next one of that name is filed there. One change, one undo.
	 */
	updateGrocery(
		id: string,
		patch: GroceryPatch
	): { item: GroceryItem | undefined; store: GroceryStore | undefined; undo: Undo } {
		const found = this.grocery.items.find((entry) => entry.id === id)
		if (!found) return { item: undefined, store: undefined, undo: () => {} }
		const before = $state.snapshot(found)
		const { storeId, ...fields } = patch
		const to = this.storeById(storeId ?? undefined)
		const moving = 'storeId' in patch && to?.id !== this.storeOf(before)?.id
		const after: GroceryItem = {
			...without({ ...before, ...fields }),
			name: fields.name?.trim() || before.name,
			qty: fields.qty ?? before.qty,
			listId: moving ? this.#listFor(to?.id) : before.listId,
		}
		const named = moving && to ? $state.snapshot(to) : undefined
		const remembered = named ? remember(named, [{ name: after.name }], nowIso()) : undefined
		const put = (record: GroceryItem) =>
			(this.grocery.items = this.grocery.items.map((entry) => (entry.id === id ? record : entry)))
		const undo = this.#commit({
			apply: () => {
				put(after)
				this.#showStore(remembered)
			},
			revert: () => {
				put(before)
				if (remembered) this.#showStore(named)
			},
			write: () => applyBatch([this.#update('grocery', after), ...this.#storeOp(remembered)]),
			unwrite: () => applyBatch([this.#update('grocery', before), ...(remembered ? this.#storeOp(named) : [])]),
		})
		return { item: found, store: moving ? to : this.storeOf(before), undo }
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

	/**
	 * Completes a list: the trip is done, so what is checked leaves it, its store remembers having sold those things
	 * (which is what files the next ones there, D-97), what a priced line cost (D-105) and when it was shopped, and its shop day, now past, is cleared. What is not checked
	 * stays for the next trip. One batch, one undo.
	 */
	completeList(listId: string): { count: number; undo: Undo } {
		const list = this.grocery.lists.find((entry) => entry.id === listId)
		const done = this.grocery.items.filter((item) => item.listId === listId && item.done)
		if (!list || !done.length) return { count: 0, undo: () => {} }
		const ids = done.map((item) => item.id)
		const items = $state.snapshot(this.grocery.items)
		const listBefore = $state.snapshot(list)
		const { shopDay, ...listAfter } = listBefore
		const named = $state.snapshot(this.storeById(list.storeId))
		const at = nowIso()
		const remembered = named
			? {
					// a price the owner typed on a line is what the store now knows the thing to cost (D-105)
					...remember(
						named,
						done.map(({ name, brand, size, price }) => ({ name, brand, size, price })),
						at
					),
					shoppedAt: at,
				}
			: undefined
		const uris = ids.map((id) => toUri(KITCHEN.item, id))
		const undo = this.#commit(
			{
				apply: () => {
					this.grocery.items = this.grocery.items.filter((entry) => !ids.includes(entry.id))
					this.#showStore(remembered)
					this.#showList(listAfter)
				},
				revert: () => {
					this.grocery.items = items
					this.#showStore(named)
					this.#showList(listBefore)
				},
				write: () =>
					applyBatch([
						...uris.map((uri): BatchOp => ({ op: 'delete', uri })),
						...this.#storeOp(remembered),
						...(shopDay ? [this.#listOp(listAfter)] : []),
					]),
				unwrite: () =>
					applyBatch([
						...uris.map((uri): BatchOp => ({ op: 'restore', uri })),
						...this.#storeOp(named),
						...(shopDay ? [this.#listOp(listBefore)] : []),
					]),
			},
			'garden.feed.groceryCleared',
			{ count: ids.length }
		)
		if (!shopDay) return { count: ids.length, undo }
		this.#remind()
		return {
			count: ids.length,
			undo: () => {
				undo()
				this.#remind()
			},
		}
	}

	/**
	 * Sets or clears a store's shop day (D-98), on its list. The morning's reminder moves with it
	 * (docs/engineering/signals.md).
	 */
	setShopDay(storeId: string, shopDay: string | undefined): Undo {
		const id = this.#listFor(storeId)
		const before = $state.snapshot(this.grocery.lists.find((list) => list.id === id)!)
		const { shopDay: _shopDay, ...rest } = before
		const after: GroceryList = shopDay ? { ...rest, shopDay } : rest
		const undo = this.#commit({
			apply: () => this.#showList(after),
			revert: () => this.#showList(before),
			write: () => applyBatch([this.#listOp(after)]),
			unwrite: () => applyBatch([this.#listOp(before)]),
		})
		this.#remind()
		return () => {
			undo()
			this.#remind()
		}
	}

	/**
	 * Adds a store, which has a list from then on, with whatever else its form held (its note, where it is). A name
	 * a store already has, whatever its case, answers that store.
	 */
	addStore(
		name: string,
		sells: StoreSells[] = ['grocery'],
		more: Pick<StorePatch, 'note' | 'place'> = {}
	): { store: GroceryStore; created: boolean; undo: Undo } {
		const key = name.trim().toLowerCase()
		const known = this.grocery.stores.find((store) => store.name.trim().toLowerCase() === key)
		if (known) return { store: known, created: false, undo: () => {} }
		const position = Math.max(-1, ...this.grocery.stores.map((entry, at) => entry.position ?? at)) + 1
		const place = without<StorePlace>(more.place ?? {})
		const store: GroceryStore = without({
			id: newId(),
			name: name.trim(),
			sells,
			position,
			note: more.note?.trim(),
			place: Object.keys(place).length ? place : undefined,
		})
		const { id, ...payload } = store
		const uri = toUri(KITCHEN.store, id)
		const undo = this.#commit({
			apply: () => (this.grocery.stores = [...this.grocery.stores, store]),
			revert: () => (this.grocery.stores = this.grocery.stores.filter((entry) => entry.id !== id)),
			write: () => createEntity({ id, type: KITCHEN.store, payload }),
			unwrite: () => deleteRows([uri]),
		})
		return { store, created: true, undo }
	}

	/**
	 * Changes a store's name, what it sells, its note or where it is (D-101). Its list and what it remembers are its
	 * own and stay.
	 */
	updateStore(id: string, patch: StorePatch): { store: GroceryStore | undefined; undo: Undo } {
		const found = this.storeById(id)
		if (!found) return { store: undefined, undo: () => {} }
		const before = $state.snapshot(found)
		const place = 'place' in patch ? without<StorePlace>(patch.place ?? {}) : before.place
		const after: GroceryStore = without({
			...before,
			...patch,
			name: patch.name?.trim() || before.name,
			note: 'note' in patch ? patch.note?.trim() : before.note,
			place: place && Object.keys(place).length ? place : undefined,
		})
		const undo = this.#commit({
			apply: () => this.#showStore(after),
			revert: () => this.#showStore(before),
			write: () => applyBatch(this.#storeOp(after)),
			unwrite: () => applyBatch(this.#storeOp(before)),
		})
		return { store: found, undo }
	}

	/**
	 * Gives a store a picture (a small image as a data URL), or takes its picture away (D-103). The one it had is
	 * deleted with the change and comes back with the undo.
	 */
	setStorePhoto(id: string, image: string | undefined): { store: GroceryStore | undefined; undo: Undo } {
		const found = this.storeById(id)
		if (!found) return { store: undefined, undo: () => {} }
		const was = found.photo
		const photo = image ? newId() : undefined
		// the store as it stands when the write runs: its list may have been completed since, and that is kept
		const withPhoto = (value: string | undefined): GroceryStore | undefined => {
			const now = this.storeById(id)
			return now ? without({ ...$state.snapshot(now), photo: value }) : undefined
		}
		const show = (value: string | undefined) => {
			const next = withPhoto(value)
			if (next) this.#showStore(next)
		}
		const undo = this.#commit({
			apply: () => {
				if (photo && image) this.photos.set(photo, image)
				show(photo)
			},
			revert: () => {
				show(was)
				if (photo) this.photos.delete(photo)
			},
			write: async () => {
				if (photo && image)
					await this.#keepPicture(photo, id, found.name, image, { kind: STORE_PHOTO, type: KITCHEN.store })
				await applyBatch(this.#storeOp(withPhoto(photo)))
				if (was) await deleteRows([photoUri(was)]).catch(() => null)
			},
			unwrite: async () => {
				if (was) await restoreRows([photoUri(was)]).catch(() => null)
				await applyBatch(this.#storeOp(withPhoto(was)))
				if (photo) await deleteRows([photoUri(photo)]).catch(() => null)
			},
		})
		return { store: found, undo }
	}

	/** Moves a store up or down among the stores (D-101), and its list with it on the page. One write, one undo. */
	moveStore(id: string, delta: number): { store: GroceryStore | undefined; undo: Undo } {
		const before = $state.snapshot(this.grocery.stores)
		const { stores: after, changed } = reorderStores(before, id, delta)
		if (!changed.length) return { store: undefined, undo: () => {} }
		const ids = changed.map((store) => store.id)
		const undo = this.#commit({
			apply: () => (this.grocery.stores = after),
			revert: () => (this.grocery.stores = before),
			write: () => applyBatch(changed.flatMap((store) => this.#storeOp(store))),
			unwrite: () =>
				applyBatch(before.filter((store) => ids.includes(store.id)).flatMap((store) => this.#storeOp(store))),
		})
		return { store: this.storeById(id), undo }
	}

	/**
	 * Deletes a store and its list. What was on the list is not lost: it moves to the unfiled list. The undo brings
	 * the store back with its list, its shop day and its items.
	 */
	removeStore(id: string): { store: GroceryStore | undefined; undo: Undo } {
		const found = this.storeById(id)
		if (!found) return { store: undefined, undo: () => {} }
		const store = $state.snapshot(found)
		const at = this.grocery.stores.indexOf(found)
		const list = $state.snapshot(this.grocery.lists.find((entry) => entry.storeId === id))
		const moved = list ? this.grocery.items.filter((item) => item.listId === list.id).map((item) => item.id) : []
		const unfiled = moved.length ? this.#listFor(undefined) : ''
		const move = (from: string, to: string) =>
			(this.grocery.items = this.grocery.items.map((item) =>
				moved.includes(item.id) && item.listId === from ? { ...item, listId: to } : item
			))
		const moveOps = (to: string): BatchOp[] =>
			$state
				.snapshot(this.grocery.items)
				.filter((item) => moved.includes(item.id))
				.map((item) => this.#update('grocery', { ...item, listId: to }))
		// its picture goes with it, and comes back with it
		const gone = [
			toUri(KITCHEN.store, id),
			...(list ? [toUri(KITCHEN.list, list.id)] : []),
			...(store.photo ? [photoUri(store.photo)] : []),
		]
		const undo = this.#commit({
			apply: () => {
				if (list) move(list.id, unfiled)
				this.grocery.stores = this.grocery.stores.filter((entry) => entry.id !== id)
				this.grocery.lists = this.grocery.lists.filter((entry) => entry.id !== list?.id)
			},
			revert: () => {
				this.grocery.stores = [...this.grocery.stores.slice(0, at), store, ...this.grocery.stores.slice(at)]
				if (list) {
					this.grocery.lists = [...this.grocery.lists, list]
					move(unfiled, list.id)
				}
			},
			write: () => applyBatch([...moveOps(unfiled), ...gone.map((uri): BatchOp => ({ op: 'delete', uri }))]),
			unwrite: () =>
				applyBatch([...gone.map((uri): BatchOp => ({ op: 'restore', uri })), ...(list ? moveOps(list.id) : [])]),
		})
		if (!list?.shopDay) return { store, undo }
		this.#remind()
		return {
			store,
			undo: () => {
				undo()
				this.#remind()
			},
		}
	}

	// Recipes

	/** A draft's fields as a recipe keeps them: where its source shows a picture is the draft's alone. */
	#fields({ imageUrl: _imageUrl, ...draft }: RecipeDraft): Omit<Recipe, 'id'> {
		return {
			...without(draft),
			tags: draft.tags,
			ingredients: draft.ingredients,
			steps: draft.steps,
		}
	}

	/** Shows a recipe's picture at once, from the bytes in hand: its row's small one, and the whole of it. */
	#showPicture(id: string, picture: RecipePicture) {
		this.photos.set(id, picture.thumbnail)
		this.#images.set(id, URL.createObjectURL(picture.image))
	}

	#hidePicture(id: string) {
		const url = this.#images.get(id)
		if (url) URL.revokeObjectURL(url)
		this.#images.delete(id)
		this.photos.delete(id)
	}

	/** Writes a recipe's picture as its Attachment; a picture that cannot be kept leaves the recipe standing. */
	async #keepRecipePicture(id: string, recipeId: string, name: string, picture: RecipePicture): Promise<void> {
		try {
			await attachBytes(
				{
					id,
					kind: RECIPE_PHOTO,
					fileName: `${name.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '') || 'recipe'}.jpg`,
					mime: 'image/jpeg',
					thumbnail: picture.thumbnail,
					links: [{ uri: toUri(KITCHEN.recipe, recipeId), relation: 'from' }],
				},
				new Uint8Array(await picture.image.arrayBuffer())
			)
		} catch (error) {
			await logError('data', "A recipe's picture could not be kept", String(error)).catch(() => null)
		}
	}

	/**
	 * Saves a recipe the owner checked: a draft from a page, a photo, pasted text or the Gardener, with the picture
	 * it came with when the owner kept it (D-93). One undo takes back both.
	 */
	addRecipe(draft: RecipeDraft, picture?: RecipePicture): { recipe: Recipe; undo: Undo } {
		const id = newId()
		const photo = picture ? newId() : undefined
		const recipe: Recipe = without({ ...this.#fields(draft), photo, id })
		const added = this.#added('recipes', recipe)
		const undo = this.#commit(
			{
				apply: () => {
					if (photo && picture) this.#showPicture(photo, picture)
					added.apply()
				},
				revert: () => {
					added.revert()
					if (photo) this.#hidePicture(photo)
				},
				write: async () => {
					await added.write()
					if (photo && picture) await this.#keepRecipePicture(photo, id, recipe.name, picture)
				},
				unwrite: async () => {
					await added.unwrite()
					if (photo) await deleteRows([photoUri(photo)]).catch(() => null)
				},
			},
			'garden.feed.recipeSaved',
			{ name: recipe.name }
		)
		return { recipe, undo }
	}

	/** Changes a recipe's fields; its picture is its own change (`setRecipePhoto`) and stays. */
	updateRecipe(id: string, draft: RecipeDraft): { recipe: Recipe | undefined; undo: Undo } {
		const recipe = this.recipeById(id)
		const undo = this.#commit(
			this.#changed<Recipe>('recipes', id, (target) => without({ ...this.#fields(draft), photo: target.photo, id }))
		)
		return { recipe, undo }
	}

	/**
	 * Gives a recipe a picture, or takes its picture away (D-93). The one it had is deleted with the change and comes
	 * back with the undo.
	 */
	setRecipePhoto(id: string, picture: RecipePicture | undefined): { recipe: Recipe | undefined; undo: Undo } {
		const recipe = this.recipeById(id)
		if (!recipe) return { recipe, undo: () => {} }
		const before = $state.snapshot(recipe) as Recipe
		const photo = picture ? newId() : undefined
		const after: Recipe = without({ ...before, photo })
		const put = (record: Recipe) => (this.recipes = this.recipes.map((entry) => (entry.id === id ? record : entry)))
		const undo = this.#commit({
			apply: () => {
				if (photo && picture) this.#showPicture(photo, picture)
				put(after)
			},
			revert: () => {
				put(before)
				if (photo) this.#hidePicture(photo)
			},
			write: async () => {
				if (photo && picture) await this.#keepRecipePicture(photo, id, before.name, picture)
				await updateEntity(id, this.#payload('recipes', after))
				if (before.photo) await deleteRows([photoUri(before.photo)]).catch(() => null)
			},
			unwrite: async () => {
				if (before.photo) await restoreRows([photoUri(before.photo)]).catch(() => null)
				await updateEntity(id, this.#payload('recipes', before))
				if (photo) await deleteRows([photoUri(photo)]).catch(() => null)
			},
		})
		return { recipe, undo }
	}

	/** Deletes a recipe, and its picture with it; both come back with the undo. */
	removeRecipe(id: string): { recipe: Recipe | undefined; undo: Undo } {
		const recipe = this.recipeById(id)
		const undo = this.#commit(
			this.#removed('recipes', [id], recipe?.photo ? [photoUri(recipe.photo)] : []),
			'garden.feed.recipeRemoved',
			{ name: recipe?.name ?? '' }
		)
		return { recipe, undo }
	}

	/**
	 * "I cooked this" (kitchen.md, "Cooking decrements stock"): each change sets what an item holds after, in its own
	 * unit. An item left with nothing stays, as run out (D-92), where it can be bought again. One batch, one undo.
	 */
	cookRecipe(id: string, changes: { stockId: string; qty: string }[]): { count: number; undo: Undo } {
		const recipe = this.recipeById(id)
		const at = nowIso()
		const after: StockItem[] = []
		for (const change of changes) {
			const item = this.stockById(change.stockId)
			if (!item) continue
			const next: StockItem = { ...$state.snapshot(item), qty: change.qty }
			after.push(isOut(next) ? ranOut(next, at) : next)
		}
		const undo = this.#commit(this.#replaced('stock', after), 'garden.feed.recipeCooked', {
			name: recipe?.name ?? '',
		})
		return { count: after.length, undo }
	}

	/** Fills the store from the kit's sample dataset; the undo puts back whatever was there. */
	seed(domainName: string): Undo {
		const before = this.data()
		const after = kitchenRows(seedData(), newId)
		const remove = (uris: string[]): BatchOp[] => uris.map((uri) => ({ op: 'delete', uri }))
		const restore = (uris: string[]): BatchOp[] => uris.map((uri) => ({ op: 'restore', uri }))
		const old = kitchenUris(before)
		const sample = kitchenUris(after.data)
		const show = (data: KitchenData) => {
			this.stock = data.stock
			this.recipes = data.recipes
			this.grocery = data.grocery
		}
		const undo = this.#commit(
			{
				apply: () => show(after.data),
				revert: () => show(before),
				write: () => applyBatch([...remove(old), ...after.ops]),
				unwrite: () => applyBatch([...remove(sample), ...restore(old)]),
			},
			'garden.feed.sampleAdded',
			{ domain: domainName }
		)
		// the lists were replaced under the reminder, and the undo replaces them again
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

	/** The list a name stands for: the stock, the recipes, or the items on the grocery lists. */
	#list(name: ListName): Kept[] {
		return name === 'stock' ? this.stock : name === 'recipes' ? this.recipes : this.grocery.items
	}

	#show(name: ListName, records: Kept[]) {
		if (name === 'stock') this.stock = records as StockItem[]
		else if (name === 'recipes') this.recipes = records as Recipe[]
		else this.grocery.items = records as GroceryItem[]
	}

	/** A record's payload: itself without its id. */
	#payload(_name: ListName, record: Kept): object {
		const { id: _id, ...payload } = $state.snapshot(record) as Kept
		return payload
	}

	#create(name: ListName, record: Kept): BatchOp {
		return { op: 'createEntity', input: { id: record.id, type: TYPE[name], payload: this.#payload(name, record) } }
	}

	#update(name: ListName, record: Kept): BatchOp {
		return { op: 'updateEntity', id: record.id, payload: this.#payload(name, record) }
	}

	#added(name: ListName, record: Kept): Change {
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
