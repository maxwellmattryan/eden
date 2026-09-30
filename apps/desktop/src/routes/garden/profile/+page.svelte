<script lang="ts">
	import { onMount } from 'svelte'
	import { feed } from '$lib/shell/feed.svelte'
	import Profile from '$lib/shell/profile/Profile.svelte'
	import { profile } from '$lib/shell/profile/store.svelte'

	onMount(() => {
		void feed.load()
		void profile.load()
	})
</script>

<Profile />
