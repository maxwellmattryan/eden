// The hearth as a motif: embers lifting off a fire. Each is a small glowing point, never a streak: it flares as it
// leaves the coals, wavers on its own sway, flickers, and shrinks and dims as it cools. Everything it shows is a
// reading: the fuller the stock, the more embers rise, and the share of them in the accent is the share of the stock
// about to expire, which rise faster and are spent sooner. It is quiet by design, a thing felt beside a header's name
// rather than looked at.
import type { SketchDefinition, SketchFrame } from '../sketch/types.js'

export interface HearthEmbersParams {
	/** Items in stock: how full the fire burns. */
	items: number
	/** Of those, the ones expiring soon: the sparks that take the accent. */
	expiring: number
}

const clamp = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, value))

/** The stock at which the fire burns its fullest. */
const FULL_STOCK = 60

/** The share of the sparks that rise: an empty larder still glows, a full one does not blaze. */
export function emberShare(items: number): number {
	return 0.2 + 0.8 * Math.pow(clamp(items / FULL_STOCK), 0.6)
}

/** How many of `active` sparks take the accent: the share of the stock expiring, and one at least while any is. */
export function accentSparks(active: number, items: number, expiring: number): number {
	if (expiring <= 0 || active <= 0) return 0
	return Math.min(active, Math.max(1, Math.round(active * clamp(expiring / Math.max(items, 1)))))
}

/** An ember to this many square pixels, with the stock full. */
const AREA_PER_EMBER = 900
const MIN_EMBERS = 24
const MAX_EMBERS = 140
/** How far past the top an ember may run before it ends. */
const MARGIN = 12
/** Where embers begin, as a share of the height: the header fades out towards its foot, so they start above it. */
const HEARTH = 0.9
/** How much of its pace an ember has lost by the time it is spent. */
const COOLING = 0.4
/** An ember of expiring stock rises this much faster and is spent this much sooner. */
const ACCENT_PACE = 1.35
const ACCENT_BURN = 1.5
/** The seconds an ember takes to flare up from nothing. */
const FLARE = 0.5
const EMBER_ALPHA = 0.85
/** The halo around an ember's core, in cores, and its share of the core's alpha. */
const HALO = 3
const HALO_ALPHA = 0.28
/** The frames a still runs before it is drawn, so its embers are spread up the header. */
const STILL_STEPS = 90
const STILL_DELTA = 1 / 30

interface Model {
	count: number
	/** Where each ember's sway is centred, and where it is now. */
	x0: Float32Array
	x: Float32Array
	y: Float32Array
	age: Float32Array
	life: Float32Array
	/** How fast each ember leaves the fire, in pixels a second. */
	pace: Float32Array
	/** The core's radius in pixels, before it cools. */
	size: Float32Array
	phase: Float32Array
	/** The sway's pace in radians a second, and its reach in pixels. */
	freq: Float32Array
	reach: Float32Array
}

type Color = 'text-tertiary' | 'brand-primary'
type Frame = SketchFrame<HearthEmbersParams, Color>

const embersFor = (model: Model, params: HearthEmbersParams) => Math.round(model.count * emberShare(params.items))

function spawn(model: Model, i: number, { random, width, height }: Frame) {
	model.x0[i] = random.range(0, width)
	model.x[i] = model.x0[i]!
	model.y[i] = height * HEARTH + random.range(0, height * 0.08)
	model.age[i] = 0
	model.life[i] = random.range(22, 44)
	model.pace[i] = random.range(5, 11)
	model.size[i] = random.range(0.9, 2)
	model.phase[i] = random.range(0, Math.PI * 2)
	model.freq[i] = random.range(0.6, 1.6)
	model.reach[i] = random.range(3, 11)
}

/** Moves every ember on by `delta`: a living one rises, sways and cools; a spent one begins again at the foot. */
function step(model: Model, frame: Frame, delta: number) {
	const { params } = frame
	const active = embersFor(model, params)
	const accents = accentSparks(active, params.items, params.expiring)

	for (let i = 0; i < model.count; i++) {
		if (model.age[i]! >= model.life[i]! || model.y[i]! < -MARGIN) {
			if (i < active) spawn(model, i, frame)
			continue
		}
		const accent = i < accents
		const t = model.age[i]! / model.life[i]!
		model.y[i] = model.y[i]! - model.pace[i]! * (1 - COOLING * t) * (accent ? ACCENT_PACE : 1) * delta
		// the sway widens as the ember rises, since the air is less still above the coals
		model.x[i] = model.x0[i]! + Math.sin(model.phase[i]! + model.age[i]! * model.freq[i]!) * model.reach[i]! * (0.4 + t)
		model.age[i] = model.age[i]! + delta * (accent ? ACCENT_BURN : 1)
	}
}

/** The embers: a halo and a core to each, flickering, smaller and dimmer as they cool. */
function embers(model: Model, { ctx, colors, params, time }: Frame) {
	const accents = accentSparks(embersFor(model, params), params.items, params.expiring)
	for (let i = 0; i < model.count; i++) {
		const t = model.age[i]! / model.life[i]!
		if (t >= 1) continue
		const flare = Math.min(1, model.age[i]! / FLARE)
		const flicker = 0.75 + 0.25 * Math.sin(time * 7 + model.phase[i]! * 5)
		const alpha = EMBER_ALPHA * flare * Math.pow(1 - t, 1.2) * flicker * (i < accents ? 1.5 : 1)
		const radius = model.size[i]! * (1 - 0.55 * t)
		ctx.fillStyle = i < accents ? colors['brand-primary'] : colors['text-tertiary']
		ctx.globalAlpha = Math.min(1, alpha * HALO_ALPHA)
		ctx.beginPath()
		ctx.arc(model.x[i]!, model.y[i]!, radius * HALO, 0, Math.PI * 2)
		ctx.fill()
		ctx.globalAlpha = Math.min(1, alpha)
		ctx.beginPath()
		ctx.arc(model.x[i]!, model.y[i]!, radius, 0, Math.PI * 2)
		ctx.fill()
	}
	ctx.globalAlpha = 1
}

export const hearthEmbers: SketchDefinition<HearthEmbersParams, Model, Color> = {
	colors: ['text-tertiary', 'brand-primary'],
	setup(frame) {
		const { random, width, height, params } = frame
		const count = Math.round(clamp((width * height) / AREA_PER_EMBER, MIN_EMBERS, MAX_EMBERS))
		const f32 = () => new Float32Array(count)
		const model: Model = {
			count,
			x0: f32(),
			x: f32(),
			y: f32(),
			age: f32(),
			life: f32(),
			pace: f32(),
			size: f32(),
			phase: f32(),
			freq: f32(),
			reach: f32(),
		}
		const active = embersFor(model, params)
		for (let i = 0; i < count; i++) {
			spawn(model, i, frame)
			// the embers begin at every height and age, so the fire is already burning; the rest wait, spent
			model.y[i] = random.range(0, height)
			model.age[i] = i < active ? random.range(0, model.life[i]!) : model.life[i]!
		}
		return model
	},
	draw(frame, model) {
		if (frame.still) for (let i = 0; i < STILL_STEPS; i++) step(model, frame, STILL_DELTA)
		else step(model, frame, frame.delta)
		embers(model, frame)
	},
}
