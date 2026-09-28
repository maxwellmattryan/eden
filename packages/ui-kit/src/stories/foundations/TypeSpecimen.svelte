<script lang="ts">
	// The 17 type styles as specimens, straight from tokens.ts, plus the four roles the brand dial owns. Switch the
	// Brand toolbar to see the display face give way to Inter at plain; switch Face to try the alternates.
	import { typeStyleNames, typeStyles } from '$lib/tokens/tokens.js'

	const ja = '庭は手入れするもの。急がず、毎日、少しずつ。'
	const roles = [
		{ name: 'button', note: 'button labels: display face at tended and lush, label at plain' },
		{ name: 'title', note: 'card and pane titles' },
		{ name: 'title-sm', note: 'list headers' },
		{ name: 'voice', note: 'every sentence the app says' },
	] as const
	const describe = (name: (typeof typeStyleNames)[number]) => {
		const t = typeStyles[name]
		const lh = typeof t.lineHeight === 'number' && t.lineHeight < 3 ? t.lineHeight : `${t.lineHeight}px`
		return `${t.family} ${t.size}/${lh} ${t.weight}${'opsz' in t && t.opsz ? ` opsz ${t.opsz}` : ''}`
	}
</script>

<section>
	<h2 class="ed-t-display-md">Type styles</h2>
	<p class="ed-t-voice intro">
		The display face is what Eden says, Inter is what Eden holds, Geist Mono is where numbers align.
	</p>
	<dl>
		{#each typeStyleNames as name (name)}
			<div class="row">
				<dt>
					<span class="ed-t-data-sm">{name}</span>
					<span class="ed-t-caption meta" data-tertiary>{describe(name)}</span>
				</dt>
				<dd>
					<span class="ed-t-{name}">{typeStyles[name].sample || 'Tend what you can reach.'}</span>
					<span class="ed-t-{name}" lang="ja">{ja}</span>
				</dd>
			</div>
		{/each}
	</dl>

	<h2 class="ed-t-display-md">Roles the brand dial sets</h2>
	<dl>
		{#each roles as role (role.name)}
			<div class="row">
				<dt>
					<span class="ed-t-data-sm">--ed-t-{role.name}</span>
					<span class="ed-t-caption meta" data-tertiary>{role.note}</span>
				</dt>
				<dd>
					<span class="ed-t-{role.name}">Delete recipe</span><span class="ed-t-{role.name}" lang="ja">レシピを削除</span
					>
				</dd>
			</div>
		{/each}
	</dl>
</section>

<style>
	section {
		max-width: 960px;
	}
	h2 {
		margin: var(--space-8) 0 var(--space-2);
	}
	h2:first-child {
		margin-top: 0;
	}
	.intro {
		color: var(--text-secondary);
		margin: 0 0 var(--space-6);
	}
	dl {
		margin: 0;
	}
	.row {
		display: grid;
		grid-template-columns: 220px minmax(0, 1fr);
		gap: var(--space-4);
		padding: var(--space-3) 0;
		border-bottom: 1px solid var(--stroke-subtle);
		align-items: baseline;
	}
	dt {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	dd {
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		min-width: 0;
		overflow-wrap: anywhere;
	}
	.meta {
		color: var(--text-tertiary);
	}
</style>
