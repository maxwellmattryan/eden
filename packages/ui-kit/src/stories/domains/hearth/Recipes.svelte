<script lang="ts">
	// Hearth's Recipes view (product/domains/kitchen.md, "Surfaces"): the header with the Recipes tab selected and Add
	// a recipe as its one action, the recipes on the left in tonight's order (what uses up the expiring stock first),
	// and the selected one in the pane on the right with each ingredient marked in stock, missing or not enough. From
	// the pane a recipe is cooked (the stock is decremented, and a unit the item's cannot be taken from is a question),
	// its missing ingredients go to the grocery list, and it is edited. A recipe on its way in opens in the pane as a
	// form and is stored only when it is saved there; Add a recipe is a sheet that takes its text, a link or a photo.
	// Desktop only in Phase 1. What the pane says of the stock is worked out below from the sample rows; the app reads
	// the same from `@eden/shared/domains/kitchen`.
	import {
		Badge,
		Button,
		Chip,
		Dropzone,
		EmptyState,
		Field,
		FileButton,
		IconButton,
		List,
		PageHeader,
		Segmented,
		Sheet,
		Sketch,
		domainGlyph,
		hearthEmbers,
		type ListRowData,
		type MenuItem,
	} from '$lib/index.js'
	import AppFrame from '../_frame/AppFrame.svelte'
	import {
		haul,
		hearthMotif,
		recipeDraft,
		recipes,
		sidebar,
		stock,
		type RecipeIngredient,
		type SampleRecipe,
		type StockItem,
	} from '../../sample-data.js'

	type Mode = 'view' | 'edit' | 'cook'
	type RecipeFields = Omit<SampleRecipe, 'id' | 'inStock'>

	type Props = {
		/** The recipe open in the pane; without it, the first in tonight's order. */
		selected?: string
		/** The pane over a saved recipe: as it reads, its form, or the questions cooking it asks. */
		mode?: Mode
		/** An unsaved recipe is in the pane, as a form to check. */
		draft?: boolean
		/** No recipes at all: the EmptyState in place of the list and the pane. */
		empty?: boolean
		/** The Add a recipe sheet is open, with a link pasted into it. */
		importing?: boolean
		/** Add a recipe: the header's action and the empty state's. */
		onadd?: () => void
		onopen?: (row: ListRowData) => void
		onaction?: (item: MenuItem, row: ListRowData) => void
		/** Cook this, and then I cooked this once its questions are answered. */
		oncook?: (id: string) => void
		oncooked?: (id: string) => void
		/** Add the missing ingredients to the grocery list, by name. */
		onmissing?: (id: string, names: string[]) => void
		/** Save in the pane's form: a recipe's id, or nothing for a draft. */
		onsave?: (id?: string) => void
		ondiscard?: () => void
		/** Read, in the sheet, with what was pasted. */
		onread?: (text: string) => void
		onfiles?: (files: File[]) => void
		onsource?: (url: string) => void
		onsample?: () => void
		onnavigate?: (id: string) => void
	}
	let {
		selected,
		mode = 'view',
		draft = false,
		empty = false,
		importing = false,
		onadd,
		onopen,
		onaction,
		oncook,
		oncooked,
		onmissing,
		onsave,
		ondiscard,
		onread,
		onfiles,
		onsource,
		onsample,
		onnavigate,
	}: Props = $props()

	const uid = $props.id()
	const hearth = sidebar.items.find((entry) => entry.id === 'kitchen')!
	const TABS = ['Stock', 'Recipes', 'Grocery']
	const saved: readonly SampleRecipe[] = recipes
	/** Today is Wednesday 09-30; anything dated on or before Friday counts as expiring. */
	const SOON = '10-02'
	const ACCEPT = ['image/*', 'application/pdf', '.pdf']
	const rowActions: MenuItem[] = [
		{ id: 'edit', label: 'Edit', icon: 'pencil' },
		{ id: 'delete', label: 'Delete', icon: 'trash', destructive: true },
	]

	/** An ingredient as a recipe prints it: the amount, the name, and the note after a comma. */
	const formatIngredient = (line: RecipeIngredient) =>
		[[line.qty, line.unit, line.name].filter(Boolean).join(' '), line.note].filter(Boolean).join(', ')
	const quantity = (item: StockItem) => (item.unit ? `${item.qty} ${item.unit}` : item.qty)
	/** A name as it is compared: lower case, nothing in brackets. */
	const plain = (name: string) =>
		name
			.toLowerCase()
			.replace(/\([^)]*\)/g, '')
			.trim()
	const stockFor = (name: string) => stock.find((item) => plain(item.name) === plain(name))
	/** Grams and millilitres in the units the sample uses; one the table does not know compares only with itself. */
	const UNITS: Record<string, { dim: string; per: number }> = {
		'': { dim: 'count', per: 1 },
		g: { dim: 'mass', per: 1 },
		kg: { dim: 'mass', per: 1000 },
		ml: { dim: 'volume', per: 1 },
		tbsp: { dim: 'volume', per: 14.7868 },
	}
	const unitOf = (unit = '') => UNITS[unit] ?? { dim: unit, per: 1 }
	/** What an item holds after a line took from it, in the item's own unit; nothing when the units do not agree. */
	function rest(item: StockItem, line: RecipeIngredient): number | undefined {
		const [held, needed] = [unitOf(item.unit), unitOf(line.unit)]
		if (held.dim !== needed.dim) return undefined
		return Math.round(((Number(item.qty) * held.per - Number(line.qty) * needed.per) / held.per) * 100) / 100
	}

	/** Each ingredient against the stock: the item that covers it, and whether it holds enough where that can be told. */
	const statusOf = (recipe: SampleRecipe) =>
		recipe.ingredients.map((ingredient) => {
			const item = stockFor(ingredient.name)
			const left = item ? rest(item, ingredient) : undefined
			return { ingredient, item, enough: left === undefined ? undefined : left >= 0 }
		})
	const missingOf = (recipe: SampleRecipe) => statusOf(recipe).filter((line) => !line.item)
	/** The expiring items a recipe uses up, by name. */
	const usesOf = (recipe: SampleRecipe) => [
		...new Set(
			statusOf(recipe)
				.filter((line) => line.item?.expiry && line.item.expiry <= SOON)
				.map((line) => line.item!.name)
		),
	]
	// Tonight's order: what uses up the most of the expiring stock, then what misses least, then the quickest.
	const ordered = [...saved].sort(
		(a, b) => usesOf(b).length - usesOf(a).length || missingOf(a).length - missingOf(b).length || a.minutes - b.minutes
	)
	const toRow = (recipe: SampleRecipe): ListRowData => {
		const uses = usesOf(recipe)
		const missing = missingOf(recipe).length
		return {
			id: recipe.id,
			primary: recipe.name,
			hint: recipe.tip,
			secondary: uses.length ? `Uses up ${uses.join(', ')}` : undefined,
			chips: [{ label: `${recipe.minutes} min`, mono: true }, ...recipe.tags.map((tag) => ({ label: tag }))],
			meta: missing ? `${missing} missing` : 'in stock',
			actions: rowActions,
		}
	}

	// The pane: the recipe that is open, and how it is shown.
	// svelte-ignore state_referenced_locally
	let current = $state(selected)
	// svelte-ignore state_referenced_locally
	let pane = $state(mode)
	// svelte-ignore state_referenced_locally
	let drafting = $state(draft)
	const detail = $derived(ordered.find((recipe) => recipe.id === current) ?? ordered[0])
	const status = $derived(detail ? statusOf(detail) : [])
	const missing = $derived(status.filter((line) => !line.item))

	// Cooking: what is taken where the units agree, and a question where they do not (cloves from a head).
	const plan = $derived(
		status.map(({ ingredient, item }) => {
			if (!item) return { ingredient, state: 'skip' as const }
			const left = rest(item, ingredient)
			if (left === undefined) return { ingredient, item, state: 'ask' as const }
			return {
				ingredient,
				item,
				state: 'subtract' as const,
				after: quantity({ ...item, qty: String(Math.max(0, left)) }),
				empty: left <= 0,
			}
		})
	)
	/** The answer to each question, by the ingredient's place in the plan: the item was used up, or left. */
	let usedUp = $state<Record<number, boolean>>({})
	function cook(recipe: SampleRecipe) {
		oncook?.(recipe.id)
		usedUp = {}
		if (plan.some((line) => line.state === 'ask')) pane = 'cook'
	}

	// A recipe's fields as the form holds them: the ingredients and the steps are text, one to a line.
	const formOf = (recipe?: RecipeFields) => ({
		name: recipe?.name ?? '',
		serves: recipe ? String(recipe.serves) : '',
		minutes: recipe ? String(recipe.minutes) : '',
		tags: recipe?.tags.join(', ') ?? '',
		ingredients: recipe?.ingredients.map(formatIngredient).join('\n') ?? '',
		steps: recipe?.steps.join('\n') ?? '',
		tip: recipe?.tip ?? '',
		sourceUrl: recipe?.sourceUrl ?? '',
	})
	// svelte-ignore state_referenced_locally
	let form = $state(formOf(draft ? recipeDraft : (saved.find((recipe) => recipe.id === selected) ?? ordered[0])))
	const ready = $derived(form.name.trim().length > 0 && form.ingredients.trim().length > 0)
	function edit(id: string) {
		current = id
		form = formOf(saved.find((recipe) => recipe.id === id))
		pane = 'edit'
	}
	function act(item: MenuItem, row: ListRowData) {
		if (item.id === 'edit') edit(row.id)
		onaction?.(item, row)
	}
	const host = (url: string) => {
		try {
			return new URL(url).hostname.replace(/^www\./, '')
		} catch {
			return url
		}
	}

	// Add a recipe: the sheet, with the link the Import story pastes into it.
	// svelte-ignore state_referenced_locally
	let sheetOpen = $state(importing)
	// svelte-ignore state_referenced_locally
	let pasted = $state(importing ? recipeDraft.sourceUrl : '')
	const link = $derived(/^https:\/\/\S+$/i.test(pasted.trim()))
	function add() {
		onadd?.()
		sheetOpen = true
	}

	const headerActions = $derived([
		{
			label: 'Add a recipe',
			icon: 'plus' as const,
			variant: empty && !drafting ? ('secondary' as const) : undefined,
			onclick: add,
		},
	])
</script>

{#snippet recipeForm(title: string, cancelLabel: string, note?: string)}
	<h2 class="detail-title" id="{uid}-detail">{title}</h2>
	{#if note}<p class="quiet">{note}</p>{/if}
	<form
		class="form"
		onsubmit={(event) => {
			event.preventDefault()
			onsave?.(drafting ? undefined : detail?.id)
			drafting = false
			pane = 'view'
		}}
	>
		<Field label="Name" bind:value={form.name} />
		<div class="pair">
			<Field label="Serves" bind:value={form.serves} mono inputmode="numeric" />
			<Field label="Time" unit="min" bind:value={form.minutes} mono inputmode="numeric" />
		</div>
		<Field
			label="Ingredients"
			helper="One to a line, the amount first: 200 g spinach, washed."
			bind:value={form.ingredients}
			multiline
			rows={6}
		/>
		<Field label="Steps" helper="One to a line, in order." bind:value={form.steps} multiline rows={6} />
		<Field label="Tags" helper="Separated by commas: weeknight, one pot." bind:value={form.tags} />
		<Field label="Tip" bind:value={form.tip} multiline rows={2} />
		<Field label="Source" bind:value={form.sourceUrl} type="url" />
		<div class="detail-actions">
			<Button label="Save" variant="primary" type="submit" disabled={!ready} />
			<Button
				label={cancelLabel}
				variant="quiet"
				onclick={() => {
					if (drafting) ondiscard?.()
					drafting = false
					pane = 'view'
				}}
			/>
		</div>
	</form>
{/snippet}

<AppFrame current="kitchen" {onnavigate}>
	{#snippet children(_platform)}
		<div class="page">
			<PageHeader name={hearth.name} subtitle={hearth.subtitle} icon={domainGlyph('kitchen')} actions={headerActions}>
				<!-- the page's one live thing (D-123): the stock as sparks off a fire, the same on every tab -->
				{#snippet motif()}
					<Sketch sketch={hearthEmbers} params={hearthMotif} />
				{/snippet}
				{#snippet legend()}
					{hearthMotif.items} in stock, {hearthMotif.expiring} expiring soon
				{/snippet}
				{#snippet filters()}
					<Segmented items={TABS} selected={1} label="Hearth sections" />
				{/snippet}
			</PageHeader>

			{#if empty && !drafting}
				<EmptyState
					title="No recipes yet"
					text="Paste a recipe or a link to one, or bring a photo of the page. The Gardener can save a dish it suggests, too."
					action={{ label: 'Add a recipe', icon: 'plus', onclick: add }}
					sample={{ onclick: onsample }}
				/>
			{:else}
				<div class="body">
					<div class="lists">
						{#if !empty}
							<List
								header="Recipes"
								count={ordered.length}
								rows={ordered.map(toRow)}
								onopen={(row) => {
									current = row.id
									pane = 'view'
									onopen?.(row)
								}}
								onaction={act}
							/>
						{/if}
					</div>

					{#if drafting}
						<aside class="detail" aria-labelledby="{uid}-detail">
							{@render recipeForm('New recipe', 'Discard', 'Not saved yet. Check it over, then save it.')}
						</aside>
					{:else if detail && pane === 'edit'}
						<aside class="detail" aria-labelledby="{uid}-detail">
							{@render recipeForm('Edit recipe', 'Cancel')}
						</aside>
					{:else if detail && pane === 'cook'}
						<aside class="detail" aria-labelledby="{uid}-detail">
							<h2 class="detail-title" id="{uid}-detail">Cooking {detail.name}</h2>
							<p class="quiet">
								This is what cooking takes from the stock. Answer where the recipe's unit cannot be taken from the
								item's.
							</p>
							<ul class="lines">
								{#each plan as line, index (index)}
									<li class="line">
										<span class="line-text">{formatIngredient(line.ingredient)}</span>
										{#if line.state === 'subtract'}
											<span class="line-change">
												{line.item.name}: {quantity(line.item)} → {line.empty ? 'none left' : line.after}
											</span>
										{:else if line.state === 'ask'}
											<span class="line-change">{line.item.name}: {quantity(line.item)} in stock</span>
											<span class="choices" role="radiogroup" aria-label={line.item.name}>
												<Chip
													label="Leave it"
													tone={usedUp[index] ? 'outline' : 'accent'}
													role="radio"
													aria-checked={!usedUp[index]}
													onclick={() => (usedUp[index] = false)}
												/>
												<Chip
													label="Used it up"
													tone={usedUp[index] ? 'accent' : 'outline'}
													role="radio"
													aria-checked={!!usedUp[index]}
													onclick={() => (usedUp[index] = true)}
												/>
											</span>
										{:else}
											<span class="line-change quiet">not in stock</span>
										{/if}
									</li>
								{/each}
							</ul>
							<div class="detail-actions">
								<Button
									label="I cooked this"
									variant="primary"
									onclick={() => {
										oncooked?.(detail.id)
										pane = 'view'
									}}
								/>
								<Button label="Cancel" variant="quiet" onclick={() => (pane = 'view')} />
							</div>
						</aside>
					{:else if detail}
						<aside class="detail" aria-labelledby="{uid}-detail">
							<div class="detail-head">
								<h2 class="detail-title" id="{uid}-detail">{detail.name}</h2>
								{#if detail.tip}
									<IconButton icon="info" size="xs" label="A tip for {detail.name}" tooltip={detail.tip} />
								{/if}
							</div>
							<div class="chips">
								<Chip label="Serves {detail.serves}" />
								<Chip label="{detail.minutes} min" icon="clock" />
								{#each detail.tags as tag (tag)}
									<Chip label={tag} tone="outline" />
								{/each}
								{#if detail.sourceUrl}
									<Chip
										label={host(detail.sourceUrl)}
										tone="outline"
										icon="external-link"
										onclick={() => onsource?.(detail.sourceUrl!)}
									/>
								{/if}
							</div>
							<section class="part" aria-labelledby="{uid}-ingredients">
								<h3 class="part-title" id="{uid}-ingredients">Ingredients</h3>
								<ul class="lines">
									{#each status as line, index (index)}
										<li class="line">
											<span class="line-text">{formatIngredient(line.ingredient)}</span>
											{#if !line.item}
												<Badge kind="warning" label="missing" />
											{:else if line.enough === false}
												<Badge kind="warning" label="not enough" />
											{:else}
												<Badge kind="neutral" label="in stock" />
											{/if}
										</li>
									{/each}
								</ul>
							</section>
							<section class="part" aria-labelledby="{uid}-steps">
								<h3 class="part-title" id="{uid}-steps">Steps</h3>
								<ol class="steps">
									{#each detail.steps as step, index (index)}
										<li>{step}</li>
									{/each}
								</ol>
							</section>
							<div class="detail-actions">
								<Button label="Cook this" icon="cooking-pot" onclick={() => cook(detail)} />
								<Button
									label={missing.length ? `Add ${missing.length} missing to grocery` : 'Add missing to grocery'}
									icon="plus"
									disabled={!missing.length}
									onclick={() =>
										onmissing?.(
											detail.id,
											missing.map((line) => line.ingredient.name)
										)}
								/>
								<Button label="Edit" icon="pencil" onclick={() => edit(detail.id)} />
								<Button
									label="Delete"
									variant="danger"
									icon="trash"
									onclick={() => onaction?.(rowActions[1]!, toRow(detail))}
								/>
							</div>
						</aside>
					{/if}
				</div>
			{/if}

			<Sheet bind:open={sheetOpen} size="md" labelledby="{uid}-import">
				{#snippet header()}
					<h2 class="sheet-title" id="{uid}-import">Add a recipe</h2>
				{/snippet}
				<Dropzone accept={ACCEPT} ondrop={(accepted) => onfiles?.(accepted)}>
					<div class="sheet-body">
						<Field
							label="The recipe, or a link to it"
							placeholder="Paste the recipe's text or a link, or drop a photo of the page"
							helper={link
								? 'The page is fetched first. When it describes its own recipe, that is read with no model asked.'
								: 'A photo of a page or a card works too: drop it here, paste it, or choose it.'}
							bind:value={pasted}
							multiline
							rows={6}
						/>
						<div class="files">
							<FileButton
								label="Choose a photo or a file"
								icon="camera"
								accept={ACCEPT}
								multiple
								tooltip
								onfiles={(files) => onfiles?.(files)}
							/>
						</div>
					</div>
				</Dropzone>
				{#snippet footer()}
					<p class="reader" role="status">{haul.provider} · {haul.model} · {haul.cost}</p>
					<Button label="Cancel" variant="quiet" onclick={() => (sheetOpen = false)} />
					<Button
						label="Read"
						variant="primary"
						disabled={!pasted.trim()}
						onclick={() => {
							onread?.(pasted.trim())
							sheetOpen = false
						}}
					/>
				{/snippet}
			</Sheet>
		</div>
	{/snippet}
</AppFrame>

<style>
	.page {
		display: flex;
		flex-direction: column;
		padding-bottom: var(--space-8);
	}
	/* The recipes on the left and the one that is open on the right */
	.body {
		display: grid;
		grid-template-columns: minmax(0, 2fr) minmax(0, 3fr);
		align-items: start;
		gap: var(--space-6);
		padding: 0 var(--ed-gutter);
	}
	.lists {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
		min-width: 0;
	}

	.detail {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
		box-sizing: border-box;
		min-width: 0;
		padding: var(--space-4);
		border: 1px solid var(--ed-card-border);
		border-radius: var(--ed-radius-card);
		background: var(--surface-1);
		box-shadow: var(--shadow-card);
	}
	.detail-head {
		display: flex;
		align-items: center;
		gap: var(--space-2);
	}
	.detail-title {
		margin: 0;
		font: var(--ed-t-display-sm);
		letter-spacing: var(--ed-t-display-sm-tracking);
		font-variation-settings: var(--ed-t-display-sm-opsz);
		text-wrap: balance;
	}
	.chips,
	.detail-actions,
	.choices {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
	}
	.quiet {
		margin: 0;
		font: var(--ed-t-body-sm);
		letter-spacing: var(--ed-t-body-sm-tracking);
		color: var(--text-secondary);
	}
	.part {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}
	.part-title {
		margin: 0;
		font: var(--ed-t-label);
		letter-spacing: var(--ed-t-label-tracking);
		color: var(--text-secondary);
	}
	/* One ingredient to a line: what it is, then where it stands */
	.lines {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.line {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-1) var(--space-2);
		font: var(--ed-t-body);
		letter-spacing: var(--ed-t-body-tracking);
	}
	.line-text {
		flex: 1 1 auto;
		min-width: 0;
	}
	.line-change {
		font: var(--ed-t-data-sm);
		letter-spacing: var(--ed-t-data-sm-tracking);
		font-variant-numeric: tabular-nums;
		color: var(--text-secondary);
	}
	.steps {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		margin: 0;
		padding-left: var(--space-6);
		list-style: decimal outside;
		font: var(--ed-t-body);
		letter-spacing: var(--ed-t-body-tracking);
		text-wrap: pretty;
	}

	/* The form: a draft to check, or a saved recipe being changed */
	.form {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}
	.pair {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
		gap: var(--space-3);
	}

	/* The Add a recipe sheet */
	.sheet-title {
		margin: 0;
		font: var(--ed-t-title);
		letter-spacing: var(--ed-t-title-tracking);
		font-variation-settings: var(--ed-t-title-opsz);
	}
	.sheet-body {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}
	.files {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2);
	}
	.reader {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		margin: 0 auto 0 0;
		font: var(--ed-t-caption);
		letter-spacing: var(--ed-t-caption-tracking);
		color: var(--text-secondary);
	}
</style>
