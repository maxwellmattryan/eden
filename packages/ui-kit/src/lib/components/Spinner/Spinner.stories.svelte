<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf'
	import { expect } from 'storybook/test'
	import { canvasOf } from '../../../storybook/play.js'
	import { defaultStrings } from '$lib/i18n/strings.js'
	import Spinner from './Spinner.svelte'

	const { Story } = defineMeta({
		title: 'Components/Feedback/Spinner',
		component: Spinner,
		tags: ['autodocs'],
		args: { size: 'sm' },
		argTypes: { size: { control: 'inline-radio', options: ['sm', 'md'] } },
	})
</script>

<!-- The arrows turn once per spin duration and say "Loading" to a screen reader; they hold still under reduced motion -->
<Story
	name="Default"
	play={async ({ canvasElement }) => {
		await expect(canvasOf(canvasElement).getAllByRole('status')[0]).toHaveTextContent(defaultStrings.loading)
	}}
/>

<!-- md, beside body text -->
<Story name="Medium" args={{ size: 'md' }} />

<!-- The name says what is running -->
<Story
	name="Named"
	args={{ label: defaultStrings.gardener.toolRunning }}
	play={async ({ canvasElement }) => {
		await expect(canvasOf(canvasElement).getAllByRole('status')[0]).toHaveTextContent(
			defaultStrings.gardener.toolRunning
		)
	}}
/>
