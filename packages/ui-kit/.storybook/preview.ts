import type { Preview } from '@storybook/sveltekit'
import { withThemeByDataAttribute } from '@storybook/addon-themes'
import '../src/storybook/storybook.css'
import PlatformFrame from '../src/storybook/PlatformFrame.svelte'
import RootAttributes from '../src/storybook/RootAttributes.svelte'
import { accents, brandLevels, defaults, densities, faces, platforms } from '../src/lib/tokens/tokens.js'

const preview: Preview = {
	parameters: {
		layout: 'fullscreen',
		a11y: {
			test: 'error',
			// text-tertiary at 12–13 px is 3.3:1 in light. The brand book allows it for metadata a reader can do without;
			// such text carries data-tertiary and is the only exemption from the contrast rule.
			config: { rules: [{ id: 'color-contrast', selector: ':not([data-tertiary])' }] },
		},
		/** Which platforms a story is designed for; the frame renders one canvas per platform. */
		platforms: [...platforms],
		viewport: {
			options: {
				phone: { name: 'Phone 390', styles: { width: '390px', height: '844px' }, type: 'mobile' },
				tablet: { name: 'Tablet 768', styles: { width: '768px', height: '1024px' }, type: 'tablet' },
				detail: { name: 'Detail 1099', styles: { width: '1099px', height: '800px' }, type: 'desktop' },
				wide: { name: 'Desktop 1440', styles: { width: '1440px', height: '900px' }, type: 'desktop' },
			},
		},
		docs: { toc: true },
		controls: { expanded: true },
	},
	globalTypes: {
		accent: {
			description: 'data-accent: the owner’s accent, replacing the brand triplet',
			toolbar: { title: 'Accent', icon: 'paintbrush', items: [...accents], dynamicTitle: true },
		},
		brand: {
			description: 'data-brand: how much of the garden shows in the chrome',
			toolbar: { title: 'Brand', icon: 'grow', items: [...brandLevels], dynamicTitle: true },
		},
		face: {
			description: 'data-face: the display face (gallery only; the app ships Newsreader)',
			toolbar: { title: 'Face', icon: 'paragraph', items: [...faces], dynamicTitle: true },
		},
		platform: {
			description: 'data-platform: render the story for desktop, mobile, or both side by side',
			toolbar: {
				title: 'Platform',
				icon: 'mobile',
				items: [
					{ value: 'both', title: 'Side by side' },
					{ value: 'desktop', title: 'Desktop' },
					{ value: 'mobile', title: 'Mobile' },
				],
				dynamicTitle: true,
			},
		},
		density: {
			description: 'data-density: desktop row density',
			toolbar: { title: 'Density', icon: 'menu', items: [...densities], dynamicTitle: true },
		},
	},
	initialGlobals: {
		accent: defaults.accent,
		brand: defaults.brand,
		face: defaults.face,
		platform: 'both',
		density: defaults.density,
	},
	decorators: [
		withThemeByDataAttribute({
			themes: { light: 'light', dark: 'dark' },
			defaultTheme: 'light',
			attributeName: 'data-theme',
		}),
		(_story, { globals }) => ({
			Component: RootAttributes,
			props: { accent: globals.accent, brand: globals.brand, face: globals.face },
		}),
		(_story, { globals, parameters, viewMode }) => ({
			Component: PlatformFrame,
			props: {
				platform: globals.platform,
				density: globals.density,
				platforms: parameters.platforms,
				frame: viewMode === 'docs' ? 'inline' : (parameters.platformFrame ?? 'framed'),
			},
		}),
	],
}

export default preview
