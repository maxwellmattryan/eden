// What a batch tool's handler reads its input with (docs/engineering/gardener.md, "Tools"): the batch writers are
// not strict, so each handler takes a `null` as a field left out, ignores what it does not know and checks every id
// before it writes anything. The substrate's task tools and Hearth's batch tools share these; the words each puts
// on its card are its own.

export type Fields = Record<string, unknown>

/** What the model sent without the fields it sent as `null`: the batch tools are not strict, and a `null` is a field left out. */
export function stated(row: Fields): Fields {
	return Object.fromEntries(Object.entries(row).filter(([, value]) => value !== null && value !== undefined))
}

/** The entries of a list the model sent, each an object; nothing for anything else. */
export function entries(input: unknown, key: string): Fields[] {
	const value = (input as Fields | null)?.[key]
	return Array.isArray(value)
		? value
				.filter((entry): entry is Fields => !!entry && typeof entry === 'object' && !Array.isArray(entry))
				.map(stated)
		: []
}

/** The ids of a list the model sent. */
export function ids(input: unknown, key: string): string[] {
	const value = (input as Fields | null)?.[key]
	return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string' && !!entry) : []
}

/** A text field the model sent, kept when it is empty: an empty string is how a field is cleared. A number is read as its text. */
export function given(row: Fields, key: string): string | undefined {
	const value = row[key]
	if (typeof value === 'number' && Number.isFinite(value)) return String(value)
	return typeof value === 'string' ? value.trim() : undefined
}

/** One undo for several writes, taken back in the reverse of their order. */
export const together =
	(undos: (() => void)[]): (() => void) =>
	() =>
		[...undos].reverse().forEach((undo) => undo())

/** The error for ids the model passed that name nothing, saying where the real ones are. */
export const unknown = (what: string, under: string, missing: string[]) => ({
	output: {
		error: `No ${what} has the id ${missing.map((id) => JSON.stringify(id)).join(', ')}. Pass the \`id\` of a row under \`${under}\` in the context. Nothing was changed.`,
	},
})

/** What a card says of a call before it runs, kept so it still reads after the rows it names are gone. */
const said = new Map<string, string>()
export function preview(tool: string, lines: (input: unknown) => (string | undefined)[]) {
	return (input: unknown): string | undefined => {
		const key = `${tool}:${JSON.stringify(input)}`
		const kept = said.get(key)
		if (kept) return kept
		const written = lines(input)
		// a row that cannot be named leaves the card to show the input as it was sent
		if (!written.length || written.some((line) => line === undefined)) return undefined
		const words = written.join('\n')
		said.set(key, words)
		return words
	}
}

/** A row with the fields it sets beside its name, as the card lists them: "Bread (qty 0, location freezer)". */
export function withFields(
	name: string | undefined,
	row: Fields,
	skip: string[] = ['id'],
	names: Record<string, (value: unknown) => string | undefined> = {}
): string | undefined {
	if (!name) return undefined
	const fields = Object.entries(row)
		.filter(([key]) => !skip.includes(key))
		.map(([key, value]) => `${key} ${names[key]?.(value) ?? (value === '' ? '-' : String(value))}`)
		.join(', ')
	return fields ? `${name} (${fields})` : name
}
