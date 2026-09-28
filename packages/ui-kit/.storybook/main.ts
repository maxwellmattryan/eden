import type { StorybookConfig } from '@storybook/sveltekit'

const config: StorybookConfig = {
	framework: { name: '@storybook/sveltekit', options: {} },
	stories: ['../src/**/*.mdx', '../src/**/*.stories.svelte'],
	addons: [
		'@storybook/addon-svelte-csf',
		'@storybook/addon-docs',
		'@storybook/addon-a11y',
		'@storybook/addon-themes',
		'@storybook/addon-vitest',
	],
	// Local-first, like the app: nothing leaves the machine.
	core: { disableTelemetry: true },
}

export default config
