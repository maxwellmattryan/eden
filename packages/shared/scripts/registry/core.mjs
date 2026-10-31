// The registry builder without its files: what it is given, what it refuses and what it writes. `build()` takes the
// sources already parsed and answers the errors, or the registry with the two generated files as text.
// build-registry.mjs reads and writes; the tests call this with small sources of their own.

const ID = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/
const SIGNAL = /^[a-z][a-z0-9]*(-[a-z0-9]+)*\.[a-z][a-z0-9]*(-[a-z0-9]+)*$/
const LOCALE_KEY = /^[a-z][A-Za-z0-9]*(\.[a-z][A-Za-z0-9]*)+$/
const FIELD = /^[a-z][A-Za-z0-9]*$/
const TIME_OF_DAY = /^(?:[01]\d|2[0-3]):[0-5]\d$/
/** The shortest period a schedule repeats at, in seconds; the crate's `MIN_EVERY_S`. */
const MIN_EVERY_S = 60

export const PRIMITIVES = ['task', 'event', 'place', 'attachment']
export const TIERS = ['T0', 'T1', 'T2', 'T3', 'by-kind', 'by-source']
export const PHASES = [1, 2, 3, 'later']
const SIZES = ['s', 'm', 'l']
const ACCESS = ['read', 'write-draft', 'write']
/** A model-backed tool's grade, lowest first, and what it may need of a model beyond text (D-74). */
const GRADES = ['light', 'standard', 'deep']
const MODEL_FLAGS = ['tools', 'vision', 'search']
/** The fields a tool has; `grade`, `needs` and `minContext` only when a model runs it. */
const TOOL_FIELDS = ['id', 'access', 'confirm', 'reads', 'grade', 'needs', 'minContext']
const CAPTURE_SOURCES = ['photo', 'receipt', 'barcode', 'share-sheet']
const DEVICE_CAPABILITIES = ['camera', 'location-precise', 'os-notifications', 'healthkit']
const CHANNELS = ['in-app', 'os']
const VERBS = ['go', 'create', 'ask', 'log', 'run']
/** What a quick action is in the Quick Log sheet (D-12): a field of one of three kinds, or the way into a surface. */
const QUICK_ACTION_KINDS = ['text', 'number', 'check', 'launch']
const SIDEBAR_GROUPS = ['shell', 'domains']

/** The fields a manifest has today, and the ones the manifest doc names that no Phase 1 domain consumes. */
const FIELDS = [
	'id',
	'phase',
	'sidebar',
	'tabs',
	'resources',
	'reads',
	'widgets',
	'quickActions',
	'captureSources',
	'tools',
	'signals',
	'notificationKinds',
	'schedules',
	'intents',
	'deviceCapabilities',
	'palette',
	'export',
]
export const PLANNED_FIELDS = ['parent', 'integrations', 'dayAnnotations', 'dailyLine', 'mobile', 'settings']

const camel = (id) => id.replace(/-([a-z0-9])/g, (_, letter) => letter.toUpperCase())
const list = (value) => (Array.isArray(value) ? value : [])
const lookup = (messages, key) =>
	key.split('.').reduce((node, part) => (node && typeof node === 'object' ? node[part] : undefined), messages)

/**
 * The tables of registry.md as rows. A table is read by its header names; the owner comes from its column or from
 * the section's heading (`## Hearth (\`kitchen\`)`), the category from its column or from the heading above the table.
 */
export function parseRegistryDoc(markdown) {
	const rows = []
	let owner = null
	let category = null
	let header = null
	const cells = (line) =>
		line
			.trim()
			.replace(/^\||\|$/g, '')
			.split(/(?<!\\)\|/)
			.map((cell) => cell.trim())
	const plain = (cell) => cell.replace(/`/g, '').trim()

	markdown.split('\n').forEach((line, index) => {
		if (line.startsWith('## ')) {
			const named = /\(`([a-z0-9-]+)`\)/.exec(line)
			owner = named ? named[1] : /^## Substrate\b/.test(line) ? 'substrate' : null
			category = null
			header = null
			return
		}
		if (line.startsWith('### ')) {
			const title = line.slice(4).trim().toLowerCase()
			category = title.startsWith('fact') ? 'fact' : title.startsWith('entity') ? 'entity' : 'kind'
			header = null
			return
		}
		if (!line.trim().startsWith('|')) {
			header = null
			return
		}
		if (!header) {
			header = cells(line).map((cell) => cell.toLowerCase())
			return
		}
		if (/^\|\s*:?-+/.test(line.trim())) return
		if (!header.includes('id')) return

		const row = Object.fromEntries(cells(line).map((cell, at) => [header[at], cell]))
		const written = plain(row.category ?? category ?? '')
		const kind = /^kind(?:\s*\(([a-z]+)\))?$/.exec(written)
		const phase = row.phase === undefined ? undefined : /^\d+$/.test(plain(row.phase)) ? Number(row.phase) : 'later'
		rows.push({
			id: plain(row.id),
			category: kind ? 'kind' : written,
			primitive: kind ? (kind[1] ?? plain(row.primitive ?? '')) : null,
			owner: plain(row.owner ?? owner ?? ''),
			tier: plain(row.tier ?? '').replace(/^by /, 'by-'),
			phase,
			line: index + 1,
		})
	})
	return rows
}

/**
 * @param sources `{ manifests: [{ file, data }], substrate: { file, data }, planned: { file, data },
 *   shell: { file, data }, locales: { en, ja }, icons: { icons, domains, shell }, doc?: { file, text } }`
 */
export function build(sources) {
	const errors = []
	const fail = (file, message) => errors.push(`${file}: ${message}`)
	const { icons, locales } = sources
	const domainIds = Object.keys(icons.domains)
	const glyphIds = [...domainIds, ...Object.keys(icons.shell)]

	// ---- The rows ----------------------------------------------------------------------------------------------

	const resources = []
	const seen = new Map()
	function addRows(file, owner, ownerPhase, rows, category, built) {
		for (const row of list(rows)) {
			const id = row?.id
			if (typeof id !== 'string' || !ID.test(id)) {
				fail(file, `${JSON.stringify(id)} is not a resource id: kebab-case, no dot (D-36)`)
				continue
			}
			if (seen.has(id)) {
				fail(file, `"${id}" is already registered by ${seen.get(id)}; an id is unique across every category`)
				continue
			}
			seen.set(id, file)
			const phase = row.phase ?? ownerPhase
			if (!TIERS.includes(row.tier))
				fail(file, `"${id}" has the tier ${JSON.stringify(row.tier)}; one of ${TIERS.join(', ')}`)
			if (!PHASES.includes(phase))
				fail(file, `"${id}" has the phase ${JSON.stringify(phase)}; one of ${PHASES.join(', ')}`)
			let primitive = null
			if (category === 'kind') {
				primitive = row.primitive
				if (!PRIMITIVES.includes(primitive)) {
					fail(
						file,
						`the kind "${id}" names the primitive ${JSON.stringify(primitive)}; one of ${PRIMITIVES.join(', ')}`
					)
				}
				const prefix = domainIds.find((domain) => id.startsWith(`${domain}-`))
				if (prefix) fail(file, `the kind "${id}" carries the domain prefix "${prefix}-" (D-36)`)
			}
			// D-130: a row is live when it is of Phase 1, or when its owner is built and the row is of the owner's phase
			const live = phase === 1 || (built && phase === ownerPhase)
			resources.push({ id, category, primitive, owner, tier: row.tier, phase, live })
		}
	}
	function addOwner(file, owner, phase, block, built = false) {
		addRows(file, owner, phase, block?.facts, 'fact', built)
		addRows(file, owner, phase, block?.primitives, 'primitive', built)
		addRows(file, owner, phase, block?.entities, 'entity', built)
		addRows(file, owner, phase, block?.kinds, 'kind', built)
	}

	addOwner(sources.substrate.file, 'substrate', undefined, sources.substrate.data)
	for (const id of PRIMITIVES) {
		if (!resources.some((row) => row.id === id && row.category === 'primitive')) {
			fail(sources.substrate.file, `the primitive "${id}" is missing`)
		}
	}

	const manifests = new Map()
	for (const { file, data } of sources.manifests) {
		if (typeof data?.id !== 'string' || !ID.test(data.id)) {
			fail(file, `${JSON.stringify(data?.id)} is not a domain id`)
			continue
		}
		if (!domainIds.includes(data.id)) fail(file, `"${data.id}" has no glyph in the kit's icon-list.json`)
		if (manifests.has(data.id)) fail(file, `the domain "${data.id}" has a manifest already`)
		manifests.set(data.id, { file, data })
	}
	const order = list(sources.shell.data.domains)
	for (const id of order) {
		if (!manifests.has(id)) fail(sources.shell.file, `"domains" lists "${id}", which has no manifest.json`)
	}
	for (const [id, { file }] of manifests) {
		if (!order.includes(id)) fail(file, `"${id}" is not listed in "domains" of ${sources.shell.file}`)
	}
	if (new Set(order).size !== order.length) fail(sources.shell.file, '"domains" lists a domain twice')
	const built = order.filter((id) => manifests.has(id)).map((id) => manifests.get(id))

	for (const { file, data } of built) addOwner(file, data.id, data.phase, data.resources, true)
	for (const [owner, block] of Object.entries(sources.planned.data.owners ?? {})) {
		if (!ID.test(owner) || !domainIds.includes(owner)) {
			fail(sources.planned.file, `"${owner}" is not a domain with a glyph in the kit's icon-list.json`)
		}
		if (manifests.has(owner)) {
			fail(sources.planned.file, `"${owner}" has a manifest; its rows live there, not among the planned ones`)
			continue
		}
		addOwner(sources.planned.file, owner, block.phase, block)
	}

	const byId = new Map(resources.map((row) => [row.id, row]))

	// ---- What every declaration shares --------------------------------------------------------------------------

	function ids(file, what, values, pattern = ID) {
		const out = []
		for (const value of list(values)) {
			if (typeof value !== 'string' || !pattern.test(value))
				fail(file, `${what}: ${JSON.stringify(value)} is not well formed`)
			else if (out.includes(value)) fail(file, `${what}: "${value}" is listed twice`)
			else out.push(value)
		}
		return out
	}
	function among(file, what, values, allowed) {
		return ids(file, what, values).filter((value) => {
			if (allowed.includes(value)) return true
			fail(file, `${what}: "${value}" is not one of ${allowed.join(', ')}`)
			return false
		})
	}
	/** Registry ids a declaration reads: each resolves, and none is T3 (D-14, D-31). */
	function reads(file, what, values) {
		return ids(file, what, values).filter((id) => {
			const row = byId.get(id)
			if (!row) fail(file, `${what} reads "${id}", which is not in the registry`)
			else if (row.tier === 'T3') fail(file, `${what} reads "${id}", which is T3 and can never be read (D-14)`)
			return row && row.tier !== 'T3'
		})
	}
	function sizes(file, what, values) {
		const out = among(file, `${what} sizes`, values, SIZES)
		if (!out.length) fail(file, `${what} has no size`)
		return out
	}
	function localeKey(file, what, key) {
		if (typeof key !== 'string' || !LOCALE_KEY.test(key)) {
			fail(file, `${what}: ${JSON.stringify(key)} is not a locale key`)
			return
		}
		for (const [lang, messages] of Object.entries(locales)) {
			if (typeof lookup(messages, key) !== 'string') fail(file, `${what}: "${key}" is missing from ${lang}.json`)
		}
	}
	function icon(file, what, name) {
		if (!icons.icons.includes(name)) fail(file, `${what}: "${name}" is not in the kit's icon list`)
	}
	/**
	 * A Gardener tool with a well-formed id: its access and reads, and, when a model runs it, its grade and what it
	 * needs of the model (D-74). No grade is a plain tool. `within` checks its reads against the declarer's own.
	 */
	function toolDeclaration(file, tool, within) {
		const what = `the tool "${tool.id}"`
		for (const field of Object.keys(tool)) {
			if (field === 'model' || field === 'provider')
				fail(file, `${what}: "${field}" is not a tool field; a tool names a grade, never a model (D-74)`)
			else if (!TOOL_FIELDS.includes(field)) fail(file, `${what}: "${field}" is not a tool field`)
		}
		if (!ACCESS.includes(tool.access))
			fail(file, `${what} has the access ${JSON.stringify(tool.access)}; one of ${ACCESS.join(', ')}`)
		const { grade, needs, minContext } = tool
		if (grade !== undefined && !GRADES.includes(grade))
			fail(file, `${what} has the grade ${JSON.stringify(grade)}; one of ${GRADES.join(', ')}, or none if plain`)
		for (const field of ['needs', 'minContext']) {
			if (grade === undefined && tool[field] !== undefined)
				fail(file, `${what} declares "${field}" and no grade; a plain tool runs no model`)
		}
		if (needs !== undefined && !Array.isArray(needs)) fail(file, `${what} has "needs" that is not a list`)
		if (minContext !== undefined && !(Number.isInteger(minContext) && minContext > 0))
			fail(file, `${what} has the minContext ${JSON.stringify(minContext)}; a whole number of tokens, above zero`)
		return {
			id: tool.id,
			access: tool.access,
			confirm: tool.confirm === true,
			reads: within(what, tool.reads),
			grade: grade ?? null,
			needs: among(file, `${what} needs`, needs, MODEL_FLAGS),
			minContext: minContext ?? null,
		}
	}

	// ---- The domains ----------------------------------------------------------------------------------------------

	const widgetIds = new Map()
	function widgetId(file, id) {
		if (typeof id !== 'string' || !ID.test(id)) {
			fail(file, `${JSON.stringify(id)} is not a widget id`)
			return false
		}
		if (widgetIds.has(id)) {
			fail(file, `the widget "${id}" is declared by ${widgetIds.get(id)} already; a widget id is unique`)
			return false
		}
		widgetIds.set(id, file)
		return true
	}

	const declarations = []
	for (const { file, data } of built) {
		const domain = data.id
		for (const field of Object.keys(data)) {
			if (PLANNED_FIELDS.includes(field))
				fail(file, `"${field}" is planned, not implemented; leave it out until a domain consumes it`)
			else if (!FIELDS.includes(field)) fail(file, `"${field}" is not a manifest field`)
		}
		const own = (id) => byId.get(id)?.owner === domain
		const foreign = (id) => !own(id) && byId.get(id)?.owner !== 'substrate'

		const group = data.sidebar?.group
		if (!SIDEBAR_GROUPS.includes(group))
			fail(file, `sidebar.group is ${JSON.stringify(group)}; one of ${SIDEBAR_GROUPS.join(', ')}`)
		if (!Number.isInteger(data.sidebar?.order)) fail(file, 'sidebar.order is a whole number')
		const sidebar = { group, order: data.sidebar?.order, visible: data.sidebar?.visible !== false }

		localeKey(file, 'the name', `domains.${domain}.name`)
		localeKey(file, 'the subtitle', `domains.${domain}.subtitle`)

		const tabs = ids(file, 'tabs', data.tabs).map((id) => {
			const label = `domains.${domain}.tabs.${camel(id)}`
			localeKey(file, `the tab "${id}"`, label)
			return { id, label }
		})

		const declared = reads(file, '"reads"', data.reads)
		for (const id of declared) {
			if (own(id)) fail(file, `"reads" names "${id}", which the domain owns; it lists what other owners hold`)
		}
		const within = (what, values) => {
			const out = reads(file, what, values)
			for (const id of out) {
				if (foreign(id) && !declared.includes(id)) {
					fail(file, `${what} reads "${id}" of ${byId.get(id).owner}, which "reads" does not declare`)
				}
			}
			return out
		}

		const quickActions = []
		for (const action of list(data.quickActions)) {
			if (typeof action?.id !== 'string' || !ID.test(action.id))
				fail(file, `${JSON.stringify(action?.id)} is not a quick action id`)
			else if (quickActions.some((other) => other.id === action.id))
				fail(file, `the quick action "${action.id}" is declared twice`)
			else {
				const what = `the quick action "${action.id}"`
				localeKey(file, what, action.label)
				icon(file, what, action.icon)
				if (!QUICK_ACTION_KINDS.includes(action.kind))
					fail(file, `${what} has the kind ${JSON.stringify(action.kind)}; one of ${QUICK_ACTION_KINDS.join(', ')}`)
				localeKey(file, `${what}'s keyword`, action.keyword)
				if (action.placeholder !== undefined) localeKey(file, `${what}'s placeholder`, action.placeholder)
				if (action.unit !== undefined && (action.kind !== 'number' || typeof action.unit !== 'string' || !action.unit))
					fail(file, `${what} has a unit, which only a number has, as a word`)
				if (action.kind === 'launch' && action.placeholder !== undefined)
					fail(file, `${what} has a placeholder, and a launch has no field`)
				quickActions.push({
					id: action.id,
					label: action.label,
					icon: action.icon,
					kind: action.kind,
					keyword: action.keyword,
					...(action.placeholder !== undefined ? { placeholder: action.placeholder } : {}),
					...(action.unit !== undefined ? { unit: action.unit } : {}),
				})
			}
		}

		const widgets = []
		for (const widget of list(data.widgets)) {
			if (!widgetId(file, widget?.id)) continue
			const what = `the widget "${widget.id}"`
			const planned = widget.planned === true
			const title = `garden.widgets.${camel(widget.id)}`
			const empty = `garden.empty.${camel(widget.id)}`
			if (!planned) {
				localeKey(file, what, title)
				localeKey(file, what, empty)
			} else if (widget.default) fail(file, `${what} is planned, so it cannot be in the default layout`)
			widgets.push({
				id: widget.id,
				sizes: sizes(file, what, widget.sizes),
				default: widget.default === true,
				planned,
				reads: within(what, widget.reads),
				title,
				empty,
			})
		}

		const tools = []
		for (const tool of list(data.tools)) {
			if (typeof tool?.id !== 'string' || !ID.test(tool.id)) fail(file, `${JSON.stringify(tool?.id)} is not a tool id`)
			else if (tools.some((other) => other.id === tool.id)) fail(file, `the tool "${tool.id}" is declared twice`)
			else tools.push(toolDeclaration(file, tool, within))
		}

		const signals = ids(file, '"signals"', data.signals, SIGNAL)
		const deviceCapabilities = among(file, '"deviceCapabilities"', data.deviceCapabilities, DEVICE_CAPABILITIES)

		// A notification kind with a signal is a rule (signals-notifications.md): the signal triggers it, `when` is
		// its condition on the payload, the channel its action. One without is declared and answers nothing yet.
		const notificationKinds = []
		for (const kind of list(data.notificationKinds)) {
			if (typeof kind?.id !== 'string' || !ID.test(kind.id))
				fail(file, `${JSON.stringify(kind?.id)} is not a notification kind id`)
			else if (notificationKinds.some((other) => other.id === kind.id))
				fail(file, `the notification kind "${kind.id}" is declared twice`)
			else {
				const what = `the notification kind "${kind.id}"`
				if (!CHANNELS.includes(kind.channel))
					fail(file, `${what} has the channel ${JSON.stringify(kind.channel)}; one of ${CHANNELS.join(', ')}`)
				if (typeof kind.cadence !== 'string' || !ID.test(kind.cadence))
					fail(file, `${what} has the cadence ${JSON.stringify(kind.cadence)}`)
				let when = null
				if (kind.signal === undefined) {
					if (kind.when !== undefined) fail(file, `${what} has a condition and no signal to hold it against`)
				} else {
					if (!signals.includes(kind.signal))
						fail(file, `${what} answers ${JSON.stringify(kind.signal)}, which is not a signal the domain emits`)
					if (kind.channel === 'os' && !deviceCapabilities.includes('os-notifications'))
						fail(file, `${what} notifies through the OS, so "deviceCapabilities" lists "os-notifications"`)
					localeKey(file, what, `domains.${domain}.notifications.${camel(kind.id)}.line`)
					if (kind.channel === 'os') localeKey(file, what, `domains.${domain}.notifications.${camel(kind.id)}.title`)
					if (kind.when !== undefined) {
						const fields = kind.when && typeof kind.when === 'object' && !Array.isArray(kind.when) ? kind.when : {}
						const sound =
							Object.keys(fields).length > 0 &&
							Object.entries(fields).every(
								([field, values]) =>
									FIELD.test(field) &&
									Array.isArray(values) &&
									values.length > 0 &&
									values.every((value) => typeof value === 'string')
							)
						if (sound) when = fields
						else fail(file, `${what} has a condition that is not fields, each with the words it may be`)
					}
				}
				notificationKinds.push({
					id: kind.id,
					channel: kind.channel,
					cadence: kind.cadence,
					default: kind.default !== false,
					signal: kind.signal ?? null,
					when,
				})
			}
		}

		// The repeating schedules the shell declares to the scheduler when it starts; a one-shot is set while the app
		// runs and is not declared.
		const schedules = []
		for (const schedule of list(data.schedules)) {
			if (typeof schedule?.id !== 'string' || !ID.test(schedule.id))
				fail(file, `${JSON.stringify(schedule?.id)} is not a schedule id`)
			else if (schedules.some((other) => other.id === schedule.id))
				fail(file, `the schedule "${schedule.id}" is declared twice`)
			else {
				const what = `the schedule "${schedule.id}"`
				const { daily, every } = schedule
				if ((daily === undefined) === (every === undefined)) fail(file, `${what} is daily or every, one of the two`)
				else if (daily !== undefined && (typeof daily !== 'string' || !TIME_OF_DAY.test(daily)))
					fail(file, `${what} is daily at ${JSON.stringify(daily)}, which is not a time of day (HH:MM)`)
				else if (every !== undefined && !(Number.isInteger(every) && every >= MIN_EVERY_S))
					fail(file, `${what} repeats every ${JSON.stringify(every)} seconds; a whole number, ${MIN_EVERY_S} at least`)
				else
					schedules.push({
						id: schedule.id,
						name: `${domain}.${schedule.id}`,
						daily: daily ?? null,
						every: every ?? null,
					})
			}
		}

		const intents = []
		for (const intent of list(data.intents)) {
			const [handler, action, ...rest] = typeof intent === 'string' ? intent.split('.') : []
			if (handler !== domain || !ID.test(action ?? '') || rest.length) {
				fail(
					file,
					`the intent ${JSON.stringify(intent)} is not "${domain}.<action>"; a domain declares the intents it handles`
				)
			} else if (intents.includes(intent)) fail(file, `the intent "${intent}" is declared twice`)
			else intents.push(intent)
		}

		const entries = []
		for (const entry of list(data.palette?.entries)) {
			if (!VERBS.includes(entry?.verb)) {
				fail(file, `a palette entry has the verb ${JSON.stringify(entry?.verb)}; one of ${VERBS.join(', ')}`)
				continue
			}
			if (entry.quickAction !== undefined) {
				const action = quickActions.find((other) => other.id === entry.quickAction)
				if (!action)
					fail(file, `a palette entry names the quick action "${entry.quickAction}", which the domain does not declare`)
				else if (entry.verb === 'log' && action.kind === 'launch')
					fail(file, `a palette entry logs the quick action "${action.id}", which is a launch and takes no value`)
				else
					entries.push({
						id: `${domain}.${action.id}`,
						verb: entry.verb,
						label: action.label,
						icon: action.icon,
						quickAction: action.id,
					})
			} else if (entry.intent !== undefined) {
				if (!intents.includes(entry.intent))
					fail(file, `a palette entry names the intent "${entry.intent}", which the domain does not declare`)
				else {
					localeKey(file, `the palette entry for "${entry.intent}"`, entry.label)
					entries.push({ id: entry.intent, verb: entry.verb, label: entry.label, intent: entry.intent })
				}
			} else
				fail(file, 'a palette entry names a quick action or an intent; the domain and its tabs are entries already')
		}

		const exported = ids(file, '"export"', data.export)
		for (const id of exported) {
			if (!own(id)) fail(file, `"export" names "${id}", which the domain does not own`)
		}
		const search = reads(file, '"palette.search"', data.palette?.search)
		for (const id of search) {
			if (!own(id)) fail(file, `"palette.search" names "${id}", which the domain does not own`)
		}

		declarations.push({
			id: domain,
			phase: data.phase,
			name: `domains.${domain}.name`,
			subtitle: `domains.${domain}.subtitle`,
			sidebar,
			tabs,
			resources: resources.filter((row) => row.owner === domain).map((row) => row.id),
			reads: declared,
			widgets,
			quickActions,
			captureSources: among(file, '"captureSources"', data.captureSources, CAPTURE_SOURCES),
			tools,
			signals,
			notificationKinds,
			schedules,
			intents,
			deviceCapabilities,
			palette: { entries, search },
			export: exported,
		})
	}

	for (const group of SIDEBAR_GROUPS) {
		const orders = new Map()
		for (const declaration of declarations.filter((entry) => entry.sidebar.group === group)) {
			const taken = orders.get(declaration.sidebar.order)
			if (taken) {
				fail(
					manifests.get(declaration.id).file,
					`sidebar.order ${declaration.sidebar.order} is "${taken}"'s in the group "${group}"`
				)
			}
			orders.set(declaration.sidebar.order, declaration.id)
		}
	}

	// ---- The shell --------------------------------------------------------------------------------------------------

	const shellFile = sources.shell.file
	const shellData = sources.shell.data
	const groups = among(shellFile, 'sidebar.groups', shellData.sidebar?.groups, ['today', ...SIDEBAR_GROUPS])
	const shellEntry = (entry, what) => {
		if (!glyphIds.includes(entry?.id))
			fail(shellFile, `${what} "${entry?.id}" has no glyph in the kit's icon-list.json`)
		localeKey(shellFile, `${what} "${entry?.id}"`, `shell.${camel(String(entry?.id))}`)
		localeKey(shellFile, `${what} "${entry?.id}"`, `shell.${camel(String(entry?.id))}Subtitle`)
		return {
			id: entry?.id,
			name: `shell.${camel(String(entry?.id))}`,
			subtitle: `shell.${camel(String(entry?.id))}Subtitle`,
		}
	}
	const entries = list(shellData.sidebar?.entries).map((entry) => {
		if (!groups.includes(entry?.group))
			fail(shellFile, `the sidebar entry "${entry?.id}" is in the group ${JSON.stringify(entry?.group)}`)
		if (!Number.isInteger(entry?.order)) fail(shellFile, `the sidebar entry "${entry?.id}" has no order`)
		if (entry?.place !== true && typeof entry?.key !== 'string') {
			fail(shellFile, `the sidebar entry "${entry?.id}" is not a place, so it has a key of its own`)
		}
		return {
			...shellEntry(entry, 'the sidebar entry'),
			group: entry?.group,
			order: entry?.order,
			place: entry?.place === true,
			key: entry?.key ?? null,
		}
	})
	const pinned = list(shellData.sidebar?.pinned).map((entry) => {
		// a pinned entry says which it is: a place with a page of its own (the Gardener, D-113) or an action (Settings)
		if (typeof entry?.place !== 'boolean')
			fail(shellFile, `the pinned entry "${entry?.id}" does not say whether it is a place`)
		return {
			...shellEntry(entry, 'the pinned entry'),
			place: entry?.place === true,
			key: entry?.key ?? null,
		}
	})
	// The phone's tab bar: the shell's places, the domains pinned until the owner chooses, and More for the rest.
	const tabs = {
		places: ids(shellFile, 'tabs.places', shellData.tabs?.places).filter((id) => {
			const known = entries.some((entry) => entry.id === id && entry.place)
			if (!known) fail(shellFile, `tabs.places lists "${id}", which is not a place among the sidebar's entries`)
			return known
		}),
		pinned: ids(shellFile, 'tabs.pinned', shellData.tabs?.pinned).filter((id) => {
			const known = declarations.some((declaration) => declaration.id === id)
			if (!known) fail(shellFile, `tabs.pinned lists "${id}", which has no manifest`)
			return known
		}),
		more: { id: shellData.tabs?.more, name: `shell.${camel(String(shellData.tabs?.more))}` },
	}
	if (typeof tabs.more.id !== 'string' || !ID.test(tabs.more.id)) fail(shellFile, 'tabs.more is the id of the last tab')
	else localeKey(shellFile, 'tabs.more', tabs.more.name)

	const tiles = []
	for (const tile of list(shellData.tiles)) {
		if (!widgetId(shellFile, tile?.id)) continue
		const what = `the tile "${tile.id}"`
		if (!glyphIds.includes(tile.glyph))
			fail(shellFile, `${what} has the glyph ${JSON.stringify(tile.glyph)}, which the kit does not list`)
		const title = `garden.widgets.${camel(tile.id)}`
		const empty = `garden.empty.${camel(tile.id)}`
		localeKey(shellFile, what, title)
		localeKey(shellFile, what, empty)
		tiles.push({
			id: tile.id,
			glyph: tile.glyph,
			sizes: sizes(shellFile, what, tile.sizes),
			reads: reads(shellFile, what, tile.reads),
			title,
			empty,
		})
	}
	const widgets = declarations.flatMap((declaration) => declaration.widgets)
	const gardenDefault = ids(shellFile, '"gardenDefault"', shellData.gardenDefault).filter((id) => {
		const widget = widgets.find((other) => other.id === id)
		if (!widget && !tiles.some((tile) => tile.id === id)) {
			fail(shellFile, `"gardenDefault" lists "${id}", which no domain and no shell tile declares`)
			return false
		}
		if (widget?.planned) fail(shellFile, `"gardenDefault" lists "${id}", which is planned`)
		else if (widget && !widget.default)
			fail(shellFile, `"gardenDefault" lists "${id}", which its domain does not mark "default"`)
		return true
	})
	for (const widget of widgets) {
		if (widget.default && !widget.planned && !gardenDefault.includes(widget.id)) {
			fail(shellFile, `"gardenDefault" does not place the default widget "${widget.id}"`)
		}
	}
	const shell = {
		domains: declarations.map((declaration) => declaration.id),
		sidebar: { groups, entries, pinned },
		tabs,
		tiles,
		gardenDefault,
	}

	// ---- The registry doc -------------------------------------------------------------------------------------------

	if (sources.doc) {
		const { file, text } = sources.doc
		const written = parseRegistryDoc(text)
		const docIds = new Set()
		for (const row of written) {
			const at = `${file}:${row.line}`
			if (docIds.has(row.id)) {
				fail(at, `"${row.id}" has a second row`)
				continue
			}
			docIds.add(row.id)
			const known = byId.get(row.id)
			if (!known) {
				fail(at, `"${row.id}" is in the doc and in no manifest`)
				continue
			}
			// the doc lists the four primitives among the substrate's entity types
			const category = known.category === 'primitive' ? 'entity' : known.category
			const differs = (what, doc, code) =>
				fail(at, `"${row.id}" has the ${what} "${doc}" in the doc and "${code}" in ${seen.get(row.id)}`)
			if (row.category !== category) differs('category', row.category, category)
			if ((row.primitive ?? null) !== known.primitive) differs('primitive', row.primitive, known.primitive)
			if (row.owner !== known.owner) differs('owner', row.owner, known.owner)
			if (row.tier !== known.tier) differs('tier', row.tier, known.tier)
			if (row.phase !== undefined && row.phase !== known.phase) differs('phase', row.phase, known.phase)
		}
		for (const row of resources) {
			if (!docIds.has(row.id)) fail(seen.get(row.id), `"${row.id}" has no row in ${file}`)
		}
	}

	if (errors.length) return { errors }
	return {
		errors,
		resources,
		declarations,
		shell,
		ts: typescript(resources, declarations, shell),
		rust: rust(resources),
	}
}

const HEADER = "GENERATED by packages/shared/scripts/build-registry.mjs from the domains' manifest.json files,"

function typescript(resources, declarations, shell) {
	const json = (value) => JSON.stringify(value, null, '\t')
	const byDomain = Object.fromEntries(declarations.map((declaration) => [declaration.id, declaration]))
	return `// ${HEADER}
// registry/substrate.json, registry/planned.json and manifest/shell.json. Do not edit; run \`yarn registry\`.

/** Every resource a grant, a declared read or an audit entry can name (D-35); \`live\` is what a write may create. */
export const RESOURCES = ${json(resources)} as const

/** The built domains' declarations, by id, in the shell's order. */
export const DECLARATIONS = ${json(byDomain)} as const

/** What the shell declares for itself. */
export const SHELL = ${json(shell)} as const
`
}

function rust(resources) {
	const pascal = (id) =>
		id
			.split('-')
			.map((part) => part[0].toUpperCase() + part.slice(1))
			.join('')
	const rows = resources
		.map((row) => {
			const primitive = row.primitive ? `Some("${row.primitive}")` : 'None'
			const phase = row.phase === 'later' ? 'None' : `Some(${row.phase})`
			return `    Resource { id: "${row.id}", category: Category::${pascal(row.category)}, primitive: ${primitive}, owner: "${row.owner}", tier: Tier::${pascal(row.tier)}, phase: ${phase}, live: ${row.live} },`
		})
		.join('\n')
	return `// ${HEADER}
// registry/substrate.json and registry/planned.json. Do not edit; run \`yarn registry\`.

use super::{Category, Resource, Tier};

#[rustfmt::skip]
pub(super) const RESOURCES: &[Resource] = &[
${rows}
];
`
}
