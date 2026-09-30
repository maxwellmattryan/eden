// The domains' manifest.json files + registry/substrate.json + registry/planned.json + manifest/shell.json →
// src/registry/generated.ts and src-tauri/src/substrate/registry_generated.rs: the resource registry (D-35) and the
// declarations the shell composes from, checked against the locales, the kit's icon list and
// docs/product/substrate/registry.md. `--check` fails on drift; `--add` stages what it wrote, for lint-staged.
import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from './registry/core.mjs'

const pkg = join(dirname(fileURLToPath(import.meta.url)), '..')
const root = join(pkg, '../..')
const check = process.argv.includes('--check')
const add = process.argv.includes('--add')

const named = (path) => relative(root, path)
const json = (path) => {
	try {
		return { file: named(path), data: JSON.parse(readFileSync(path, 'utf8')) }
	} catch (error) {
		console.error(`build-registry: ${named(path)}: ${error.message}`)
		process.exit(1)
	}
}

const domains = join(pkg, 'src/domains')
const doc = join(root, 'docs/product/substrate/registry.md')
const result = build({
	manifests: readdirSync(domains, { withFileTypes: true })
		.filter((entry) => entry.isDirectory() && existsSync(join(domains, entry.name, 'manifest.json')))
		.map((entry) => json(join(domains, entry.name, 'manifest.json'))),
	substrate: json(join(pkg, 'src/registry/substrate.json')),
	planned: json(join(pkg, 'src/registry/planned.json')),
	shell: json(join(pkg, 'src/manifest/shell.json')),
	locales: {
		en: json(join(pkg, 'src/i18n/locales/en.json')).data,
		ja: json(join(pkg, 'src/i18n/locales/ja.json')).data,
	},
	icons: json(join(root, 'packages/ui-kit/src/lib/tokens/icon-list.json')).data,
	doc: { file: named(doc), text: readFileSync(doc, 'utf8') },
})

if (result.errors.length) {
	for (const error of result.errors) console.error(`build-registry: ${error}`)
	process.exit(1)
}

const outputs = [
	[join(pkg, 'src/registry/generated.ts'), result.ts],
	[join(root, 'src-tauri/src/substrate/registry_generated.rs'), result.rust],
]
const summary = `${result.resources.length} resources, ${result.declarations.length} domains`

if (check) {
	const stale = outputs.filter(([path, content]) => !existsSync(path) || readFileSync(path, 'utf8') !== content)
	if (stale.length) {
		for (const [path] of stale)
			console.error(`build-registry --check: ${named(path)} is out of date; run \`yarn registry\``)
		process.exit(1)
	}
	console.log(`build-registry --check: ${summary} up to date.`)
} else {
	for (const [path, content] of outputs) {
		writeFileSync(path, content)
		console.log(`wrote ${named(path)}`)
	}
	console.log(`build-registry: ${summary}`)
	if (add) execFileSync('git', ['add', ...outputs.map(([path]) => path)], { cwd: root, stdio: 'inherit' })
}
