// Every visible or spoken string the kit produces on its own. English lives here and nowhere else; an app provides
// its translations through UiKitProvider. Domain names, glyphs and content always arrive as props.
// Voice: calm, plain, warm, brief; sentence case; no exclamation marks (docs/design/brand.md).

export interface UiStrings {
	add: string
	save: string
	cancel: string
	confirm: string
	done: string
	dismiss: string
	/** The cross on a notice, named after what it dismisses. */
	dismissNamed: (name: string) => string
	discard: string
	commit: string
	close: string
	back: string
	retry: string
	retrying: string
	undo: string
	select: string
	selected: (count: number) => string
	/** The spoken state of a selected row outside a grid, where aria-selected is not allowed. */
	selectedRow: string
	actions: string
	actionsFor: (name: string) => string
	remove: (name: string) => string
	more: string
	menu: string
	loading: string
	nothingYet: string
	addSampleData: string
	unread: string
	tabs: string
	enterToSave: string
	optional: string
	required: string
	on: string
	off: string
	step: (current: number, total: number) => string
	noData: string
	gardener: {
		name: string
		open: string
		proposedFact: string
		inferred: string
		accept: string
		savedToProfile: string
		dismissedNotStored: string
		cancelledNothingChanged: string
		confirmed: (verb: string) => string
		canSee: string
		contextRows: (count: number | string, id: string) => string
		locked: (id: string) => string
		openAuditLog: string
		noKeyOnDevice: string
		useLocalModel: string
		budgets: string
		budget: (used: string, cap: string) => string
		tool: string
		/** The conversation log's accessible name. */
		thread: string
		/** The one-line expansion of a can-see chip when there are no rows to show. */
		inContext: (count: number | string, id: string) => string
	}
	access: {
		read: string
		writeDraft: string
		write: string
		actExternal: string
		tier: string
		estimated: string
		origin: string
	}
	capture: {
		title: string
		processedBy: (provider: string, cost: string) => string
		draftRows: string
		mergesWith: (name: string) => string
		everyRowRemoved: string
		footer: (created: number, merged: number) => string
		locations: { fridge: string; freezer: string; pantry: string; counter: string }
		/** The accessible names of a draft row's editable name and quantity. */
		rowName: string
		rowQty: string
		/** The accessible name of a row's location radio group. */
		location: (name: string) => string
		/** The label before a row's expiry. */
		expires: string
		/** The thumbnail's alt text. */
		image: string
	}
	confirmSheet: { subject: string; resource: string; destination: string; payload: string }
	quickLog: {
		title: string
		quickActions: string
		tookIt: string
		last: (value: string, when: string) => string
		/** The sparkline's legend. */
		series: string
	}
	statusBar: {
		inbox: string
		sync: string
		connect: string
		grantedNotConnected: string
		syncNow: string
		signInExpired: string
		settings: string
		domains: string
		quickLog: string
		/** The bar's accessible name. */
		label: string
		/** The Gardener chip's accessible name: the model and its budget, as one name. */
		gardenerBudget: (model: string, budget: string) => string
	}
	sidebar: {
		/** The domain nav's accessible name. */
		label: string
		/** The pinned list's accessible name: Settings. */
		pinned: string
	}
	tabBar: {
		/** The mobile tab bar's accessible name. */
		label: string
		/** A tab with a badge: its label and the count, as one name. */
		withBadge: (label: string, count: number) => string
	}
	sky: {
		sunny: string
		clearNight: string
		partlyCloudy: string
		cloudy: string
		fog: string
		drizzle: string
		rain: string
		thunderstorm: string
		snow: string
		hail: string
		wind: string
		tornado: string
	}
	sparkline: (count: number, latest: string) => string
	reference: (value: string) => string
	compass: {
		/** The letter at the compass's north point. */
		north: string
	}
	iconButton: {
		/** The accessible name of a bell with a badge: the label and its unread count. */
		withCount: (label: string, count: number) => string
	}
	chip: {
		/** The status dot, in words. */
		status: { healthy: string; stale: string; failed: string; off: string }
		/** The budget meter's accessible name and its value. */
		budgetUsed: string
		percent: (value: number) => string
	}
	widget: {
		/** The drag handle's name in the Garden's edit mode. */
		move: (title: string) => string
	}
}

export const defaultStrings: UiStrings = {
	add: 'Add',
	save: 'Save',
	cancel: 'Cancel',
	confirm: 'Confirm',
	done: 'Done',
	dismiss: 'Dismiss',
	dismissNamed: (name) => `Dismiss ${name}`,
	discard: 'Discard',
	commit: 'Commit',
	close: 'Close',
	back: 'Back',
	retry: 'Retry',
	retrying: 'Retrying…',
	undo: 'Undo',
	select: 'Select',
	selected: (count) => `${count} selected`,
	selectedRow: 'Selected',
	actions: 'Actions',
	actionsFor: (name) => `Actions for ${name}`,
	remove: (name) => `Remove ${name}`,
	more: 'More',
	menu: 'Menu',
	loading: 'Loading',
	nothingYet: 'Nothing yet.',
	addSampleData: 'Add sample data',
	unread: 'Unread',
	tabs: 'Tabs',
	enterToSave: 'Enter to save',
	optional: 'Optional',
	required: 'Required',
	on: 'On',
	off: 'Off',
	step: (current, total) => `Step ${current} of ${total}`,
	noData: 'No data yet',
	gardener: {
		name: 'Gardener',
		open: 'Open the Gardener',
		proposedFact: 'Proposed fact',
		inferred: 'inferred',
		accept: 'Accept',
		savedToProfile: 'Saved to your profile as user-confirmed.',
		dismissedNotStored: 'Dismissed. Not stored.',
		cancelledNothingChanged: 'Cancelled. Nothing was changed.',
		confirmed: (verb) => `${verb}. Done.`,
		canSee: 'Can see',
		contextRows: (count, id) => `${count} ${id}`,
		locked: (id) => `${id}, excluded from this request`,
		openAuditLog: 'Open the audit log',
		noKeyOnDevice: 'No key on this device',
		useLocalModel: 'Use local model',
		budgets: 'Budgets',
		budget: (used, cap) => `${used} of ${cap}`,
		tool: 'Tool',
		thread: 'Conversation with the Gardener',
		inContext: (count, id) => `${count} ${id} rows are in this request.`,
	},
	access: {
		read: 'read',
		writeDraft: 'draft',
		write: 'write',
		actExternal: 'external',
		tier: 'T2',
		estimated: 'estimated',
		origin: 'origin',
	},
	capture: {
		title: 'Verify the haul',
		processedBy: (provider, cost) => `Processed by ${provider}, about ${cost}`,
		draftRows: 'Draft rows',
		mergesWith: (name) => `Merges with ${name}`,
		everyRowRemoved: 'Every row was removed. Nothing will be created.',
		footer: (created, merged) => (merged ? `${created} to create, ${merged} to merge` : `${created} to create`),
		locations: { fridge: 'Fridge', freezer: 'Freezer', pantry: 'Pantry', counter: 'Counter' },
		rowName: 'Name',
		rowQty: 'Quantity',
		location: (name) => `Location of ${name}`,
		expires: 'Expires',
		image: 'The captured image',
	},
	confirmSheet: { subject: 'Subject', resource: 'Resource', destination: 'Destination', payload: 'Payload' },
	quickLog: {
		title: 'Quick Log',
		quickActions: 'Quick actions',
		tookIt: 'Took it',
		last: (value, when) => `Last ${value}, ${when}`,
		series: 'Recent values',
	},
	statusBar: {
		inbox: 'Inbox',
		sync: 'Sync',
		connect: 'Connect',
		grantedNotConnected: 'Granted, not connected on this device.',
		syncNow: 'Sync now',
		signInExpired: 'Sign-in expired. Reconnect to resume.',
		settings: 'Settings',
		domains: 'Domains',
		quickLog: 'Quick Log',
		label: 'Status bar',
		gardenerBudget: (model, budget) => `${model}, ${budget} used`,
	},
	sidebar: {
		label: 'Domains',
		pinned: 'Settings',
	},
	tabBar: {
		label: 'Sections',
		withBadge: (label, count) => `${label}, ${count} new`,
	},
	sky: {
		sunny: 'Sunny',
		clearNight: 'Clear night',
		partlyCloudy: 'Partly cloudy',
		cloudy: 'Cloudy',
		fog: 'Fog',
		drizzle: 'Drizzle',
		rain: 'Rain',
		thunderstorm: 'Thunderstorm',
		snow: 'Snow',
		hail: 'Hail',
		wind: 'Windy',
		tornado: 'Tornado',
	},
	sparkline: (count, latest) => `${count} values, latest ${latest}`,
	reference: (value) => `reference ${value}`,
	compass: { north: 'N' },
	iconButton: {
		withCount: (label, count) => `${label}, ${count} unread`,
	},
	chip: {
		status: { healthy: 'Healthy', stale: 'Stale', failed: 'Failed', off: 'Not connected' },
		budgetUsed: 'Budget used',
		percent: (value) => `${value} %`,
	},
	widget: {
		move: (title) => `Move ${title}`,
	},
}

type DeepPartial<T> = {
	[K in keyof T]?: T[K] extends (...args: never[]) => unknown ? T[K] : T[K] extends object ? DeepPartial<T[K]> : T[K]
}
export type UiStringsOverride = DeepPartial<UiStrings>

/** `overrides` on top of the defaults, group by group, so an app can translate a subset first. */
export function mergeStrings(base: UiStrings, overrides?: UiStringsOverride): UiStrings {
	if (!overrides) return base
	const out = { ...base } as unknown as Record<string, unknown>
	for (const [key, value] of Object.entries(overrides)) {
		if (value === undefined) continue
		const current = (base as unknown as Record<string, unknown>)[key]
		out[key] =
			value && typeof value === 'object' && typeof current === 'object' && current !== null
				? mergeStrings(current as UiStrings, value as UiStringsOverride)
				: value
	}
	return out as unknown as UiStrings
}
