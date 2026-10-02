<script lang="ts" module>
	import type { SelectGroup, SelectOption } from '../Select/Select.svelte'

	/** The parts of an address other than its country. */
	export type AddressFormKey = 'line1' | 'line2' | 'city' | 'region' | 'postalCode'
	/** The address being written: its country's code and whichever parts have been typed. */
	export type AddressFormValue = Partial<Record<AddressFormKey | 'country', string>>

	/** One field of the form: which part it writes, and how the country in hand asks for it. */
	export interface AddressFieldSpec {
		key: AddressFormKey
		label: string
		required?: boolean
		error?: string
		placeholder?: string
		autocomplete?: string
		inputmode?: 'numeric' | 'text'
		autocapitalize?: 'characters' | 'words'
		/** A fixed list to choose from in place of typing. */
		options?: SelectOption[]
	}
</script>

<script lang="ts">
	// A postal address as its country asks for it: the country, then that country's fields in its own order, two to
	// a row where they pair. The form knows no country and holds no copy; which fields there are, what each is called
	// and what is wrong with one all arrive as `rows`, resolved by the app for the country in hand. Choosing another
	// country keeps everything typed, under the same keys: a part the new country does not ask is only hidden, and
	// comes back if the owner changes their mind.
	import type { FullAutoFill } from 'svelte/elements'
	import Field from '../Field/Field.svelte'
	import Select from '../Select/Select.svelte'

	type Props = {
		/** The address. Bindable; each field writes its own key. */
		value: AddressFormValue
		/** The country shown as chosen: the address's own, or the one the app starts a new address in. */
		country: string
		/** The countries to choose from, flat or under headings. */
		countries: (SelectOption | SelectGroup)[]
		/** The country select's label. */
		countryLabel: string
		/** The chosen country's fields, a row at a time. */
		rows: AddressFieldSpec[][]
		disabled?: boolean
		/** Called with the new country's code after the value has taken it. */
		oncountry?: (country: string) => void
		/** Called when a field is left, so the app can say what is wrong with it only then. */
		onblurfield?: (key: AddressFormKey) => void
		class?: string
	}
	let {
		value = $bindable(),
		country,
		countries,
		countryLabel,
		rows,
		disabled = false,
		oncountry,
		onblurfield,
		class: className = '',
	}: Props = $props()

	function choose(code: string) {
		if (!code) return
		value.country = code
		oncountry?.(code)
	}
</script>

<div class="ed-address {className}">
	<Select
		label={countryLabel}
		value={country}
		options={countries}
		{disabled}
		autocomplete="country"
		onchange={choose}
	/>
	{#each rows as row (row.map((field) => field.key).join('+'))}
		<div class="ed-address-row">
			{#each row as field (field.key)}
				{#if field.options}
					<Select
						label={field.label}
						bind:value={value[field.key]}
						options={field.options}
						placeholder={field.placeholder ?? ''}
						error={field.error}
						{disabled}
						autocomplete={field.autocomplete as FullAutoFill}
						aria-required={field.required ? 'true' : undefined}
						onblur={() => onblurfield?.(field.key)}
					/>
				{:else}
					<Field
						label={field.label}
						bind:value={value[field.key]}
						placeholder={field.placeholder}
						error={field.error}
						{disabled}
						autocomplete={field.autocomplete as FullAutoFill}
						inputmode={field.inputmode}
						autocapitalize={field.autocapitalize}
						aria-required={field.required ? 'true' : undefined}
						onblur={() => onblurfield?.(field.key)}
					/>
				{/if}
			{/each}
		</div>
	{/each}
</div>

<style>
	.ed-address {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
		min-width: 0;
	}
	/* Two to a row where there is room for two, one above the other where there is not: no breakpoint decides it */
	.ed-address-row {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(calc(var(--space-8) * 4), 1fr));
		gap: var(--space-4);
	}
</style>
