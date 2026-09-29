import type { ColorToken } from '../tokens/tokens.js'
import type { Noise } from './noise.js'
import type { Random } from './random.js'

/** What a sketch is handed on every call: the surface, the clock, its parameters and the theme's colours. */
export interface SketchFrame<P = undefined, C extends ColorToken = ColorToken> {
	/** The surface, already scaled: a sketch draws in CSS pixels. */
	ctx: CanvasRenderingContext2D
	/** The surface's size in CSS pixels. */
	width: number
	height: number
	/** Seconds the sketch has played; it stands still while the sketch is paused or out of sight. */
	time: number
	/** Seconds since the frame before, never more than a tenth. */
	delta: number
	/** Frames drawn since the setup. */
	frame: number
	/** The wall clock, in milliseconds since the epoch. */
	now: number
	/** The parameters as they are now. */
	params: P
	/** The colours the sketch named, resolved for the theme and accent around the canvas. */
	colors: Record<C, string>
	/** The seeded stream, begun again at every setup. */
	random: Random
	/** Noise over the same seed. */
	noise: Noise
	/** Reduced motion: the sketch is drawn once and must compose a whole picture in that one call. */
	still: boolean
}

/**
 * A generative sketch, in nannou's shape: `setup` builds the model and `draw` moves it on and paints it. A sketch
 * is a plain object with no DOM of its own, so one definition serves a header, a tile and a full page.
 */
export interface SketchDefinition<P = undefined, S = void, C extends ColorToken = ColorToken> {
	/** The colour tokens the sketch paints with; they arrive resolved in `frame.colors`. */
	colors?: readonly C[]
	/** True keeps what the frame before painted; by default the surface is cleared before every draw. */
	persist?: boolean
	/** Builds the model: at the start, and again whenever the surface changes size. */
	setup(frame: SketchFrame<P, C>): S
	/** Moves the model on by `frame.delta` and paints it. */
	draw(frame: SketchFrame<P, C>, model: S): void
}
