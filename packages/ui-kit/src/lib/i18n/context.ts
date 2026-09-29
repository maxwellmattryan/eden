import { createContext } from 'svelte'
import { defaultStrings, type UiStrings } from './strings.js'

/** What UiKitProvider puts in context: a live view of the merged strings. */
export interface StringsSource {
	readonly current: UiStrings
}

export const [getStringsSource, setStringsSource, hasStringsSource] = createContext<StringsSource>()

/**
 * The strings for this component: the nearest UiKitProvider's, or the English defaults. Reads go through to the
 * provider's current value, so a locale change re-renders whatever used them.
 */
export function useStrings(): UiStrings {
	const source: StringsSource = hasStringsSource() ? getStringsSource() : { current: defaultStrings }
	return new Proxy({} as UiStrings, {
		get: (_, key) => source.current[key as keyof UiStrings],
		has: (_, key) => key in source.current,
		ownKeys: () => Reflect.ownKeys(source.current),
		getOwnPropertyDescriptor: (_, key) => ({
			enumerable: true,
			configurable: true,
			value: source.current[key as keyof UiStrings],
		}),
	})
}
