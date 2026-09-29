<script module lang="ts">
	import type { IconName } from '../../icons/icons.js'

	/** One parsed field, shown as an accent chip. */
	export interface ParsedChip {
		/** The chip's text. */
		label: string
		/** A leading glyph. */
		icon?: IconName
		/** Geist Mono, for a quantity or an id. */
		mono?: boolean
	}
	/** Turns the typed line into chips. Each domain supplies its own. */
	export type QuickAddParser = (text: string) => ParsedChip[]

	const QUANTITY = /(\d+(?:[.,]\d+)?)\s*(kg|g|lb|lbs|oz|ml|l|packets?|cans?|x)\b/i
	const LOCATION = /\b(fridge|freezer|pantry|counter)\b/i
	const WEEKDAY = /\b(mon|tue|wed|thu|fri|sat|sun)[a-z]*\b/i
	const TIME = /\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/i

	/**
	 * The demonstration parser, pure: a quantity with its unit as a mono chip, one of the four stock locations, a weekday
	 * and a time as one clock chip, and whatever is left as the name in front. "2 lb chicken thighs fridge" gives
	 * chicken thighs · 2 lb · fridge; "dentist thursday 3pm" gives dentist · Thu 15:00. The app's parser is per domain.
	 */
	export function defaultParse(text: string): ParsedChip[] {
		const chips: ParsedChip[] = []
		let rest = ` ${text} `
		const quantity = QUANTITY.exec(rest)
		if (quantity) {
			chips.push({ label: `${quantity[1]} ${quantity[2]!.toLowerCase()}`, mono: true })
			rest = rest.replace(quantity[0], ' ')
		}
		const location = LOCATION.exec(rest)
		if (location) {
			chips.push({ label: location[1]!.toLowerCase() })
			rest = rest.replace(location[0], ' ')
		}
		const day = WEEKDAY.exec(rest)
		const time = TIME.exec(rest)
		let clock = ''
		// a bare number is not a time: it needs minutes or a meridiem
		if (time && (time[2] || time[3])) {
			let hours = parseInt(time[1]!, 10)
			const meridiem = time[3]?.toLowerCase()
			if (meridiem === 'pm' && hours < 12) hours += 12
			if (meridiem === 'am' && hours === 12) hours = 0
			clock = `${String(hours).padStart(2, '0')}:${time[2] ?? '00'}`
			rest = rest.replace(time[0], ' ')
		}
		if (day) rest = rest.replace(day[0], ' ')
		const weekday = day ? day[1]![0]!.toUpperCase() + day[1]!.slice(1).toLowerCase() : ''
		const when = [weekday, clock].filter(Boolean).join(' ')
		if (when) chips.push({ label: when, icon: 'clock' })
		const name = rest.replace(/\s+/g, ' ').trim()
		if (name) chips.unshift({ label: name })
		return chips
	}
</script>

<script lang="ts">
	// The natural-language line at the top of every list (docs/design/ux-patterns.md, "Forms and quick-add"). As the
	// owner types, `parse` turns the line into accent chips: beneath the field, or trailing it on desktop when they fit
	// beside a usable field. Enter, or the + that appears once there is text, commits: `onadd(text, parsed)` fires and
	// the field clears; the caller shows the undo toast. It never opens a form: a line that does not parse is saved as a
	// name. The chrome is Field's InputWrap, so the two fields share one border and one ring; the input is controlled
	// (value plus oninput), as in Field.
	import type { HTMLInputAttributes } from 'svelte/elements'
	import { useStrings } from '../../i18n/context.js'
	import { platformOf } from '../../internal/platform.js'
	import Chip from '../Chip/Chip.svelte'
	import InputWrap from '../Field/InputWrap.svelte'
	import IconButton from '../IconButton/IconButton.svelte'

	type Props = Omit<
		HTMLInputAttributes,
		| 'value'
		| 'placeholder'
		| 'type'
		| 'id'
		| 'oninput'
		| 'onkeydown'
		| 'class'
		| 'children'
		| 'aria-label'
		| 'aria-describedby'
	> & {
		/** The hint in the empty field, and the input's accessible name, since a quick-add field never has a visible label. Defaults to "Add". */
		placeholder?: string
		/** The line as typed. Bindable. */
		value?: string
		/** Turns the line into chips. Defaults to the module's demonstration `defaultParse`; the app's parser is per domain. */
		parse?: QuickAddParser
		/** Called with the trimmed line and its chips on Enter or the + button, after which the field clears. */
		onadd?: (text: string, parsed: ParsedChip[]) => void
		/** The input's id; the chips container derives its id from it. */
		id?: string
		/** Called after the bound value has been updated. */
		oninput?: HTMLInputAttributes['oninput']
		/** Called after Enter has been handled. */
		onkeydown?: HTMLInputAttributes['onkeydown']
		class?: string
	}
	const uid = $props.id()
	let {
		placeholder,
		value = $bindable(''),
		parse = defaultParse,
		onadd,
		id = uid,
		oninput,
		onkeydown,
		class: className = '',
		...rest
	}: Props = $props()

	const s = useStrings()
	const hint = $derived(placeholder ?? s.add)
	const text = $derived(value.trim())
	const parsed = $derived(text ? parse(text) : [])
	const chipsId = $derived(`${id}-parsed`)

	// The root, for the platform: chips trail the field only on desktop; on mobile they always sit beneath.
	let root = $state<HTMLElement>()
	let field = $state<HTMLInputElement>()
	const stacked = $derived(root ? platformOf(root) === 'mobile' : false)

	function commit() {
		if (!text) return
		onadd?.(text, parsed)
		value = ''
	}
	function input(e: Event & { currentTarget: EventTarget & HTMLInputElement }) {
		value = e.currentTarget.value
		oninput?.(e)
	}
	function keydown(e: KeyboardEvent & { currentTarget: EventTarget & HTMLInputElement }) {
		// Enter commits, unless it is confirming an IME composition
		if (e.key === 'Enter' && !e.isComposing) {
			e.preventDefault()
			commit()
		}
		onkeydown?.(e)
	}
	function add() {
		commit()
		// the + goes away with the text; the next line starts in the field
		field?.focus()
	}
</script>

<div class={['ed-quickadd', { 'ed-quickadd-stacked': stacked }, className]} bind:this={root}>
	<InputWrap class="ed-quickadd-wrap">
		<input
			class="ed-quickadd-input"
			bind:this={field}
			{id}
			type="text"
			placeholder={hint}
			{value}
			aria-label={hint}
			aria-describedby={parsed.length ? chipsId : undefined}
			autocomplete="off"
			enterkeyhint="done"
			oninput={input}
			onkeydown={keydown}
			{...rest}
		/>
		{#if text}<IconButton icon="plus" label={s.add} size="sm" tooltip onclick={add} />{/if}
	</InputWrap>
	{#if parsed.length}
		<div class="ed-quickadd-parsed" id={chipsId}>
			{#each parsed as chip, i (`${chip.label}-${i}`)}
				<Chip label={chip.label} icon={chip.icon} mono={chip.mono} tone="accent" />
			{/each}
		</div>
	{/if}
</div>

<style>
	.ed-quickadd {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2);
		min-width: 0;
	}
	/* the field keeps a usable width; the chips trail it only when there is room for both, else they wrap beneath */
	.ed-quickadd > :global(.ed-quickadd-wrap) {
		flex: 1 1 calc(var(--space-8) * 7);
		min-width: 0;
	}
	.ed-quickadd-input {
		flex: 1;
		min-width: 0;
		height: 100%;
		margin: 0;
		padding: 0;
		border: 0;
		border-radius: 0;
		background: transparent;
		color: inherit;
		font: var(--ed-t-text);
		appearance: none;
		outline: none;
		box-shadow: none;
	}
	.ed-quickadd-input::placeholder {
		color: var(--text-tertiary);
	}
	.ed-quickadd-parsed {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-1);
		min-width: 0;
	}
	.ed-quickadd-stacked > :global(.ed-quickadd-wrap),
	.ed-quickadd-stacked .ed-quickadd-parsed {
		flex-basis: 100%;
	}
</style>
