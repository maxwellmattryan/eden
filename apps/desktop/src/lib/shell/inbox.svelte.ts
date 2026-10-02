// The inbox as the shell holds it (product/substrate/signals-notifications.md, "Notification center";
// docs/engineering/signals.md): the cards behind the status bar's bell, read once and then kept up by what each emit
// delivers. A card is a rule's answer to a signal and holds no words of its own: the layout writes its line from the
// rule's locale key and the signal's payload, so the inbox reads in whichever locale is current. A card that goes to
// the OS is shown as a notification when it arrives, if the owner turned the capability on for this device; until
// then its card offers to. From T2 up the notification says which domain has something and not what (the lock screen
// shows it). Grouping, snooze and the rule toggles are the notification center's.
import { get } from 'svelte/store'
import { logError } from '@eden/shared/api'
import { t, waitLocale } from '@eden/shared/i18n'
import {
	DEVICE,
	markInboxRead,
	mayShowContent,
	messageValues,
	notificationKeys,
	onDelivered,
	onWithdrawn,
	OS_NOTIFICATIONS,
	queryInbox,
	showNotification,
	type InboxEntry,
} from '@eden/shared/signals'
import { manifestFor } from '../domains/index.js'
import { grants } from '@eden/shared/shell'

const report = (what: string) => (error: unknown) => void logError('inbox', what, String(error)).catch(() => null)

export class InboxStore {
	/** True once the inbox has been read, whether or not the read succeeded. */
	ready = $state(false)
	failed = $state(false)
	/** The cards, the latest first. */
	cards = $state<InboxEntry[]>([])

	readonly unread = $derived(this.cards.filter((card) => !card.read).length)
	/** Whether the owner turned OS notifications on for this device: the capability grant (grants.md). */
	readonly canNotify = $derived(
		grants.grants.some(
			(grant) => grant.subject === DEVICE && grant.resourceType === 'capability' && grant.resource === OS_NOTIFICATIONS
		)
	)
	/** The card that offers to turn OS notifications on: the latest one that would have been one, while they are off. */
	readonly asks = $derived(
		grants.ready && !this.canNotify ? this.cards.find((card) => card.channel === 'os')?.id : undefined
	)

	#loading: Promise<void> | null = null

	/**
	 * Reads the inbox once and hears what is delivered from then on. The shell calls it before signals start, so a
	 * card made by the first take is not missed.
	 */
	load(): Promise<void> {
		if (!this.#loading) {
			onDelivered((cards) => this.#arrived(cards))
			onWithdrawn((ids) => (this.cards = this.cards.filter((card) => !ids.includes(card.id))))
			this.#loading = this.#read()
		}
		return this.#loading
	}

	async #read(): Promise<void> {
		try {
			const stored = await queryInbox()
			// what arrived while the store was being read is in it already, or is newer than all of it
			const arrived = this.cards.filter((card) => !stored.some((other) => other.id === card.id))
			this.cards = [...arrived, ...stored]
			this.failed = false
		} catch (error) {
			this.failed = true
			report('Could not read the inbox')(error)
		} finally {
			this.ready = true
		}
	}

	#arrived(cards: InboxEntry[]) {
		const fresh = cards.filter((card) => !this.cards.some((other) => other.id === card.id))
		this.cards = [...fresh, ...this.cards]
		for (const card of fresh) {
			if (card.channel === 'os') void this.#notify(card).catch(report('Could not show a notification'))
		}
	}

	/** Shows a card as an OS notification, in the current locale. The crate checks the capability again. */
	async #notify(card: InboxEntry): Promise<void> {
		await grants.load()
		if (!this.canNotify) return
		await waitLocale()
		const format = get(t)
		const keys = notificationKeys(card.rule)
		const values = messageValues(card.payload)
		const manifest = manifestFor(keys.domain)
		const open = mayShowContent(card.tier)
		const title = open ? format(keys.title, { values }) : format(manifest?.name ?? 'app.name')
		const body = open ? format(keys.line, { values }) : format('shell.inbox.private')
		await showNotification(title, body)
	}

	/** Marks what the inbox showed as read: what the bell's closing calls. */
	async markRead(): Promise<void> {
		const ids = this.cards.filter((card) => !card.read).map((card) => card.id)
		if (!ids.length) return
		this.cards = this.cards.map((card) => (card.read ? card : { ...card, read: true }))
		await markInboxRead(ids).catch(report('Could not mark the inbox as read'))
	}

	/** Turns OS notifications on for this device, asked in context by the card that would have been one. */
	async allowNotifications(): Promise<void> {
		await grants
			.grant({
				subject: DEVICE,
				resource: OS_NOTIFICATIONS,
				resourceType: 'capability',
				access: 'read',
				lifetime: 'standing',
				origin: 'confirm',
			})
			.catch(report('Could not turn notifications on'))
	}
}

export const inbox = new InboxStore()
