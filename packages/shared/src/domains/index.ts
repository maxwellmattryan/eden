// The registry of the domains' logic and `defineDomain` (docs/engineering/domain-module.md): what the shared shell
// reads of the enabled domains, and what each app joins its surface to.
export { declarations } from '../manifest/index.js'
export {
	defineDomain,
	widgetsPending,
	type DomainLogic,
	type DomainManifest,
	type DomainRoutes,
	type DomainSurface,
	type QuickAction,
	type QuickActionHandler,
	type QuickLogReadout,
	type WidgetBinding,
	type WidgetDeclaration,
} from './define.js'
export { logic, logicFor } from './registry.js'
