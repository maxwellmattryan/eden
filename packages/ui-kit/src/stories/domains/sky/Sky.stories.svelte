<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf'
	import type { ComponentProps } from 'svelte'
	import { expect, fn, userEvent, within } from 'storybook/test'
	import { canvasOf, hasCanvas } from '../../../storybook/play.js'
	import { defaultStrings } from '$lib/i18n/strings.js'
	import { sidebar, skyAirQuality, skyAllergens, skyHours, skyToday, skyWeek } from '../../sample-data.js'
	import Sky from './Sky.svelte'

	const strings = defaultStrings
	/** The week's day cells, without the facts listed inside them. */
	const days = (canvas: ReturnType<typeof canvasOf>) =>
		within(canvas.getByRole('list', { name: 'Daily forecast' }))
			.getAllByRole('listitem')
			.filter((item) => item.classList.contains('day'))
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
						'The Sky view (product/domains/weather.md), mocked from kit components under D-54. The header’s glyph is live and the location chip opens a Menu over home and the saved venues. Beneath: the now block with the temperature and the day’s range, the one active alert as a Banner, twelve hours from 08:00 in a strip that scrolls sideways (a named tab stop), with the showers arriving at 16:00, the details as tiles, the calendar week as a strip across the page from the week start, a day to a column with its rain, UV, wind and light, with today marked and the days before it observed (D-58), the air quality and the pollen and mold cards, the sun and moon card, and the sources’ attribution. The page is the same whatever the provider (D-56): Apple Weather changes the attribution line only, and a failed provider adds the fallback note. Offline, an InlineError names the last good forecast and the status bar carries the banner; the numbers stay. At night the glyph turns to a moon.',
				},
			},
		},
		args: { onretry: fn(), onlocation: fn(), onopentoday: fn(), onnavigate: fn(), onsources: fn(), onplace: fn() },
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
		// the reading, which the chart's side may repeat as one of its figures
		await expect(within(now).getAllByText(`${skyHours[0]!.temp}°`)[0]).toBeVisible()
		await expect(canvas.getByRole('alert')).toHaveTextContent('Showers from 16:00')
		await expect(canvas.getByRole('alert')).toHaveTextContent('Your 17:30 session may get wet.')
		const hours = canvas.getByRole('region', { name: 'Hours' })
		await expect(hours).toBeVisible()
		await expect(within(hours).getByRole('list', { name: 'Hourly forecast' })).toHaveAttribute('tabindex', '0')
		await expect(within(hours).getAllByRole('listitem')).toHaveLength(skyHours.length)
		await expect(canvas.getByRole('region', { name: 'This week' })).toBeVisible()
		const week = canvas.getByRole('list', { name: 'Daily forecast' })
		await expect(week).toHaveAttribute('tabindex', '0')
		const rows = days(canvas)
		await expect(rows).toHaveLength(skyWeek.length)
		await expect(rows[0]).toHaveTextContent('Mon')
		await expect(rows[0]).toHaveTextContent('Observed')
		await expect(rows[2]).toHaveTextContent('Wed')
		await expect(rows[2]).toHaveTextContent('Today')
		await expect(rows[2]).toHaveAttribute('aria-current', 'date')
		await expect(rows[2]).not.toHaveTextContent('Observed')
		await expect(within(rows[2]!).getByRole('img', { name: 'Strongest wind' })).toBeVisible()
		await expect(canvas.getByText('Waning gibbous')).toBeVisible()
		const details = canvas.getByRole('region', { name: 'Details' })
		await expect(within(details).getByText('Humidity')).toBeVisible()
		await expect(within(details).getByText('UV index')).toBeVisible()
		const air = canvas.getByRole('region', { name: 'Air quality' })
		await expect(within(air).getByText(String(skyAirQuality.index))).toBeVisible()
		await expect(within(air).getByText('Good')).toBeVisible()
		const allergens = canvas.getByRole('region', { name: 'Pollen and mold' })
		for (const allergen of skyAllergens) await expect(within(allergens).getByText(allergen.name)).toBeVisible()
		await expect(canvas.getByRole('region', { name: 'Sun and moon' })).toBeVisible()
		await expect(canvas.getByText(skyToday.sunrise)).toBeVisible()
		await expect(canvas.getByText('Forecast by Open-Meteo')).toBeVisible()
		await expect(
			within(air).getByRole('img', { name: `US air quality index ${skyAirQuality.index}, Good` })
		).toBeVisible()
		await expect(within(details).getAllByRole('button', { name: /^About / })).toHaveLength(10)
		await expect(within(hours).getByRole('button', { name: 'About the hours' })).toBeVisible()
		await expect(within(air).getByRole('button', { name: 'About Ozone' })).toBeVisible()
		await expect(await within(now).findByRole('img', { name: /^Temperature from 08:00 to 19:00/ })).toBeVisible()
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

<!-- The week from Sunday (D-58): the Sunday before is the first row, observed, and today is the fourth -->
<Story
	name="Week from Sunday"
	{template}
	args={{ weekStart: 'sunday' }}
	play={async ({ canvasElement }) => {
		if (!hasCanvas(canvasElement)) return
		const canvas = canvasOf(canvasElement)
		const rows = days(canvas)
		await expect(rows).toHaveLength(7)
		await expect(rows[0]).toHaveTextContent('Sun')
		await expect(rows[0]).toHaveTextContent('Observed')
		await expect(rows[3]).toHaveTextContent('Wed')
		await expect(rows[3]).toHaveTextContent('Today')
		await expect(rows[6]).toHaveTextContent('Sat')
	}}
/>

<!-- The 12-hour clock (D-58): the strip, the alert, the week's note and the light all follow it -->
<Story
	name="Twelve-hour clock"
	{template}
	args={{ clock: '12h' }}
	play={async ({ canvasElement }) => {
		if (!hasCanvas(canvasElement)) return
		const canvas = canvasOf(canvasElement)
		const hours = canvas.getByRole('region', { name: 'Hours' })
		await expect(within(hours).getByText('8 AM')).toBeVisible()
		await expect(within(hours).getByText('4 PM')).toBeVisible()
		await expect(canvas.getByRole('alert')).toHaveTextContent('Showers from 4 PM')
		await expect(canvas.getByRole('alert')).toHaveTextContent('Your 5:30 PM session')
		await expect(canvas.getByText('7:22 AM')).toBeVisible()
		await expect(canvas.getByText('7:14 PM')).toBeVisible()
	}}
/>

<!-- Apple Weather as the provider (D-57): the same page, with Apple's mark and its legal link in the attribution -->
<Story
	name="Apple Weather"
	{template}
	args={{ provider: 'weatherkit' }}
	play={async ({ canvasElement, args }) => {
		if (!hasCanvas(canvasElement)) return
		const canvas = canvasOf(canvasElement)
		await expect(canvas.getByRole('region', { name: 'Details' })).toBeVisible()
		await expect(canvas.getByRole('region', { name: 'Air quality' })).toBeVisible()
		await expect(days(canvas)).toHaveLength(7)
		await expect(canvas.getByText('Apple Weather')).toBeVisible()
		await expect(canvas.queryByText('Forecast by Open-Meteo')).toBeNull()
		canvas.getByRole('button', { name: 'Data sources' }).click()
		await expect(args.onsources).toHaveBeenCalledTimes(1)
	}}
/>

<!-- Apple Weather could not answer: Open-Meteo stands in, a note says so, and the attribution is Open-Meteo's -->
<Story
	name="Fallback"
	{template}
	args={{ provider: 'weatherkit', fallback: true }}
	play={async ({ canvasElement }) => {
		if (!hasCanvas(canvasElement)) return
		const canvas = canvasOf(canvasElement)
		await expect(canvas.getByText("Couldn't reach Apple Weather. Showing Open-Meteo's forecast instead.")).toBeVisible()
		await expect(canvas.getByText('Forecast by Open-Meteo')).toBeVisible()
	}}
/>

<!-- No allergen source covers the place (D-59): the block stays and says so -->
<Story
	name="Allergens unavailable"
	{template}
	args={{ allergens: 'unavailable' }}
	play={async ({ canvasElement }) => {
		if (!hasCanvas(canvasElement)) return
		const canvas = canvasOf(canvasElement)
		const allergens = canvas.getByRole('region', { name: 'Pollen and mold' })
		await expect(within(allergens).getByText('No pollen or mold source covers this place yet.')).toBeVisible()
	}}
/>

<!-- Changing home: the location menu's last item opens a sheet with a search and its results; a result becomes home -->
<Story
	name="Change home"
	{template}
	args={{ locating: true }}
	parameters={{ platformFrame: 'inline' }}
	play={async ({ canvasElement, args }) => {
		const page = within(canvasElement.ownerDocument.body)
		const sheet = await page.findByRole('dialog', { name: 'Change home' })
		await expect(within(sheet).getByRole('textbox', { name: 'Find a place' })).toHaveValue('Austin')
		const places = within(within(sheet).getByRole('list', { name: 'Places' })).getAllByRole('button')
		await expect(places).toHaveLength(3)
		await expect(places[0]).toHaveTextContent('Austin · Texas, United States')
		await userEvent.click(places[0]!)
		await expect(args.onplace).toHaveBeenCalledWith('austin-tx')
	}}
/>
