// The rules a set of files is held to before an app takes them: which types, how many, how large. One pure function
// for every way a file arrives (a drop, the picker, a paste), so each refuses the same files for the same reason.
// A pattern is `image/*`, an exact MIME type, or an extension (`.md`): browsers leave `type` empty for the files they
// do not know, so a list that means to take Markdown names the extension too.

/** What the rules read of a file; a `File` is one. */
export interface FileLike {
	name: string
	type: string
	size: number
}

export interface FileRules {
	/** Only these: `image/*`, an exact MIME type or an extension (`.pdf`). Absent, every type is taken. */
	accept?: readonly string[]
	/** Never these, whatever `accept` says. The same patterns. */
	exclude?: readonly string[]
	/** The most files there may be, counting `count`. */
	maxFiles?: number
	/** The largest one file may be, in bytes. */
	maxSize?: number
	/** The most all files may weigh together, in bytes, counting `totalSize`. */
	maxTotalSize?: number
	/** Files already held, counted against `maxFiles`. */
	count?: number
	/** Bytes already held, counted against `maxTotalSize`. */
	totalSize?: number
}

/** Why a file was refused: its type, its own size, one too many, or the weight of all of them. */
export type FileRefusal = 'type' | 'size' | 'count' | 'total'

export interface FileCheck<T extends FileLike = File> {
	accepted: T[]
	rejected: { file: T; reason: FileRefusal }[]
}

/** What a file is, as far as a person cares: the words a drop names it by. */
export type FileGroup = 'image' | 'pdf' | 'text' | 'other'

type Typed = { name?: string; type: string }

const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.heic', '.svg', '.avif', '.bmp', '.tif', '.tiff']
const TEXT_EXTENSIONS = ['.txt', '.md', '.markdown', '.csv', '.json', '.log', '.yaml', '.yml', '.xml']
const TEXT_TYPES = ['application/json', 'application/xml', 'application/yaml']

function extensionOf(name: string | undefined): string {
	const dot = name?.lastIndexOf('.') ?? -1
	return dot > 0 ? name!.slice(dot).toLowerCase() : ''
}

/** True when the file fits one of the patterns, by its MIME type or by its extension. */
export function matchesType(file: Typed, patterns: readonly string[]): boolean {
	const type = file.type.toLowerCase()
	const extension = extensionOf(file.name)
	return patterns.some((raw) => {
		const pattern = raw.trim().toLowerCase()
		if (pattern.startsWith('.')) return extension === pattern
		if (pattern.endsWith('/*')) return type.startsWith(pattern.slice(0, -1))
		return type !== '' && type === pattern
	})
}

function typeAllowed(file: Typed, rules: FileRules): boolean {
	if (rules.exclude && matchesType(file, rules.exclude)) return false
	return !rules.accept || matchesType(file, rules.accept)
}

/** The files the rules take and the ones they refuse, each with the first rule it broke; the order is kept. */
export function checkFiles<T extends FileLike>(files: readonly T[], rules: FileRules = {}): FileCheck<T> {
	const accepted: T[] = []
	const rejected: FileCheck<T>['rejected'] = []
	let count = rules.count ?? 0
	let total = rules.totalSize ?? 0
	for (const file of files) {
		let reason: FileRefusal | undefined
		if (!typeAllowed(file, rules)) reason = 'type'
		else if (rules.maxSize !== undefined && file.size > rules.maxSize) reason = 'size'
		else if (rules.maxFiles !== undefined && count >= rules.maxFiles) reason = 'count'
		else if (rules.maxTotalSize !== undefined && total + file.size > rules.maxTotalSize) reason = 'total'
		if (reason) {
			rejected.push({ file, reason })
			continue
		}
		accepted.push(file)
		count++
		total += file.size
	}
	return { accepted, rejected }
}

/**
 * What can be said against a drag before it is dropped, when only the count and (in some engines) the MIME types are
 * known: too many, or nothing in it of a type the rules take. An item without a type is not held against the drag,
 * since its extension may yet fit; sizes are unknown until the drop.
 */
export function hoverRefusal(items: readonly { type: string }[], rules: FileRules = {}): 'count' | 'type' | undefined {
	if (!items.length) return undefined
	if (rules.maxFiles !== undefined && (rules.count ?? 0) + items.length > rules.maxFiles) return 'count'
	if (items.some((item) => item.type === '')) return undefined
	const mimeOnly = (patterns: readonly string[] | undefined) => patterns?.filter((p) => !p.trim().startsWith('.'))
	const accept = mimeOnly(rules.accept)
	// a list of extensions alone says nothing about a MIME type
	if (rules.accept && !accept?.length) return undefined
	const exclude = mimeOnly(rules.exclude)
	return items.some((item) => typeAllowed(item, { accept, exclude })) ? undefined : 'type'
}

export function groupOf(file: Typed): FileGroup {
	const type = file.type.toLowerCase()
	const extension = extensionOf(file.name)
	if (type.startsWith('image/') || (!type && IMAGE_EXTENSIONS.includes(extension))) return 'image'
	if (type === 'application/pdf' || (!type && extension === '.pdf')) return 'pdf'
	if (type.startsWith('text/') || TEXT_TYPES.includes(type) || (!type && TEXT_EXTENSIONS.includes(extension)))
		return 'text'
	return 'other'
}

const GROUP_ORDER: readonly FileGroup[] = ['image', 'pdf', 'text', 'other']

/** How many of each group, in a fixed order, leaving out the groups with none. */
export function summarize(items: readonly Typed[]): { group: FileGroup; count: number }[] {
	const counts = new Map<FileGroup, number>()
	for (const item of items) {
		const group = groupOf(item)
		counts.set(group, (counts.get(group) ?? 0) + 1)
	}
	return GROUP_ORDER.filter((group) => counts.has(group)).map((group) => ({ group, count: counts.get(group)! }))
}

const UNITS = ['B', 'KB', 'MB', 'GB'] as const

/** A size for a caption: `812 B`, `14 KB`, `1.2 MB`. One decimal under ten of a unit, none above. */
export function formatBytes(bytes: number): string {
	let value = Math.max(0, bytes)
	let unit = 0
	while (value >= 1024 && unit < UNITS.length - 1) {
		value /= 1024
		unit++
	}
	const rounded = unit === 0 || value >= 10 ? Math.round(value) : Math.round(value * 10) / 10
	return `${rounded} ${UNITS[unit]}`
}
