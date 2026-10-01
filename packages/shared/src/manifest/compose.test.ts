import { describe, expect, it } from 'vitest'
import {
	declarations,
	defaultLayout,
	gardenCatalog,
	handlerOf,
	paletteIndex,
	quickActions,
	shell,
	shortcutPositions,
	sidebarGroups,
	tabBar,
} from './index.js'

const ids = (groups: ReturnType<typeof sidebarGroups>) => groups.map((group) => group.items.map((item) => item.id))
const without = (id: string) => declarations.filter((declaration) => declaration.id !== id)

describe('sidebarGroups', () => {
	it('groups Today; Garden and Toolbench; then the domains, with the Gardener pinned (D-64, D-77)', () => {
		const groups = sidebarGroups(declarations, shell)
		expect(groups.map((group) => group.id)).toEqual(['today', 'shell', 'domains'])
		expect(ids(groups)).toEqual([['today'], ['garden', 'toolbench'], ['kitchen', 'weather']])
		expect(shell.sidebar.pinned.map((entry) => entry.id)).toEqual(['gardener', 'settings'])
		expect(shell.sidebar.pinned[0]).toMatchObject({ id: 'gardener', name: 'shell.gardener', key: 'G' })
		expect(groups[2]?.items[0]).toMatchObject({ kind: 'domain', name: 'domains.kitchen.name', place: true })
	})

	it("follows the owner's order, and keeps the rest in their declared one", () => {
		expect(ids(sidebarGroups(declarations, shell, { order: ['weather'] }))[2]).toEqual(['weather', 'kitchen'])
		expect(ids(sidebarGroups(declarations, shell, { order: ['weather', 'kitchen', 'toolbench'] }))).toEqual([
			['today'],
			['garden', 'toolbench'],
			['weather', 'kitchen'],
		])
	})

	it('leaves out what the owner hid, and a group with nothing in it', () => {
		const groups = sidebarGroups(declarations, shell, { hidden: ['kitchen', 'weather', 'toolbench'] })
		expect(ids(groups)).toEqual([['today'], ['garden']])
	})

	it('leaves out a domain that is not enabled', () => {
		expect(ids(sidebarGroups(without('toolbench'), shell))[1]).toEqual(['garden'])
	})
})

describe('shortcutPositions', () => {
	it('counts the places in order, and gives the Gardener none', () => {
		const positions = shortcutPositions(sidebarGroups(declarations, shell))
		expect([...positions]).toEqual([
			['today', 1],
			['garden', 2],
			['toolbench', 3],
			['kitchen', 4],
			['weather', 5],
		])
	})

	it('moves up when a domain is hidden', () => {
		const positions = shortcutPositions(sidebarGroups(declarations, shell, { hidden: ['toolbench'] }))
		expect(positions.get('kitchen')).toBe(3)
		expect(positions.has('toolbench')).toBe(false)
	})
})

describe('tabBar', () => {
	const idsOf = (items: { id: string }[]) => items.map((item) => item.id)

	it('pins Hearth and Sky after Garden and Today, and keeps the rest behind More', () => {
		const bar = tabBar(declarations, shell)
		expect(idsOf(bar.tabs)).toEqual(['garden', 'today', 'kitchen', 'weather'])
		expect(idsOf(bar.more)).toEqual(['toolbench', 'gardener', 'settings'])
		expect(shell.tabs.more).toEqual({ id: 'more', name: 'shell.more' })
	})

	it("pins the owner's two, and no more than two", () => {
		const bar = tabBar(declarations, shell, ['toolbench', 'weather', 'kitchen'])
		expect(idsOf(bar.tabs)).toEqual(['garden', 'today', 'toolbench', 'weather'])
		expect(idsOf(bar.more)).toEqual(['kitchen', 'gardener', 'settings'])
	})

	it('leaves out a pinned domain that is not enabled', () => {
		expect(idsOf(tabBar(without('kitchen'), shell).tabs)).toEqual(['garden', 'today', 'weather'])
	})
})

describe('the Garden', () => {
	it('offers the built widgets and the tiles of the shell, never a planned one', () => {
		const catalog = gardenCatalog(declarations, shell)
		expect(catalog.map((widget) => widget.id)).toEqual([
			'expiring-soon',
			'cook-tonight',
			'resurfaced-idea',
			'active-projects',
			'weather-now',
			'sun-and-moon',
			'today',
			'daily-line',
			'quick-log',
		])
		expect(catalog.find((widget) => widget.id === 'cook-tonight')).toEqual({
			id: 'cook-tonight',
			owner: 'kitchen',
			glyph: 'kitchen',
			sizes: ['m'],
			reads: ['stock-item', 'recipe', 'dietary-preference', 'allergy', 'medical-dietary-restriction'],
			title: 'garden.widgets.cookTonight',
			empty: 'garden.empty.cookTonight',
			default: true,
		})
		expect(catalog.find((widget) => widget.id === 'quick-log')).toMatchObject({ owner: 'shell', glyph: 'fitness' })
	})

	it('lays out the Phase 1 default: nine tiles in the order of the mockup, each at its first size', () => {
		const layout = defaultLayout(declarations, shell)
		expect(layout.map((tile) => [tile.id, tile.glyph, tile.size])).toEqual([
			['weather-now', 'weather', 's'],
			['today', 'today', 'm'],
			['expiring-soon', 'kitchen', 's'],
			['cook-tonight', 'kitchen', 'm'],
			['resurfaced-idea', 'toolbench', 's'],
			['active-projects', 'toolbench', 'm'],
			['sun-and-moon', 'weather', 's'],
			['daily-line', 'garden', 'm'],
			['quick-log', 'fitness', 's'],
		])
	})

	it("drops a disabled domain's tiles from the layout", () => {
		const layout = defaultLayout(without('kitchen'), shell)
		expect(layout.map((tile) => tile.id)).not.toContain('expiring-soon')
		expect(layout).toHaveLength(7)
	})
})

describe('paletteIndex', () => {
	const index = paletteIndex(declarations, shell)

	it('goes to the places of the shell, to each domain and to each of its tabs', () => {
		const go = index.entries.filter((entry) => entry.verb === 'go').map((entry) => entry.id)
		expect(go).toEqual([
			'go.today',
			'go.garden',
			'go.kitchen',
			'go.kitchen.stock',
			'go.kitchen.recipes',
			'go.kitchen.grocery',
			'go.kitchen.tips',
			'go.toolbench',
			'go.toolbench.ideas',
			'go.toolbench.projects',
			'go.toolbench.lab',
			'go.toolbench.studio',
			'go.toolbench.notes',
			'go.weather',
		])
		expect(index.entries.find((entry) => entry.id === 'go.kitchen.recipes')).toEqual({
			id: 'go.kitchen.recipes',
			verb: 'go',
			label: 'domains.kitchen.tabs.recipes',
			context: 'domains.kitchen.name',
			glyph: 'kitchen',
			target: { kind: 'tab', domain: 'kitchen', tab: 'recipes' },
		})
	})

	it('runs the quick actions the domains offer', () => {
		const run = index.entries.filter((entry) => entry.verb === 'run')
		expect(run.map((entry) => entry.id)).toEqual([
			'run.kitchen.add-to-grocery',
			'run.kitchen.capture-haul',
			'run.toolbench.capture-idea',
		])
		expect(run[0]).toMatchObject({
			label: 'domains.kitchen.grocery.add',
			icon: 'plus',
			target: { kind: 'quick-action', domain: 'kitchen', action: 'add-to-grocery' },
		})
	})

	it('holds each id once', () => {
		const all = index.entries.map((entry) => entry.id)
		expect(new Set(all).size).toBe(all.length)
	})

	it('searches the types a domain offers, which are its own', () => {
		expect(index.search).toEqual([
			{ domain: 'kitchen', types: ['stock-item', 'recipe'] },
			{ domain: 'toolbench', types: ['idea', 'project', 'note'] },
		])
	})
})

describe('quickActions and intents', () => {
	it('lists the Quick Log in the order of the domains', () => {
		expect(quickActions(declarations).map((action) => [action.domain, action.id])).toEqual([
			['kitchen', 'capture-haul'],
			['kitchen', 'add-to-grocery'],
			['toolbench', 'capture-idea'],
		])
	})

	it('finds the handler of an intent, and none when its domain is disabled', () => {
		expect(handlerOf(declarations, 'kitchen.add-to-grocery')?.id).toBe('kitchen')
		expect(handlerOf(without('kitchen'), 'kitchen.add-to-grocery')).toBeUndefined()
		expect(handlerOf(declarations, 'calendar.show-date')).toBeUndefined()
	})
})
