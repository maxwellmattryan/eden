<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf'
	import Stepper from './Stepper.svelte'

	// The Phase-1 wizard, from product/substrate/onboarding.md.
	const wizard = [
		'Welcome',
		'Language',
		'Appearance',
		'Your name',
		'Home',
		'Domains',
		'Gardener',
		'Privacy',
		'Notifications',
		'Ready',
	]

	const { Story } = defineMeta({
		title: 'Components/Feedback/Stepper',
		component: Stepper,
		tags: ['autodocs'],
		args: { steps: 10, current: 5, shape: 'auto' },
		argTypes: {
			shape: { control: 'inline-radio', options: ['auto', 'bars', 'dots'] },
			current: { control: { type: 'range', min: 1, max: 10, step: 1 } },
		},
		parameters: {
			docs: {
				description: {
					component:
						'The onboarding step indicator. Completed steps fill with the accent, the current one is ringed, the rest wait in stroke-hover. Desktop draws short bars, with a label beneath each when `labels` is given; mobile, and any column too narrow for the bars, draws dots and names only the current step. It is purely presentational: the wizard’s own Back and Continue move between steps. A screen reader hears the nav’s name, "Step 3 of 10", and the same line announced as `current` changes.',
				},
			},
		},
	})
</script>

<Story name="Steps">
	{#snippet template(args)}
		<div class="sb-column">
			<Stepper {...args} current={1} />
			<Stepper {...args} current={5} />
			<Stepper {...args} current={10} />
		</div>
	{/snippet}
</Story>

<Story name="With labels" args={{ labels: wizard }} />

<Story
	name="Compact"
	args={{ steps: 24, current: 9 }}
	parameters={{
		docs: {
			description: {
				story:
					'Many steps. The bars keep their size and shrink only to a floor; where the column is narrower than the bars need, the indicator falls back to dots on its own.',
			},
		},
	}}
>
	{#snippet template(args)}
		<div class="sb-column">
			<Stepper {...args} />
			<div class="sb-narrow">
				<Stepper {...args} current={21} />
			</div>
		</div>
	{/snippet}
</Story>

<style>
	.sb-column {
		display: flex;
		flex-direction: column;
		gap: var(--space-6);
	}
	.sb-narrow {
		max-width: var(--sidebar);
	}
</style>
