// MapLibre GL JS as a `MapSurface` (D-128, D-129): the one place in Eden that makes the map's canvas. Loaded by a
// dynamic import, so no page pays for it until a map is shown. The style is Eden's own (`style.ts`); the library's
// controls are all off, since what is pressable on the map is Eden's DOM. Every request the map makes goes to the
// one tile host and is counted in the egress ledger in batches (D-131).
import { Map as MapLibreMap, setWorkerUrl } from 'maplibre-gl'
import { recordEgress } from '../../../egress/client.js'
import { requestBytes } from '../../../egress/bytes.js'
import type { Bounds, LngLat } from '../../../geo/index.js'
import { edenMapStyle, TILE_HOST } from './style.js'
import type { MapEvent, MapPalette, MapSurface, MapSurfaceOptions, MapView } from './types.js'

/** How long requests are gathered before they are entered in the ledger as one. */
const LEDGER_MS = 2000
/** The font ideographs are drawn in, from the system: the tile host's fonts hold none (D-128). */
const IDEOGRAPH_FONTS = "'Hiragino Sans', 'Yu Gothic', 'Noto Sans CJK JP', 'Noto Sans JP', sans-serif"

/** Counts the requests the map makes and enters them in the ledger a batch at a time. */
function ledger() {
	let requests = 0
	let bytes = 0
	let timer: ReturnType<typeof setTimeout> | undefined
	const flush = () => {
		timer = undefined
		if (!requests) return
		recordEgress('openfreemap', bytes, requests)
		requests = 0
		bytes = 0
	}
	return {
		count(url: string) {
			if (!url.startsWith(TILE_HOST)) return
			requests += 1
			bytes += requestBytes(url)
			timer ??= setTimeout(flush, LEDGER_MS)
		},
		flush() {
			if (timer) clearTimeout(timer)
			flush()
		},
	}
}

export async function createMaplibreSurface(options: MapSurfaceOptions): Promise<MapSurface> {
	if (options.workerUrl) setWorkerUrl(options.workerUrl)
	const counted = ledger()
	let lang = options.lang
	const animated = (animate: boolean | undefined) => animate !== false && !options.still

	const map = new MapLibreMap({
		container: options.container,
		style: edenMapStyle(options.palette, lang) as never,
		center: [options.view.center.lng, options.view.center.lat],
		zoom: options.view.zoom,
		attributionControl: false,
		localIdeographFontFamily: IDEOGRAPH_FONTS,
		// the ground is north up and flat: nothing tilts or turns it
		dragRotate: false,
		pitchWithRotate: false,
		touchPitch: false,
		maxPitch: 0,
		fadeDuration: options.still ? 0 : 200,
		transformRequest: (url) => {
			counted.count(url)
			return { url }
		},
	})
	map.touchZoomRotate.disableRotation()
	map.keyboard.disableRotation()

	let ready = false
	const loaded = new Promise<void>((resolve, reject) => {
		const failed = map.on('error', (event) => {
			if (!ready) reject(event.error instanceof Error ? event.error : new Error('the map could not start'))
		})
		map.once('load', () => {
			ready = true
			failed.unsubscribe()
			resolve()
		})
	})
	// a rejection nobody waits on is not an unhandled one
	loaded.catch(() => undefined)

	const surface: MapSurface = {
		ready: loaded,
		project(point: LngLat) {
			const at = map.project([point.lng, point.lat])
			return Number.isFinite(at.x) && Number.isFinite(at.y) ? { x: at.x, y: at.y } : null
		},
		unproject(at) {
			const point = map.unproject([at.x, at.y])
			return Number.isFinite(point.lng) && Number.isFinite(point.lat) ? { lng: point.lng, lat: point.lat } : null
		},
		view(): MapView {
			const center = map.getCenter()
			return { center: { lng: center.lng, lat: center.lat }, zoom: map.getZoom() }
		},
		bounds(): Bounds {
			const box = map.getBounds()
			return { west: box.getWest(), south: box.getSouth(), east: box.getEast(), north: box.getNorth() }
		},
		setView(view, { animate } = {}) {
			const target = {
				...(view.center ? { center: [view.center.lng, view.center.lat] as [number, number] } : {}),
				...(view.zoom !== undefined ? { zoom: view.zoom } : {}),
			}
			if (animated(animate)) map.easeTo({ ...target, duration: 500 })
			else map.jumpTo(target)
		},
		fit(points, { maxZoom = 15, animate } = {}) {
			if (!points.length) return
			if (points.length === 1) return surface.setView({ center: points[0]!, zoom: Math.min(maxZoom, 14) }, { animate })
			const lngs = points.map((point) => point.lng)
			const lats = points.map((point) => point.lat)
			map.fitBounds(
				[
					[Math.min(...lngs), Math.min(...lats)],
					[Math.max(...lngs), Math.max(...lats)],
				],
				{ padding: 56, maxZoom, duration: animated(animate) ? 500 : 0 }
			)
		},
		setPadding(insets) {
			map.setPadding(insets)
		},
		setPalette(palette: MapPalette) {
			map.setStyle(edenMapStyle(palette, lang) as never)
		},
		on(event: MapEvent, handler) {
			const subscription = map.on(event, handler)
			return () => subscription.unsubscribe()
		},
		onClick(handler) {
			const subscription = map.on('click', (event) => handler({ lng: event.lngLat.lng, lat: event.lngLat.lat }))
			return () => subscription.unsubscribe()
		},
		destroy() {
			counted.flush()
			lang = ''
			map.remove()
		},
	}
	return surface
}
