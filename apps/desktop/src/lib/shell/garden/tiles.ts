// What the app binds to the Garden tiles the shell declares for itself (`@eden/shared/manifest`, `shell.tiles`): the
// daily line, neutral until Sanctuary provides it, and the quick log, which draws the first numeric log a domain
// binds a readout for: none does until Vigor logs a weight, so it keeps its prompt. Today (the tasks substrate) keeps
// its prompt too. The layout is the owner's (`gardenLayout()` over `settings.gardenLayout`, D-155).
import type { ShellTileId } from '@eden/shared/manifest'
import type { WidgetBinding } from '$lib/domains'
import { get } from 'svelte/store'
import { t } from '@eden/shared/i18n'
import { quickLogUi } from '../quick-log-ui.svelte'
import DailyLineTile from './widgets/DailyLineTile.svelte'
import QuickLogTile from './widgets/QuickLogTile.svelte'
import { numericLog } from './widgets/quick-log-tile'

export const shellTiles: Partial<Record<ShellTileId, WidgetBinding>> = {
	'daily-line': { body: DailyLineTile, hasData: () => true },
	'quick-log': {
		body: QuickLogTile,
		hasData: () => Boolean(numericLog(get(t))),
		action: { label: 'garden.actions.quickLog', open: () => quickLogUi.show(numericLog(get(t))?.id) },
	},
}
