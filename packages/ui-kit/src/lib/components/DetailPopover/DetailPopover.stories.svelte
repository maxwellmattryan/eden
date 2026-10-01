<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf'
	import { expect, fn, userEvent, waitFor } from 'storybook/test'
	import { canvasOf } from '../../../storybook/play.js'
	import { defaultStrings } from '$lib/i18n/strings.js'
	import { audit, canSee, integrations, skyDetails } from '../../../stories/sample-data.js'
	import Button from '../Button/Button.svelte'
	import DetailPopover from './DetailPopover.svelte'
	import DetailSection, { type DetailRow } from './DetailSection.svelte'

	const strings = defaultStrings
	const meteo = integrations[1]!
	const triggerLabel = 'Source'
	const speaksTitle = 'What the Gardener read'
	const actsTitle = 'Add to the grocery list'
	const wideTitle = 'Request 0f3a'

	const forecastRows: DetailRow[] = [
		{ label: 'Feels like', value: `${skyDetails.feelsLike} °` },
		{ label: 'Humidity', value: `${skyDetails.humidity} %` },
		{ label: 'Wind', value: `${skyDetails.wind} km/h from the ${skyDetails.windFrom}, gusts ${skyDetails.gust}` },
		{ label: 'Pressure', value: `${skyDetails.pressure} hPa` },
		{ label: 'Visibility', value: `${skyDetails.visibility} km` },
	]
	const actRows: DetailRow[] = [
		{ label: 'Tool', value: 'add-to-list', mono: true },
		{ label: 'Model', value: audit.model, mono: true },
		{ label: 'Cost', value: audit.cost, mono: true },
		{ label: 'Outcome', value: audit.outcome, icon: 'check', tone: 'positive' },
	]
	const requestRows: DetailRow[] = [
		{ label: 'When', value: audit.when, mono: true },
		{ label: 'Surface', value: audit.surface },
		{ label: 'Model', value: audit.model, mono: true },
		{ label: 'Tokens', value: `${audit.tokensIn} in, ${audit.tokensOut} out`, mono: true },
	]
	const readRows: DetailRow[] = canSee.map((item) => ({ label: item.id, value: String(item.count), mono: true }))
	const sentRows: DetailRow[] = [
		{ label: 'Destination', value: 'Anthropic (Hearth chat)' },
		{ label: 'Bytes out', value: '18.2 kB', mono: true },
		{ label: 'Outcome', value: 'ok', icon: 'check', tone: 'positive' },
	]

	const { Story } = defineMeta({
		title: 'Components/Overlays/DetailPopover',
		component: DetailPopover,
		tags: ['autodocs'],
		parameters: {
			platformFrame: 'inline',
			docs: {
				description: {
					component:
						'A `Popover` with Eden’s chrome for a detail: a head band on the tone’s muted ground with the glyph, the title and a caption, a body of `DetailSection`s parted by hairlines, and a footer of actions when one is given. Neutral sits on surface-2; `ai` and `honey` are the Gardener’s two colours (D-40). The radius, border, shadow and unfurl are the Popover’s own.',
				},
			},
		},
		args: { tone: 'neutral', side: 'bottom', align: 'start', width: 'md', onclose: fn() },
		argTypes: {
			tone: { control: 'inline-radio', options: ['neutral', 'ai', 'honey'] },
			side: { control: 'inline-radio', options: ['top', 'bottom'] },
			align: { control: 'inline-radio', options: ['start', 'end'] },
			width: { control: 'inline-radio', options: ['sm', 'md', 'lg'] },
			anchor: { control: false },
		},
	})
</script>

<script lang="ts">
	let open = $state(false)
	let trigger = $state<HTMLElement>()
</script>

<!-- A forecast source: the glyph and the title on the neutral band, the reading in rows -->
<Story
	name="Neutral"
	args={{ icon: 'cloud-sun', title: meteo.label, subtitle: meteo.detail }}
	play={async ({ canvasElement, args }) => {
		const canvas = canvasOf(canvasElement)
		const button = canvas.getByRole('button', { name: triggerLabel })
		await userEvent.click(button)
		const panel = await canvas.findByRole('dialog', { name: meteo.label })
		await waitFor(() => expect(panel).toBeVisible())
		await expect(canvas.getByText(meteo.detail)).toBeVisible()
		await expect(canvas.getByText(forecastRows[0]!.label)).toBeVisible()
		await userEvent.keyboard('{Escape}')
		await waitFor(() => expect(panel).not.toBeVisible())
		await waitFor(() => expect(args.onclose).toHaveBeenLastCalledWith('escape'))
		await waitFor(() => expect(button).toHaveFocus())
	}}
>
	{#snippet template(args)}
		<span class="sb-anchor" bind:this={trigger}>
			<Button
				label={triggerLabel}
				icon="info"
				aria-haspopup="dialog"
				aria-expanded={open}
				onclick={() => (open = !open)}
			/>
		</span>
		<DetailPopover
			bind:open
			anchor={trigger}
			tone={args.tone}
			icon={args.icon}
			title={args.title}
			subtitle={args.subtitle}
			side={args.side}
			align={args.align}
			width={args.width}
			onclose={args.onclose}
		>
			<DetailSection rows={forecastRows} />
		</DetailPopover>
	{/snippet}
</Story>

<!-- The Gardener saying what it read: green, the eye, one section with the app's own list -->
<Story
	name="Gardener speaks"
	args={{ tone: 'ai', icon: 'eye', title: speaksTitle, subtitle: `${audit.surface} · ${audit.when}` }}
>
	{#snippet template(args)}
		<span class="sb-anchor" bind:this={trigger}>
			<Button
				label={triggerLabel}
				icon="eye"
				aria-haspopup="dialog"
				aria-expanded={open}
				onclick={() => (open = !open)}
			/>
		</span>
		<DetailPopover
			bind:open
			anchor={trigger}
			tone={args.tone}
			icon={args.icon}
			title={args.title}
			subtitle={args.subtitle}
			side={args.side}
			align={args.align}
			width={args.width}
			onclose={args.onclose}
		>
			<DetailSection label="Read">
				<ul class="sb-list">
					{#each canSee as item (item.id)}
						<li>
							<span class="sb-id">{item.id}</span>
							<span class="sb-count">{item.count}</span>
						</li>
					{/each}
				</ul>
			</DetailSection>
		</DetailPopover>
	{/snippet}
</Story>

<!-- The Gardener acting: honey, the shovel, a mono value, a positive outcome, the audit log one button away -->
<Story
	name="Gardener acts"
	args={{ tone: 'honey', icon: 'shovel', title: actsTitle, subtitle: `${audit.surface} · ${audit.when}` }}
>
	{#snippet template(args)}
		<span class="sb-anchor" bind:this={trigger}>
			<Button
				label={triggerLabel}
				icon="shovel"
				aria-haspopup="dialog"
				aria-expanded={open}
				onclick={() => (open = !open)}
			/>
		</span>
		<DetailPopover
			bind:open
			anchor={trigger}
			tone={args.tone}
			icon={args.icon}
			title={args.title}
			subtitle={args.subtitle}
			side={args.side}
			align={args.align}
			width={args.width}
			onclose={args.onclose}
		>
			<DetailSection rows={actRows} />
			{#snippet footer()}
				<Button label={strings.gardener.openAuditLog} variant="quiet" size="md" onclick={() => (open = false)} />
			{/snippet}
		</DetailPopover>
	{/snippet}
</Story>

<!-- Three sections at the wide size: the request, what it read, what left the device -->
<Story name="Wide" args={{ width: 'lg', icon: 'list', title: wideTitle, subtitle: 'Audit log' }}>
	{#snippet template(args)}
		<span class="sb-anchor" bind:this={trigger}>
			<Button
				label={triggerLabel}
				icon="info"
				aria-haspopup="dialog"
				aria-expanded={open}
				onclick={() => (open = !open)}
			/>
		</span>
		<DetailPopover
			bind:open
			anchor={trigger}
			tone={args.tone}
			icon={args.icon}
			title={args.title}
			subtitle={args.subtitle}
			side={args.side}
			align={args.align}
			width={args.width}
			onclose={args.onclose}
		>
			<DetailSection label="Request" rows={requestRows} />
			<DetailSection label="Read" rows={readRows} />
			<DetailSection label="Sent" rows={sentRows} />
		</DetailPopover>
	{/snippet}
</Story>

<style>
	.sb-anchor {
		display: inline-block;
	}
	.sb-list {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.sb-list li {
		display: flex;
		justify-content: space-between;
		gap: var(--space-3);
	}
	.sb-id {
		font: var(--ed-t-data-sm);
		color: var(--text-primary);
	}
	.sb-count {
		font: var(--ed-t-data-sm);
		color: var(--text-secondary);
		font-variant-numeric: tabular-nums;
	}
</style>
