// Prints each shipped font's axes and coverage and fails when a file is missing, lacks the axes the type styles rely on,
// carries vertical metrics other than the ones tokens.json declares for it (WebKit ignores ascent-override and
// descent-override, so the file itself must hold them), or is subsetted below Latin-1 + Latin Extended-A + the punctuation the copy uses. Gallery alternates are reported only.
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as fontkit from 'fontkit'

const pkg = join(dirname(fileURLToPath(import.meta.url)), '..')
const T = JSON.parse(readFileSync(join(pkg, 'src/lib/tokens/tokens.json'), 'utf8'))

const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i)
// Required: the launch locales are English and Japanese (Japanese falls back to the system fonts), so the gate is Latin-1
// plus the punctuation the copy uses. The soft hyphen (U+00AD) and currency sign (U+00A4) are commonly dropped and not needed.
const required = [
	...range(0x20, 0x7e), // ASCII
	...range(0xa0, 0xff).filter((cp) => cp !== 0xad && cp !== 0xa4), // Latin-1 Supplement
	0x2013,
	0x2014,
	0x2018,
	0x2019,
	0x201c,
	0x201d,
	0x2022,
	0x2026,
	0x20ac,
	0x2122,
	0x2212, // dashes, quotes, bullet, ellipsis, euro, tm, minus
]
// Informational: Latin Extended-A, needed only when a locale with diacritics beyond Latin-1 is added.
const extendedA = range(0x100, 0x17f)
const axesRequired = { Newsreader: ['wght', 'opsz'], Inter: ['wght'], 'Geist Mono': ['wght'] }

let failures = 0
const rows = []
for (const [group, fonts] of [
	['shipped', T.type.fonts.shipped],
	['gallery', T.type.fonts.gallery],
]) {
	for (const f of fonts) {
		const path = join(pkg, 'src/lib/fonts', f.file)
		if (!existsSync(path)) {
			rows.push([group, f.family, f.file, 'MISSING', '', '', ''])
			if (group === 'shipped') failures++
			continue
		}
		const font = fontkit.openSync(path)
		const axes = Object.keys(font.variationAxes ?? {})
		const set = new Set(font.characterSet)
		const missing = required.filter((cp) => !set.has(cp))
		const extA = extendedA.filter((cp) => set.has(cp)).length
		const missingAxes = (axesRequired[f.family] ?? []).filter((a) => !axes.includes(a))
		const size = Math.round(readFileSync(path).length / 1024)
		const units = (percent) => Math.round((parseFloat(percent) / 100) * font.unitsPerEm)
		const metricsOff =
			f.metrics &&
			(font.hhea.ascent !== units(f.metrics.ascentOverride) ||
				font.hhea.descent !== -units(f.metrics.descentOverride) ||
				font.hhea.lineGap !== units(f.metrics.lineGapOverride))
		let verdict = 'ok'
		if (group === 'shipped' && metricsOff) {
			verdict = `FAIL: hhea ${font.hhea.ascent}/${font.hhea.descent}/${font.hhea.lineGap} is not the declared metrics`
			failures++
		} else if (group === 'shipped' && (missing.length || missingAxes.length)) {
			verdict = 'FAIL'
			failures++
		}
		rows.push([
			group,
			f.family + (f.style === 'italic' ? ' italic' : ''),
			`${size} KB`,
			axes.join(',') || 'static',
			String(font.numGlyphs),
			missing.length
				? `${missing.length} missing (e.g. U+${missing[0].toString(16).toUpperCase().padStart(4, '0')})`
				: `Latin-1 + punctuation; Ext-A ${extA}/${extendedA.length}`,
			missingAxes.length ? `axes missing: ${missingAxes.join(',')}` : verdict,
		])
	}
}
const widths = rows[0].map((_, i) => Math.max(...rows.map((r) => r[i].length)))
for (const r of rows) console.log(r.map((c, i) => c.padEnd(widths[i])).join('  '))
if (failures) {
	console.error(`\ncheck-fonts: ${failures} shipped font${failures === 1 ? '' : 's'} failed.`)
	process.exit(1)
}
console.log('\ncheck-fonts: shipped fonts ok.')
