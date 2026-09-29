import type { Platform } from '../tokens/tokens.js'

/**
 * The platform an element renders on, read from the nearest `data-platform` ancestor (the app sets it once on `<html>`;
 * a Storybook frame sets it on its viewport). Desktop when nothing says otherwise. The kit never consults matchMedia.
 */
export function platformOf(el: Element | null | undefined): Platform {
	const value = el?.closest('[data-platform]')?.getAttribute('data-platform')
	return value === 'mobile' ? 'mobile' : 'desktop'
}
