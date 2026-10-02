<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf'
	import { expect, fn } from 'storybook/test'
	import { canvasOf } from '../../../storybook/play.js'
	import AddressForm, { type AddressFieldSpec, type AddressFormValue } from './AddressForm.svelte'
	import { addressCountries, addressForms, homeAddress, homeAddressJa } from '../../../stories/sample-data.js'

	type Country = keyof typeof addressForms
	const withErrors: AddressFieldSpec[][] = addressForms.US.rows.map((row) =>
		row.map((field) =>
			field.key === 'postalCode'
				? { ...field, error: 'Written like 78751.' }
				: field.key === 'city'
					? { ...field, error: 'Needed to save.' }
					: field
		)
	)

	const { Story } = defineMeta({
		title: 'Components/Inputs/AddressForm',
		component: AddressForm,
		tags: ['autodocs'],
		args: {
			value: homeAddress,
			country: 'US',
			countries: addressCountries,
			...addressForms.US,
			oncountry: fn(),
			onblurfield: fn(),
		},
	})
</script>

<script lang="ts">
	// The app resolves the fields for the country in hand; the story stands in for it with the sample table.
	let address = $state<AddressFormValue>({ ...homeAddress })
	const country = $derived((address.country ?? 'US') as Country)
	const form = $derived(addressForms[country] ?? addressForms.BR)
</script>

<Story
	name="United States"
	play={async ({ canvasElement, userEvent, args }) => {
		const canvas = canvasOf(canvasElement)
		await expect(canvas.getByRole('combobox', { name: 'Country or region' })).toHaveValue('US')
		await expect(canvas.getByRole('combobox', { name: 'State' })).toHaveValue('TX')
		const zip = canvas.getByRole('textbox', { name: 'ZIP code' })
		await expect(zip).toHaveValue('78751')
		await expect(zip).toHaveAttribute('autocomplete', 'postal-code')
		await expect(canvas.getByRole('textbox', { name: 'City' })).toHaveAttribute('aria-required', 'true')
		await userEvent.click(zip)
		await userEvent.tab()
		await expect(args.onblurfield).toHaveBeenLastCalledWith('postalCode')
	}}
/>

<!-- Japan asks the postal code and the prefecture first, and the labels arrive in the language in hand -->
<Story
	name="Japan"
	args={{ value: homeAddressJa, country: 'JP', ...addressForms.JP }}
	play={async ({ canvasElement }) => {
		const canvas = canvasOf(canvasElement)
		const labels = [...canvasElement.querySelectorAll('.ed-canvas label')].map((label) => label.textContent)
		await expect(labels).toEqual(['国または地域', '郵便番号', '都道府県', '市区町村', '町名・番地', '建物名・部屋番号'])
		await expect(canvas.getByRole('combobox', { name: '都道府県' })).toHaveValue('13')
	}}
/>

<Story
	name="Germany"
	args={{
		value: { country: 'DE', line1: 'Hauptstraße 12', postalCode: '10115', city: 'Berlin' },
		country: 'DE',
		...addressForms.DE,
	}}
/>

<!-- A country with no layout of its own: every part is asked, the region as plain text -->
<Story
	name="Generic"
	args={{
		value: { country: 'BR', line1: 'Rua Augusta 100', city: 'São Paulo', region: 'SP' },
		country: 'BR',
		...addressForms.BR,
	}}
/>

<Story
	name="Errors"
	args={{ value: { country: 'US', line1: '4301 Duval St', postalCode: '7875' }, rows: withErrors }}
	play={async ({ canvasElement }) => {
		const canvas = canvasOf(canvasElement)
		await expect(canvas.getByRole('textbox', { name: 'ZIP code' })).toHaveAccessibleDescription('Written like 78751.')
		await expect(canvas.getByRole('textbox', { name: 'City' })).toHaveAttribute('aria-invalid', 'true')
	}}
/>

<!-- Choosing another country changes the fields and keeps what was typed; coming back shows it all again -->
<Story
	name="Country switch"
	play={async ({ canvasElement, userEvent, args }) => {
		const canvas = canvasOf(canvasElement)
		const countries = canvas.getByRole('combobox', { name: 'Country or region' })
		await userEvent.type(canvas.getByRole('textbox', { name: 'Apartment, suite or unit' }), 'Apt 2')
		await userEvent.selectOptions(countries, 'DE')
		await expect(args.oncountry).toHaveBeenLastCalledWith('DE')
		await expect(canvas.queryByRole('combobox', { name: 'State' })).toBeNull()
		await expect(canvas.getByRole('textbox', { name: 'Postal code' })).toHaveValue('78751')
		await expect(canvas.getByRole('textbox', { name: 'City' })).toHaveValue('Austin')
		await userEvent.selectOptions(countries, 'US')
		await expect(canvas.getByRole('combobox', { name: 'State' })).toHaveValue('TX')
		await expect(canvas.getByRole('textbox', { name: 'Apartment, suite or unit' })).toHaveValue('Apt 2')
	}}
>
	{#snippet template(args)}
		<AddressForm {...args} bind:value={address} {country} {...form} />
	{/snippet}
</Story>

<Story name="Disabled" args={{ disabled: true }} />
