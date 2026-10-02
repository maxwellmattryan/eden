<script lang="ts">
	// What is picked on the phone's map, in a sheet from the foot (D-95): a saved place, a place the Gardener found or
	// the home. The sheet is only the frame; its body is the detail the desktop shows over its map (`PlaceDetail`,
	// `SuggestionDetail`, `HomeCard`), drawn flat because the sheet is already the card, so every action the desktop
	// has on a place is here too. The forms it opens (edit, a visit) are sheets of their own and stand over it.
	import { Sheet } from '@eden/ui-kit'
	import { meadow, type SavedPlace } from '@eden/shared/domains/places'
	import { home } from '@eden/shared/home'
	import HomeCard from '@eden/shared/domains/places/views/HomeCard.svelte'
	import PlaceDetail from '@eden/shared/domains/places/views/PlaceDetail.svelte'
	import SuggestionDetail from '@eden/shared/domains/places/views/SuggestionDetail.svelte'

	type Props = {
		/** The id of what is shown: a saved place, a suggestion, or `home`. None closes the sheet. */
		picked?: string
		onedit?: (place: SavedPlace) => void
		onvisit?: (place: SavedPlace) => void
		/** The owner asks to put the place on the map by a tap. */
		onplace?: (place: SavedPlace) => void
	}
	let { picked = $bindable(), onedit, onvisit, onplace }: Props = $props()

	const place = $derived(meadow.placeById(picked))
	const suggestion = $derived(place ? undefined : meadow.suggestionById(picked))
	const homeOpen = $derived(picked === 'home' && meadow.area.kind === 'home')
	const label = $derived(place?.name ?? suggestion?.candidate.name ?? (homeOpen ? home.current.label : ''))
	// the sheet opens when something is picked and closes when there is nothing
	let open = $derived(place !== undefined || suggestion !== undefined || homeOpen)
</script>

<Sheet bind:open {label} onclose={() => (picked = undefined)}>
	{#if place}
		<PlaceDetail {place} flat {onedit} {onvisit} {onplace} onclose={() => (picked = undefined)} />
	{:else if suggestion}
		<SuggestionDetail {suggestion} flat onclose={() => (picked = undefined)} onsaved={(id) => (picked = id)} />
	{:else if homeOpen}
		<HomeCard flat />
	{/if}
</Sheet>
