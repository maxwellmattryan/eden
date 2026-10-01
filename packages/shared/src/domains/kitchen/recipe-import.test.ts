import { describe, expect, it } from 'vitest'
import { durationMinutes, recipeDraft, recipeFromJsonLd } from './recipe-import.js'

const page = (json: unknown) =>
	`<html><head><script type="application/ld+json">${JSON.stringify(json)}</script></head><body>…</body></html>`

describe('a recipe from a page', () => {
	it('reads ISO durations', () => {
		expect(durationMinutes('PT25M')).toBe(25)
		expect(durationMinutes('PT1H30M')).toBe(90)
		expect(durationMinutes('P0DT45M')).toBe(45)
		expect(durationMinutes('25 minutes')).toBe(0)
		expect(durationMinutes(undefined)).toBe(0)
	})

	it('reads a Recipe out of a graph', () => {
		const html = page({
			'@context': 'https://schema.org',
			'@graph': [
				{ '@type': 'WebSite', name: 'Site' },
				{
					'@type': ['Recipe', 'NewsArticle'],
					name: 'Miso-glazed salmon &amp; spinach',
					recipeYield: ['2', '2 servings'],
					prepTime: 'PT10M',
					cookTime: 'PT15M',
					keywords: 'weeknight, Fish',
					recipeIngredient: ['2 salmon fillets', '1 1/2 tbsp white miso', '200 g spinach, washed'],
					recipeInstructions: [
						{
							'@type': 'HowToSection',
							name: 'Glaze',
							itemListElement: [{ '@type': 'HowToStep', text: 'Mix the <b>miso</b>.' }],
						},
						{ '@type': 'HowToStep', text: 'Roast for 12 minutes.' },
					],
				},
			],
		})
		expect(recipeFromJsonLd(html, 'https://example.com/salmon')).toEqual({
			name: 'Miso-glazed salmon & spinach',
			serves: 2,
			minutes: 25,
			tags: ['weeknight', 'fish'],
			ingredients: [
				{ name: 'salmon fillets', qty: '2' },
				{ name: 'white miso', qty: '1 1/2', unit: 'tbsp' },
				{ name: 'spinach', qty: '200', unit: 'g', note: 'washed' },
			],
			steps: ['Mix the miso.', 'Roast for 12 minutes.'],
			sourceUrl: 'https://example.com/salmon',
		})
	})

	it('reads instructions written as one text', () => {
		const html = page({
			'@type': 'Recipe',
			name: 'Rice',
			totalTime: 'PT20M',
			recipeIngredient: ['1 cup rice'],
			recipeInstructions: 'Rinse the rice.\nSimmer for 15 minutes.',
		})
		expect(recipeFromJsonLd(html)).toMatchObject({
			minutes: 20,
			serves: 2,
			steps: ['Rinse the rice.', 'Simmer for 15 minutes.'],
		})
	})

	it('answers nothing for a page with no recipe, a broken script or a recipe with no lines', () => {
		expect(recipeFromJsonLd('<html><body>hello</body></html>')).toBeUndefined()
		expect(recipeFromJsonLd('<script type="application/ld+json">{ not json</script>')).toBeUndefined()
		expect(
			recipeFromJsonLd(page({ '@type': 'Recipe', name: 'Empty', recipeIngredient: [], recipeInstructions: [] }))
		).toBeUndefined()
		expect(recipeFromJsonLd(page({ '@type': 'Article', name: 'News' }))).toBeUndefined()
	})

	it('reads a draft a model answered, leniently', () => {
		expect(
			recipeDraft({
				name: ' Soba with tofu ',
				serves: 2.4,
				minutes: '15',
				tags: ['Quick', ''],
				ingredients: [{ name: 'soba', qty: 200, unit: 'g', note: '' }, '2 tbsp soy sauce', { name: '', qty: '1' }],
				steps: ['Boil the soba.', ''],
				sourceUrl: '',
				tip: 'Rinse the noodles cold.',
			})
		).toEqual({
			name: 'Soba with tofu',
			serves: 2,
			minutes: 0,
			tags: ['quick'],
			ingredients: [
				{ name: 'soba', qty: '200', unit: 'g' },
				{ name: 'soy sauce', qty: '2', unit: 'tbsp' },
			],
			steps: ['Boil the soba.'],
			tip: 'Rinse the noodles cold.',
		})
		expect(recipeDraft({ name: 'Nothing', ingredients: [] })).toBeUndefined()
		expect(recipeDraft(null)).toBeUndefined()
	})
})
