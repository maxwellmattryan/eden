<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf'
	import type { ComponentProps } from 'svelte'
	import { expect, fn, within } from 'storybook/test'
	import { canvasOf, hasCanvas } from '../../../storybook/play.js'
	import { defaultStrings } from '$lib/i18n/strings.js'
	import { sidebar, skyHours, skyToday, skyWeek } from '../../sample-data.js'
	import Sky from './Sky.svelte'

	const strings = defaultStrings
	const sky = sidebar.items.find((entry) => entry.id === 'weather')!
	const offline = `Offline. Showing the forecast from ${skyToday.lastGood}.`

	const { Story } = defineMeta({
		title: 'Domains/Sky/Sky',
		component: Sky,
		tags: ['autodocs'],
		parameters: {
			docs: {
				description: {
					component:
						'The Sky view (product/domains/weather.md), mocked from kit components under D-54. The header’s glyph is live and the location chip opens a Menu over home and the saved venues. Beneath: the now block with the temperature and the day’s range, the one active alert as a Banner, twelve hours from 08:00 in a strip that scrolls sideways (a named tab stop), with the showers arriving at 16:00, the week as a List, and the sun and moon card. Offline, an InlineError names the last good forecast and the status bar carries the banner; the numbers stay. At night the glyph turns to a moon.',
				},
			},
		},
		args: { onretry: fn(), onlocation: fn(), onopentoday: fn(), onnavigate: fn() },
	})
</script>

{#snippet template(args: ComponentProps<typeof Sky>)}
	<Sky {...args} />
{/snippet}

<!-- Wednesday 07:40 at home: 22° and sunny now, showers from 16:00, the session alert -->
<Story
	name="Default"
	{template}
	play={async ({ canvasElement }) => {
		if (!hasCanvas(canvasElement)) return
		const canvas = canvasOf(canvasElement)
		await expect(canvas.getByRole('main')).toBeVisible()
		await expect(canvas.getByRole('heading', { level: 1, name: sky.name })).toBeVisible()
		await expect(canvas.getByRole('button', { name: 'Home · Hyde Park' })).toHaveAttribute('aria-expanded', 'false')
		const now = canvas.getByRole('region', { name: 'Now' })
		await expect(now).toBeVisible()
		await expect(within(now).getByText(`${skyHours[0]!.temp}°`)).toBeVisible()
		await expect(canvas.getByRole('alert')).toHaveTextContent('Showers from 16:00')
		const hours = canvas.getByRole('region', { name: 'Hours' })
		await expect(hours).toBeVisible()
		await expect(within(hours).getByRole('list', { name: 'Hourly forecast' })).toHaveAttribute('tabindex', '0')
		await expect(within(hours).getAllByRole('listitem')).toHaveLength(skyHours.length)
		await expect(canvas.getByRole('grid', { name: 'This week' })).toBeVisible()
		await expect(canvas.getAllByRole('row')).toHaveLength(skyWeek.length)
		await expect(canvas.getByRole('region', { name: 'Sun and moon' })).toBeVisible()
		await expect(canvas.getByText(skyToday.sunrise)).toBeVisible()
	}}
/>

<!-- No provider: the inline error with the last good time and Retry; the status bar's banner on desktop -->
<Story
	name="Offline"
	{template}
	args={{ offline: true }}
	play={async ({ canvasElement, args }) => {
		if (!hasCanvas(canvasElement)) return
		const canvas = canvasOf(canvasElement)
		await expect(canvas.getByText("Couldn't reach Open-Meteo.")).toBeVisible()
		await expect(canvas.getByText(`Showing the forecast from ${skyToday.lastGood}.`)).toBeVisible()
		canvas.getByRole('button', { name: strings.retry }).click()
		await expect(args.onretry).toHaveBeenCalledTimes(1)
		if (canvas.queryByRole('contentinfo', { name: strings.statusBar.label })) {
			await expect(canvas.getByRole('status')).toHaveTextContent(offline)
		}
	}}
/>

<!-- After sunset: a clear night, the glyph a moon, the evening's temperature -->
<Story
	name="Night"
	{template}
	args={{ night: true }}
	play={async ({ canvasElement }) => {
		if (!hasCanvas(canvasElement)) return
		const canvas = canvasOf(canvasElement)
		await expect(canvas.getByText('Clear night')).toBeVisible()
		await expect(canvas.getAllByRole('img', { name: strings.sky.clearNight }).length).toBeGreaterThan(0)
	}}
/>
