<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf'
	import type { ComponentProps } from 'svelte'
	import { expect, fn } from 'storybook/test'
	import { canvasOf, hasCanvas } from '../../../storybook/play.js'
	import { defaultStrings } from '$lib/i18n/strings.js'
	import { UiKitProvider, domainGlyph, type BottomTab } from '$lib/index.js'
	import { bottomTabs, gardenLayout, sidebarJa, skyToday } from '../../sample-data.js'
	import Garden, { gardenCopy, type GardenCopy } from './Garden.svelte'

	const strings = defaultStrings
	const offline = `Offline. Showing the forecast from ${skyToday.lastGood}.`

	/** The Japanese shell for the screenshot locale (design/sample-data.md, "Japanese screenshots"). */
	const copyJa: GardenCopy = {
		name: '庭',
		subtitle: '9月30日 水曜日',
		edit: '配置を編集',
		quickNav: 'クイックナビゲーション',
		activity: 'アクティビティ',
		lastUpdated: (time) => `最終更新 ${time}`,
		widgets: {
			'weather-now': '今の空',
			today: '今日',
			'expiring-soon': 'まもなく期限',
			'cook-tonight': '今夜の料理',
			'resurfaced-idea': '再浮上したアイデア',
			'active-projects': '進行中のプロジェクト',
			'sun-and-moon': '太陽と月',
			'daily-line': '今日の一行',
			'quick-log': '体重',
		},
		empty: {
			'weather-now': '自宅の場所を設定すると空が見えます。',
			today: '今日の予定はありません。',
			'expiring-soon': 'まもなく期限のものはありません。',
			'cook-tonight': '食材とレシピを追加してください。',
			'resurfaced-idea': 'アイデアを記録すると、また巡ってきます。',
			'active-projects': 'プロジェクトはまだありません。',
			'sun-and-moon': '自宅の場所を設定すると光が見えます。',
			'daily-line': '足るを知る',
			'quick-log': '体重を記録すると線が始まります。',
			feed: 'まだ何も起きていません。',
		},
		actions: {
			today: '今日を開く',
			'cook-tonight': 'これを作る',
			'resurfaced-idea': 'アイデアを開く',
			'active-projects': 'プロジェクトを開く',
			'quick-log': '体重を記録',
		},
		untouched: (days) => `${days}日間手つかず`,
		minutes: (minutes) => `${minutes}分`,
		suggested: 'ほうれん草が明日期限',
		sunrise: '日の出',
		sunset: '日の入り',
		goldenHour: 'ゴールデンアワー',
		moon: '月',
		weight: 'kg',
	}
	const namesJa = Object.fromEntries(sidebarJa.items.map((entry) => [entry.id, entry.name]))
	const tabsJa: BottomTab[] = bottomTabs.map((tab) => ({
		id: tab.id,
		label: tab.id === 'more' ? 'その他' : (namesJa[tab.id] ?? tab.label),
		icon: tab.id === 'more' ? 'menu' : domainGlyph(tab.id),
	}))
	const stringsJa = {
		sidebar: { label: '領域', pinned: '庭師と設定' },
		tabBar: { label: 'セクション' },
		statusBar: { label: 'ステータスバー', inbox: '受信箱', quickLog: 'クイックログ' },
		nothingYet: 'まだ何もありません。',
	}

	const { Story } = defineMeta({
		title: 'Domains/Garden/Garden',
		component: Garden,
		tags: ['autodocs'],
		parameters: {
			docs: {
				description: {
					component:
						'The dashboard (product/substrate/shell.md), mocked from kit components under D-54. A quick-navigation row of domain tiles, the Phase 1 default grid read from `gardenLayout` in the sample data (weather-now, today, expiring-soon, cook-tonight, resurfaced-idea, active-projects, sun-and-moon, the neutral daily line, the weight quick log), and the activity feed in a column of its own on desktop. Rendered inside the AppFrame: the Sidebar with subtitles on, the status bar at the foot, and on the phone the bottom tabs. Widgets show a one-line prompt until data exists; offline, the Sky widgets say when their forecast is from.',
				},
			},
		},
		args: { onnavigate: fn(), onopen: fn(), onedit: fn() },
	})
</script>

{#snippet template(args: ComponentProps<typeof Garden>)}
	<Garden {...args} />
{/snippet}

<!-- Wednesday 07:40: every widget has data; the feed holds this morning's two logs and yesterday's haul -->
<Story
	name="Default"
	{template}
	play={async ({ canvasElement }) => {
		if (!hasCanvas(canvasElement)) return
		const canvas = canvasOf(canvasElement)
		await expect(canvas.getByRole('main')).toBeVisible()
		await expect(canvas.getByRole('heading', { level: 1, name: gardenCopy.name })).toBeVisible()
		await expect(canvas.getByRole('navigation', { name: gardenCopy.quickNav })).toBeVisible()
		// one named region per tile in the layout; the domain nav differs by platform
		await expect(canvas.getAllByRole('region')).toHaveLength(gardenLayout.length)
		for (const tile of gardenLayout) {
			await expect(canvas.getByRole('region', { name: gardenCopy.widgets[tile.id] })).toBeVisible()
		}
		const desktop = canvas.queryByRole('contentinfo', { name: strings.statusBar.label })
		if (desktop) {
			await expect(canvas.getByRole('navigation', { name: strings.sidebar.label })).toBeVisible()
			await expect(canvas.getByRole('complementary', { name: gardenCopy.activity })).toBeVisible()
		} else {
			await expect(canvas.getByRole('navigation', { name: strings.tabBar.label })).toBeVisible()
			await expect(canvas.queryByRole('complementary')).toBeNull()
		}
	}}
/>

<!-- Straight after onboarding: every widget shows its prompt, and the feed has nothing yet -->
<Story
	name="First run"
	{template}
	args={{ firstRun: true }}
	play={async ({ canvasElement }) => {
		if (!hasCanvas(canvasElement)) return
		const canvas = canvasOf(canvasElement)
		await expect(canvas.getAllByRole('region')).toHaveLength(gardenLayout.length)
		for (const tile of gardenLayout) await expect(canvas.getByText(gardenCopy.empty[tile.id]!)).toBeVisible()
	}}
/>

<!-- Offline: the banner takes the sync line's place in the status bar; the Sky widgets say when their forecast is from -->
<Story
	name="Offline"
	{template}
	args={{ offline: true }}
	play={async ({ canvasElement }) => {
		if (!hasCanvas(canvasElement)) return
		const canvas = canvasOf(canvasElement)
		await expect(canvas.getAllByText(gardenCopy.lastUpdated(skyToday.lastGood))).toHaveLength(2)
		if (canvas.queryByRole('contentinfo', { name: strings.statusBar.label })) {
			await expect(canvas.getByRole('status')).toHaveTextContent(offline)
		}
	}}
/>

<!-- The screenshot locale: the shell and the page in Japanese, the kit's own strings through UiKitProvider -->
<Story
	name="Japanese"
	args={{ nav: sidebarJa, tabs: tabsJa, copy: copyJa, lang: 'ja' }}
	play={async ({ canvasElement }) => {
		if (!hasCanvas(canvasElement)) return
		const canvas = canvasOf(canvasElement)
		await expect(canvas.getByRole('heading', { level: 1, name: copyJa.name })).toBeVisible()
		await expect(canvas.getByRole('region', { name: copyJa.widgets['weather-now'] })).toBeVisible()
	}}
>
	{#snippet template(args: ComponentProps<typeof Garden>)}
		<UiKitProvider strings={stringsJa}>
			<Garden {...args} />
		</UiKitProvider>
	{/snippet}
</Story>
