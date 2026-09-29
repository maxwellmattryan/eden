// The sky as a motif: the wind as a flow field. Everything it shows is a reading: the streaks run the way the wind
// blows and as fast, wander in a calm, lean down with the rain and thicken with the cloud. It is quiet by design, a
// thing felt beside a header's name rather than looked at.
import type { SketchDefinition, SketchFrame } from '../sketch/types.js'

export interface SkyFieldParams {
	/** Where the wind blows from, in degrees clockwise from north. */
	windFrom: number
	/** The sustained wind, km/h. */
	windSpeed: number
	/** The gusts, km/h: the further above the sustained wind, the less even the streaks. */
	windGust?: number
	/** Percent of the sky under cloud. */
	cloudCover?: number
	/** mm in the last hour. */
	precipitation?: number
}

const clamp = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, value))

/** The way the wind carries things on the page, north up: a unit vector pointing where the wind blows to. */
export function windVector(from: number): { x: number; y: number } {
	const to = ((from + 180) * Math.PI) / 180
	return { x: Math.sin(to), y: -Math.cos(to) }
}

/** How fast a streak travels, in pixels a second: a calm still drifts, a gale does not race. */
export function streakSpeed(windSpeed: number): number {
	return 10 + 3.2 * Math.pow(clamp(windSpeed, 0, 90), 0.8)
}

/** The points a streak holds: its length is what it travelled over this many frames. */
const TRAIL = 30
/** A streak to this many square pixels, under a clear sky. */
const AREA_PER_STREAK = 800
const MIN_STREAKS = 48
const MAX_STREAKS = 320
/** How far past the edge a streak may run before it ends. */
const MARGIN = 24
/** The noise's grain across the page and its drift through time. */
const GRAIN = 0.0045
const DRIFT = 0.07
/** One streak in this many takes the accent. */
const ACCENT_EVERY = 5
const STREAK_ALPHA = 0.34
/** The frames a still runs before it is drawn, so its streaks have their length. */
const STILL_STEPS = 90
const STILL_DELTA = 1 / 30

interface Model {
	count: number
	x: Float32Array
	y: Float32Array
	age: Float32Array
	life: Float32Array
	/** Each streak's points as a ring: `TRAIL` pairs, the newest at `head`. */
	trail: Float32Array
	head: Uint8Array
	length: Uint8Array
}

type Color = 'text-tertiary' | 'brand-primary'
type Frame = SketchFrame<SkyFieldParams, Color>

function spawn(model: Model, i: number, { random, width, height }: Frame) {
	model.x[i] = random.range(0, width)
	model.y[i] = random.range(0, height)
	model.age[i] = 0
	model.life[i] = random.range(3, 7)
	model.length[i] = 0
}

/** Moves every streak on by `delta`: a living one gains a point at its head, a spent one loses its tail. */
function step(model: Model, frame: Frame, delta: number) {
	const { params, noise, width, height, time } = frame
	const wind = windVector(params.windFrom)
	const heading = Math.atan2(wind.y, wind.x)
	const pace = streakSpeed(params.windSpeed)
	const gust = clamp(((params.windGust ?? params.windSpeed) - params.windSpeed) / 30)
	const rain = clamp((params.precipitation ?? 0) / 4)
	// a calm wanders and a steady wind holds its line; rain straightens it further
	const spread = (1.5 - 1.05 * clamp(params.windSpeed / 40)) * (1 - 0.5 * rain)
	const active = Math.round(model.count * (0.6 + 0.4 * clamp((params.cloudCover ?? 0) / 100)))

	for (let i = 0; i < model.count; i++) {
		const x = model.x[i]!
		const y = model.y[i]!
		const inside = x > -MARGIN && x < width + MARGIN && y > -MARGIN && y < height + MARGIN
		if (i < active && inside && model.age[i]! < model.life[i]!) {
			const angle = heading + noise(x * GRAIN, y * GRAIN, time * DRIFT) * spread
			const speed = pace * (1 + 0.6 * gust * noise(x * GRAIN * 0.5 + 100, y * GRAIN * 0.5, time * 0.25))
			const nx = x + Math.cos(angle) * speed * delta
			const ny = y + (Math.sin(angle) * speed + rain * 90) * delta
			const head = (model.head[i]! + 1) % TRAIL
			model.trail[(i * TRAIL + head) * 2] = nx
			model.trail[(i * TRAIL + head) * 2 + 1] = ny
			model.head[i] = head
			model.length[i] = Math.min(TRAIL, model.length[i]! + 1)
			model.x[i] = nx
			model.y[i] = ny
			model.age[i] = model.age[i]! + delta
		} else if (model.length[i]! > 0) {
			model.length[i] = model.length[i]! - 1
		} else if (i < active) {
			spawn(model, i, frame)
		}
	}
}

/** The streaks, a stroke to each age of segment, so a streak fades along its length without a gradient apiece. */
function streaks(model: Model, { ctx, colors }: Frame) {
	ctx.lineWidth = 1
	ctx.lineCap = 'round'
	for (const accent of [false, true]) {
		ctx.strokeStyle = accent ? colors['brand-primary'] : colors['text-tertiary']
		for (let k = 0; k < TRAIL - 1; k++) {
			ctx.globalAlpha = STREAK_ALPHA * Math.pow(1 - k / (TRAIL - 1), 1.6) * (accent ? 1.3 : 1)
			ctx.beginPath()
			for (let i = accent ? 0 : 1; i < model.count; i++) {
				if ((i % ACCENT_EVERY === 0) !== accent || model.length[i]! < k + 2) continue
				const a = (i * TRAIL + ((model.head[i]! - k + TRAIL) % TRAIL)) * 2
				const b = (i * TRAIL + ((model.head[i]! - k - 1 + TRAIL) % TRAIL)) * 2
				ctx.moveTo(model.trail[a]!, model.trail[a + 1]!)
				ctx.lineTo(model.trail[b]!, model.trail[b + 1]!)
			}
			ctx.stroke()
		}
	}
	ctx.globalAlpha = 1
}

export const skyField: SketchDefinition<SkyFieldParams, Model, Color> = {
	colors: ['text-tertiary', 'brand-primary'],
	setup(frame) {
		const { random, width, height } = frame
		const count = Math.round(clamp((width * height) / AREA_PER_STREAK, MIN_STREAKS, MAX_STREAKS))
		const model: Model = {
			count,
			x: new Float32Array(count),
			y: new Float32Array(count),
			age: new Float32Array(count),
			life: new Float32Array(count),
			trail: new Float32Array(count * TRAIL * 2),
			head: new Uint8Array(count),
			length: new Uint8Array(count),
		}
		for (let i = 0; i < count; i++) {
			spawn(model, i, frame)
			// the streaks begin at every age, so they never end together
			model.age[i] = random.range(0, model.life[i]!)
		}
		return model
	},
	draw(frame, model) {
		if (frame.still) for (let i = 0; i < STILL_STEPS; i++) step(model, frame, STILL_DELTA)
		else step(model, frame, frame.delta)
		streaks(model, frame)
	},
}
