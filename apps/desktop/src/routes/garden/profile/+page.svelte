<script lang="ts">
	import { onMount } from 'svelte'
	import { feed } from '@eden/shared/shell'
	import Profile from '@eden/shared/shell/profile/Profile.svelte'
	import { profile } from '@eden/shared/shell/profile'

	onMount(() => {
		void feed.load()
		void profile.load()
	})
</script>

<Profile />
