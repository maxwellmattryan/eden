import { describe, expect, it } from 'vitest'
import { DataError, dataErrorCode } from './errors.js'

describe('dataErrorCode', () => {
	it('reads the code an error starts with', () => {
		expect(dataErrorCode('not-found: eden://recipe/01J9ZQ4M3T8R5V2X7Y6W1B0CDE')).toBe('not-found')
		expect(dataErrorCode('bundle:hash-mismatch: entities/recipe.jsonl')).toBe('bundle:hash-mismatch')
		expect(dataErrorCode(new DataError('invalid', 'not an id'))).toBe('invalid')
		expect(dataErrorCode(new Error('not-found: entity 01'))).toBe('not-found')
	})

	it('finds none in a plain message', () => {
		for (const plain of [
			'Invalid operation: not an id',
			'Database error: disk full',
			'IO error: x',
			'',
			'note:',
			7,
			null,
		]) {
			expect(dataErrorCode(plain)).toBeUndefined()
		}
	})
})
