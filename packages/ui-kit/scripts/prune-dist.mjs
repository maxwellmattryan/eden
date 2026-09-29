// svelte-package copies everything under src/lib into dist, stories and tests included (it has no exclude option).
// Run after it: removes what is not part of the package.
import { readdirSync, rmSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const dist = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist')
const drop = (name) => /\.stories\.svelte(\.d\.ts)?$|\.test\.(ts|js|mjs)(\.d\.ts)?$/.test(name) || name === 'faces.css'
let removed = 0
const walk = (dir) => {
	for (const name of readdirSync(dir)) {
		const path = join(dir, name)
		if (statSync(path).isDirectory()) {
			if (name === 'alternates' || name === 'stories' || name === 'storybook' || name === 'vrt') {
				rmSync(path, { recursive: true })
				removed++
			} else walk(path)
		} else if (drop(name)) {
			rmSync(path)
			removed++
		}
	}
}
walk(dist)
console.log(`prune-dist: removed ${removed} stor${removed === 1 ? 'y' : 'ies, tests and gallery files'} from dist`)
