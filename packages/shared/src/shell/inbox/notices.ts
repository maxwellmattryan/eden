// A card of the inbox as the kit's `InboxCard` takes it (substrate/signals-notifications.md, "Notification center"):
// its line written from the rule's locale key and the signal's payload, so it reads in the current locale; when it
// arrived; its domain; Open, which goes to the domain's place; and, on the latest card that would have been an OS
// notification while those are off, the offer to turn them on. Both shells draw the same items: desktop behind the
// status bar's bell, the phone in its inbox sheet (D-158). The module is pure: the words, the clock
// and the store's two answers arrive as arguments.
import { domainGlyph, type GlyphId, type InboxItem } from '@eden/ui-kit'
import { formatTime, formatWeekday, relativeDay, type DateFormat } from '../../dates/index.js'
import { declarations } from '../../manifest/index.js'
import type { BuiltDomainId } from '../../manifest/types.js'
import { navigation } from '../../navigation/index.js'
import { messageValues, notificationKeys } from '../../signals/rules.js'
import type { InboxEntry } from '../../signals/types.js'

type Translate = (key: string, options?: { values?: Record<string, string | number> }) => string

export interface InboxItemsOptions {
	/** svelte-i18n's `$t`. */
	tr: Translate
	/** The language and the owner's clock. */
	format: DateFormat
	/** The id of the card that offers to turn OS notifications on (`inbox.asks`), when one does. */
	asks?: string
	/** What that offer does (`inbox.allowNotifications`). */
	allow?: () => void
	/** Called before Open goes to the domain: the phone closes its sheet. */
	onopen?: () => void
}

/** When a card arrived: the time today, "yesterday", else the weekday. */
export function arrivedWords(at: number, tr: Translate, format: DateFormat): string {
	const iso = new Date(at).toISOString()
	const day = relativeDay(iso)
	if (day === 'today') return formatTime(at, format)
	return day === 'yesterday' ? tr('shell.inbox.yesterday') : formatWeekday(iso, format.lang)
}

/** The cards as inbox items, in the order given (the store keeps the latest first). */
export function inboxItems(cards: readonly InboxEntry[], options: InboxItemsOptions): InboxItem[] {
	const { tr, format, asks, allow, onopen } = options
	return cards.map((card) => {
		const keys = notificationKeys(card.rule)
		const domain = declarations.find((entry) => entry.id === keys.domain)
		return {
			id: card.id,
			// the registry builder checked each domain id against the kit's glyphs
			icon: domain ? domainGlyph(domain.id as GlyphId) : undefined,
			line: tr(keys.line, { values: messageValues(card.payload) }),
			when: arrivedWords(card.at, tr, format),
			domain: domain ? tr(domain.name) : undefined,
			unread: !card.read,
			actions: [
				...(domain
					? [
							{
								id: 'open',
								label: tr('shell.inbox.open'),
								icon: 'arrow-right' as const,
								onclick: () => {
									onopen?.()
									void navigation.open({ place: domain.id as BuiltDomainId })
								},
							},
						]
					: []),
				...(asks === card.id && allow
					? [{ id: 'allow', label: tr('shell.inbox.allow'), icon: 'bell' as const, onclick: () => allow() }]
					: []),
			],
		}
	})
}
