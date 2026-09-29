<script module lang="ts">
	import type { IconName } from '$lib/icons/icons.js'
	import type { UiStrings } from '$lib/i18n/strings.js'

	/** Every condition Sky reports. */
	export const CONDITIONS = [
		'sunny',
		'partly-cloudy',
		'cloudy',
		'fog',
		'drizzle',
		'rain',
		'thunderstorm',
		'snow',
		'hail',
		'wind',
		'tornado',
	] as const
	export type SkyCondition = (typeof CONDITIONS)[number]

	const DAY: Record<SkyCondition, IconName> = {
		sunny: 'sun',
		'partly-cloudy': 'cloud-sun',
		cloudy: 'cloud',
		fog: 'cloud-fog',
		drizzle: 'cloud-drizzle',
		rain: 'cloud-rain',
		thunderstorm: 'cloud-lightning',
		snow: 'cloud-snow',
		hail: 'cloud-hail',
		wind: 'wind',
		tornado: 'tornado',
	}
	const NIGHT: Partial<Record<SkyCondition, IconName>> = { sunny: 'moon', 'partly-cloudy': 'cloud-moon' }
	const LABEL: Record<SkyCondition, keyof UiStrings['sky']> = {
		sunny: 'sunny',
		'partly-cloudy': 'partlyCloudy',
		cloudy: 'cloudy',
		fog: 'fog',
		drizzle: 'drizzle',
		rain: 'rain',
		thunderstorm: 'thunderstorm',
		snow: 'snow',
		hail: 'hail',
		wind: 'wind',
		tornado: 'tornado',
	}

	/**
	 * The Lucide stand-in for a condition, for places that take an icon name (the sidebar item). At night the sun
	 * becomes a moon where the glyph has one. Unknown conditions fall back to Sky's resting glyph.
	 */
	export function iconFor(condition: SkyCondition, night = false): IconName {
		return (night ? NIGHT[condition] : undefined) ?? DAY[condition] ?? 'cloud-sun'
	}
</script>

<script lang="ts">
	// Sky's glyph is live: it follows the current conditions in the sidebar, the page header and the Now widget.
	// Until the domain glyph family is drawn (its resting glyph is a sun peeking from behind a cloud) each condition
	// maps to the nearest Lucide icon, and the change crossfades through Icon.
	import type { SVGAttributes } from 'svelte/elements'
	import Icon from '$lib/icons/Icon.svelte'
	import { useStrings } from '$lib/i18n/context.js'

	type Props = Omit<SVGAttributes<SVGSVGElement>, 'name'> & {
		/** The current condition. */
		condition?: SkyCondition
		/** After sunset: the sun becomes a moon where the glyph has one. */
		night?: boolean
		/** sm 16, md 20, lg 24, as Icon. */
		size?: 'sm' | 'md' | 'lg'
		/** The accessible name. Defaults to the condition's name, "Clear night" for a sunny night. */
		label?: string
	}
	let {
		condition = 'partly-cloudy',
		night = false,
		size = 'md',
		label,
		class: className = '',
		...rest
	}: Props = $props()

	const s = useStrings()
	const name = $derived(iconFor(condition, night))
	const text = $derived(label ?? (night && condition === 'sunny' ? s.sky.clearNight : s.sky[LABEL[condition]]))
</script>

<Icon {name} {size} label={text} class={className} {...rest} />
