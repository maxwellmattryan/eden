<script lang="ts" generics="P, S, C extends ColorToken">
	// The kit's one canvas: a surface a generative sketch draws on. The sketch is a plain definition (`setup`, `draw`)
	// and this is everything around it: the backing store sized to the element and the screen, the theme's colours
	// resolved where the canvas stands, the frames, and the rest the loop takes while it is out of sight or paused.
	// Under reduced motion the sketch is drawn once, as a still. The canvas fills its container, which gives it its
	// size; it is decoration unless it is given a `label`.
	import { untrack } from 'svelte'
	import type { Attachment } from 'svelte/attachments'
	import type { HTMLCanvasAttributes } from 'svelte/elements'
	import { runSketch, type SketchRunner } from '../../internal/sketch.js'
	import type { SketchDefinition } from '../../sketch/types.js'
	import type { ColorToken } from '../../tokens/tokens.js'

	type Props = Omit<HTMLCanvasAttributes, 'width' | 'height'> & {
		/** What is drawn. */
		sketch: SketchDefinition<P, S, C>
		/** What the sketch reads: a change shows on the next frame and never restarts it. */
		params: P
		/** The seed of the sketch's randomness and noise: the same seed draws the same sketch. */
		seed?: number
		/** The most frames a second. */
		fps?: number
		/** Holds the sketch on the frame it has reached. */
		paused?: boolean
		/** The accessible name, for a sketch that says something; without one the canvas is hidden from assistive technology. */
		label?: string
	}
	let { sketch, params, seed = 1, fps = 30, paused = false, label, class: className = '', ...rest }: Props = $props()

	let runner: SketchRunner | undefined

	// A new sketch, seed or rate starts over; the parameters and the pause are read as the frames come.
	const run: Attachment<HTMLCanvasElement> = (canvas) => {
		const options = { sketch, seed, fps, params: () => params, paused: () => paused }
		const started = untrack(() => runSketch(canvas, options))
		runner = started
		return () => {
			started.stop()
			if (runner === started) runner = undefined
		}
	}

	// effect: imperative DOM
	$effect(() => {
		void $state.snapshot(params)
		void paused
		runner?.invalidate()
	})
</script>

<canvas
	class={['ed-sketch', className]}
	role={label ? 'img' : undefined}
	aria-label={label}
	aria-hidden={label ? undefined : true}
	{@attach run}
	{...rest}
></canvas>

<style>
	.ed-sketch {
		display: block;
		width: 100%;
		height: 100%;
	}
</style>
