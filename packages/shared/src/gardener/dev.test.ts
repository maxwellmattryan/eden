import { describe, expect, it } from 'vitest'
import { declarations } from '../manifest/index.js'
import { clampToLight, isDevEnvironment } from './dev.js'
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

	it('puts every grade on the light model', () => {
		expect(clampToLight(gradeMapOf(ANTHROPIC_SEED), ANTHROPIC_SEED)).toEqual({
			light: { provider: 'anthropic', model: 'claude-haiku-4-5-20251001' },
			standard: { provider: 'anthropic', model: 'claude-haiku-4-5-20251001' },
			deep: { provider: 'anthropic', model: 'claude-haiku-4-5-20251001' },
		})
	})

	it('never answers a model above light for any declared tool or grade', () => {
		const map = clampToLight(gradeMapOf(ANTHROPIC_SEED), ANTHROPIC_SEED)
		const models = modelLookup(PROVIDERS)
		const light = ANTHROPIC_SEED.grades.light
		for (const { domain, declaration } of toolIndex(declarations)) {
			const resolved = resolveTool({ tool: declaration, domain, map, models })
			if (resolved.kind === 'model') expect(resolved.model, `${domain}.${declaration.id}`).toBe(light)
			else expect(resolved.kind).toBe('plain')
		}
		for (const grade of GRADES) {
			expect(resolveGrade(grade, ['tools', 'vision'], map, models)).toMatchObject({ kind: 'model', model: light })
		}
	})
})
