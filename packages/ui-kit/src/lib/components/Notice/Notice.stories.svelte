<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf'
	import { expect, fn, waitFor } from 'storybook/test'
	import { canvasOf, hasCanvas } from '../../../storybook/play.js'
	import PageHeader from '../PageHeader/PageHeader.svelte'
	import Notice from './Notice.svelte'
	import { sidebar } from '../../../stories/sample-data.js'

	const sky = sidebar.items.find((entry) => entry.id === 'weather')!
	const watch = {
		title: 'Flood Watch',
		detail: 'From Wednesday 19:00 until Friday 19:00.',
		meta: 'NWS Austin/San Antonio TX · Tue 09:24',
	}

	const { Story } = defineMeta({
		title: 'Components/Feedback/Notice',
		component: Notice,
		tags: ['autodocs'],
		args: { tone: 'warning', ...watch },
		parameters: { layout: 'padded' },
	})
</script>

<!-- A weather alert: what it is first, when it holds beneath, who issued it quietly -->
<Story
	name="Alert"
	play={async ({ canvasElement }) => {
		if (!hasCanvas(canvasElement)) return
		const canvas = canvasOf(canvasElement)
		const alert = canvas.getByRole('alert')
		await expect(alert).toHaveTextContent(watch.title)
		await expect(alert).toHaveTextContent(watch.meta)
	}}
/>

<Story name="Severe" args={{ tone: 'danger', title: 'Tornado Warning', detail: 'Until 18:45. Take shelter now.' }} />

<!-- A nudge before a plan, with its one action -->
<Story
	name="With action"
	args={{
		title: 'Showers from 16:00',
		detail: 'Your 17:30 session may get wet.',
		meta: undefined,
		action: { label: 'Open Today', onclick: fn() },
	}}
/>

<Story name="Title only" args={{ tone: 'info', title: 'Frost tonight', detail: undefined, meta: undefined }} />

<!-- A notice the owner can put away: the cross is named after what it dismisses -->
<Story
	name="Dismissible"
	args={{ ondismiss: fn(), ondismissed: fn() }}
	play={async ({ canvasElement, args }) => {
		if (!hasCanvas(canvasElement)) return
		const canvas = canvasOf(canvasElement)
		canvas.getByRole('button', { name: `Dismiss ${watch.title}` }).click()
		await expect(args.ondismiss).toHaveBeenCalledTimes(1)
		// it fades and its Breeze plays; then it says it has gone
		await waitFor(() => expect(args.ondismissed).toHaveBeenCalledTimes(1), { timeout: 3000 })
	}}
/>

<!-- Where it sits: the top right of a page, in the header's aside -->
<Story name="In a page header">
	{#snippet template(args)}
		<PageHeader name={sky.name} subtitle={sky.subtitle} icon="cloud-sun">
			{#snippet aside()}
				<Notice {...args} />
			{/snippet}
		</PageHeader>
	{/snippet}
</Story>
