import { sveltekit } from '@sveltejs/kit/vite'
import { storybookTest } from '@storybook/addon-vitest/vitest-plugin'
import tailwindcss from '@tailwindcss/vite'
import { playwright } from '@vitest/browser-playwright'
import { defineConfig } from 'vitest/config'

// Storybook stories run as browser tests once per platform; unit tests cover pure logic.
const storybookProject = (platform: 'desktop' | 'mobile') => ({
	extends: true as const,
	plugins: [
		storybookTest({ configDir: '.storybook', storybookScript: 'yarn storybook', initialGlobals: { platform } }),
	],
	test: {
		name: `sb-${platform}`,
		browser: {
			enabled: true,
			headless: true,
			provider: playwright(),
			instances: [{ browser: 'chromium' as const }],
			...(platform === 'mobile' ? { viewport: { width: 390, height: 844 } } : {}),
		},
	},
})

export default defineConfig({
	plugins: [sveltekit(), tailwindcss()],
	test: {
		projects: [
			{
				extends: true,
				test: {
					name: 'unit',
					environment: 'node',
					include: ['src/**/*.test.ts', 'scripts/**/*.test.mjs'],
				},
			},
			storybookProject('desktop'),
			storybookProject('mobile'),
		],
	},
})
