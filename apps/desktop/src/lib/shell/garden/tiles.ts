// What the app binds to the Garden tiles the shell declares for itself (`@eden/shared/manifest`, `shell.tiles`): the
// daily line, neutral until Sanctuary provides it. Today (the tasks substrate) and the weight quick log (Vigor) keep
// their prompts until those exist. The layout itself comes from `defaultLayout()`; edit mode will make it the owner's.
import type { ShellTileId } from '@eden/shared/manifest'
import type { WidgetBinding } from '$lib/domains'
import DailyLineTile from './widgets/DailyLineTile.svelte'

export const shellTiles: Partial<Record<ShellTileId, WidgetBinding>> = {
	'daily-line': { body: DailyLineTile, hasData: () => true },
}
