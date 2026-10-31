// Vigor's surface on the phone (product/domains/fitness.md, "Mobile"): the page and its tabs. What Vigor declares is
// in `@eden/shared/domains/fitness/manifest.json`; what it does is its `logic.ts` there, which `defineDomain` joins to
// this. The page and its four Garden tiles are the ones the desktop mounts.
import { goto } from '$app/navigation'
import { resolve } from '$app/paths'
import { defineDomain } from '@eden/shared/domains'
import { fitness } from '@eden/shared/domains/fitness'
import NextSession from '@eden/shared/domains/fitness/widgets/NextSession.svelte'
import Streak from '@eden/shared/domains/fitness/widgets/Streak.svelte'
import ThisWeekTraining from '@eden/shared/domains/fitness/widgets/ThisWeekTraining.svelte'
import WeightTrend from '@eden/shared/domains/fitness/widgets/WeightTrend.svelte'

export const fitnessManifest = defineDomain('fitness', {
	routes: {
		path: '/fitness/[[tab]]',
		href: resolve('/fitness/[[tab]]', {}),
		open: () => void goto(resolve('/fitness/[[tab]]', {})),
		openTab: (tab) => void goto(resolve('/fitness/[[tab]]', { tab })),
	},
	widgets: {
		'this-week-training': {
			body: ThisWeekTraining,
			hasData: () => fitness.thisWeek.total > 0,
			action: {
				label: 'garden.actions.thisWeekTraining',
				open: () => void goto(resolve('/fitness/[[tab]]', { tab: 'history' })),
			},
		},
		streak: {
			body: Streak,
			hasData: () => fitness.logs.length > 0,
			action: {
				label: 'garden.actions.streak',
				open: () => void goto(resolve('/fitness/[[tab]]', { tab: 'history' })),
			},
		},
		'next-session': {
			body: NextSession,
			hasData: () => fitness.next !== undefined,
			action: {
				label: 'garden.actions.nextSession',
				open: () => void goto(resolve('/fitness/[[tab]]', { tab: 'workouts' })),
			},
		},
		'weight-trend': {
			body: WeightTrend,
			hasData: () => fitness.latestWeight !== undefined,
			action: {
				label: 'garden.actions.weightTrend',
				open: () => void goto(resolve('/fitness/[[tab]]', { tab: 'body' })),
			},
		},
	},
})
