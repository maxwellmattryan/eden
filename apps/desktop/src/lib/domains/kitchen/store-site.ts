// What a store's own website fills in for it (product/domains/kitchen.md, "Grocery"; D-103, D-108): its picture, and
// the phone number and the address its page gives, read on the device. The store's form and the Gardener's
// `edit-stores` both ask through here, once a website has been saved on a store.
import { storeSite } from './staging.svelte.js'
import { kitchen, type Undo } from './store.svelte.js'

/**
 * Reads a store's website once it is saved, and sets what arrives: the picture when the store has none, and the
 * phone and the address where the store's own are empty. Nothing is set on a store that has gone or has another
 * website by then. The undo it answers takes back what was set, or stops what is still on its way.
 */
export function fetchStoreSite(id: string, url: string): Undo {
	let stopped = false
	const undos: Undo[] = []
	void storeSite(url).then(({ image, details }) => {
		const store = kitchen.storeById(id)
		if (stopped || !store || store.place?.url !== url) return
		if (image && !store.photo) undos.push(kitchen.setStorePhoto(id, image).undo)
		const phone = store.place?.phone || details.phone
		const address = store.place?.address || details.address
		if (phone !== store.place?.phone || address !== store.place?.address)
			undos.push(kitchen.updateStore(id, { place: { ...store.place, phone, address } }).undo)
	})
	return () => {
		stopped = true
		undos.reverse().forEach((undo) => undo())
	}
}
