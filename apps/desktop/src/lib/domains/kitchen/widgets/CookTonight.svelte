<script lang="ts">
	// The cook-tonight tile: the recipes with their time, and the one the expiring stock suggests noted beneath.
	import { t } from '@eden/shared/i18n'
	import WidgetRows from '$lib/shell/WidgetRows.svelte'
	import { kitchen } from '../store.svelte'

	const rows = $derived(
		kitchen.recipes.map((recipe) => ({
			id: recipe.id,
			text: recipe.name,
			note:
				recipe.id === kitchen.suggestedRecipe?.id && kitchen.expiringTomorrow
					? $t('garden.suggested', { values: { name: kitchen.expiringTomorrow.name.toLowerCase() } })
					: undefined,
			meta: $t('garden.minutes', { values: { minutes: recipe.minutes } }),
		}))
	)
</script>

<WidgetRows {rows} />
