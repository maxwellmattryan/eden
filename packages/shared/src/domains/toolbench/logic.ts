// Toolbench's logic (product/domains/toolbench.md): its store, its tool handlers and what its quick actions write.
// What Toolbench declares is in `./manifest.json`; its page and its Garden tiles are bound by each app
// (`src/lib/domains/toolbench/manifest.ts`).
import { get } from 'svelte/store'
import { t } from '../../i18n/index.js'
import type { DomainLogic } from '../define.js'
import { toolbenchExtras } from './formats.js'
import { toolbench } from './store.svelte.js'
import { toolbenchCommitDraft, toolbenchQuickActions, toolbenchTools } from './tools.js'

export const toolbenchLogic: DomainLogic<'toolbench'> = {
	id: 'toolbench',
	load: () => toolbench.load(),
	reload: () => toolbench.reload(),
	extras: async () => {
		await toolbench.load()
		return toolbenchExtras(toolbench.data())
	},
	seed: () => toolbench.seed(get(t)('domains.toolbench.name')),
	tools: toolbenchTools,
	quickActionHandlers: toolbenchQuickActions,
	commitDraft: toolbenchCommitDraft,
}
