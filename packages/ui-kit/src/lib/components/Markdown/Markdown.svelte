<script lang="ts">
	// Markdown drawn with the kit's own elements: paragraphs, headings no larger than a small title, lists and task
	// lists, emphasis, inline code and fenced code, quotes, rules, tables and links. The source is read into a tree
	// (parse.ts) and the tree is drawn here, so raw HTML in the source is text and nothing is ever injected. `voice`
	// sets the prose in the Gardener's voice. The source may grow as a reply streams: it is read again each time, and
	// a fence that has not closed yet is already a code block. Code and tables wrap rather than scroll, so nothing in
	// a narrow panel hides behind a scrollbar. The text selects, since it is there to be read and kept.
	import type { HTMLAttributes } from 'svelte/elements'
	import Icon from '../../icons/Icon.svelte'
	import { useStrings } from '../../i18n/context.js'
	import { parseMarkdown, type Block, type Inline } from './parse.js'

	type Props = HTMLAttributes<HTMLDivElement> & {
		/** The Markdown source. */
		source: string
		/** Prose in the Gardener's voice rather than body text. */
		voice?: boolean
		/** Called with a link's href instead of following it, for an app that opens links itself. */
		onlink?: (href: string) => void
	}
	let { source, voice = false, onlink, class: className = '', ...rest }: Props = $props()

	const s = useStrings()
	const tree = $derived(parseMarkdown(source))

	function follow(event: MouseEvent, href: string) {
		if (!onlink) return
		event.preventDefault()
		onlink(href)
	}
</script>

<!-- prettier-ignore -->
{#snippet inline(nodes: Inline[])}{#each nodes as node, i (i)}{#if node.t === 'text'}{node.text}{:else if node.t === 'strong'}<strong>{@render inline(node.kids)}</strong>{:else if node.t === 'em'}<em>{@render inline(node.kids)}</em>{:else if node.t === 'del'}<del>{@render inline(node.kids)}</del>{:else if node.t === 'code'}<code class="ed-md-code">{node.text}</code>{:else if node.t === 'br'}<br />{:else if node.t === 'link'}<a class="ed-md-link" href={node.href} target="_blank" rel="noopener noreferrer" onclick={(e) => follow(e, node.href)}>{@render inline(node.kids)}</a>{/if}{/each}{/snippet}

{#snippet blocks(nodes: Block[])}
	{#each nodes as node, i (i)}
		{#if node.t === 'p'}
			<p class="ed-md-p">{@render inline(node.kids)}</p>
		{:else if node.t === 'h'}
			<p
				class={['ed-md-h', { 'ed-md-h-minor': node.level > 2 }]}
				role="heading"
				aria-level={Math.min(node.level + 2, 6)}
			>
				{@render inline(node.kids)}
			</p>
		{:else if node.t === 'code'}
			<pre class="ed-md-pre"><code>{node.text}</code></pre>
		{:else if node.t === 'quote'}
			<blockquote class="ed-md-quote">{@render blocks(node.kids)}</blockquote>
		{:else if node.t === 'hr'}
			<hr class="ed-md-hr" />
		{:else if node.t === 'list'}
			<svelte:element
				this={node.ordered ? 'ol' : 'ul'}
				class={['ed-md-list', { 'ed-md-ordered': node.ordered }]}
				start={node.ordered ? node.start : undefined}
			>
				{#each node.items as item, j (j)}
					<li class={{ 'ed-md-task': item.checked !== undefined }}>
						{#if item.checked !== undefined}
							<Icon
								class="ed-md-check"
								name={item.checked ? 'circle-check' : 'circle-dashed'}
								size="sm"
								label={item.checked ? s.done : undefined}
							/>
						{/if}
						<div class="ed-md-item">{@render blocks(item.kids)}</div>
					</li>
				{/each}
			</svelte:element>
		{:else if node.t === 'table'}
			<table class="ed-md-table">
				<thead>
					<tr>
						{#each node.head as cell, j (j)}
							<th style:text-align={cell.align ?? undefined}>{@render inline(cell.kids)}</th>
						{/each}
					</tr>
				</thead>
				<tbody>
					{#each node.rows as row, j (j)}
						<tr>
							{#each row as cell, k (k)}
								<td style:text-align={cell.align ?? undefined}>{@render inline(cell.kids)}</td>
							{/each}
						</tr>
					{/each}
				</tbody>
			</table>
		{/if}
	{/each}
{/snippet}

<div class={['ed-md', { 'ed-md-voice': voice }, className]} {...rest}>
	{@render blocks(tree)}
</div>

<style>
	.ed-md {
		--ed-md-font: var(--ed-t-body);
		--ed-md-tracking: var(--ed-t-body-tracking);
		--ed-md-opsz: var(--ed-t-body-opsz);
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		min-width: 0;
		color: var(--text-primary);
		font: var(--ed-md-font);
		letter-spacing: var(--ed-md-tracking);
		font-variation-settings: var(--ed-md-opsz);
		overflow-wrap: anywhere;
		user-select: text;
		-webkit-user-select: text;
	}
	.ed-md-voice {
		--ed-md-font: var(--ed-t-voice);
		--ed-md-tracking: var(--ed-t-voice-tracking);
		--ed-md-opsz: var(--ed-t-voice-opsz);
	}
	.ed-md-p {
		margin: 0;
		text-wrap: pretty;
	}
	.ed-md-h {
		margin: var(--space-1) 0 0;
		font: var(--ed-t-title-sm);
		letter-spacing: var(--ed-t-title-sm-tracking);
		font-variation-settings: var(--ed-t-title-sm-opsz);
	}
	.ed-md-h:first-child {
		margin-top: 0;
	}
	.ed-md-h-minor {
		font: var(--ed-t-label);
		letter-spacing: var(--ed-t-label-tracking);
		font-variation-settings: var(--ed-t-label-opsz);
	}
	.ed-md strong {
		font-weight: 600;
	}
	.ed-md-code,
	.ed-md-pre {
		font: var(--ed-t-code);
		letter-spacing: var(--ed-t-code-tracking);
		font-variation-settings: var(--ed-t-code-opsz);
		background: var(--surface-0);
		border-radius: calc(var(--ed-radius-control) / 2);
	}
	.ed-md-code {
		padding: 0 var(--space-1);
	}
	.ed-md-pre {
		margin: 0;
		padding: var(--space-2) var(--space-3);
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}
	.ed-md-link {
		color: inherit;
		text-decoration: underline;
		text-underline-offset: 2px;
		border-radius: calc(var(--ed-radius-control) / 2);
	}
	.ed-md-link:focus-visible {
		outline: 2px solid transparent;
		box-shadow: var(--focus-ring);
	}
	.ed-md-quote {
		margin: 0;
		padding-left: var(--space-3);
		border-left: 2px solid var(--stroke-strong, var(--stroke-subtle));
		color: var(--text-secondary);
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}
	.ed-md-hr {
		width: 100%;
		margin: var(--space-1) 0;
		border: 0;
		border-top: 1px solid var(--stroke-subtle);
	}
	/* the app's reset takes the markers away; a list in a reply keeps them */
	.ed-md-list {
		list-style: disc outside;
		margin: 0;
		padding-left: var(--space-6);
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
	}
	.ed-md-ordered {
		list-style: decimal outside;
	}
	.ed-md-item {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		min-width: 0;
	}
	.ed-md-task {
		list-style: none;
		display: flex;
		align-items: flex-start;
		gap: var(--space-2);
		margin-left: calc(var(--space-6) * -1);
	}
	.ed-md :global(.ed-md-check) {
		flex: none;
		margin-top: var(--space-1);
		color: var(--text-secondary);
	}
	.ed-md-table {
		border-collapse: collapse;
		font: var(--ed-t-body-sm);
		letter-spacing: var(--ed-t-body-sm-tracking);
		font-variation-settings: var(--ed-t-body-sm-opsz);
		max-width: 100%;
	}
	.ed-md-table th,
	.ed-md-table td {
		padding: var(--space-1) var(--space-2);
		border-bottom: 1px solid var(--stroke-subtle);
		text-align: left;
		vertical-align: top;
	}
	.ed-md-table th {
		font: var(--ed-t-label);
		letter-spacing: var(--ed-t-label-tracking);
		color: var(--text-secondary);
	}
</style>
