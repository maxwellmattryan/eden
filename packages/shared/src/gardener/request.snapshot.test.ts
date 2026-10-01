// What a request carries, word for word, kept as files beside this test so a change to the prompt shows as a diff in
// review: the system prompt of a chat request over a fixture pack, and every tool as the API is given it. Update with `vitest run -u` after a deliberate
// change, and read the diff.
import { describe, expect, it } from 'vitest'
import { declarations } from '../manifest/index.js'
import { buildPack, type PackReaders } from './pack.js'
import { ANTHROPIC_SEED } from './providers.js'
import { toApiTool, toolIndex, toolsFor } from './tools.js'

const NAMES: Record<string, string> = { kitchen: 'Hearth', toolbench: 'Toolbench', weather: 'Sky' }

const empty: PackReaders = {
	facts: async () => [],
	entities: async () => [],
	primitives: async () => [],
	check: async () => ({ allowed: false, reason: 'no-grant' }),
}

describe('what a request carries', () => {
	it('the system prompt of a chat request', async () => {
		const pack = await buildPack(
			{
				reads: ['stock-item', 'recipe', 'task', 'allergy'],
				thread: [],
				message: 'What can I cook tonight?',
				tools: toolsFor(toolIndex(declarations), 'kitchen'),
				model: ANTHROPIC_SEED.models[1]!,
				outputReserve: 4096,
				tokenCap: null,
				subject: 'anthropic',
				now: Date.UTC(2026, 8, 30, 14, 40),
				zone: 'America/Chicago',
				lang: 'en',
				domainName: 'Hearth',
				domains: declarations.map((domain) => ({ id: domain.id, name: NAMES[domain.id] ?? domain.id })),
				grade: 'standard',
				markdown: true,
			},
			empty
		)
		const text = pack.system.map((block) => block.text).join('\n\n--- not cached below ---\n\n')
		await expect(`${text}\n`).toMatchFileSnapshot('./__snapshots__/system-prompt.chat.txt')
	})

	it('the system prompt of a delegated request', async () => {
		const pack = await buildPack(
			{
				reads: ['stock-item', 'recipe', 'allergy'],
				thread: [],
				message: 'Suggest 3 things the owner could cook.',
				tools: [],
				model: ANTHROPIC_SEED.models[1]!,
				outputReserve: 2048,
				tokenCap: null,
				subject: 'anthropic',
				now: Date.UTC(2026, 8, 30, 14, 40),
				zone: 'America/Chicago',
				lang: 'en',
				domains: declarations.map((domain) => ({ id: domain.id, name: NAMES[domain.id] ?? domain.id })),
				grade: 'standard',
				mode: 'delegated',
				json: true,
			},
			empty
		)
		const text = pack.system.map((block) => block.text).join('\n\n--- not cached below ---\n\n')
		await expect(`${text}\n`).toMatchFileSnapshot('./__snapshots__/system-prompt.delegated.txt')
	})

	it('the tools, as the API is given them', async () => {
		const tools = toolIndex(declarations).map(toApiTool)
		await expect(`${JSON.stringify(tools, null, '\t')}\n`).toMatchFileSnapshot('./__snapshots__/tools.txt')
	})
})
