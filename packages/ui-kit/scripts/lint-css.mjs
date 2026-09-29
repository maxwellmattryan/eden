// Fails when a component's scoped CSS or markup breaks the kit's styling rules (docs/engineering/ui-kit.md):
//   - no literal pixel font sizes: type comes from the --ed-t-* variables so the scale and the dials hold
//   - no raw --radius-* tokens: components read the dial-adjusted --ed-radius-* variables
//   - no html[data-...] selectors: theme, brand and platform differences arrive through tokens, never through selectors
//   - no literal aria-label strings in components: visible and spoken copy comes from the strings context
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const root = new URL('../src/lib/', import.meta.url).pathname
const files = []
const walk = (dir) => {
	for (const name of readdirSync(dir)) {
		const path = join(dir, name)
		if (statSync(path).isDirectory()) walk(path)
		else if (name.endsWith('.svelte')) files.push(path)
	}
}
walk(root)

const rules = [
	{ id: 'px-font-size', re: /font-size\s*:\s*\d+(\.\d+)?px/g, where: 'style' },
	{ id: 'px-font-shorthand', re: /\bfont\s*:\s*[^;{}]*\d+(\.\d+)?px/g, where: 'style' },
	{ id: 'raw-radius', re: /var\(\s*--radius-(control|card|sheet)\b/g, where: 'style' },
	{ id: 'html-attribute-selector', re: /html\[data-/g, where: 'style' },
	{
		id: 'literal-aria-label',
		re: /\saria-label="[^"{]+"/g,
		where: 'markup',
		only: /\/components\/|\/toast\//,
		allow: /aria-label="\{/,
	},
]

let failures = 0
for (const file of files) {
	const source = readFileSync(file, 'utf8')
	const style = [...source.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join('\n')
	const markup = source.replace(/<style[^>]*>[\s\S]*?<\/style>/g, '').replace(/<script[^>]*>[\s\S]*?<\/script>/g, '')
	for (const rule of rules) {
		if (rule.only && !rule.only.test(file)) continue
		const haystack = rule.where === 'style' ? style : markup
		for (const match of haystack.matchAll(rule.re)) {
			failures++
			console.error(`${relative(process.cwd(), file)}: ${rule.id}: ${match[0].trim()}`)
		}
	}
}

if (failures) {
	console.error(
		`\nlint-css: ${failures} problem${failures === 1 ? '' : 's'} in ${files.length} component file${files.length === 1 ? '' : 's'}.`
	)
	process.exit(1)
}
console.log(`lint-css: ${files.length} component file${files.length === 1 ? '' : 's'} clean.`)
