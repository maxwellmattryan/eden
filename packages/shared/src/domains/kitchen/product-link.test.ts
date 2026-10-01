import { describe, expect, it } from 'vitest'
import { pictureAddress, productLink } from './product-link.js'

const NORI = 'https://www.heb.com/product-detail/gimme-organic-sushi-nori-seaweed-wraps-9-ct/2042876'

describe('a product link', () => {
	it('reads the name, the size, the store and the picture from an H-E-B address', () => {
		expect(productLink(NORI)).toEqual({
			store: 'H-E-B',
			name: 'Gimme organic sushi nori seaweed wraps',
			size: '9 ct',
			imageUrl: 'https://images.heb.com/is/image/HEBGrocery/002042876-1?hei=480&fit=constrain&qlt=80',
		})
	})

	it('reads a size with a decimal and a two-word unit, and a name with none', () => {
		expect(productLink('https://www.heb.com/product-detail/h-e-b-whole-milk-greek-yogurt-32-oz/1234567')).toMatchObject(
			{
				name: 'Whole milk greek yogurt',
				brand: 'H-E-B',
				size: '32 oz',
				imageUrl: 'https://images.heb.com/is/image/HEBGrocery/001234567-1?hei=480&fit=constrain&qlt=80',
			}
		)
		expect(productLink('https://heb.com/product-detail/olive-oil-16-9-fl-oz/55/')).toMatchObject({
			name: 'Olive oil',
			size: '16.9 fl oz',
			imageUrl: 'https://images.heb.com/is/image/HEBGrocery/000000055-1?hei=480&fit=constrain&qlt=80',
		})
		const plain = productLink('https://www.heb.com/product-detail/fresh-bananas/320229?utm=x#top')
		expect(plain).toMatchObject({ name: 'Fresh bananas' })
		expect(plain).not.toHaveProperty('brand')
		expect(plain).not.toHaveProperty('size')
	})

	it('reads nothing from what is not a product page it knows', () => {
		expect(productLink('https://www.heb.com/category/shop/fruit')).toBeUndefined()
		expect(productLink('https://www.heb.com/product-detail/fresh-bananas/not-a-number')).toBeUndefined()
		expect(productLink('http://www.heb.com/product-detail/fresh-bananas/320229')).toBeUndefined()
		expect(productLink('https://example.com/product-detail/fresh-bananas/320229')).toBeUndefined()
		expect(productLink('2 lb chicken thighs fridge')).toBeUndefined()
		expect(productLink('')).toBeUndefined()
	})

	it('names the picture a link means: the product, or the link itself', () => {
		expect(pictureAddress(NORI)).toBe(
			'https://images.heb.com/is/image/HEBGrocery/002042876-1?hei=480&fit=constrain&qlt=80'
		)
		expect(pictureAddress(' https://example.com/pictures/rice.jpg ')).toBe('https://example.com/pictures/rice.jpg')
		expect(pictureAddress('http://example.com/rice.jpg')).toBeUndefined()
		expect(pictureAddress('rice')).toBeUndefined()
	})
})
