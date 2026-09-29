import { createNoise } from '../sketch/noise.js'
import { createRandom } from '../sketch/random.js'
import type { SketchDefinition, SketchFrame } from '../sketch/types.js'
import type { ColorToken } from '../tokens/tokens.js'

export interface SketchOptions<P, S, C extends ColorToken> {
	sketch: SketchDefinition<P, S, C>
	/** Read on every frame, so a change of parameters never restarts the sketch. */
	params: () => P
	paused: () => boolean
	seed: number
	/** The most frames a second. */
	fps: number
}

export interface SketchRunner {
	/** Something the sketch reads has changed: wakes a loop that was paused and redraws a still one. */
	invalidate(): void
	stop(): void
}

/** The backing store is never denser than this, whatever the screen. */
const MAX_RATIO = 2
/** The longest step a sketch is asked to take, in seconds: a stalled frame must not throw the model. */
const MAX_DELTA = 0.1
/** How often the colours and the motion setting are read again, in milliseconds. */
const SURROUNDINGS_MS = 1000

/** True when the stylesheet has zeroed the movement durations (base.css, under reduced motion). */
export function motionReduced(el: Element): boolean {
	return parseFloat(getComputedStyle(el).getPropertyValue('--ed-duration-settle')) === 0
}

/**
 * Runs a sketch on a canvas: sizes the backing store to the element and the screen, resolves the sketch's colour
 * tokens where the canvas stands, and drives the frames. The loop rests while the canvas is out of sight or paused,
 * and under reduced motion the sketch is drawn once, as a still.
 */
export function runSketch<P, S, C extends ColorToken>(
	canvas: HTMLCanvasElement,
	{ sketch, params, paused, seed, fps }: SketchOptions<P, S, C>
): SketchRunner {
	const ctx = canvas.getContext('2d')
	if (!ctx) return { invalidate() {}, stop() {} }

	const frame: SketchFrame<P, C> = {
		ctx,
		width: 0,
		height: 0,
		time: 0,
		delta: 0,
		frame: 0,
		now: Date.now(),
		params: params(),
		colors: {} as Record<C, string>,
		random: createRandom(seed),
		noise: createNoise(createRandom(seed)),
		still: false,
	}
	const interval = 1000 / Math.max(1, fps)
	let model: S | undefined
	let ready = false
	let visible = true
	let handle = 0
	let last = 0
	let stopped = false

	/** Reads the colours and the motion setting where the canvas stands; true when either changed. */
	function look(): boolean {
		let changed = false
		const style = getComputedStyle(canvas)
		for (const token of sketch.colors ?? []) {
			canvas.style.color = `var(--${token})`
			const value = style.color
			if (frame.colors[token] !== value) changed = true
			frame.colors[token] = value
		}
		canvas.style.color = ''
		const still = motionReduced(canvas)
		if (frame.still !== still) changed = true
		frame.still = still
		return changed
	}

	function setup() {
		const width = canvas.clientWidth
		const height = canvas.clientHeight
		ready = width > 0 && height > 0
		if (!ready) return
		const ratio = Math.min(globalThis.devicePixelRatio || 1, MAX_RATIO)
		canvas.width = Math.round(width * ratio)
		canvas.height = Math.round(height * ratio)
		ctx!.setTransform(ratio, 0, 0, ratio, 0, 0)
		Object.assign(frame, { width, height, time: 0, delta: 0, frame: 0, now: Date.now(), params: params() })
		frame.random = createRandom(seed)
		frame.noise = createNoise(createRandom(seed))
		model = sketch.setup(frame)
		paint(0)
	}

	function paint(delta: number) {
		if (!ready) return
		frame.delta = delta
		frame.time += delta
		frame.now = Date.now()
		frame.params = params()
		if (!sketch.persist) ctx!.clearRect(0, 0, frame.width, frame.height)
		sketch.draw(frame, model as S)
		frame.frame++
	}

	const playing = () => !stopped && ready && visible && !frame.still && !paused()

	function tick(at: number) {
		handle = 0
		if (!playing()) return
		// a frame that comes early is skipped; the tolerance keeps a 60 Hz screen at an even 30
		if (at - last >= interval - 2) {
			paint(last ? Math.min((at - last) / 1000, MAX_DELTA) : 0)
			last = at
		}
		handle = requestAnimationFrame(tick)
	}

	function wake() {
		if (handle || !playing()) return
		last = 0
		handle = requestAnimationFrame(tick)
	}

	/** A playing sketch takes new colours on its next frame; a still one, or one that just became still, is drawn again. */
	function refresh() {
		const was = frame.still
		if (look() && (was || frame.still)) setup()
		wake()
	}

	const resize = new ResizeObserver(() => {
		if (canvas.clientWidth === frame.width && canvas.clientHeight === frame.height) return
		setup()
		wake()
	})
	const sight = new IntersectionObserver((entries) => {
		visible = entries.at(-1)?.isIntersecting ?? true
		wake()
	})
	// the theme, the accent and the motion setting can change under a sketch that is standing still
	const watch = setInterval(() => {
		if (visible) refresh()
	}, SURROUNDINGS_MS)

	look()
	setup()
	resize.observe(canvas)
	sight.observe(canvas)
	wake()

	return {
		invalidate() {
			if (stopped) return
			if (frame.still) setup()
			wake()
		},
		stop() {
			stopped = true
			if (handle) cancelAnimationFrame(handle)
			handle = 0
			clearInterval(watch)
			resize.disconnect()
			sight.disconnect()
		},
	}
}
