<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf'
	import type { SvelteRenderer } from '@storybook/svelte'
	import type { PlayFunctionContext } from 'storybook/internal/csf'
	import { expect, screen, waitFor } from 'storybook/test'
	import Icon from '$lib/icons/Icon.svelte'
	import { domainGlyph } from '$lib/icons/domain-glyphs.js'
	import { defaultStrings } from '$lib/i18n/strings.js'
	import { sidebar } from '../../../stories/sample-data.js'
	import IconButton from '../IconButton/IconButton.svelte'
	import Tooltip from './Tooltip.svelte'
	import { tooltip } from './tooltip.js'

	const hearth = sidebar.items[2]!

	const { Story } = defineMeta({
		title: 'Components/Overlays/Tooltip',
		component: Tooltip,
		tags: ['autodocs'],
		args: { text: hearth.subtitle, side: 'bottom' },
		argTypes: { side: { control: 'inline-radio', options: ['top', 'bottom'] } },
		parameters: {
			platformFrame: 'inline',
			docs: {
				description: {
					component:
						'The visible form of a label that already exists: an icon-only control’s name, a sidebar subtitle the owner collapsed. Most consumers put the attachment straight on the control, `<IconButton {@attach tooltip(s.back)} />`; the `Tooltip` component wraps a host that cannot take one. It shows on hover after 400 ms (mouse or pen only, never touch) and at once on keyboard focus; it hides on leave, blur, pointer down and Escape. One shared bubble serves every host, so neighbouring controls hand it over without flicker.',
				},
			},
		},
	})

	/** The keyboard contract: focus shows the bubble with the text; Escape hides it. */
	const showsOnFocus =
		(text: string) =>
		async ({ canvas, userEvent }: Pick<PlayFunctionContext<SvelteRenderer>, 'canvas' | 'userEvent'>) => {
			await userEvent.tab()
			await expect(canvas.getAllByRole('button')[0]).toHaveFocus()
			const tip = await screen.findByRole('tooltip')
			await expect(tip).toHaveTextContent(text)
			await userEvent.keyboard('{Escape}')
			await waitFor(() => expect(screen.queryByRole('tooltip')).toBeNull())
		}
</script>

<Story
	name="On an icon button"
	parameters={{
		docs: {
			description: {
				story: 'An icon-only control keeps its `label`; the tooltip repeats it for sighted pointer and keyboard users.',
			},
		},
	}}
	play={showsOnFocus(defaultStrings.back)}
>
	{#snippet template()}
		<IconButton icon="arrow-left" label={defaultStrings.back} {@attach tooltip(defaultStrings.back)} />
	{/snippet}
</Story>

<Story
	name="On a sidebar item"
	parameters={{
		docs: {
			description: {
				story:
					'The subtitle collapsed into the tooltip (D-2). The getter form reads the text each time the bubble opens, so a locale change needs no re-attachment. Stand-in row until SidebarItem lands.',
			},
		},
	}}
	play={showsOnFocus(hearth.subtitle)}
>
	{#snippet template()}
		<button type="button" class="sb-row" {@attach tooltip(() => hearth.subtitle)}>
			<Icon name={domainGlyph('kitchen')} size="md" />
			<span>{hearth.name}</span>
		</button>
	{/snippet}
</Story>

<Story
	name="Wrapper"
	parameters={{
		docs: {
			description: {
				story:
					'The `Tooltip` component, for a host that cannot take an attachment. It wraps its children in an inline-block span the bubble anchors to.',
			},
		},
	}}
	play={(context) => showsOnFocus(context.args.text ?? '')(context)}
>
	{#snippet template(args)}
		<Tooltip text={args.text} side={args.side}>
			<IconButton icon="bell" label={defaultStrings.statusBar.inbox} />
		</Tooltip>
	{/snippet}
</Story>

<Story
	name="Delay"
	parameters={{
		docs: {
			description: {
				story:
					'The hover delay is 400 ms by default. `delay: 0` suits a dense toolbar; a longer delay suits a control the pointer often crosses on its way elsewhere. Once a tooltip is up, the next host shows its own at once, whatever its delay.',
			},
		},
	}}
>
	{#snippet template()}
		<div class="sb-column">
			<p class="sb-label">
				<IconButton
					icon="arrow-left"
					label={defaultStrings.back}
					{@attach tooltip(defaultStrings.back, { delay: 0 })}
				/>
				no delay
			</p>
			<p class="sb-label">
				<IconButton
					icon="bell"
					label={defaultStrings.statusBar.inbox}
					{@attach tooltip(defaultStrings.statusBar.inbox, { delay: 1200 })}
				/>
				1200 ms
			</p>
		</div>
	{/snippet}
</Story>

<style>
	/* a stand-in for SidebarItem, which arrives in wave 4 */
	.sb-row {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		width: var(--sidebar);
		height: var(--ed-row);
		padding: 0 var(--space-3);
		border: 0;
		border-radius: var(--ed-radius-control);
		background: var(--surface-1);
		color: var(--text-primary);
		font: var(--ed-t-text);
		text-align: left;
		cursor: pointer;
	}
	.sb-row:focus-visible {
		outline: 2px solid transparent;
		box-shadow: var(--focus-ring);
	}
	.sb-column {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
		align-items: flex-start;
	}
	.sb-label {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		margin: 0;
		font: var(--ed-t-caption);
		color: var(--text-secondary);
	}
</style>
