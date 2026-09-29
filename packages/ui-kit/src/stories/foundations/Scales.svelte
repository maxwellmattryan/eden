<script lang="ts">
	// Spacing, radius, elevation, sizes, motion, z-order and breakpoints, from tokens.ts. Radii show the dial-adjusted
	// --ed-radius-* values next to the raw tokens, so switching Brand shows the difference.
	import { breakpoints, motion, radius, sizes, spacing, zIndex } from '$lib/tokens/tokens.js'
	const entries = <T extends Record<string, string | number>>(o: T) => Object.entries(o) as [string, string | number][]
</script>

<section>
	<h2 class="ed-t-display-md">Spacing</h2>
	<ul class="bars">
		{#each entries(spacing) as [name, value] (name)}
			<li>
				<span class="bar" style:width={value}></span><span class="ed-t-data-sm">{name}</span><span
					class="ed-t-caption v">{value}</span
				>
			</li>
		{/each}
	</ul>

	<h2 class="ed-t-display-md">Radius</h2>
	<ul class="boxes">
		{#each entries(radius) as [name, value] (name)}
			<li>
				<span class="box" style:border-radius={value}></span>
				<span class="ed-t-data-sm">{name}</span><span class="ed-t-caption v">{value}</span>
			</li>
		{/each}
		<li>
			<span class="box" style="border-radius: var(--ed-radius-control)"></span><span class="ed-t-data-sm"
				>--ed-radius-control</span
			><span class="ed-t-caption v">the dial</span>
		</li>
		<li>
			<span class="box" style="border-radius: var(--ed-radius-card)"></span><span class="ed-t-data-sm"
				>--ed-radius-card</span
			><span class="ed-t-caption v">the dial</span>
		</li>
		<li>
			<span class="box" style="border-radius: var(--ed-radius-sheet)"></span><span class="ed-t-data-sm"
				>--ed-radius-sheet</span
			><span class="ed-t-caption v">the dial</span>
		</li>
	</ul>

	<h2 class="ed-t-display-md">Elevation</h2>
	<ul class="boxes">
		<li>
			<span class="box card" style="box-shadow: var(--shadow-card)"></span><span class="ed-t-data-sm">shadow-card</span
			><span class="ed-t-caption v">none in dark: surface-1 plus a stroke</span>
		</li>
		<li>
			<span class="box card" style="box-shadow: var(--shadow-sheet)"></span><span class="ed-t-data-sm"
				>shadow-sheet</span
			><span class="ed-t-caption v">none in dark</span>
		</li>
	</ul>

	<h2 class="ed-t-display-md">Sizes</h2>
	<table class="ed-t-body-sm">
		<tbody>
			{#each entries(sizes) as [name, value] (name)}
				<tr><td class="ed-t-data-sm">{name}</td><td>{value}</td></tr>
			{/each}
		</tbody>
	</table>

	<h2 class="ed-t-display-md">Motion</h2>
	<table class="ed-t-body-sm">
		<tbody>
			{#each entries(motion) as [name, value] (name)}
				<tr><td class="ed-t-data-sm">--ed-{name}</td><td>{value}</td></tr>
			{/each}
		</tbody>
	</table>
	<p class="ed-t-voice note">
		Under reduced motion the panel, settle and breeze durations are zero: only opacity animates. Nothing loops.
	</p>

	<h2 class="ed-t-display-md">Z-order and breakpoints</h2>
	<table class="ed-t-body-sm">
		<tbody>
			{#each entries(zIndex) as [name, value] (name)}
				<tr><td class="ed-t-data-sm">--ed-z-{name}</td><td>{value}</td></tr>
			{/each}
			{#each entries(breakpoints) as [name, value] (name)}
				<tr
					><td class="ed-t-data-sm">breakpoint {name}</td><td>{value}px (Tailwind only; the kit reads data-platform)</td
					></tr
				>
			{/each}
		</tbody>
	</table>
</section>

<style>
	section {
		max-width: 960px;
	}
	h2 {
		margin: var(--space-8) 0 var(--space-3);
	}
	h2:first-child {
		margin-top: 0;
	}
	ul {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}
	.bars li,
	.boxes li {
		display: flex;
		align-items: center;
		gap: var(--space-3);
	}
	.bar {
		display: inline-block;
		height: 12px;
		background: var(--brand-primary);
		border-radius: 2px;
	}
	.boxes {
		flex-direction: row;
		flex-wrap: wrap;
		gap: var(--space-4);
	}
	.boxes li {
		flex-direction: column;
		align-items: flex-start;
		gap: var(--space-1);
	}
	.box {
		display: block;
		width: 96px;
		height: 64px;
		background: var(--surface-2);
		border: 1px solid var(--stroke);
	}
	.box.card {
		background: var(--surface-1);
		border-color: var(--ed-card-border);
	}
	.v {
		color: var(--text-secondary);
	}
	table {
		border-collapse: collapse;
	}
	td {
		padding: var(--space-1) var(--space-4) var(--space-1) 0;
		border-bottom: 1px solid var(--stroke-subtle);
	}
	.note {
		color: var(--text-secondary);
		margin: var(--space-3) 0 0;
	}
</style>
