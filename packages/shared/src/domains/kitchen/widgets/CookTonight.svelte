<script lang="ts">
	// The cook-tonight tile (product/domains/kitchen.md, "Garden widgets"): the recipes tonight's stock suggests, the
	// one that uses up what is about to expire first. Worked out here from the rows, with the safety filter (D-25) and
	// no model asked: a recipe that names something the owner avoids is never on the tile.
	import { cookTonight } from '../cook.js'
	import { t } from '../../../i18n/index.js'
	import { WidgetRows } from '@eden/ui-kit'
	import { forbidden } from '../safety.svelte.js'
	import { kitchen } from '../store.svelte.js'

	void forbidden.read()

	const rows = $derived(
		cookTonight(kitchen.recipes, kitchen.stock, forbidden.words)
			.slice(0, 3)
			.map(({ recipe, uses }) => ({
				id: recipe.id,
				text: recipe.name,
				note: uses.length
					? $t('garden.suggested', { values: { name: uses.map((name) => name.toLowerCase()).join(', ') } })
					: undefined,
				meta: recipe.minutes ? $t('garden.minutes', { values: { minutes: recipe.minutes } }) : undefined,
			}))
	)
</script>

<WidgetRows {rows} />
