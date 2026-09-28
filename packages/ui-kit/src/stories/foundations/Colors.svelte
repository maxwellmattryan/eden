<script lang="ts">
	// Every colour token in both themes, rendered inside element-scoped theme subtrees (the same mechanism a plain
	// audit-log surface or a Storybook frame uses), with the contrast measurements from the generated report.
	import { colorTokenNames, colors, themes } from '$lib/tokens/tokens.js'
	import report from '$lib/tokens/tokens-report.json' with { type: 'json' }

	const groups = [
		{ name: 'Surfaces', tokens: ['surface-0', 'surface-1', 'surface-2', 'surface-3'] },
		{ name: 'Text', tokens: ['text-primary', 'text-secondary', 'text-tertiary'] },
		{ name: 'Strokes', tokens: ['stroke', 'stroke-subtle', 'stroke-hover'] },
		{ name: 'Brand', tokens: ['brand-primary', 'brand-hover', 'brand-muted', 'on-brand'] },
		{ name: 'The Gardener: speaks, acts', tokens: ['ai', 'ai-muted', 'on-ai', 'honey', 'honey-muted', 'on-honey'] },
		{ name: 'Semantic', tokens: ['danger', 'on-danger', 'warning', 'info', 'success'] },
		{ name: 'Accents', tokens: colorTokenNames.filter((n) => n.startsWith('accent-')) },
		{ name: 'Charts', tokens: colorTokenNames.filter((n) => n.startsWith('chart-')) },
	] as const
	const themeName = { light: 'Light, the morning garden', dark: 'Dark, the night forest' } as const
	const fmt = (r: number) => `${r.toFixed(2)}:1`
</script>

{#each themes as theme (theme)}
	<section class="ed-canvas theme" data-theme={theme}>
		<h2 class="ed-t-display-md">{themeName[theme]}</h2>
		{#each groups as group (group.name)}
			<h3 class="ed-t-title">{group.name}</h3>
			<ul class="swatches">
				{#each group.tokens as token (token)}
					<li>
						<span class="swatch" style:background="var(--{token})"></span>
						<span class="ed-t-data-sm">{token}</span>
						<span class="ed-t-caption hex">{colors[theme][token as keyof (typeof colors)[typeof theme]]}</span>
					</li>
				{/each}
			</ul>
		{/each}

		<h3 class="ed-t-title">Documented pairs</h3>
		<table class="ed-t-body-sm">
			<thead><tr><th>pair</th><th>size</th><th>ratio</th><th>grade</th></tr></thead>
			<tbody>
				{#each report.pairs[theme] as p (p.fg + p.bg + p.size)}
					<tr class:miss={!p.ok}>
						<td
							><span class="pair" style:color="var(--{p.fg})" style:background="var(--{p.bg})">{p.fg} on {p.bg}</span
							></td
						>
						<td>{p.size}</td>
						<td class="ed-t-data-sm">{fmt(p.ratio)}</td>
						<td>{p.grade}{p.ok ? '' : ', misses'}</td>
					</tr>
				{/each}
			</tbody>
		</table>

		<h3 class="ed-t-title">Accents</h3>
		<table class="ed-t-body-sm">
			<thead>
				<tr
					><th>accent</th><th>as text on surface-0</th><th>fill under on-brand</th><th>hover on surface-0</th><th
						>text on muted</th
					></tr
				>
			</thead>
			<tbody>
				{#each report.accents[theme] as a (a.id)}
					<tr>
						<td><span class="dot" style:background={a.hex}></span>{a.id}{a.default ? ' (default)' : ''}</td>
						<td class="ed-t-data-sm" class:miss={a.textOnSurface0 < 4.5}>{fmt(a.textOnSurface0)}</td>
						<td class="ed-t-data-sm" class:miss={a.onBrandOnFill < 4.5}>
							<span class="pair" style:background={a.hex} style:color={a.onBrand}>{fmt(a.onBrandOnFill)}</span>
						</td>
						<td class="ed-t-data-sm" class:miss={a.hoverOnSurface0 < 4.5}>{fmt(a.hoverOnSurface0)}</td>
						<td class="ed-t-data-sm" class:miss={a.textPrimaryOnMuted < 4.5}>
							<span class="pair" style:background={a.muted} style:color="var(--text-primary)"
								>{fmt(a.textPrimaryOnMuted)}</span
							>
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</section>
{/each}

<style>
	.theme {
		padding: var(--space-6);
		border-radius: var(--ed-radius-card);
		border: 1px solid var(--ed-card-border);
		margin-bottom: var(--space-6);
	}
	h2 {
		margin: 0 0 var(--space-4);
	}
	h3 {
		margin: var(--space-6) 0 var(--space-2);
		color: var(--text-secondary);
	}
	.swatches {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
		gap: var(--space-3);
		list-style: none;
		padding: 0;
		margin: 0;
	}
	.swatches li {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
	}
	.swatch {
		display: block;
		height: 48px;
		border-radius: var(--ed-radius-control);
		border: 1px solid var(--stroke-subtle);
	}
	.hex {
		color: var(--text-secondary);
	}
	table {
		border-collapse: collapse;
		width: 100%;
	}
	th,
	td {
		text-align: left;
		padding: var(--space-1) var(--space-2);
		border-bottom: 1px solid var(--stroke-subtle);
		vertical-align: middle;
	}
	th {
		color: var(--text-secondary);
		font-weight: 500;
	}
	.pair {
		display: inline-block;
		padding: 2px var(--space-2);
		border-radius: var(--ed-radius-control);
	}
	.dot {
		display: inline-block;
		width: 12px;
		height: 12px;
		border-radius: var(--radius-full);
		margin-right: var(--space-2);
		vertical-align: -1px;
	}
	.miss {
		color: var(--danger);
	}
</style>
