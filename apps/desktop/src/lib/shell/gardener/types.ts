// What a tool handler is to the runtime (docs/engineering/gardener.md, "Tools"): a domain binds one per declared
// tool in its manifest, the substrate keeps its own in `substrate-tools.ts`, and the loop calls them by wire name.
// A plain or a write tool runs here and answers the model; a model-backed one hands the runtime a prompt and reads
// the answer back, since the request itself is the runtime's (D-74: its own single request, its own audit entry).
import type { AttachmentBlock, DraftCard, JsonSchema, ModelGrade, PackAttachment } from '@eden/shared/gardener'

/**
 * The files a tool is given: the ones on the owner's message in a conversation, or the ones a page staged for a
 * tool it runs itself (Hearth's capture). The pack counts them by their blocks and reads each once, when it is sent.
 */
export interface ToolFiles {
	blocks: AttachmentBlock[]
	/** What is sent of one; left out for files stored in the workspace, which the pack's own reader reads. */
	read?: (block: AttachmentBlock) => Promise<PackAttachment | undefined>
}

/**
 * Why a tool did not answer, as a code a page can put its own words to. The `output` beside it is written for the
 * model; a page that runs a tool itself (`runtime.runDirect`) reads this instead.
 */
export type ToolFailure =
	| 'busy'
	| 'no-key'
	| 'unavailable'
	| 'budget'
	| 'network'
	| 'refusal'
	| 'max-tokens'
	| 'cancelled'
	| 'unreadable'
	| 'empty'
	| 'no-files'

/** What a handler knows of the request it serves. */
export interface ToolContext {
	/** The domain the conversation was opened from, when it was. */
	domain?: string
	/** The thread the call belongs to. */
	threadId: string
	/** The request the call belongs to: the parent of a delegated request's audit entry. */
	requestId: string
	/** The grade the conversation runs at. */
	grade: ModelGrade
	lang: 'en' | 'ja'
	/** The owner's zone, for the day a tool works on. */
	zone: string | undefined
	/** Today where the owner is, `YYYY-MM-DD`. */
	today: string
	/** Shows an undo toast for a write the handler made; the message is already translated. */
	undo: (message: string, undo: () => void) => void
	/** The URIs the conversation is about, when it was opened on something. */
	focus: string[]
	/** The files the tool may read: the owner's message's, else the latest earlier message's that had any. */
	files?: ToolFiles
}

/** What a tool answers: what the model reads, the card the panel shows, the rows it touched (for the audit). */
export interface ToolResult {
	output: unknown
	card?: DraftCard
	touched?: string[]
	/** A proposal the tool made: the panel shows the card and the profile page too. */
	proposal?: { id: string; type: string; value: unknown; confidence: number; text?: string; source?: string }
	/** Why nothing was answered, when nothing was. */
	failure?: ToolFailure
}

/** A model-backed tool: what it asks the model, and what it makes of the answer. */
export interface Delegate {
	/** Why the input cannot be worked on, in words the model can act on; no request is made when it answers. */
	check?: (input: unknown, ctx: ToolContext) => string | undefined
	/** The message the delegated request carries, built from the input and the rows the handler reads itself. */
	prompt: (input: unknown, ctx: ToolContext) => Promise<string> | string
	/** The URIs the request is about, pinned first in its pack and never trimmed. */
	focus?: (input: unknown, ctx: ToolContext) => Promise<string[]> | string[]
	/** The answer as the model reads it back and as a card, from the model's text. */
	parse: (text: string, input: unknown, ctx: ToolContext) => Promise<ToolResult> | ToolResult
	/**
	 * The shape the answer is held to (the API's structured output), built with `answer` from `@eden/shared/gardener`;
	 * `parse` then reads JSON it can rely on. Left out, the answer is prose.
	 */
	schema?: JsonSchema
	/**
	 * The files to send with the prompt (`capture-haul`, `import-recipe`): photos, PDFs, text. A delegate that names
	 * this and is given none is not run, and says so.
	 */
	files?: (input: unknown, ctx: ToolContext) => Promise<ToolFiles | undefined> | ToolFiles | undefined
	/** Whether the request may run without files, when `files` answers none (a recipe pasted as text). */
	filesOptional?: (input: unknown) => boolean
	/** How many tokens the answer may take; the runtime's default otherwise. */
	maxTokens?: number
}

export type ToolHandler = { run: (input: unknown, ctx: ToolContext) => Promise<ToolResult> } | { delegate: Delegate }

/** The model's answer to a delegated request, read as JSON where the prompt asked for it. */
export function parseJson<T>(text: string): T | undefined {
	const trimmed = text.trim()
	const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(trimmed)
	const body = fenced?.[1] ?? trimmed
	const start = body.search(/[[{]/)
	if (start === -1) return undefined
	try {
		return JSON.parse(body.slice(start)) as T
	} catch {
		// the model may wrap the JSON in a sentence: take from the first bracket to the last
		const end = Math.max(body.lastIndexOf('}'), body.lastIndexOf(']'))
		if (end <= start) return undefined
		try {
			return JSON.parse(body.slice(start, end + 1)) as T
		} catch {
			return undefined
		}
	}
}

/** A string field of an input the model sent, or nothing. */
export function str(input: unknown, key: string): string | undefined {
	const value = (input as Record<string, unknown> | null)?.[key]
	return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

/** A number field of an input, or nothing. */
export function num(input: unknown, key: string): number | undefined {
	const value = (input as Record<string, unknown> | null)?.[key]
	return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

/** What a drafting tool's result tells the model of its card. */
export const DRAFTED = 'Shown as a card. Not saved until the owner keeps it.'

/** A whole number field of an input, within bounds, or the default. */
export function int(input: unknown, key: string, fallback: number, min: number, max: number): number {
	const value = (input as Record<string, unknown> | null)?.[key]
	if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
	return Math.min(max, Math.max(min, Math.round(value)))
}

/** The subject every Gardener grant and check names: the provider, so a grant outlives a change of model. */
export const GRANT_SUBJECT = 'anthropic'
