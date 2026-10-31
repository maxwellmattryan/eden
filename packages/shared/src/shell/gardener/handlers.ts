// Every tool's handler by wire name (docs/engineering/gardener.md, "Tools"): the substrate's own and each enabled
// domain's from its logic. A declared tool with no handler is unavailable and says so; `missingHandlers` lists
// them, and the shell logs it at startup.
import { toolIndex, type GardenerTool } from '../../gardener/index.js'
import { declarations, logicFor } from '../../domains/index.js'
import { substrateTools } from './substrate-tools.js'
import type { ToolHandler } from './types.js'

export const tools: readonly GardenerTool[] = toolIndex(declarations)

export function handlerOf(tool: GardenerTool): ToolHandler | undefined {
	if (tool.domain === 'substrate') return substrateTools[tool.declaration.id]
	return logicFor(tool.domain)?.tools?.[tool.declaration.id]
}

export function toolByWireName(name: string): GardenerTool | undefined {
	return tools.find((tool) => tool.wireName === name)
}

/** The declared tools nothing handles, as `<domain>.<id>`. */
export function missingHandlers(): string[] {
	return tools.filter((tool) => !handlerOf(tool)).map((tool) => `${tool.domain}.${tool.declaration.id}`)
}
