// The chat's session (product/substrate/ai.md, "Surfaces"): what the desktop's docked panel and the phone's chat
// sheet both hold while the owner talks to the Gardener, so neither forks the other. The message being written and
// the files waiting on it (D-82 to D-84), whether the thread list is up, the greeting of an empty conversation, the
// states in which the Gardener cannot answer, the row that waits on a reply (D-80), and what opening the chat loads.
// A surface keeps only its own DOM: its header, its composer, where the key is typed. One app mounts one surface, so
// one instance serves both.
import { get } from 'svelte/store'
import { toast, type FileCheck } from '@eden/ui-kit'
import { isTauri } from '../../api/index.js'
import { hourOfDay } from '../../dates/index.js'
import { gardenerPanelState, greetingKey, MAX_FILES, segmentsOf, type MessageBlock } from '../../gardener/index.js'
import { t } from '../../i18n/index.js'
import { grants } from '../grants.svelte.js'
import { profile } from '../profile/store.svelte.js'
import { domainFace } from './domain-face.js'
import {
	capByType,
	checkStaged,
	measure,
	measuring,
	stagedOf,
	stagedRules,
	type StageCheck,
	type StagedFile,
} from './files.js'
import { gardenerUi } from './panel-ui.svelte.js'
import { runtime } from './runtime.svelte.js'
import { gardenerSetup } from './setup.svelte.js'
import { threads } from './threads.svelte.js'

/** `$t` as a component hands it in: the words follow the locale because the component reads them. */
type Translate = (key: string, options?: { values?: Record<string, string | number> }) => string

class ChatSession {
	/** The browser answers with a scripted stream, so the composer stays open there. */
	readonly inApp = isTauri()
	/** The message being written; it comes back when a send did not go. */
	draft = $state('')
	/**
	 * The files waiting on the message. Each is measured (an image's size and thumbnail) while it waits, and the
	 * send waits for that, so what is stored is whole. They belong to the conversation they were added in.
	 */
	staged = $state<StagedFile[]>([])
	/** Whether the thread list stands in the conversation's place. */
	listOpen = $state(false)
	/** Set when the log should go to its foot whatever the owner scrolled to: a send. The log reads and clears it. */
	toFoot = true
	/** Puts the caret in the composer, where the surface wants that (the panel does; the phone's keyboard stays down). */
	focusComposer: (() => void) | undefined

	// An empty conversation opens with a greeting: one of the locale's lines, by the hour and a roll made anew for
	// each new conversation, with the owner's preferred name when the profile holds one. It waits for the chat to
	// settle (the latest conversation may be about to open) and for the profile, so it never flashes or changes.
	#settled = $state(false)
	#roll = $state(Math.random())

	/** The domain the chat was opened from, as the views name it. */
	readonly face = $derived(gardenerUi.domain ? domainFace(gardenerUi.domain) : undefined)
	/** The thread's last reply carries the eye that says what it read (D-149). */
	readonly lastReply = $derived(threads.messages.filter((message) => message.role !== 'owner').at(-1)?.id)
	readonly canAsk = $derived((this.inApp ? gardenerSetup.hasKey : true) && !gardenerSetup.failed)
	readonly blocked = $derived(gardenerSetup.percent >= 100 && gardenerSetup.capUsd > 0)
	readonly ownerName = $derived.by(() => {
		const fact = profile.facts.find((entry) => entry.type === 'preferred-name' && !profile.isExpired(entry))
		return typeof fact?.value === 'string' ? fact.value.trim() || undefined : undefined
	})
	readonly greets = $derived(this.#settled && profile.ready && !threads.current && this.canAsk && !this.blocked)
	/** What a drop zone over the chat accepts, given what already waits. */
	readonly dropRules = $derived(stagedRules(this.staged))
	/**
	 * The Gardener is awaited with nothing yet to show (D-80): the owner's message is being packed, or the reply has
	 * begun and holds no words and no card. One row for both, so the sprout grows on without starting over; once the
	 * reply has something, the bubble takes its place and draws its own sprout between rounds.
	 */
	readonly waiting = $derived.by(() => {
		const thread = threads.current?.id
		if (!thread) return false
		if (runtime.preparing === thread) return !runtime.pending
		const last = threads.messages.at(-1)
		return (
			runtime.live?.threadId === thread &&
			runtime.live.messageId === last?.id &&
			!segmentsOf(last.blocks as MessageBlock[]).length
		)
	})

	/** The chat's name: the open conversation's title, else what it would ask about. */
	title(words: Translate): string {
		return (
			threads.current?.title ??
			(this.face
				? words('gardener.askInDomain', { values: { domain: words(this.face.name) } })
				: words('shell.gardener'))
		)
	}
	placeholder(words: Translate): string {
		return this.face
			? words('gardener.askInDomain', { values: { domain: words(this.face.name) } })
			: words('gardener.askPlaceholder')
	}
	greeting(words: Translate): string {
		return words(greetingKey(hourOfDay(Date.now()), this.#roll, !!this.ownerName), {
			values: { name: this.ownerName ?? '' },
		})
	}

	/** What an opening chat reads, and what it was opened to run. A surface calls it from the effect on its `open`. */
	load() {
		void gardenerSetup.load()
		void grants.load()
		void profile.load()
		// what the app closed on last time is written to the audit log before anything new is asked
		void runtime.settleOpen()
		void threads
			.load()
			.then(async () => {
				// the conversation the chat was left on opens, a new one staying new, and the surface's latest when
				// none was kept or it is gone; unless the chat was opened to run something
				if (gardenerUi.pending) return runtime.runPending()
				if (threads.current) return
				const kept = gardenerPanelState().thread
				if (kept === null) return
				const id = threads.threads.some((entry) => entry.id === kept) ? kept : threads.of(gardenerUi.domain)[0]?.id
				if (id) await threads.open(id)
			})
			.finally(() => (this.#settled = true))
	}

	/** Says why files were left out: one toast, for the first reason, in the app's words. */
	#refuse(rejected: StageCheck['rejected']) {
		const first = rejected[0]
		if (!first) return
		toast({
			message: get(t)(`gardener.attachments.refused.${first.reason}`, {
				values: { name: first.file.name, max: MAX_FILES },
			}),
			error: true,
		})
	}
	stage(check: StageCheck) {
		this.#refuse(check.rejected)
		for (const file of check.accepted) {
			const entry = stagedOf(file)
			this.staged.push(entry)
			measuring.track(
				entry.key,
				measure(file, entry.mime).then((meta) => {
					const at = this.staged.find((other) => other.key === entry.key)
					if (at) Object.assign(at, meta, { busy: false })
				})
			)
		}
		if (check.accepted.length) this.focusComposer?.()
	}
	/** A drop came through the zone's own rules; each type's cap is still to be held. */
	dropped = (accepted: File[], rejected: FileCheck['rejected']) => {
		const capped = capByType(accepted)
		this.stage({ accepted: capped.accepted, rejected: [...rejected, ...capped.rejected] })
	}
	/** Files from the picker or a paste, checked against what already waits. */
	picked = (files: File[]) => this.stage(checkStaged(files, this.staged))
	unstage(key: string) {
		this.staged = this.staged.filter((entry) => entry.key !== key)
	}

	async send(text: string) {
		this.toFoot = true
		const files = [...this.staged]
		this.staged = []
		await measuring.settled(files.map((entry) => entry.key))
		// the measured entries, not the copies taken before they were
		if (await runtime.ask(text, files)) return
		// nothing was sent: the message and its files go back where they were
		if (files.length) toast({ message: get(t)('gardener.attachments.failed'), error: true })
		this.staged = [...files, ...this.staged]
		if (!this.draft) this.draft = text
	}
	/** Starts a new conversation; the surface focuses its composer once it is in the DOM again. */
	newThread() {
		threads.close()
		this.staged = []
		this.#roll = Math.random()
		this.listOpen = false
	}
	async openThread(id: string) {
		if (id !== threads.current?.id) this.staged = []
		await threads.open(id)
		this.listOpen = false
	}
}

export const chat = new ChatSession()
