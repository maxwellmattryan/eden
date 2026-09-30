import { describe, expect, it } from 'vitest'
import { build, parseRegistryDoc } from './core.mjs'

const messages = {
	domains: { kitchen: { name: 'Hearth', subtitle: 'Food', tabs: { stock: 'Stock' }, add: 'Add' } },
	garden: {
		widgets: { expiringSoon: 'Expiring soon', today: 'Today' },
		empty: { expiringSoon: 'Nothing expiring.', today: 'Nothing due.' },
	},
	shell: {
		today: 'Today',
		todaySubtitle: 'Tasks',
		settings: 'Settings',
		settingsSubtitle: 'Preferences',
		more: 'More',
	},
}

const manifest = () => ({
	id: 'kitchen',
	phase: 1,
	sidebar: { group: 'domains', order: 10 },
	tabs: ['stock'],
	resources: {
		facts: [{ id: 'allergy', tier: 'T2' }],
		entities: [{ id: 'stock-item', tier: 'T0' }],
		kinds: [{ id: 'shop-day', primitive: 'event', tier: 'T0' }],
	},
	reads: ['favorite-supplement'],
	widgets: [{ id: 'expiring-soon', sizes: ['s', 'm'], default: true, reads: ['stock-item'] }],
	quickActions: [{ id: 'add-stock', label: 'domains.kitchen.add', icon: 'plus' }],
	tools: [{ id: 'suggest', access: 'read', reads: ['stock-item', 'favorite-supplement', 'task'] }],
	signals: ['stock.low'],
	intents: ['kitchen.add-to-grocery'],
	palette: { entries: [{ verb: 'run', quickAction: 'add-stock' }], search: ['stock-item'] },
	export: ['stock-item'],
})

const DOC = `
## Rules

- One row per resource.

## Substrate

### Facts

| id | owner | tier | phase | value | notes |
|---|---|---|---|---|---|
| \`home-area\` | substrate | T1 | 1 | city | |

### Entity types

| id | owner | tier | phase | notes |
|---|---|---|---|---|
| \`task\` | substrate | T1 | 1 | |
| \`event\` | substrate | by kind | 1 | |
| \`place\` | substrate | by kind | 1 | |
| \`attachment\` | substrate | by kind | 1 | |

### Kinds

| id | primitive | owner | tier | phase | notes |
|---|---|---|---|---|---|
| \`passport\` | attachment | substrate | T3 | 2 | Vault only |

## Hearth (\`kitchen\`), Phase 1

| id | category | tier | notes |
|---|---|---|---|
| \`allergy\` | fact | T2 | value \`{kind: food \\| drug}\` |
| \`stock-item\` | entity | T0 | |
| \`shop-day\` | kind (event) | T0 | |

## Candidates, Phase 3 or later

| id | category | owner | tier | notes |
|---|---|---|---|---|
| \`favorite-supplement\` | fact | fitness | T1 | |
`

/** Sources that build; a test changes one thing and names the error it expects. */
function sources(change = () => {}) {
	const given = {
		manifests: [{ file: 'kitchen/manifest.json', data: manifest() }],
		substrate: {
			file: 'substrate.json',
			data: {
				facts: [{ id: 'home-area', tier: 'T1', phase: 1 }],
				primitives: [
					{ id: 'task', tier: 'T1', phase: 1 },
					{ id: 'event', tier: 'by-kind', phase: 1 },
					{ id: 'place', tier: 'by-kind', phase: 1 },
					{ id: 'attachment', tier: 'by-kind', phase: 1 },
				],
				kinds: [{ id: 'passport', primitive: 'attachment', tier: 'T3', phase: 2 }],
			},
		},
		planned: {
			file: 'planned.json',
			data: { owners: { fitness: { phase: 'later', facts: [{ id: 'favorite-supplement', tier: 'T1' }] } } },
		},
		shell: {
			file: 'shell.json',
			data: {
				domains: ['kitchen'],
				sidebar: {
					groups: ['today', 'shell', 'domains'],
					entries: [{ id: 'today', group: 'today', order: 0, place: true }],
					pinned: [{ id: 'settings', key: ',' }],
				},
				tabs: { places: ['today'], pinned: ['kitchen'], more: 'more' },
				tiles: [{ id: 'today', glyph: 'today', sizes: ['m'], reads: ['task'] }],
				gardenDefault: ['today', 'expiring-soon'],
			},
		},
		locales: { en: structuredClone(messages), ja: structuredClone(messages) },
		icons: {
			icons: ['plus', 'pot', 'leaf', 'sunrise', 'settings'],
			domains: { kitchen: 'pot', fitness: 'leaf' },
			shell: { today: 'sunrise', settings: 'settings' },
		},
		doc: { file: 'registry.md', text: DOC },
	}
	change(given)
	return given
}
const kitchen = (given) => given.manifests[0].data
const errorsOf = (change) => build(sources(change)).errors

describe('build', () => {
	it('builds the registry, the declarations and the shell', () => {
		const result = build(sources())
		expect(result.errors).toEqual([])
		expect(result.resources.find((row) => row.id === 'shop-day')).toEqual({
			id: 'shop-day',
			category: 'kind',
			primitive: 'event',
			owner: 'kitchen',
			tier: 'T0',
			phase: 1,
			live: true,
		})
		expect(result.resources.find((row) => row.id === 'favorite-supplement')).toMatchObject({
			owner: 'fitness',
			phase: 'later',
			live: false,
		})
		const [declaration] = result.declarations
		expect(declaration.resources).toEqual(['allergy', 'stock-item', 'shop-day'])
		expect(declaration.tabs).toEqual([{ id: 'stock', label: 'domains.kitchen.tabs.stock' }])
		expect(declaration.widgets[0]).toMatchObject({ title: 'garden.widgets.expiringSoon', planned: false })
		expect(declaration.palette.entries).toEqual([
			{ id: 'kitchen.add-stock', verb: 'run', label: 'domains.kitchen.add', icon: 'plus', quickAction: 'add-stock' },
		])
		expect(result.shell.gardenDefault).toEqual(['today', 'expiring-soon'])
		expect(result.ts).toContain('export const RESOURCES = [')
		expect(result.rust).toContain(
			'Resource { id: "passport", category: Category::Kind, primitive: Some("attachment"), owner: "substrate", tier: Tier::T3, phase: Some(2) },'
		)
		expect(result.rust).toContain('tier: Tier::ByKind, phase: Some(1)')
		expect(result.rust).toContain('owner: "fitness", tier: Tier::T1, phase: None')
	})

	it('refuses an id that is registered twice, whatever its category', () => {
		const errors = errorsOf((given) => kitchen(given).resources.facts.push({ id: 'stock-item', tier: 'T0' }))
		expect(errors).toContainEqual(expect.stringMatching(/^kitchen\/manifest\.json: "stock-item" is already registered/))
	})

	it('refuses a dot or a domain prefix in a kind id (D-36)', () => {
		const dotted = errorsOf((given) => {
			kitchen(given).resources.kinds[0].id = 'kitchen.shop-day'
		})
		expect(dotted).toContainEqual(
			expect.stringMatching(/^kitchen\/manifest\.json: "kitchen\.shop-day" is not a resource id/)
		)
		const prefixed = errorsOf((given) => {
			kitchen(given).resources.kinds[0].id = 'kitchen-shop-day'
		})
		expect(prefixed).toContainEqual(expect.stringMatching(/the kind "kitchen-shop-day" carries the domain prefix/))
	})

	it('refuses a kind of no primitive, a tier and a phase it does not know', () => {
		const errors = errorsOf((given) => {
			kitchen(given).resources.kinds[0].primitive = 'note'
			kitchen(given).resources.entities[0].tier = 'T4'
			kitchen(given).phase = 4
		})
		expect(errors).toContainEqual(expect.stringMatching(/the kind "shop-day" names the primitive "note"/))
		expect(errors).toContainEqual(expect.stringMatching(/"stock-item" has the tier "T4"/))
		expect(errors).toContainEqual(expect.stringMatching(/"allergy" has the phase 4/))
	})

	it('refuses a read that is not in the registry, and a read of a T3 resource', () => {
		const errors = errorsOf((given) => {
			kitchen(given).widgets[0].reads = ['stock-item', 'pantry']
			kitchen(given).tools[0].reads = ['passport']
		})
		expect(errors).toContainEqual(
			'kitchen/manifest.json: the widget "expiring-soon" reads "pantry", which is not in the registry'
		)
		expect(errors).toContainEqual(expect.stringMatching(/the tool "suggest" reads "passport", which is T3/))
	})

	it("refuses a read of another domain's resource that the manifest does not declare", () => {
		const errors = errorsOf((given) => {
			kitchen(given).reads = []
		})
		expect(errors).toContainEqual(
			'kitchen/manifest.json: the tool "suggest" reads "favorite-supplement" of fitness, which "reads" does not declare'
		)
	})

	it('refuses an intent of another handler, and an export of what the domain does not own', () => {
		const errors = errorsOf((given) => {
			kitchen(given).intents = ['toolbench.open-idea']
			kitchen(given).export = ['task']
		})
		expect(errors).toContainEqual(expect.stringMatching(/the intent "toolbench\.open-idea" is not "kitchen\.<action>"/))
		expect(errors).toContainEqual(expect.stringMatching(/"export" names "task", which the domain does not own/))
	})

	it('refuses a planned field and a field it does not know', () => {
		const errors = errorsOf((given) => {
			kitchen(given).dailyLine = true
			kitchen(given).colour = 'green'
		})
		expect(errors).toContainEqual(expect.stringMatching(/"dailyLine" is planned, not implemented/))
		expect(errors).toContainEqual(expect.stringMatching(/"colour" is not a manifest field/))
	})

	it('makes a rule of a notification kind with a signal, and refuses one that cannot hold', () => {
		const rule = (change = () => {}) =>
			sources((given) => {
				for (const messages of Object.values(given.locales)) {
					messages.domains.kitchen.notifications = { lowStock: { line: '{name} is low', title: 'Low stock' } }
				}
				kitchen(given).deviceCapabilities = ['os-notifications']
				kitchen(given).notificationKinds = [
					{ id: 'low-stock', channel: 'os', cadence: 'weekly', signal: 'stock.low', when: { level: ['empty', 'low'] } },
					{ id: 'expiring-digest', channel: 'in-app', cadence: 'daily', default: false },
				]
				change(given)
			})
		const kind = (given) => kitchen(given).notificationKinds[0]
		const result = build(rule())
		expect(result.errors).toEqual([])
		expect(result.declarations[0].notificationKinds).toEqual([
			{
				id: 'low-stock',
				channel: 'os',
				cadence: 'weekly',
				default: true,
				signal: 'stock.low',
				when: { level: ['empty', 'low'] },
			},
			// A kind with no signal is declared and answers nothing, so it needs no words yet.
			{ id: 'expiring-digest', channel: 'in-app', cadence: 'daily', default: false, signal: null, when: null },
		])

		const refused = (change) => build(rule(change)).errors
		expect(refused((given) => (kind(given).signal = 'stock.expiring'))).toEqual([
			'kitchen/manifest.json: the notification kind "low-stock" answers "stock.expiring", which is not a signal the domain emits',
		])
		expect(refused((given) => (kitchen(given).deviceCapabilities = ['camera']))).toEqual([
			'kitchen/manifest.json: the notification kind "low-stock" notifies through the OS, so "deviceCapabilities" lists "os-notifications"',
		])
		// The line for every rule, the title for one that goes to the OS, in both languages.
		expect(refused((given) => delete given.locales.ja.domains.kitchen.notifications.lowStock.title)).toEqual([
			'kitchen/manifest.json: the notification kind "low-stock": "domains.kitchen.notifications.lowStock.title" is missing from ja.json',
		])
		expect(refused((given) => delete given.locales.en.domains.kitchen.notifications.lowStock.line)).toEqual([
			'kitchen/manifest.json: the notification kind "low-stock": "domains.kitchen.notifications.lowStock.line" is missing from en.json',
		])
		for (const when of [{}, { level: [] }, { level: 'low' }, { level: [1] }, { 'stock-level': ['low'] }, ['low']]) {
			expect(refused((given) => (kind(given).when = when))).toContainEqual(
				expect.stringMatching(/has a condition that is not fields/)
			)
		}
		expect(
			refused((given) => {
				kitchen(given).notificationKinds[1].when = { level: ['low'] }
			})
		).toEqual([
			'kitchen/manifest.json: the notification kind "expiring-digest" has a condition and no signal to hold it against',
		])
	})

	it('names each schedule by its domain, and refuses one that is neither daily nor every', () => {
		const declared = build(
			sources((given) => {
				kitchen(given).schedules = [
					{ id: 'morning', daily: '08:00' },
					{ id: 'restock', every: 3600 },
				]
			})
		)
		expect(declared.errors).toEqual([])
		expect(declared.declarations[0].schedules).toEqual([
			{ id: 'morning', name: 'kitchen.morning', daily: '08:00', every: null },
			{ id: 'restock', name: 'kitchen.restock', daily: null, every: 3600 },
		])
		expect(build(sources()).declarations[0].schedules).toEqual([])

		const refused = (schedules) => errorsOf((given) => (kitchen(given).schedules = schedules))
		expect(refused([{ id: 'Morning', daily: '08:00' }])).toContainEqual(expect.stringMatching(/is not a schedule id/))
		expect(refused([{ id: 'morning' }])).toContainEqual(expect.stringMatching(/is daily or every, one of the two/))
		expect(refused([{ id: 'morning', daily: '08:00', every: 60 }])).toContainEqual(
			expect.stringMatching(/is daily or every, one of the two/)
		)
		for (const daily of ['8:00', '24:00', '08:60', 800]) {
			expect(refused([{ id: 'morning', daily }])).toContainEqual(expect.stringMatching(/is not a time of day/))
		}
		for (const every of [30, 90.5, '300']) {
			expect(refused([{ id: 'restock', every }])).toContainEqual(expect.stringMatching(/a whole number, 60 at least/))
		}
		expect(
			refused([
				{ id: 'morning', daily: '08:00' },
				{ id: 'morning', every: 300 },
			])
		).toEqual(['kitchen/manifest.json: the schedule "morning" is declared twice'])
	})

	it('refuses a locale key one language lacks, but not the keys of a planned widget', () => {
		const missing = errorsOf((given) => {
			delete given.locales.ja.garden.empty.expiringSoon
		})
		expect(missing).toEqual([
			'kitchen/manifest.json: the widget "expiring-soon": "garden.empty.expiringSoon" is missing from ja.json',
		])
		const planned = errorsOf((given) => {
			kitchen(given).widgets.push({ id: 'cook-tonight', sizes: ['m'], reads: ['stock-item'], planned: true })
		})
		expect(planned).toEqual([])
	})

	it('refuses a widget id declared twice, by a domain or by the shell', () => {
		const errors = errorsOf((given) => {
			given.shell.data.tiles.push({ id: 'expiring-soon', glyph: 'today', sizes: ['s'], reads: [] })
		})
		expect(errors).toContainEqual(
			expect.stringMatching(/^shell\.json: the widget "expiring-soon" is declared by kitchen/)
		)
	})

	it('keeps the default layout and the default widgets in step', () => {
		const unplaced = errorsOf((given) => {
			given.shell.data.gardenDefault = ['today']
		})
		expect(unplaced).toEqual(['shell.json: "gardenDefault" does not place the default widget "expiring-soon"'])
		const unknown = errorsOf((given) => {
			given.shell.data.gardenDefault.push('moon')
		})
		expect(unknown).toContainEqual(expect.stringMatching(/"gardenDefault" lists "moon"/))
	})

	it('refuses a tab that is no place of the shell, and a pinned domain that is not built', () => {
		const errors = errorsOf((given) => {
			given.shell.data.tabs = { places: ['settings'], pinned: ['fitness'], more: 'more' }
		})
		expect(errors).toEqual([
			'shell.json: tabs.places lists "settings", which is not a place among the sidebar\'s entries',
			'shell.json: tabs.pinned lists "fitness", which has no manifest',
		])
	})

	it('refuses a manifest the shell does not list, and an owner that is both built and planned', () => {
		const unlisted = errorsOf((given) => {
			given.shell.data.domains = []
		})
		expect(unlisted).toContainEqual(expect.stringMatching(/"kitchen" is not listed in "domains" of shell\.json/))
		const both = errorsOf((given) => {
			given.planned.data.owners.kitchen = { phase: 1, facts: [] }
		})
		expect(both).toContainEqual(expect.stringMatching(/^planned\.json: "kitchen" has a manifest/))
	})

	it('refuses a row that differs from the registry doc, in either direction', () => {
		const tier = errorsOf((given) => {
			kitchen(given).resources.entities[0].tier = 'T1'
		})
		expect(tier).toEqual([
			'registry.md:34: "stock-item" has the tier "T0" in the doc and "T1" in kitchen/manifest.json',
		])
		const undocumented = errorsOf((given) => {
			kitchen(given).resources.entities.push({ id: 'recipe', tier: 'T0' })
		})
		expect(undocumented).toEqual(['kitchen/manifest.json: "recipe" has no row in registry.md'])
		const unregistered = errorsOf((given) => {
			given.doc.text += '| `seat-preference` | fact | travel | T1 | |\n'
		})
		expect(unregistered).toContainEqual(expect.stringMatching(/"seat-preference" is in the doc and in no manifest/))
	})
})

describe('parseRegistryDoc', () => {
	it('reads each table by its header, with the owner and the category of its section', () => {
		const rows = parseRegistryDoc(DOC)
		expect(rows.map((row) => row.id)).toEqual([
			'home-area',
			'task',
			'event',
			'place',
			'attachment',
			'passport',
			'allergy',
			'stock-item',
			'shop-day',
			'favorite-supplement',
		])
		expect(rows.find((row) => row.id === 'event')).toMatchObject({
			category: 'entity',
			owner: 'substrate',
			tier: 'by-kind',
			phase: 1,
		})
		expect(rows.find((row) => row.id === 'passport')).toMatchObject({
			category: 'kind',
			primitive: 'attachment',
			phase: 2,
		})
		expect(rows.find((row) => row.id === 'shop-day')).toMatchObject({
			category: 'kind',
			primitive: 'event',
			owner: 'kitchen',
			phase: undefined,
		})
		expect(rows.find((row) => row.id === 'allergy')).toMatchObject({ category: 'fact', tier: 'T2' })
		expect(rows.find((row) => row.id === 'favorite-supplement')).toMatchObject({ owner: 'fitness' })
	})
})
