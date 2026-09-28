<script lang="ts">
	// The side-by-side mechanism. Storybook hands the story to a decorator as its `children` snippet, so this frame can
	// render it twice: once in a desktop canvas (1280 wide, zoomed to fit) and once in a phone canvas (390×844 with
	// safe-area insets). Each canvas carries its own data-platform, so the same component shows both renderings.
	// Stories opt out of a platform with `parameters.platforms`; top-layer overlays use `parameters.platformFrame = 'inline'`.
	import type { Snippet } from 'svelte'
	import type { Platform } from '$lib/tokens/tokens.js'
	import { fitScale } from './fit-scale.js'

	type Props = {
		platform: Platform | 'both'
		density: string
		platforms?: Platform[]
		frame?: 'framed' | 'inline'
		children: Snippet
	}
	let { platform, density, platforms = ['desktop', 'mobile'], frame = 'framed', children }: Props = $props()

	const shown = $derived<Platform[]>(platform === 'both' ? platforms : platforms.includes(platform) ? [platform] : [])
	const inlinePlatform = $derived<Platform>(platform === 'both' ? (platforms[0] ?? 'desktop') : platform)
</script>

{#if shown.length === 0}
	<p class="sb-note">This component is not designed for {platform}.</p>
{:else if frame === 'inline' || platform !== 'both'}
	<div class="ed-canvas sb-inline" data-platform={inlinePlatform} data-density={density}>
		{@render children()}
	</div>
{:else}
	<div class="sb-frames">
		{#each shown as p (p)}
			<section class="sb-frame sb-frame-{p}" aria-label={p === 'desktop' ? 'Desktop rendering' : 'Mobile rendering'}>
				<header class="sb-frame-label">{p}</header>
				{#if p === 'desktop'}
					<div class="sb-desktop">
						<div
							class="ed-canvas sb-desktop-viewport"
							data-platform="desktop"
							data-density={density}
							{@attach fitScale(1280)}
						>
							{@render children()}
						</div>
					</div>
				{:else}
					<div class="sb-phone">
						<div
							class="ed-canvas sb-phone-viewport"
							data-platform="mobile"
							style="--ed-safe-top: 47px; --ed-safe-bottom: 34px"
						>
							{@render children()}
						</div>
					</div>
				{/if}
			</section>
		{/each}
	</div>
{/if}
