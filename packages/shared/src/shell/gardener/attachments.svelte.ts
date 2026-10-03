// The Attachment rows behind the files of the open conversation (D-83): a message's blocks name each file by id, and
// the row has the thumbnail and says whether the file is still there. Read when a thread opens and after a send.
import { SvelteMap } from 'svelte/reactivity'
import { queryAttachments, type AttachmentRow } from '../../data/index.js'

class ThreadAttachments {
	/** The live rows of the thread's files, by id. */
	readonly rows = new SvelteMap<string, AttachmentRow>()
	/** The thread the rows were last read for; a file is only called missing once they have been. */
	loaded = $state<string | undefined>()
	#reading = 0

	/** Reads the rows of a thread's files; the latest call wins when the owner moves between threads. */
	async load(threadUri: string | undefined): Promise<void> {
		const reading = ++this.#reading
		if (!threadUri) {
			this.rows.clear()
			this.loaded = undefined
			return
		}
		const rows = await queryAttachments({ linkedTo: threadUri, relation: 'part-of' }).catch(() => [])
		if (reading !== this.#reading) return
		this.rows.clear()
		for (const row of rows) this.rows.set(row.id, row)
		this.loaded = threadUri
	}

	/** A small picture of a file, when it has one. */
	thumbnail(id: string): string | undefined {
		return this.rows.get(id)?.thumbnail ?? undefined
	}

	/** True when the thread's rows have been read and this file's is not among them: it was deleted. */
	missing(id: string, threadUri: string | undefined): boolean {
		return this.loaded !== undefined && this.loaded === threadUri && !this.rows.has(id)
	}
}

export const threadAttachments = new ThreadAttachments()
