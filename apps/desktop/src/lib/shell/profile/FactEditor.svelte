<script lang="ts">
	// The fact editor, a small centred sheet: first what the fact is about, from the types the owner may assert
	// grouped by owner, then the fields the type's shape asks for (`@eden/shared/profile`, `FACT_SHAPES`), a note
	// and the window it holds in. A single-valued type that already has a row opens that row instead. Save is
	// offered once the value fits; editing what a domain or the Gardener wrote makes the fact the owner's own.
	import { untrack } from 'svelte'
	import { Badge, Button, Chip, Field, Segmented, Sheet } from '@eden/ui-kit'
	import { t } from '@eden/shared/i18n'
	import {
		FACT_SHAPES,
		LIVE_FACT_TYPES,
		optionKey,
		validateValue,
		type Fact,
		type LiveFactId,
		type ValueShape,
	} from '@eden/shared/profile'
	import { ownerOf, tierOf } from '@eden/shared/registry'
	import { undoToast } from '@eden/shared/shell'
	import { profile } from '@eden/shared/shell/profile'

	type Props = {
		/** Bindable. */
		open?: boolean
		/** The fact to edit; none to add one. */
		fact?: Fact
		/** Opens on the window fields, for "Set a window". */
		focusWindow?: boolean
	}
	let { open = $bindable(false), fact, focusWindow = false }: Props = $props()

	/** Up to this many options fit a Segmented; more become chips. */
	const SEGMENTED_MAX = 5
	const OWNER_ORDER = ['substrate', 'kitchen', 'toolbench', 'health']

	// The editor is made anew each time it opens (`{#key}` in Profile.svelte), so the fact it starts from is read once.
	const given = untrack(() => fact)
	let editing = $state<Fact | undefined>(given)
	let type = $state<LiveFactId | undefined>(given?.type as LiveFactId | undefined)
	/** The text of each field, by path: '' for the value itself, a key inside an object, `name` and `weight` of a
	 * weighted value. */
	let text = $state<Record<string, string>>({})
	/** The chosen option of each enum field, by path. */
	let picked = $state<Record<string, string>>({})
	let note = $state(given?.note ?? '')
	let validFrom = $state(given?.validFrom ?? '')
	let validUntil = $state(given?.validUntil ?? '')

	const shape = $derived(type ? FACT_SHAPES[type].shape : undefined)
	const typeName = (id: string) => $t(`profile.facts.${id}`)
	const ownerName = (owner: string) =>
		owner === 'substrate' || owner === 'health' ? $t(`profile.owners.${owner}`) : $t(`domains.${owner}.name`)

	/** The types the owner may assert, by owner in the page's order; the substrate's derived type stays out. */
	const choices = $derived.by(() => {
		const groups: { owner: string; label: string; ids: LiveFactId[] }[] = []
		for (const id of LIVE_FACT_TYPES) {
			if (FACT_SHAPES[id].derived) continue
			const owner = ownerOf(id)
			const group = groups.find((entry) => entry.owner === owner)
			if (group) group.ids.push(id)
			else groups.push({ owner, label: ownerName(owner), ids: [id] })
		}
		return groups.sort((a, b) => OWNER_ORDER.indexOf(a.owner) - OWNER_ORDER.indexOf(b.owner))
	})

	function fill(shape: ValueShape, value: unknown, path: string) {
		switch (shape.kind) {
			case 'string':
			case 'integer':
				text[path] = value === undefined || value === null ? '' : String(value)
				return
			case 'enum':
				if (typeof value === 'string' && shape.options.includes(value)) picked[path] = value
				else if (typeof value === 'string') {
					picked[path] = ''
					text[path] = value
				}
				return
			case 'weighted': {
				const record = (value ?? {}) as Record<string, unknown>
				text[`${path}.name`] = typeof record.name === 'string' ? record.name : ''
				text[`${path}.weight`] = typeof record.weight === 'number' ? String(Math.round(record.weight * 100)) : '50'
				return
			}
			case 'object': {
				const record = (value ?? {}) as Record<string, unknown>
				for (const field of shape.fields) fill(field.shape, record[field.key], field.key)
				return
			}
		}
	}

	/** Every path the shape asks for starts as text, empty or its default, so each field has something to bind to. */
	function reset(shape: ValueShape, path: string) {
		switch (shape.kind) {
			case 'string':
			case 'integer':
				text[path] = ''
				return
			case 'enum':
				text[path] = ''
				picked[path] = shape.options.length <= SEGMENTED_MAX ? (shape.options[0] ?? '') : ''
				return
			case 'weighted':
				text[`${path}.name`] = ''
				text[`${path}.weight`] = '50'
				return
			case 'object':
				for (const field of shape.fields) reset(field.shape, field.key)
				return
		}
	}

	function build(shape: ValueShape, path: string): unknown {
		switch (shape.kind) {
			case 'string': {
				const word = (text[path] ?? '').trim()
				return word || undefined
			}
			case 'integer': {
				const word = (text[path] ?? '').trim()
				return word ? Number(word) : undefined
			}
			case 'enum': {
				const option = picked[path]
				if (option) return option
				const custom = (text[path] ?? '').trim()
				return shape.custom && custom ? custom : undefined
			}
			case 'weighted': {
				const name = (text[`${path}.name`] ?? '').trim()
				const weight = Number(text[`${path}.weight`] ?? '')
				return { name, weight: Number.isFinite(weight) ? weight / 100 : NaN }
			}
			case 'object': {
				const record: Record<string, unknown> = {}
				for (const field of shape.fields) {
					const part = build(field.shape, field.key)
					if (part !== undefined) record[field.key] = part
				}
				return record
			}
		}
	}

	const value = $derived(shape ? build(shape, '') : undefined)
	const problem = $derived(type ? validateValue(type, value) : 'no type')
	const windowProblem = $derived(validFrom && validUntil && validFrom > validUntil)
	const canSave = $derived(!problem && !windowProblem)

	/** A type chosen from the list: a single-valued type with a row opens that row. */
	function choose(id: LiveFactId) {
		const existing = FACT_SHAPES[id].multi ? undefined : profile.liveOf(id)
		if (existing && existing.provenance !== 'system-derived') {
			editing = existing
			note = existing.note ?? ''
			validFrom = existing.validFrom ?? ''
			validUntil = existing.validUntil ?? ''
		}
		type = id
		text = {}
		picked = {}
		reset(FACT_SHAPES[id].shape, '')
		if (editing) fill(FACT_SHAPES[id].shape, editing.value, '')
	}
	if (given) choose(given.type as LiveFactId)

	/** Whether the quiet button steps back to the list of types: only while adding, once a type is chosen. On the
	 * list itself, and when editing a fact, there is nothing behind the sheet's step, so the button cancels. */
	const canStepBack = $derived(type !== undefined && !editing)

	/** The quiet button: back to the list of types, or out of the sheet. Its label and what it does share one test. */
	function leave() {
		if (canStepBack) type = undefined
		else open = false
	}

	function save() {
		if (!type || !canSave) return
		const name = typeName(type)
		const window = { validFrom: validFrom || null, validUntil: validUntil || null }
		if (editing) {
			const patch = {
				value,
				note: note.trim() || null,
				...window,
				...(editing.provenance === 'user-asserted' ? {} : { provenance: 'user-asserted' as const }),
			}
			undoToast($t('profile.toast.changed', { values: { name } }), profile.update(editing.id, patch, name))
		} else {
			const { undo } = profile.assert(
				{ type, value, provenance: 'user-asserted', note: note.trim() || null, ...window },
				name
			)
			undoToast($t('profile.toast.added', { values: { name } }), undo)
		}
		open = false
	}

	const title = $derived(
		editing
			? $t('profile.editor.editTitle', { values: { name: typeName(editing.type) } })
			: $t('profile.editor.addTitle')
	)
	const labelOf = (path: string) => (path ? $t(`profile.fields.${path}`) : $t('profile.editor.value'))
	const segmentedIndex = (options: readonly string[], path: string) => Math.max(0, options.indexOf(picked[path] ?? ''))
</script>

<Sheet bind:open placement="center" size="sm" label={title}>
	{#snippet header()}
		<h2 class="title">{title}</h2>
	{/snippet}

	{#if !type}
		<div class="pick">
			<p class="prompt">{$t('profile.editor.pickType')}</p>
			{#each choices as group (group.owner)}
				<h3 class="group">{group.label}</h3>
				<ul class="types">
					{#each group.ids as id (id)}
						<li>
							<button type="button" class="type" onclick={() => choose(id)}>
								<span>{typeName(id)}</span>
								{#if tierOf(id) === 'T2'}<Badge kind="tier" label="T2" />{/if}
							</button>
						</li>
					{/each}
				</ul>
			{/each}
		</div>
	{:else if shape}
		<div class="form">
			{#if !FACT_SHAPES[type].multi && !editing}
				<p class="prompt">{$t('profile.editor.single')}</p>
			{/if}
			{#if editing && (editing.provenance === 'ai-inferred' || editing.provenance === 'domain-derived')}
				<p class="prompt">
					{$t(`profile.provenance.${editing.provenance}`, { values: { owner: ownerName(ownerOf(editing.type)) } })}
				</p>
			{/if}
			{@render fieldOf(shape, '', focusWindow ? undefined : true)}
			<Field label={$t('profile.editor.note')} bind:value={note} helper={$t('profile.editor.noteHelper')} />
			<div class="window">
				<Field type="date" label={$t('profile.editor.validFrom')} bind:value={validFrom} autofocus={focusWindow} />
				<Field
					type="date"
					label={$t('profile.editor.validUntil')}
					bind:value={validUntil}
					error={windowProblem ? $t('profile.editor.invalid') : undefined}
				/>
			</div>
			<p class="prompt">{$t('profile.editor.windowHelper')}</p>
		</div>
	{/if}

	{#snippet footer()}
		<div class="actions">
			<Button
				variant="quiet"
				label={canStepBack ? $t('profile.editor.back') : $t('profile.editor.cancel')}
				onclick={leave}
			/>
			{#if type}
				<Button variant="primary" label={$t('profile.editor.save')} disabled={!canSave} onclick={save} />
			{/if}
		</div>
	{/snippet}
</Sheet>

{#snippet fieldOf(shape: ValueShape, path: string, first?: boolean)}
	{#if shape.kind === 'string'}
		<Field label={labelOf(path)} bind:value={text[path]} autofocus={first} />
	{:else if shape.kind === 'integer'}
		<Field
			label={labelOf(path)}
			type="number"
			bind:value={text[path]}
			min={shape.min}
			max={shape.max}
			step={1}
			mono
			autofocus={first}
		/>
	{:else if shape.kind === 'enum' && shape.options.length <= SEGMENTED_MAX}
		<div class="labelled">
			<span class="label">{labelOf(path)}</span>
			<Segmented
				items={shape.options.map((option) => ({
					id: option,
					label: $t(optionKey(type ?? '', option, path || undefined)),
				}))}
				selected={segmentedIndex(shape.options, path)}
				label={labelOf(path)}
				onchange={(index) => (picked[path] = shape.options[index] ?? '')}
			/>
		</div>
	{:else if shape.kind === 'enum'}
		<div class="labelled">
			<span class="label">{labelOf(path)}</span>
			<div class="chips">
				{#each shape.options as option (option)}
					<Chip
						label={$t(optionKey(type ?? '', option, path || undefined))}
						tone="outline"
						selectable
						selected={picked[path] === option}
						onselect={(on) => (picked[path] = on ? option : '')}
					/>
				{/each}
			</div>
			{#if shape.custom}
				<Field
					label={$t('profile.editor.custom')}
					placeholder={$t('profile.editor.customPlaceholder')}
					bind:value={text[path]}
					oninput={() => (picked[path] = '')}
				/>
			{/if}
		</div>
	{:else if shape.kind === 'weighted'}
		<Field label={$t('profile.fields.name')} bind:value={text[`${path}.name`]} autofocus={first} />
		<Field
			label={$t('profile.fields.weight')}
			type="number"
			bind:value={text[`${path}.weight`]}
			unit="%"
			min={0}
			max={100}
			step={10}
			mono
		/>
	{:else if shape.kind === 'object'}
		{#each shape.fields as field, index (field.key)}
			{@render fieldOf(field.shape, field.key, first && index === 0)}
		{/each}
	{/if}
{/snippet}

<style>
	.title {
		margin: 0;
		font: var(--ed-t-title);
		color: var(--text-primary);
	}
	.pick,
	.form {
		display: grid;
		gap: var(--space-4);
	}
	.prompt {
		margin: 0;
		font: var(--ed-t-body-sm);
		color: var(--text-secondary);
	}
	.group {
		margin: var(--space-2) 0 0;
		font: var(--ed-t-label);
		color: var(--text-secondary);
	}
	.types {
		display: grid;
		gap: 2px;
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.type {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-2);
		width: 100%;
		min-height: var(--ed-control);
		padding: 0 var(--space-3);
		border: 0;
		border-radius: var(--ed-radius-md);
		background: transparent;
		font: var(--ed-t-body);
		color: var(--text-primary);
		text-align: start;
		cursor: pointer;
	}
	.type:hover {
		background: var(--surface-hover);
	}
	.type:focus-visible {
		outline: 2px solid var(--focus-ring);
		outline-offset: 2px;
	}
	.labelled {
		display: grid;
		gap: var(--space-2);
	}
	.label {
		font: var(--ed-t-label);
		color: var(--text-primary);
	}
	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
	}
	.window {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: var(--space-3);
	}
	.actions {
		display: flex;
		justify-content: flex-end;
		gap: var(--space-2);
	}
</style>
