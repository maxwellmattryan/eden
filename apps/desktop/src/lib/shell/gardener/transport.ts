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

/**
 * A scripted reply: the text streamed word by word, then a stop. What `yarn dev:web` answers with. A message that
 * names the moon is answered as the model would: a line, three reads of `sun-and-moon`, then the answer once their
 * results are back, so the order of a reply and the fold of its reads can be worked on in the browser.
 */
export function fakeTransport(script: (request: GardenerRequest) => string = () => FAKE_REPLY): Transport {
	return (request, onEvent) => {
		let cancelled = false
		const done = (async () => {
			onEvent({ type: 'start', messageId: `fake-${request.id}`, model: request.model })
			onEvent({ type: 'usage', input: 120, output: 0, cacheRead: 0, cacheWrite: 0 })
			const looks = moonRound(request)
			// the wait a model makes before its first word, so the sprout can be worked on too
			await new Promise((resolve) => setTimeout(resolve, 1200))
			for (const word of (looks === 'ask' ? FAKE_LOOK : looks === 'answer' ? FAKE_MOON : script(request)).split(
				/(?<=\s)/
			)) {
				if (cancelled) break
				await new Promise((resolve) => setTimeout(resolve, 30))
				onEvent({ type: 'text_delta', text: word })
			}
			if (looks === 'ask' && !cancelled) {
				for (const day of [0, 1, 2]) {
					await new Promise((resolve) => setTimeout(resolve, 300))
					onEvent({
						type: 'tool_use',
						id: `fake-${request.id}-${day}`,
						name: 'weather_sun-and-moon',
						input: day === 2 ? { next: 'full' } : { day: day ? 'tomorrow' : 'today' },
					})
				}
			}
			onEvent({ type: 'usage', input: 120, output: 40, cacheRead: 0, cacheWrite: 0 })
			const reason = cancelled ? 'cancelled' : looks === 'ask' ? 'tool_use' : 'end_turn'
			onEvent({ type: 'stop', reason, refusal: null })
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

const FAKE_LOOK = 'Let me look at the moon over the next weeks.'
const FAKE_MOON =
	'That is what the ephemeris says: the next full moon is in the last result, **around** the day it names.'

/** Where a moon question stands: to be asked of the tool, answered from its results, or not one at all. */
function moonRound(request: GardenerRequest): 'ask' | 'answer' | undefined {
	const turns = request.messages as { role: string; content: unknown }[]
	const last = turns.at(-1)?.content
	if (Array.isArray(last) && last.some((part) => (part as { type?: string }).type === 'tool_result')) return 'answer'
	const words = typeof last === 'string' ? last : JSON.stringify(last ?? '')
	const reach = (request.tools as { name: string }[]).some((tool) => tool.name === 'weather_sun-and-moon')
	return reach && /\bmoon\b/i.test(words) ? 'ask' : undefined
}

const FAKE_REPLY = [
	'This is the **browser**: the Gardener runs in the installed app, so I am a scripted reply.',
	'- Everything else on this panel is *real*.\n- Replies are drawn as Markdown, `code` included.',
	'```text\nyarn dev\n```',
	'More in [the Tauri docs](https://tauri.app).',
].join('\n\n')

/** The transport for where the app runs. */
export const transport: Transport = isTauri() ? crateTransport : fakeTransport()
