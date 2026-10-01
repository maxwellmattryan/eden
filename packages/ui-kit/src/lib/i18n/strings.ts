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
	/** The name of a row's checkbox: "Check off Limes". */
	checkOff: (name: string) => string
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
	show: string
	hide: string
	step: (current: number, total: number) => string
	/** The name of a glyph that explains a label, such as a table column's info button. */
	about: (name: string) => string
	noData: string
	/** The letters that stand for a date's parts in an unset date field: MM/DD/YYYY, in the system's order. */
	datePart: { year: string; month: string; day: string }
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
		/** The eye button at the composer's foot. */
		canSee: string
		/** The title of the panel the button opens. */
		canSeeTitle: string
		/** The panel's first section: the ids with rows to read. */
		inThisRequest: string
		/** The spoken sentence beside a locked row when the app cannot ask for the grant. */
		locked: (id: string) => string
		/** The panel's caption: how many facts, across how many types. */
		canSeeSummary: (facts: number, types: number) => string
		/** The caption's tail when ids are kept out. */
		notShared: (count: number) => string
		/** The label of the locked section. */
		notSharedLabel: string
		/** The tooltip on the locked section's info glyph. */
		notSharedExplain: string
		/** The button at a locked row's end that asks for the grant. */
		allow: string
		openAuditLog: string
		/** The info glyph on a tool card's head. */
		aboutTool: string
		noKeyOnDevice: string
		useLocalModel: string
		budgets: string
		budget: (used: string, cap: string) => string
		tool: string
		/** The conversation log's accessible name. */
		thread: string
		/** The one-line expansion of a read when there are no rows to show: the type by name, and how many. */
		inContext: (count: number | string, name: string) => string
		/** The caret beside the model chip that opens the grade menu. */
		switchGrade: string
		grade: string
		unavailableNoProvider: string
		unavailableNoCapableModel: (missing: string) => string
		unavailableNoKey: string
		budgetReached: string
		offline: string
		confirmCost: (estimate: string) => string
		trimmed: (ids: string) => string
		runsInApp: string
		devClamp: (model: string) => string
		cutShort: string
		continueReply: string
		stop: string
		send: string
		newThread: string
		threads: string
		askPlaceholder: string
		askInDomain: (domain: string) => string
		focus: (title: string) => string
		lockedThread: string
		includeThread: string
		delegated: (tool: string) => string
		copyCode: string
		copied: string
		/** The spoken word for a tool card's status glyph. */
		toolRunning: string
		toolDone: string
		toolFailed: string
		toolCancelled: string
		toolWaiting: string
		/** The spoken name of the sprout that grows while a reply is awaited. */
		writing: string
		/** The line under the owner's message: when it was sent. */
		sentAt: (time: string) => string
		/** The line under a reply: when it was received. */
		receivedAt: (time: string) => string
		/** The copy glyph under a message. */
		copyMessage: string
		addTask: string
		createTasks: (n: number) => string
		addToList: string
		discard: string
		committed: string
		discarded: string
		/** The name of the file a long paste into the composer becomes. */
		pastedText: string
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
		/** The sheet's title while the sources are collected and read. */
		collectTitle: string
		/** The sheet's title once there are rows to check. */
		title: string
		/** The invitation in the empty drop area. */
		invite: string
		/** The line under the invitation: the ways in. The second is the phone's, where nothing is dropped. */
		inviteHint: string
		inviteHintTouch: string
		/** The file button's name. */
		chooseFiles: string
		/** The accessible name of the sources: the staged files, and their thumbnails beside the rows. */
		sources: string
		/** The cost as the provider line says it: "about 0.8 ¢". */
		estimate: (cost: string) => string
		/** The provider line once the sources were read; `line` is the provider, the model and the cost. */
		readBy: (line: string) => string
		/** The first phase's primary button, and the status while it runs. */
		read: string
		reading: string
		draftRows: string
		addRow: string
		/** The switch on a row that matches a stock item. */
		mergeWith: (name: string) => string
		everyRowRemoved: string
		footer: (created: number, merged: number) => string
		locations: { fridge: string; freezer: string; pantry: string; counter: string }
		/** The accessible names of a draft row's fields; the name and the unit are placeholders too. */
		rowName: string
		rowQty: string
		rowUnit: string
		rowExpiry: string
		rowBrand: string
		rowSize: string
		rowPrice: string
		/** The store a haul was bought at: the menu's name, its chip with none picked and with one, and "No store". */
		store: string
		pickStore: string
		boughtAt: (store: string) => string
		noStore: string
		/** Under the chip while no store is picked: the name the sources gave, or that prices need a store. */
		storeRead: (name: string) => string
		pricesNeedStore: string
		/** The category chip with nothing chosen and the menu's name; the chip's accessible name with a choice. */
		category: string
		categoryNamed: (label: string) => string
		/** The accessible name of a row's location radio group. */
		location: (name: string) => string
		/** A row with no name yet, where its name is spoken: "Remove this row". */
		unnamed: string
		/** The words that differ when the shelves are read as they stand (`kind="stock"`): a match is updated. */
		stock: {
			collectTitle: string
			title: string
			invite: string
			inviteHint: string
			inviteHintTouch: string
			mergeWith: (name: string) => string
			footer: (created: number, updated: number) => string
		}
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
	dropzone: {
		/** The overlay's headline while files are dragged over; 0 when the count is not known. */
		drop: (count: number) => string
		/** How many of each kind are being dragged. */
		groups: {
			image: (count: number) => string
			pdf: (count: number) => string
			text: (count: number) => string
			other: (count: number) => string
		}
		/** The drag holds more files than there is room for. */
		tooMany: (max: number) => string
		/** Nothing in the drag is of a type taken here. */
		notAccepted: string
	}
	file: {
		/** A file chip's body as a button. */
		open: (name: string) => string
		/** The file is no longer on this device. */
		missing: string
		/** The file could not be read or stored. */
		failed: string
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
	checkOff: (name) => `Check off ${name}`,
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
	show: 'Show',
	hide: 'Hide',
	step: (current, total) => `Step ${current} of ${total}`,
	about: (name) => `About ${name}`,
	noData: 'No data yet',
	datePart: { year: 'YYYY', month: 'MM', day: 'DD' },
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
		canSeeTitle: 'What the Gardener can see',
		inThisRequest: 'In this request',
		locked: (id) => `${id}, not shared: needs your grant`,
		canSeeSummary: (facts, types) => `${facts} facts across ${types} types`,
		notShared: (count) => `${count} not shared`,
		notSharedLabel: 'Not shared',
		notSharedExplain:
			'A tool declared these, but T2 facts stay out of every request until you share them. Allow gives the Gardener a standing read you can revoke at any time.',
		allow: 'Allow',
		openAuditLog: 'Open the audit log',
		aboutTool: 'About this tool',
		noKeyOnDevice: 'No key on this device',
		useLocalModel: 'Use local model',
		budgets: 'Budgets',
		budget: (used, cap) => `${used} of ${cap}`,
		tool: 'Tool',
		thread: 'Conversation with the Gardener',
		inContext: (count, name) => `${name}: ${count} in this request.`,
		switchGrade: 'Switch the Gardener’s grade',
		grade: 'Grade',
		unavailableNoProvider: 'No provider is configured.',
		unavailableNoCapableModel: (missing) => `No model can run this: it needs ${missing}.`,
		unavailableNoKey: 'No key on this device',
		budgetReached: 'The monthly budget is reached.',
		offline: 'Cloud models are unavailable offline.',
		confirmCost: (estimate) => `This will cost about ${estimate}. Send it?`,
		trimmed: (ids) => `Trimmed to fit: ${ids}`,
		runsInApp: 'The Gardener runs in the installed app.',
		devClamp: (model) => `Development build: every grade runs on ${model}.`,
		cutShort: 'Cut short by the token cap.',
		continueReply: 'Continue',
		stop: 'Stop',
		send: 'Send',
		newThread: 'New conversation',
		threads: 'Conversations',
		askPlaceholder: 'Ask the Gardener',
		askInDomain: (domain) => `Ask about ${domain}`,
		focus: (title) => `About: ${title}`,
		lockedThread: 'This conversation read T2 data and stays out of future context.',
		includeThread: 'Include this conversation',
		delegated: (tool) => `Ran ${tool} as its own request.`,
		copyCode: 'Copy',
		copied: 'Copied',
		toolRunning: 'Running',
		toolDone: 'Done',
		toolFailed: 'Failed',
		toolCancelled: 'Cancelled',
		toolWaiting: 'Waiting on you',
		writing: 'Writing a reply',
		sentAt: (time) => `Sent at ${time}`,
		receivedAt: (time) => `Received at ${time}`,
		copyMessage: 'Copy message',
		addTask: 'Add task',
		createTasks: (n) => (n === 1 ? 'Create 1 task' : `Create ${n} tasks`),
		addToList: 'Add to the list',
		discard: 'Discard',
		committed: 'Added',
		discarded: 'Discarded',
		pastedText: 'Pasted text.txt',
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
		collectTitle: 'Capture a haul',
		title: 'Verify the haul',
		invite: 'Add photos, a receipt or an order PDF',
		inviteHint: 'Drop them here, choose files, or paste a list.',
		inviteHintTouch: 'Choose files, or paste a list.',
		chooseFiles: 'Choose files',
		sources: 'Sources',
		estimate: (cost) => `up to ${cost}`,
		readBy: (line) => `Read by ${line}`,
		read: 'Read',
		reading: 'Reading…',
		draftRows: 'Draft rows',
		addRow: 'Add a row',
		mergeWith: (name) => `Merge with ${name}`,
		everyRowRemoved: 'Every row was removed. Nothing will be created.',
		footer: (created, merged) => (merged ? `${created} to create, ${merged} to merge` : `${created} to create`),
		locations: { fridge: 'Fridge', freezer: 'Freezer', pantry: 'Pantry', counter: 'Counter' },
		rowName: 'Name',
		rowQty: 'Quantity',
		rowUnit: 'Unit',
		rowExpiry: 'Expiry',
		rowBrand: 'Brand',
		rowSize: 'Size',
		rowPrice: 'Price',
		store: 'Store',
		pickStore: 'Pick the store',
		boughtAt: (store) => `Bought at ${store}`,
		noStore: 'No store',
		storeRead: (name) => `Read as ${name}, which is not one of your stores.`,
		pricesNeedStore: 'Prices are remembered once the store is picked.',
		category: 'Category',
		categoryNamed: (label) => `Category: ${label}`,
		location: (name) => `Location of ${name}`,
		unnamed: 'this row',
		stock: {
			collectTitle: 'Take stock',
			title: 'Check what was found',
			invite: 'Add photos of your fridge, freezer, pantry or counter',
			inviteHint: 'Drop them here or choose files. What is in them becomes your stock.',
			inviteHintTouch: 'Choose files. What is in them becomes your stock.',
			mergeWith: (name) => `Update ${name}`,
			footer: (created, updated) => (updated ? `${created} to create, ${updated} to update` : `${created} to create`),
		},
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
	dropzone: {
		drop: (count) => (count === 1 ? 'Drop 1 file' : count > 1 ? `Drop ${count} files` : 'Drop files'),
		groups: {
			image: (count) => (count === 1 ? '1 image' : `${count} images`),
			pdf: (count) => (count === 1 ? '1 PDF' : `${count} PDFs`),
			text: (count) => (count === 1 ? '1 text file' : `${count} text files`),
			other: (count) => (count === 1 ? '1 other file' : `${count} other files`),
		},
		tooMany: (max) => (max === 1 ? 'One file at a time' : `Up to ${max} files at a time`),
		notAccepted: 'These files cannot be added here',
	},
	file: {
		open: (name) => `Open ${name}`,
		missing: 'No longer on this device',
		failed: 'Could not be added',
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
