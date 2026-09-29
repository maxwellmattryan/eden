<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf'
	import Button from '../components/Button/Button.svelte'
	import Icon from './Icon.svelte'
	import { iconNames } from './icons.js'
	import { GLYPHS, domainIds, shellIds } from './domain-glyphs.js'

	const { Story } = defineMeta({
		title: 'Foundations/Icon',
		component: Icon,
		tags: ['autodocs'],
		args: { name: 'bell', size: 'md' },
		argTypes: {
			name: { control: 'select', options: iconNames },
			size: { control: 'inline-radio', options: ['sm', 'md', 'lg'] },
		},
	})
</script>

<script lang="ts">
	let live = $state<'sun' | 'cloud-sun' | 'cloud-rain' | 'moon'>('sun')
	const cycle = ['sun', 'cloud-sun', 'cloud-rain', 'moon'] as const
</script>

<Story name="Sizes">
	{#snippet template(args)}
		<div style="display: flex; gap: 16px; align-items: center">
			<Icon {...args} size="sm" />
			<Icon {...args} size="md" />
			<Icon {...args} size="lg" />
		</div>
	{/snippet}
</Story>

<Story name="Every icon" parameters={{ platforms: ['desktop'] }}>
	{#snippet template()}
		<ul
			style="display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 12px; list-style: none; padding: 0; margin: 0"
		>
			{#each iconNames as name (name)}
				<li
					style="display: flex; align-items: center; gap: 8px; font: var(--ed-t-caption); color: var(--text-secondary)"
				>
					<Icon {name} size="md" /><span>{name}</span>
				</li>
			{/each}
		</ul>
	{/snippet}
</Story>

<Story name="Domain stand-ins" parameters={{ platforms: ['desktop'] }}>
	{#snippet template()}
		<ul
			style="display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 12px; list-style: none; padding: 0; margin: 0"
		>
			{#each [...domainIds, ...shellIds] as id (id)}
				<li style="display: flex; align-items: center; gap: 8px; font: var(--ed-t-body-sm)">
					<Icon name={GLYPHS[id]} size="lg" /><span>{id}</span><span style="color: var(--text-tertiary)"
						>{GLYPHS[id]}</span
					>
				</li>
			{/each}
		</ul>
	{/snippet}
</Story>

<Story name="Live swap">
	{#snippet template()}
		<Button
			icon={live}
			label={live}
			onclick={() => (live = cycle[(cycle.indexOf(live) + 1) % cycle.length] ?? 'sun')}
		/>
	{/snippet}
</Story>
