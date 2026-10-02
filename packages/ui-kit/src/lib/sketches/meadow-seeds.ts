// The meadow as a motif: seeds adrift on a light wind. Each is a small point with a wisp behind it, carried sideways
// on a slow breeze, lifting and settling on its own drift, fading in as it is taken up and out as it comes to rest.
// Everything it shows is a reading: the more places are saved, the more seeds are in the air, and the share of them
// in the accent is the share of those places that are favourites. A texture with no figure in it, felt beside a
// header's name rather than looked at.
import type { SketchDefinition, SketchFrame } from '../sketch/types.js'

export interface MeadowSeedsParams {
	/** Saved places: how many seeds are in the air. */
	places: number
	/** Of those, the favourites: the seeds that take the accent. */
	favourites: number
}

const clamp = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, value))

/** The number of saved places at which the air is at its fullest. */
const FULL_MEADOW = 80

/** The share of the seeds adrift: a bare meadow still has a few in the air, a full one is not a storm. */
export function seedShare(places: number): number {
	return 0.15 + 0.85 * Math.pow(clamp(places / FULL_MEADOW), 0.55)
}

/** How many of `active` seeds take the accent: the share of places that are favourites, one at least while any is. */
export function accentSeeds(active: number, places: number, favourites: number): number {
	if (favourites <= 0 || active <= 0) return 0
	return Math.min(active, Math.max(1, Math.round(active * clamp(favourites / Math.max(places, 1)))))
}

/** A seed to this many square pixels, with the meadow full. */
const AREA_PER_SEED = 1100
const MIN_SEEDS = 18
const MAX_SEEDS = 120
/** How far past an edge a seed may run before it ends. */
const MARGIN = 14
/** The seconds a seed takes to fade in, and the share of its life over which it fades out. */
const RISE = 1.2
const REST = 0.3
const SEED_ALPHA = 0.7
/** The wisp behind a seed, in pixels a unit of pace, and its share of the seed's alpha. */
const WISP = 0.55
const WISP_ALPHA = 0.4
/** The frames a still runs before it is drawn, so its seeds are spread along the wind. */
const STILL_STEPS = 60
const STILL_DELTA = 1 / 30

interface Model {
	count: number
	x: Float32Array
	y: Float32Array
	/** Where each seed's drift is centred, and where it was a frame ago, for the wisp. */
	y0: Float32Array
	age: Float32Array
	life: Float32Array
	/** How fast each seed is carried, in pixels a second. */
	pace: Float32Array
	size: Float32Array
	phase: Float32Array
	/** The drift's pace in radians a second, and its reach in pixels. */
	freq: Float32Array
	reach: Float32Array
}

type Color = 'text-tertiary' | 'brand-primary'
type Frame = SketchFrame<MeadowSeedsParams, Color>

const seedsFor = (model: Model, params: MeadowSeedsParams) => Math.round(model.count * seedShare(params.places))

function spawn(model: Model, i: number, { random, width, height }: Frame, anywhere = false) {
	model.x[i] = anywhere ? random.range(0, width) : random.range(-MARGIN, width * 0.35)
	model.y0[i] = random.range(height * 0.08, height * 0.92)
	model.y[i] = model.y0[i]!
	model.age[i] = 0
	model.life[i] = random.range(16, 34)
	model.pace[i] = random.range(6, 15)
	model.size[i] = random.range(0.8, 1.7)
	model.phase[i] = random.range(0, Math.PI * 2)
	model.freq[i] = random.range(0.25, 0.8)
	model.reach[i] = random.range(4, 14)
}

/** Moves every seed on by `delta`: one adrift is carried and lifted; one at rest is taken up again upwind. */
function step(model: Model, frame: Frame, delta: number) {
	const { params, width, noise, time } = frame
	const active = seedsFor(model, params)
	for (let i = 0; i < model.count; i++) {
		if (model.age[i]! >= model.life[i]! || model.x[i]! > width + MARGIN) {
			if (i < active) spawn(model, i, frame)
			continue
		}
		// the breeze is uneven: each seed's pace swells and slackens on the noise where it is
		const gust = 0.7 + 0.6 * noise(model.x[i]! * 0.004, model.y[i]! * 0.01 + time * 0.05)
		model.x[i] = model.x[i]! + model.pace[i]! * gust * delta
		model.y[i] = model.y0[i]! + Math.sin(model.phase[i]! + model.age[i]! * model.freq[i]!) * model.reach[i]!
		model.age[i] = model.age[i]! + delta
	}
}

/** The seeds: a point and the wisp it trails, dim as it is taken up and as it comes to rest. */
function seeds(model: Model, { ctx, colors, params }: Frame) {
	const accents = accentSeeds(seedsFor(model, params), params.places, params.favourites)
	ctx.lineCap = 'round'
	for (let i = 0; i < model.count; i++) {
		const t = model.age[i]! / model.life[i]!
		if (t >= 1) continue
		const rise = Math.min(1, model.age[i]! / RISE)
		const rest = Math.min(1, (1 - t) / REST)
		const alpha = SEED_ALPHA * rise * rest * (i < accents ? 1.35 : 1)
		const color = i < accents ? colors['brand-primary'] : colors['text-tertiary']
		const x = model.x[i]!
		const y = model.y[i]!
		// the wisp leans back along the wind and up the drift's slope
		const slope = Math.cos(model.phase[i]! + model.age[i]! * model.freq[i]!) * model.reach[i]! * model.freq[i]!
		const tail = model.pace[i]! * WISP
		ctx.strokeStyle = color
		ctx.lineWidth = model.size[i]! * 0.6
		ctx.globalAlpha = Math.min(1, alpha * WISP_ALPHA)
		ctx.beginPath()
		ctx.moveTo(x, y)
		ctx.lineTo(x - tail, y - (slope * tail) / Math.max(model.pace[i]!, 1) - model.size[i]!)
		ctx.stroke()
		ctx.fillStyle = color
		ctx.globalAlpha = Math.min(1, alpha)
		ctx.beginPath()
		ctx.arc(x, y, model.size[i]!, 0, Math.PI * 2)
		ctx.fill()
	}
	ctx.globalAlpha = 1
}

export const meadowSeeds: SketchDefinition<MeadowSeedsParams, Model, Color> = {
	colors: ['text-tertiary', 'brand-primary'],
	setup(frame) {
		const { random, width, height, params } = frame
		const count = Math.round(clamp((width * height) / AREA_PER_SEED, MIN_SEEDS, MAX_SEEDS))
		const f32 = () => new Float32Array(count)
		const model: Model = {
			count,
			x: f32(),
			y: f32(),
			y0: f32(),
			age: f32(),
			life: f32(),
			pace: f32(),
			size: f32(),
			phase: f32(),
			freq: f32(),
			reach: f32(),
		}
		const active = seedsFor(model, params)
		for (let i = 0; i < count; i++) {
			// the seeds begin everywhere along the wind and at every age, so the air is already moving; the rest wait
			spawn(model, i, frame, true)
			model.age[i] = i < active ? random.range(0, model.life[i]!) : model.life[i]!
		}
		return model
	},
	draw(frame, model) {
		if (frame.still) for (let i = 0; i < STILL_STEPS; i++) step(model, frame, STILL_DELTA)
		else step(model, frame, frame.delta)
		seeds(model, frame)
	},
}
