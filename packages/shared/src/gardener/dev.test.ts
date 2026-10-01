import { describe, expect, it } from 'vitest'
import { declarations } from '../manifest/index.js'
import { clampForDevelopment, isDevEnvironment } from './dev.js'
import { ANTHROPIC_SEED, gradeMapOf, modelLookup, PROVIDERS } from './providers.js'
import { resolveGrade, resolveTool } from './resolve.js'
import { toolIndex } from './tools.js'
import { GRADES } from './types.js'

describe('the development clamp', () => {
	it('knows the builds to clamp', () => {
		expect(isDevEnvironment('development')).toBe(true)
		expect(isDevEnvironment('web')).toBe(true)
		expect(isDevEnvironment('staging')).toBe(false)
		expect(isDevEnvironment('production')).toBe(false)
	})

	it('puts light and standard on the light model, and deep on the standard one', () => {
		expect(clampForDevelopment(gradeMapOf(ANTHROPIC_SEED), ANTHROPIC_SEED)).toEqual({
			light: { provider: 'anthropic', model: 'claude-haiku-4-5-20251001' },
			standard: { provider: 'anthropic', model: 'claude-haiku-4-5-20251001' },
			deep: { provider: 'anthropic', model: 'claude-sonnet-5-5' },
		})
	})

	it('never answers the deep model, and the standard one only for deep', () => {
		const map = clampForDevelopment(gradeMapOf(ANTHROPIC_SEED), ANTHROPIC_SEED)
		const models = modelLookup(PROVIDERS)
		const { light, standard, deep } = ANTHROPIC_SEED.grades
		const allowed = (grade: string | null) => (grade === 'deep' ? standard : light)
		for (const { domain, declaration } of toolIndex(declarations)) {
			const resolved = resolveTool({ tool: declaration, domain, map, models })
			if (resolved.kind === 'model') {
				expect(resolved.model, `${domain}.${declaration.id}`).toBe(allowed(declaration.grade))
				expect(resolved.model).not.toBe(deep)
			} else expect(resolved.kind).toBe('plain')
		}
		for (const grade of GRADES) {
			expect(resolveGrade(grade, ['tools', 'vision'], map, models)).toMatchObject({
				kind: 'model',
				model: allowed(grade),
			})
		}
	})
})
