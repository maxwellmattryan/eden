// The Phase 1 default layout (product/substrate/shell.md, "The Garden"; design/sample-data.md, "The Garden"): the
// same nine tiles as the kit's `gardenLayout`, in the same order, so the mockup and the app agree. Edit mode will make
// this the owner's and persist it; until then it is fixed.
import type { GlyphId, WidgetSize } from '@eden/ui-kit'
import type { WidgetDeclaration } from '../manifest.js'
import DailyLineTile from './widgets/DailyLineTile.svelte'

export type GardenDomain = Extract<GlyphId, 'weather' | 'today' | 'kitchen' | 'toolbench' | 'fitness' | 'garden'>

export interface GardenTile {
	id: string
	/** The contributing domain's plain id; `garden` for the neutral tiles the shell owns. */
	domain: GardenDomain
	size: WidgetSize
	/** The locale keys of the title and the prompt, used until the domain's manifest declares the widget. */
	title: string
	empty: string
}

export const layout: GardenTile[] = [
	{
		id: 'weather-now',
		domain: 'weather',
		size: 's',
		title: 'garden.widgets.weatherNow',
		empty: 'garden.empty.weatherNow',
	},
	{ id: 'today', domain: 'today', size: 'm', title: 'garden.widgets.today', empty: 'garden.empty.today' },
	{
		id: 'expiring-soon',
		domain: 'kitchen',
		size: 's',
		title: 'garden.widgets.expiringSoon',
		empty: 'garden.empty.expiringSoon',
	},
	{
		id: 'cook-tonight',
		domain: 'kitchen',
		size: 'm',
		title: 'garden.widgets.cookTonight',
		empty: 'garden.empty.cookTonight',
	},
	{
		id: 'resurfaced-idea',
		domain: 'toolbench',
		size: 's',
		title: 'garden.widgets.resurfacedIdea',
		empty: 'garden.empty.resurfacedIdea',
	},
	{
		id: 'active-projects',
		domain: 'toolbench',
		size: 'm',
		title: 'garden.widgets.activeProjects',
		empty: 'garden.empty.activeProjects',
	},
	{
		id: 'sun-and-moon',
		domain: 'weather',
		size: 's',
		title: 'garden.widgets.sunAndMoon',
		empty: 'garden.empty.sunAndMoon',
	},
	{ id: 'daily-line', domain: 'garden', size: 'm', title: 'garden.widgets.dailyLine', empty: 'garden.empty.dailyLine' },
	{ id: 'quick-log', domain: 'fitness', size: 's', title: 'garden.widgets.quickLog', empty: 'garden.empty.quickLog' },
]

export type ShellTile = Pick<WidgetDeclaration, 'body' | 'hasData' | 'action'>

/**
 * The tiles the shell itself fills: the daily line, neutral until Sanctuary provides it. Today (the tasks substrate)
 * and the weight quick log (Vigor) keep their prompts until those exist.
 */
export const shellTiles: Partial<Record<string, ShellTile>> = {
	'daily-line': { body: DailyLineTile, hasData: () => true },
}
