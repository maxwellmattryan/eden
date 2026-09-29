// Visual regression over the static Storybook build: every story (unless tagged `no-vrt`) in light and dark, on the
// desktop and the mobile canvas, screenshotted and compared with the committed baselines in src/vrt/__baselines__.
// `--update` rewrites the baselines. Baselines are rendered on the owner's machine (OQ-20); run `yarn storybook:build` first.
//   node scripts/vrt.mjs [--update] [--filter <substring>] [--threshold 0.1] [--max-diff 0.001]
import { createServer } from 'node:http'
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, extname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import pixelmatch from 'pixelmatch'
import { chromium } from 'playwright'
import { PNG } from 'pngjs'

const pkg = join(dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
const flag = (name, fallback) => {
	const i = args.indexOf(name)
	return i === -1 ? fallback : args[i + 1]
}
const update = args.includes('--update')
const filter = flag('--filter', '')
const threshold = parseFloat(flag('--threshold', '0.1'))
const maxDiff = parseFloat(flag('--max-diff', '0.001'))
const staticDir = join(pkg, 'storybook-static')
const baselineDir = join(pkg, 'src/vrt/__baselines__')
const diffDir = join(pkg, 'vrt/__diff__')
if (!existsSync(join(staticDir, 'index.json'))) {
	console.error('vrt: storybook-static/index.json not found; run `yarn storybook:build` first.')
	process.exit(2)
}

const types = {
	'.html': 'text/html',
	'.js': 'text/javascript',
	'.mjs': 'text/javascript',
	'.css': 'text/css',
	'.json': 'application/json',
	'.svg': 'image/svg+xml',
	'.png': 'image/png',
	'.woff2': 'font/woff2',
	'.woff': 'font/woff',
	'.ico': 'image/x-icon',
	'.map': 'application/json',
}
const server = createServer((req, res) => {
	const path = join(staticDir, decodeURIComponent(new URL(req.url, 'http://x').pathname))
	if (!path.startsWith(staticDir) || !existsSync(path) || statSync(path).isDirectory()) {
		res.writeHead(404)
		return res.end()
	}
	res.writeHead(200, { 'content-type': types[extname(path)] ?? 'application/octet-stream' })
	res.end(readFileSync(path))
})
await new Promise((r) => server.listen(0, '127.0.0.1', r))
const origin = `http://127.0.0.1:${server.address().port}`

const index = JSON.parse(readFileSync(join(staticDir, 'index.json'), 'utf8'))
const stories = Object.values(index.entries).filter(
	(e) => e.type === 'story' && !(e.tags ?? []).includes('no-vrt') && e.id.includes(filter)
)
const matrix = [
	{ theme: 'light', platform: 'desktop', viewport: { width: 1280, height: 800 } },
	{ theme: 'dark', platform: 'desktop', viewport: { width: 1280, height: 800 } },
	{ theme: 'light', platform: 'mobile', viewport: { width: 390, height: 844 } },
	{ theme: 'dark', platform: 'mobile', viewport: { width: 390, height: 844 } },
]

mkdirSync(baselineDir, { recursive: true })
mkdirSync(diffDir, { recursive: true })
const browser = await chromium.launch()
const context = await browser.newContext({ deviceScaleFactor: 1, reducedMotion: 'reduce' })
const page = await context.newPage()
let failures = 0
let written = 0
let compared = 0

for (const cell of matrix) {
	await page.setViewportSize(cell.viewport)
	for (const story of stories) {
		const name = `${story.id}--${cell.theme}--${cell.platform}.png`
		const url = `${origin}/iframe.html?id=${story.id}&viewMode=story&globals=theme:${cell.theme};platform:${cell.platform};brand:lush;accent:moss;face:newsreader;density:comfortable`
		await page.goto(url, { waitUntil: 'networkidle' })
		await page.waitForSelector('#storybook-root > *', { timeout: 15000 })
		await page.evaluate(() => document.fonts.ready)
		await page.waitForTimeout(300)
		const root = page.locator('#storybook-root')
		const shot = PNG.sync.read(await root.screenshot({ animations: 'disabled', caret: 'hide' }))
		const baselinePath = join(baselineDir, name)
		if (update || !existsSync(baselinePath)) {
			writeFileSync(baselinePath, PNG.sync.write(shot))
			written++
			continue
		}
		const base = PNG.sync.read(readFileSync(baselinePath))
		compared++
		if (base.width !== shot.width || base.height !== shot.height) {
			failures++
			writeFileSync(join(diffDir, name.replace('.png', '.new.png')), PNG.sync.write(shot))
			console.error(`✗ ${name}: size ${base.width}×${base.height} → ${shot.width}×${shot.height}`)
			continue
		}
		const diff = new PNG({ width: base.width, height: base.height })
		const changed = pixelmatch(base.data, shot.data, diff.data, base.width, base.height, { threshold })
		const ratio = changed / (base.width * base.height)
		if (ratio > maxDiff) {
			failures++
			writeFileSync(join(diffDir, name), PNG.sync.write(diff))
			writeFileSync(join(diffDir, name.replace('.png', '.new.png')), PNG.sync.write(shot))
			console.error(`✗ ${name}: ${(ratio * 100).toFixed(2)}% of pixels changed`)
		}
	}
}
await browser.close()
server.close()
const where = relative(process.cwd(), baselineDir)
if (written) console.log(`vrt: wrote ${written} baseline${written === 1 ? '' : 's'} to ${where}`)
if (compared)
	console.log(
		`vrt: compared ${compared} screenshot${compared === 1 ? '' : 's'}, ${failures} differ${failures === 1 ? 's' : ''}${failures ? ` (diffs in ${relative(process.cwd(), diffDir)})` : ''}`
	)
process.exit(failures ? 1 : 0)
