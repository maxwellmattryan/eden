// Unit tests for the pure modules (dates, the weather mappers, the settings migrations, the registry) and for the
// registry builder under scripts/, in Node. A tested module never imports a rune module (`*.svelte.ts`): nothing here
// compiles Svelte.
import { defineConfig } from 'vitest/config'

export default defineConfig({
	test: {
		environment: 'node',
		include: ['src/**/*.test.ts', 'scripts/**/*.test.mjs'],
	},
})
