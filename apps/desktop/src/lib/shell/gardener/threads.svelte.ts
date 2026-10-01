// The Gardener's conversations as the shell holds them (docs/engineering/gardener.md, "Threads and policy"): the
// threads read once, the current thread's messages, and every write the panel makes. A write changes the store at
// once and is sent after, in order (`WriteQueue`); the blocks of a reply change many times a second while it
// streams, so they are persisted on a short debounce and once more when the reply settles. A reply being written is
// held apart from the open thread, so its request goes on writing to it while the owner reads another conversation.
import { logError } from '@eden/shared/api'
import { newId, WriteQueue } from '@eden/shared/data'
import {
	appendMessage,
	createThread,
	deleteMessage,
	deleteThread,
	queryMessages,
	queryThreads,
	rememberGardenerPanel,
	restoreThread,
	updateMessage,
	updateThread,
	type Message,
	type MessageBlock,
	type Thread,
	type ThreadTier,
} from '@eden/shared/gardener'

export type Undo = () => void

const PERSIST_MS = 250
const TITLE_MAX = 60
const TIER_RANK: Record<ThreadTier, number> = { T0: 0, T1: 1, T2: 2 }

export class ThreadStore {
	ready = $state(false)
	failed = $state(false)
	saveFailed = $state(false)
	/** Every live thread, the latest updated first. */
	threads = $state<Thread[]>([])
	/** The thread the panel shows, when one is open; which one is kept on the device for the next launch. */
	current = $state<Thread | undefined>()
	/** The current thread's messages, in order. */
	messages = $state<Message[]>([])

	#loading: Promise<void> | undefined
	// eslint-disable-next-line svelte/prefer-svelte-reactivity -- a plain map of timers: nothing reads it reactively
	#timers = new Map<string, ReturnType<typeof setTimeout>>()
	/** The replies being written, by id: what `patch` and `flush` reach whichever thread is open. */
	// eslint-disable-next-line svelte/prefer-svelte-reactivity -- a plain map: nothing reads it reactively
	#held = new Map<string, Message>()
	readonly #queue = new WriteQueue(
		(failed) => (this.saveFailed = failed),
		(error) => void logError('data', 'A Gardener write failed', String(error)).catch(() => null)
	)

	load(): Promise<void> {
		return (this.#loading ??= this.#read())
	}

	async reload(): Promise<void> {
		await this.#queue.settled()
		this.#loading = this.#read()
		await this.#loading
		if (this.current) await this.open(this.current.id)
	}

	async #read(): Promise<void> {
		try {
			this.threads = await queryThreads({})
			this.failed = false
		} catch {
			this.failed = true
		} finally {
			this.ready = true
		}
	}

	/** The threads of a domain, or every thread. */
	of(domain?: string): Thread[] {
		return domain ? this.threads.filter((thread) => thread.domain === domain) : this.threads
	}

	/** Opens a thread: its messages are read, after what is waiting has been sent. */
	async open(id: string): Promise<void> {
		await this.load()
		const thread = this.threads.find((entry) => entry.id === id)
		if (!thread) return
		await this.#queue.settled()
		this.current = thread
		rememberGardenerPanel({ thread: id })
		try {
			// a reply still being written is ahead of its row: the one held is shown, and goes on changing in view
			this.messages = (await queryMessages(id)).map((row) => this.#held.get(row.id) ?? row)
		} catch {
			this.messages = []
		}
	}

	close(): void {
		this.current = undefined
		this.messages = []
		rememberGardenerPanel({ thread: null })
	}

	/** A new thread, current at once; the row is written after. Its title is the first message, clipped. */
	newThread(domain: string | undefined, title: string): Thread {
		const id = newId()
		const thread: Thread = {
			uri: `eden://thread/${id}`,
			id,
			domain: domain ?? null,
			title: clip(title),
			tier: 'T0',
			createdAt: '',
			updatedAt: '',
			deletedAt: null,
		}
		this.threads = [thread, ...this.threads]
		this.current = thread
		this.messages = []
		rememberGardenerPanel({ thread: id })
		this.#queue.enqueue(() =>
			createThread({ id, domain: domain ?? null, title: thread.title, tier: 'T0' }).then((stored) =>
				this.#replaceThread(stored)
			)
		)
		return thread
	}

	/** Appends a message to a thread, the current one unless another is named; shown at once when it is open. */
	append(role: Message['role'], blocks: MessageBlock[], requestId?: string, thread = this.current): Message {
		if (!thread) throw new Error('no thread is open')
		const id = newId()
		const message: Message = $state({
			uri: `eden://message/${id}`,
			id,
			threadId: thread.id,
			role,
			blocks,
			requestId: requestId ?? null,
			createdAt: '',
			updatedAt: '',
			deletedAt: null,
		})
		if (this.current?.id === thread.id) this.messages = [...this.messages, message]
		this.#queue.enqueue(() =>
			appendMessage({ id, threadId: thread.id, role, blocks, requestId: requestId ?? null }).then((stored) =>
				this.#replaceMessage(stored)
			)
		)
		this.#touch(thread.id)
		return message
	}

	/** Keeps a reply within reach of its request while it is written, whichever thread is open. */
	hold(message: Message): void {
		this.#held.set(message.id, message)
	}

	release(messageId: string): void {
		this.#held.delete(messageId)
	}

	/** Deletes messages of the current thread for good: a reply the owner asked for again. */
	removeMessages(ids: string[]): void {
		this.messages = this.messages.filter((entry) => !ids.includes(entry.id))
		for (const id of ids) {
			const timer = this.#timers.get(id)
			if (timer) clearTimeout(timer)
			this.#timers.delete(id)
			this.#queue.enqueue(() => deleteMessage(id).then(() => undefined))
		}
	}

	#find(messageId: string): Message | undefined {
		return this.#held.get(messageId) ?? this.messages.find((entry) => entry.id === messageId)
	}

	/** Changes a message's blocks in place and persists them on a debounce; `flush` persists them now. */
	patch(messageId: string, change: (blocks: MessageBlock[]) => MessageBlock[]): void {
		const message = this.#find(messageId)
		if (!message) return
		message.blocks = change(message.blocks as MessageBlock[])
		const timer = this.#timers.get(messageId)
		if (timer) clearTimeout(timer)
		this.#timers.set(
			messageId,
			setTimeout(() => this.flush(messageId), PERSIST_MS)
		)
	}

	/** Persists a message's blocks as they are now. */
	flush(messageId: string): void {
		const timer = this.#timers.get(messageId)
		if (timer) clearTimeout(timer)
		this.#timers.delete(messageId)
		const message = this.#find(messageId)
		if (!message) return
		const blocks = $state.snapshot(message.blocks)
		this.#queue.enqueue(() => updateMessage(messageId, blocks).then(() => undefined))
	}

	/** The thread's tier rises to what it read; it never falls. */
	raiseTier(id: string, tier: ThreadTier): void {
		const thread = this.threads.find((entry) => entry.id === id)
		if (!thread || TIER_RANK[tier] <= TIER_RANK[thread.tier]) return
		thread.tier = tier
		if (this.current?.id === id) this.current = { ...this.current, tier }
		this.#queue.enqueue(() => updateThread(id, { tier }).then((stored) => this.#replaceThread(stored)))
	}

	rename(id: string, title: string): void {
		const thread = this.threads.find((entry) => entry.id === id)
		if (!thread) return
		thread.title = clip(title)
		if (this.current?.id === id) this.current = { ...this.current, title: thread.title }
		this.#queue.enqueue(() => updateThread(id, { title: thread.title }).then((stored) => this.#replaceThread(stored)))
	}

	/** Deletes a thread; the undo brings it and its messages back. */
	remove(id: string): Undo {
		const thread = this.threads.find((entry) => entry.id === id)
		if (!thread) return () => {}
		const at = this.threads.indexOf(thread)
		this.threads = this.threads.filter((entry) => entry.id !== id)
		if (this.current?.id === id) this.close()
		this.#queue.enqueue(() => deleteThread(id).then(() => undefined))
		return () => {
			this.threads = [...this.threads.slice(0, at), thread, ...this.threads.slice(at)]
			this.#queue.enqueue(() => restoreThread(id).then((stored) => this.#replaceThread(stored)))
		}
	}

	/** Deletes several threads at once; the one undo brings them all back where they were. */
	removeMany(ids: string[]): Undo {
		const before = this.threads
		const removed = before.filter((entry) => ids.includes(entry.id))
		if (!removed.length) return () => {}
		this.threads = before.filter((entry) => !ids.includes(entry.id))
		if (this.current && ids.includes(this.current.id)) this.close()
		for (const thread of removed) this.#queue.enqueue(() => deleteThread(thread.id).then(() => undefined))
		return () => {
			// the old order, with whatever was made since kept ahead of it and whatever else left since kept out
			const live = this.threads
			this.threads = [
				...live.filter((entry) => !before.some((old) => old.id === entry.id)),
				...before.filter((entry) => ids.includes(entry.id) || live.some((now) => now.id === entry.id)),
			]
			for (const thread of removed) {
				this.#queue.enqueue(() => restoreThread(thread.id).then((stored) => this.#replaceThread(stored)))
			}
		}
	}

	/** Sends the write that failed again, and then the ones behind it. */
	async flushWrites(): Promise<void> {
		await this.#queue.retry()
	}

	/** A thread moves to the top when it is written to. */
	#touch(id: string) {
		const thread = this.threads.find((entry) => entry.id === id)
		if (!thread || this.threads[0] === thread) return
		this.threads = [thread, ...this.threads.filter((entry) => entry.id !== id)]
	}

	#replaceThread(stored: Thread) {
		this.threads = this.threads.map((entry) => (entry.id === stored.id ? { ...entry, ...stored } : entry))
		if (this.current?.id === stored.id) this.current = { ...this.current, ...stored }
	}

	#replaceMessage(stored: Message) {
		// the blocks shown may be ahead of the row: keep them, take the stamps
		const message = this.#find(stored.id)
		if (!message) return
		message.createdAt = stored.createdAt
		message.updatedAt = stored.updatedAt
	}
}

function clip(title: string): string {
	const line = title.replace(/\s+/g, ' ').trim()
	return line.length > TITLE_MAX ? `${line.slice(0, TITLE_MAX - 1)}…` : line || '…'
}

export const threads = new ThreadStore()
