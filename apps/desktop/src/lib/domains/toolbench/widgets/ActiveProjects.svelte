<script lang="ts">
	// The active-projects tile: each project's name in mono, its next step beneath, its kind at the end.
	import { WidgetRows } from '@eden/ui-kit'
	import { toolbench } from '@eden/shared/domains/toolbench'

	const rows = $derived(
		toolbench.projects.map((project) => ({
			id: project.id,
			text: project.name,
			mono: true,
			note: project.next[0],
			meta: project.kind,
		}))
	)
</script>

<WidgetRows {rows} />
