// The bus signals travel on inside the app: a domain subscribes to a name and is handed each payload emitted under
// it. A handler that throws is told to the bus's owner and stops nobody else, since one occurrence of a schedule is
// handed over once and a broken subscriber must not take the others' with it.
import type { SignalPayload } from './types.js'

export type SignalHandler = (payload: SignalPayload) => void | Promise<void>

export interface Bus {
	/** Hears every signal of the name from now on; the answer stops it. */
	subscribe(name: string, handler: SignalHandler): () => void
	/** Hands the payload to each subscriber of the name, and settles when they all have. */
	dispatch(name: string, payload: SignalPayload): Promise<void>
}

export function createBus(onError: (name: string, error: unknown) => void = () => {}): Bus {
	const handlers = new Map<string, Set<SignalHandler>>()
	return {
		subscribe(name, handler) {
			const set = handlers.get(name) ?? new Set()
			handlers.set(name, set)
			set.add(handler)
			return () => void set.delete(handler)
		},
		async dispatch(name, payload) {
			const heard = [...(handlers.get(name) ?? [])].map(async (handler) => {
				try {
					await handler(payload)
				} catch (error) {
					onError(name, error)
				}
			})
			await Promise.all(heard)
		},
	}
}
