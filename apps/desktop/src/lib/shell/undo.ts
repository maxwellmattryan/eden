// Every write shows an undo toast, never a confirm sheet (D-12; docs/design/ux-patterns.md, "Confirmation and risk
// patterns"). Stores return an `undo` with each write; the component translates the message and calls this.
import { get } from 'svelte/store'
import { toast } from '@eden/ui-kit'
import { t } from '@eden/shared/i18n'

/** Shows the kit's one toast with an Undo action; `message` is already translated. */
export function undoToast(message: string, undo: () => void) {
	toast({ message, action: { label: get(t)('common.undo'), icon: 'undo-2', onclick: undo } })
}
