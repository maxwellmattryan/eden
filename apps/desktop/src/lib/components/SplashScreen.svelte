<script lang="ts">
	// The splash once the app has mounted: the same frame as the static copy in app.html, which it removes as it takes
	// over, fading out when the layout says the app is ready. Its classes are styled by the stylesheet inlined beside
	// the static copy (@eden/shared/splash), never by the app's own, so the two copies cannot differ.
	import { onMount } from 'svelte'
	import { cubicOut } from 'svelte/easing'
	import { fade } from 'svelte/transition'
	import { AppMark } from '@eden/ui-kit'
	import { SPLASH_CLASS, SPLASH_FADE_MS, SPLASH_ID } from '@eden/shared/splash'

	type Props = {
		show: boolean
		version: string
		/** The app's name as the wordmark writes it. */
		name?: string
		onoutroend?: () => void
	}
	let { show, version, name = 'Eden', onoutroend }: Props = $props()

	const duration = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : SPLASH_FADE_MS

	onMount(() => {
		document.getElementById(SPLASH_ID)?.remove()
	})
</script>

{#if show}
	<div class={SPLASH_CLASS} aria-hidden="true" out:fade={{ duration, easing: cubicOut }} {onoutroend}>
		<AppMark />
		<span class="{SPLASH_CLASS}-name">{name}</span>
		<span class="{SPLASH_CLASS}-version">v{version}</span>
	</div>
{/if}
