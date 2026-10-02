// Quick Log's entries and its one write path (D-12; product/substrate/shell.md, "Quick Log surfaces"): the enabled
// domains' quick actions as the kit's sheet takes them, and what saving one does. A value goes to the action's
// handler, which writes with an undo and records the feed's line itself; a launch opens its domain's surface (Hearth's
// capture, D-13). The status bar's +, the sheet, Today's strip and the Gardener's `log-quick` all come through here.
import { get } from 'svelte/store'
import { toast, type IconName, type QuickLog } from '@eden/ui-kit'
import { logError } from '@eden/shared/api'
import { t } from '@eden/shared/i18n'
import { quickActions, type QuickAction } from '@eden/shared/manifest'
import { parseQuickLog, type QuickLogCandidate } from '@eden/shared/quick-log'
import { declarations, manifestFor } from '$lib/domains'
import { undoToast } from './undo'

export interface QuickLogAction extends QuickAction {
	icon: IconName
}

type Translate = (key: string, options?: { values?: Record<string, string> }) => string

/** `<domain>.<quick action>`: what an entry is kept and named by. */
export const quickLogKey = (action: QuickAction): string => `${action.domain}.${action.id}`

/** Whether the app has bound what the action does; an action it has not is offered nowhere. */
function bound(action: QuickAction): boolean {
	const manifest = manifestFor(action.domain)
	return Boolean(
		action.kind === 'launch' ? manifest?.quickActionLaunchers?.[action.id] : manifest?.quickActionHandlers?.[action.id]
	)
}

/** The quick actions of the enabled domains that do something, in the domains' order. */
export function quickLogActions(): QuickLogAction[] {
	// the registry builder checked each icon against the kit's list
	return quickActions(declarations)
		.filter(bound)
		.map((action) => ({ ...action, icon: action.icon as IconName }))
}

/** The sheet's tabs: each action in the owner's words, with what its domain's store knows of the log. */
export function quickLogEntries(tr: Translate): QuickLog[] {
	return quickLogActions().map((action) => {
		const domain = tr(action.context)
		return {
			id: quickLogKey(action),
			label: tr(action.keyword),
			icon: action.icon,
			kind: action.kind,
			unit: action.unit,
			placeholder: action.placeholder ? tr(action.placeholder) : undefined,
			helper:
				action.kind === 'launch'
					? tr('today.quickLogChip', { values: { action: tr(action.label), domain } })
					: tr('quickLog.to', { values: { domain } }),
			...manifestFor(action.domain)?.quickActionReadouts?.[action.id]?.(),
		}
	})
}

/** What a one-liner may name each action by: its keyword, its label and, where it is the domain's only field, the domain. */
export function quickLogCandidates(tr: Translate): QuickLogCandidate[] {
	const fields = quickLogActions().filter((action) => action.kind !== 'launch')
	return fields.map((action) => ({
		key: quickLogKey(action),
		words: [
			tr(action.keyword),
			tr(action.label),
			...(fields.filter((other) => other.domain === action.domain).length === 1 ? [tr(action.context)] : []),
		],
	}))
}

/** Runs a quick action with a value through its domain's handler, on the domain's loaded store; nothing when it has none. */
export async function runQuickAction(
	domain: string,
	action: string,
	value: string
): Promise<{ undo: () => void } | undefined> {
	const manifest = manifestFor(domain)
	const handler = manifest?.quickActionHandlers?.[action]
	if (!handler) return undefined
	await manifest?.load?.()
	return handler(value)
}

/**
 * Saves one entry: a launch opens its surface, a value is written and shown with its undo for the toast's eight
 * seconds, never behind a confirm sheet. Answers whether anything happened.
 */
export async function saveQuickLog(key: string, value: string): Promise<boolean> {
	const dot = key.indexOf('.')
	const [domain, action] = [key.slice(0, dot), key.slice(dot + 1)]
	const launcher = manifestFor(domain)?.quickActionLaunchers?.[action]
	if (launcher) {
		launcher()
		return true
	}
	const text = value.trim()
	if (!text) return false
	const tr = get(t)
	try {
		const result = await runQuickAction(domain, action, text)
		if (!result) return false
		undoToast(tr('quickLog.logged', { values: { value: text } }), result.undo)
		return true
	} catch (error) {
		void logError('quick-log', `${key} could not be saved`, String(error)).catch(() => null)
		toast({ message: tr('quickLog.failed'), error: true })
		return false
	}
}

/** The palette's `log` verb (issue 23): "log grocery oat milk" saves the value to the action it names. */
export async function logLine(line: string): Promise<boolean> {
	const parsed = parseQuickLog(line, quickLogCandidates(get(t)))
	return parsed ? saveQuickLog(parsed.key, parsed.value) : false
}
