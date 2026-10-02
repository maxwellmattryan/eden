// The picture a link the owner pasted means (D-110), fetched by the crate and sized for keeping: the picture at the
// address, or, when the address is a page instead, the picture that page names as its own. Counted by the crate under
// `web-image` and `web-page`. Hearth's recipes and Meadow's places share it.
import { logError } from './diagnostics.js'
import { httpsAddress, pageImage } from './html.js'
import { sizedPicture, type SizedPicture } from './picture.js'
import { fetchImage, fetchPage, webErrorCode } from './web.js'

/** A picture from an `https` address, a picture's own or its page's. Nothing when neither gives one. */
export async function linkedSizedPicture(link: string): Promise<SizedPicture | undefined> {
	const address = httpsAddress(link)
	if (!address) return undefined
	const fetched = async (url: string) => sizedPicture(new Blob([(await fetchImage(url)) as Uint8Array<ArrayBuffer>]))
	try {
		return await fetched(address)
	} catch (error) {
		if (webErrorCode(error) !== 'web:not-image') {
			void logError('web', 'A picture could not be fetched', webErrorCode(error)).catch(() => null)
			return undefined
		}
	}
	try {
		const page = await fetchPage(address)
		const named = pageImage(page.html, page.url)
		return named ? await fetched(named) : undefined
	} catch (error) {
		void logError('web', "A page's picture could not be fetched", webErrorCode(error)).catch(() => null)
		return undefined
	}
}
