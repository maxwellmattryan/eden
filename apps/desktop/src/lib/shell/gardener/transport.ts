// How a request reaches the model (docs/engineering/gardener.md, "The request"): through the crate under Tauri, and
// through a scripted stream in the browser, where there is no key and no crate, so the panel can be worked on with
// `yarn dev:web`. Either way the runtime sees the same events.
import { isTauri } from '@eden/shared/api'
import { gardenerSend, type GardenerEvent, type GardenerRequest } from '@eden/shared/gardener'

export interface Transport {
	(
		request: GardenerRequest,
		onEvent: (event: GardenerEvent) => void
	): { done: Promise<void>; cancel: () => Promise<boolean> }
}

/** The crate's stream. */
export const crateTransport: Transport = (request, onEvent) => gardenerSend(request, onEvent)

/** A scripted reply: the text streamed word by word, then a stop. What `yarn dev:web` answers with. */
export function fakeTransport(script: (request: GardenerRequest) => string = () => FAKE_REPLY): Transport {
	return (request, onEvent) => {
		let cancelled = false
		const done = (async () => {
			onEvent({ type: 'start', messageId: `fake-${request.id}`, model: request.model })
			onEvent({ type: 'usage', input: 120, output: 0, cacheRead: 0, cacheWrite: 0 })
			for (const word of script(request).split(/(?<=\s)/)) {
				if (cancelled) break
				await new Promise((resolve) => setTimeout(resolve, 30))
				onEvent({ type: 'text_delta', text: word })
			}
			onEvent({ type: 'usage', input: 120, output: 40, cacheRead: 0, cacheWrite: 0 })
			onEvent({ type: 'stop', reason: cancelled ? 'cancelled' : 'end_turn', refusal: null })
		})()
		return {
			done,
			cancel: async () => {
				cancelled = true
				return true
			},
		}
	}
}

const FAKE_REPLY =
	'This is the browser: the Gardener runs in the installed app, so I am a scripted reply. Everything else on this panel is real.'

/** The transport for where the app runs. */
export const transport: Transport = isTauri() ? crateTransport : fakeTransport()
