// Markdown as a small tree the component draws with elements of its own: marked's lexer reads the source and this
// keeps only what the kit renders. Raw HTML in the source stays text, a link keeps its href only when it is http(s) or
// mailto, and an image is a link on its alt text, so nothing a reply says can become markup or fetch anything.
import { marked, type Token, type Tokens } from 'marked'

export type Inline =
	| { t: 'text'; text: string }
	| { t: 'strong' | 'em' | 'del'; kids: Inline[] }
	| { t: 'code'; text: string }
	| { t: 'br' }
	| { t: 'link'; href: string; kids: Inline[] }

export type Cell = { align: 'left' | 'center' | 'right' | null; kids: Inline[] }

export type Block =
	| { t: 'p'; kids: Inline[] }
	| { t: 'h'; level: number; kids: Inline[] }
	| { t: 'code'; lang: string; text: string }
	| { t: 'quote'; kids: Block[] }
	| { t: 'list'; ordered: boolean; start: number; items: { checked?: boolean; kids: Block[] }[] }
	| { t: 'hr' }
	| { t: 'table'; head: Cell[]; rows: Cell[][] }

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", '#39': "'", nbsp: ' ' }
const decode = (text: string) => text.replace(/&(amp|lt|gt|quot|apos|#39|nbsp);/g, (_, name: string) => ENTITIES[name]!)

/** The href when it is one the kit will follow, else nothing. */
export function safeHref(href: string): string | undefined {
	return /^(https?:\/\/|mailto:)/i.test(href.trim()) ? href.trim() : undefined
}

function inlines(tokens: Token[] | undefined): Inline[] {
	const out: Inline[] = []
	for (const token of tokens ?? []) {
		if (token.type === 'strong' || token.type === 'em' || token.type === 'del')
			out.push({ t: token.type, kids: inlines((token as Tokens.Strong).tokens) })
		else if (token.type === 'codespan') out.push({ t: 'code', text: (token as Tokens.Codespan).text })
		else if (token.type === 'br') out.push({ t: 'br' })
		else if (token.type === 'link' || token.type === 'image') {
			const link = token as Tokens.Link | Tokens.Image
			const kids =
				token.type === 'link' ? inlines((link as Tokens.Link).tokens) : [{ t: 'text' as const, text: link.text }]
			const href = safeHref(link.href)
			if (href) out.push({ t: 'link', href, kids })
			else out.push(...kids)
		} else if (token.type === 'text' && (token as Tokens.Text).tokens?.length)
			out.push(...inlines((token as Tokens.Text).tokens))
		else if (token.type === 'text' || token.type === 'escape')
			out.push({ t: 'text', text: decode((token as Tokens.Text).text) })
		// raw HTML and anything unknown: the source as written, as text
		else if ('raw' in token && token.raw) out.push({ t: 'text', text: token.raw })
	}
	return out
}

function blocks(tokens: Token[]): Block[] {
	const out: Block[] = []
	for (const token of tokens) {
		if (token.type === 'space' || token.type === 'def' || token.type === 'checkbox') continue
		if (token.type === 'paragraph') out.push({ t: 'p', kids: inlines((token as Tokens.Paragraph).tokens) })
		else if (token.type === 'heading')
			out.push({ t: 'h', level: (token as Tokens.Heading).depth, kids: inlines((token as Tokens.Heading).tokens) })
		else if (token.type === 'code')
			out.push({ t: 'code', lang: (token as Tokens.Code).lang ?? '', text: (token as Tokens.Code).text })
		else if (token.type === 'blockquote') out.push({ t: 'quote', kids: blocks((token as Tokens.Blockquote).tokens) })
		else if (token.type === 'hr') out.push({ t: 'hr' })
		else if (token.type === 'list') {
			const list = token as Tokens.List
			out.push({
				t: 'list',
				ordered: list.ordered,
				start: typeof list.start === 'number' ? list.start : 1,
				items: list.items.map((item) => ({
					...(item.task ? { checked: !!item.checked } : {}),
					kids: blocks(item.tokens),
				})),
			})
		} else if (token.type === 'table') {
			const table = token as Tokens.Table
			const cell = (entry: Tokens.TableCell): Cell => ({ align: entry.align, kids: inlines(entry.tokens) })
			out.push({ t: 'table', head: table.header.map(cell), rows: table.rows.map((row) => row.map(cell)) })
		} else if (token.type === 'text') {
			// a tight list item's line: inline content with no paragraph of its own
			const text = token as Tokens.Text
			out.push({ t: 'p', kids: text.tokens?.length ? inlines(text.tokens) : [{ t: 'text', text: decode(text.text) }] })
		} else if ('raw' in token && token.raw.trim()) out.push({ t: 'p', kids: [{ t: 'text', text: token.raw.trim() }] })
	}
	return out
}

/** The source as blocks. Never throws: a source the lexer cannot read is one paragraph of its text. */
export function parseMarkdown(source: string): Block[] {
	try {
		return blocks(marked.lexer(source, { gfm: true }))
	} catch {
		return source.trim() ? [{ t: 'p', kids: [{ t: 'text', text: source }] }] : []
	}
}
