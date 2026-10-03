// The localStorage keys the settings keep, in two groups: the choices an export bundle carries (`storage`), and what
// this device keeps for itself (`deviceStorage`), which no bundle carries and no import changes (D-156, D-160).
// Plain, so a test can read the groups without compiling the settings class.
import { storageKeys } from '@eden/ui-kit/tokens'

/** Every key a bundle carries: the kit's five plus the app's own. */
export const storage = {
	...storageKeys,
	language: 'eden:language',
	subtitles: 'eden:subtitles',
	measurement: 'eden:measurement',
	weekStart: 'eden:week-start',
	clock: 'eden:clock',
	weatherProvider: 'eden:weather-provider',
	mapsApp: 'eden:maps-app',
	placesDiscovery: 'eden:places-discovery',
	placesWeekly: 'eden:places-weekly',
	placesDetailsOff: 'eden:places-details-off',
	home: 'eden:home',
	gardenerGrade: 'eden:gardener-grade',
	gardenerPanelWidth: 'eden:gardener-panel-width',
	sidebarWidth: 'eden:sidebar-width',
	sidebarCollapsed: 'eden:sidebar-collapsed',
} as const

/**
 * What this device keeps for itself: the Garden as the owner arranged it here (D-156) and the phone's pinned tabs
 * (D-160). Read and written like the rest, and never part of `snapshot()` or `restore()`.
 */
export const deviceStorage = {
	gardenLayout: 'eden:garden-layout',
	pinnedTabs: 'eden:pinned-tabs',
} as const
