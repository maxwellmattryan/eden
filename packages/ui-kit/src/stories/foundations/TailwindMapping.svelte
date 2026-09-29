<!--
	The Tailwind mapping in use. Every class here resolves through `@theme inline` to a runtime variable, so switching the
	Accent or Theme toolbar recolours the blocks without a rebuild. Apps write this; kit components write scoped CSS.
-->
<div class="flex max-w-3xl flex-col gap-4">
	<div class="rounded-card bg-brand p-4 font-display text-display-sm text-on-brand shadow-card">
		bg-brand text-on-brand rounded-card shadow-card: follows the accent
	</div>
	<div class="rounded-card border border-stroke bg-surface-1 p-4 text-body text-text-primary">
		bg-surface-1 text-text-primary border-stroke rounded-card
		<span class="text-text-secondary"> text-text-secondary </span>
		<span class="text-caption text-text-tertiary" data-tertiary>text-text-tertiary text-caption</span>
	</div>
	<div class="rounded-card bg-ai-muted p-4 font-display text-voice text-ai">
		bg-ai-muted text-ai text-voice: the Gardener speaks
	</div>
	<div class="rounded-control bg-honey-muted p-3 text-label text-honey">
		bg-honey-muted text-honey rounded-control: the Gardener acts
	</div>
	<div class="text-body-sm text-danger">text-danger</div>
	<div class="rounded-control border border-stroke-subtle p-3 text-body dark:bg-surface-2 mobile:text-body-lg">
		dark:bg-surface-2 mobile:text-body-lg: the custom variants
	</div>
</div>
