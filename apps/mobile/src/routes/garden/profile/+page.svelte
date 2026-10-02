<script lang="ts">
	// The Profile on the phone (product/substrate/profile.md, "Surfaces"): the shared page desktop mounts, through its
	// narrow layout; a fact's actions are its row menu, a bottom sheet here.
	import { onMount } from 'svelte'
	import { feed } from '@eden/shared/shell'
	import { profile } from '@eden/shared/shell/profile'
	import Profile from '@eden/shared/shell/profile/Profile.svelte'

	onMount(() => {
		void feed.load()
		void profile.load()
	})
</script>

<Profile />
