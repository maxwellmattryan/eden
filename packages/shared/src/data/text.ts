// The formats made for reading that a domain adds to its bundle: CSV for what is a table, Markdown for what is prose.

export type Cell = string | number | boolean | null | undefined

function cell(value: Cell): string {
	const text = value === null || value === undefined ? '' : String(value)
	return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

/** A CSV file: a header and its rows, quoted where a value holds a comma, a quote or a line break (RFC 4180). */
export function toCsv(header: string[], rows: Cell[][]): string {
	return [header, ...rows].map((row) => row.map(cell).join(',')).join('\r\n') + '\r\n'
}

/** Text as one line of Markdown: what would start a heading, a list or emphasis is escaped. */
export function inline(text: string): string {
	return text
		.replace(/\s+/g, ' ')
		.trim()
		.replace(/([\\`*_[\]<>#|])/g, '\\$1')
}

/** A Markdown document: a title, then each section under its own heading. Empty lines of a body are dropped. */
export function toMarkdown(title: string, sections: { heading: string; lines: (string | undefined)[] }[]): string {
	const parts = sections.map(({ heading, lines }) =>
		[`## ${inline(heading)}`, '', ...lines.filter((line) => line !== undefined)].join('\n').trimEnd()
	)
	return [`# ${inline(title)}`, ...parts].join('\n\n') + '\n'
}
